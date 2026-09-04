#!/usr/bin/env node
import {
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../../project-check/lib/project-check.mjs';
import {
  assertSha,
  classifyExecutionBoundary,
  classifyMergeFinalization,
  classifyMergeGateChecks,
  findExactProjectCheckForWorkflowRun,
  PROJECT_CHECK_WORKFLOW,
  REQUIRED_PROJECT_CHECK,
  shouldRestartFinalization,
  validateSyntheticMergeParents,
  validationRefName,
} from '../lib/merge-finalizer.mjs';

const API_VERSION = '2026-03-10';
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_RESTARTS = 3;

function parseArgs(argv) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    pr: null,
    execute: false,
    prepare: false,
    mergeOnly: false,
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRestarts: DEFAULT_MAX_RESTARTS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repository') args.repository = argv[++i] ?? null;
    else if (arg === '--pr') args.pr = Number(argv[++i]);
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--prepare') args.prepare = true;
    else if (arg === '--merge-only') args.mergeOnly = true;
    else if (arg === '--poll-ms') args.pollMs = Number(argv[++i]);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (arg === '--max-restarts') args.maxRestarts = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.repository || !/^[^/]+\/[^/]+$/.test(args.repository)) {
    throw new Error('--repository owner/repo is required');
  }
  if (!Number.isInteger(args.pr) || args.pr <= 0) throw new Error('--pr must be a positive integer');
  if (!Number.isInteger(args.pollMs) || args.pollMs < 1000) throw new Error('--poll-ms must be an integer >= 1000');
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < args.pollMs) throw new Error('--timeout-ms must be >= --poll-ms');
  if (!Number.isInteger(args.maxRestarts) || args.maxRestarts < 0 || args.maxRestarts > 10) {
    throw new Error('--max-restarts must be an integer from 0 to 10');
  }
  const modeCount = [args.execute, args.prepare, args.mergeOnly].filter(Boolean).length;
  if (modeCount > 1) throw new Error('--execute, --prepare, and --merge-only are mutually exclusive');
  return args;
}

class GitHubHttpError extends Error {
  constructor(method, path, status, body) {
    super(`GitHub ${method} ${path} failed: ${status} ${body.slice(0, 500)}`);
    this.status = status;
    this.path = path;
  }
}

async function githubRequest(repository, path, token, options = {}) {
  const method = options.method ?? 'GET';
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new GitHubHttpError(method, path, response.status, text);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function output(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function blocker(status, details = {}) {
  output({ status, ...details });
  process.exitCode = 1;
  return null;
}

function handoff(status, details = {}) {
  output({ status, ...details });
  process.exitCode = 3;
  return null;
}

async function readPullMergeSha(repository, prNumber, token) {
  try {
    const ref = await githubRequest(repository, `/git/ref/pull/${prNumber}/merge`, token);
    const sha = ref?.object?.sha ?? null;
    if (sha === null) return null;
    assertSha(sha, 'pullMergeRef.sha');
    return sha;
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) return null;
    throw error;
  }
}

async function readBoundary(repository, prNumber, token) {
  const [mainBranch, pr] = await Promise.all([
    githubRequest(repository, '/branches/main', token),
    githubRequest(repository, `/pulls/${prNumber}`, token),
  ]);
  const mainSha = mainBranch?.commit?.sha;
  const headSha = pr?.head?.sha;
  assertSha(mainSha, 'mainSha');
  assertSha(headSha, 'pr.head.sha');
  const support = classifyExecutionBoundary({ repository, pr });
  const validationSha = support.status === 'SUPPORTED'
    ? await readPullMergeSha(repository, prNumber, token)
    : null;
  return { mainSha, headSha, validationSha, pr, support };
}

function projectMergeGates(boundary, comparison) {
  const behindBy = Number(comparison?.behind_by ?? 0);
  if (behindBy > 0) {
    return {
      status: 'DEFERRED_UPDATE_REQUIRED',
      changedFileCount: null,
      owners: [],
      mergeGates: [],
      manualReviews: [],
    };
  }

  const expectedChangedFileCount = Number(boundary.pr?.changed_files);
  const files = Array.isArray(comparison?.files) ? comparison.files : [];
  if (!Number.isInteger(expectedChangedFileCount) || expectedChangedFileCount < 0 || files.length !== expectedChangedFileCount) {
    return {
      status: 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE',
      expectedChangedFileCount: Number.isInteger(expectedChangedFileCount) ? expectedChangedFileCount : null,
      actualChangedFileCount: files.length,
      mergeGates: [],
    };
  }

  const paths = files.map(file => file?.filename).filter(item => typeof item === 'string' && item.length > 0);
  if (paths.length !== files.length) {
    return {
      status: 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE',
      expectedChangedFileCount,
      actualChangedFileCount: paths.length,
      mergeGates: [],
    };
  }

  const contracts = loadProjectCheckContracts();
  const route = routeProjectCheckPaths(paths, contracts);
  return {
    status: route.status,
    changedFileCount: route.changedFileCount,
    owners: route.owners,
    mergeGates: route.mergeGates,
    manualReviews: route.manualReviews,
    boundaries: route.boundaries,
  };
}

function effectiveStatus(result, mergeGateProjection, mergeGateResult) {
  if (mergeGateProjection.status === 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE') return mergeGateProjection.status;
  if (mergeGateResult.status === 'BLOCKER_MERGE_GATE_CONTRACT' || mergeGateResult.status === 'BLOCKER_MERGE_GATE') {
    return mergeGateResult.status;
  }
  if (result.status !== 'READY_TO_MERGE') return result.status;
  return mergeGateResult.status === 'PASS' ? 'READY_TO_MERGE' : mergeGateResult.status;
}

async function readSnapshot(repository, prNumber, token) {
  const boundary = await readBoundary(repository, prNumber, token);
  if (boundary.support.status !== 'SUPPORTED') {
    return {
      ...boundary,
      result: boundary.support,
      comparison: null,
      checkRuns: [],
      mergeGateProjection: { status: 'NOT_APPLICABLE', mergeGates: [] },
      mergeGateResult: { status: 'PASS', gateResults: [] },
      status: boundary.support.status,
    };
  }
  const [comparison, checks] = await Promise.all([
    githubRequest(repository, `/compare/${boundary.mainSha}...${boundary.headSha}`, token),
    boundary.validationSha
      ? githubRequest(repository, `/commits/${boundary.validationSha}/check-runs?per_page=100`, token)
      : Promise.resolve({ check_runs: [] }),
  ]);
  const checkRuns = checks?.check_runs ?? [];
  const result = classifyMergeFinalization({
    mainSha: boundary.mainSha,
    pr: boundary.pr,
    comparison,
    checkRuns,
    validationSha: boundary.validationSha,
  });
  const mergeGateProjection = projectMergeGates(boundary, comparison);
  let mergeGateResult = { status: 'PASS', gateResults: [] };
  if (mergeGateProjection.status === 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE') {
    mergeGateResult = mergeGateProjection;
  } else if ((mergeGateProjection.mergeGates ?? []).length > 0) {
    const headChecks = await githubRequest(repository, `/commits/${boundary.headSha}/check-runs?per_page=100`, token);
    mergeGateResult = classifyMergeGateChecks({
      headSha: boundary.headSha,
      mergeGates: mergeGateProjection.mergeGates,
      checkRuns: headChecks?.check_runs ?? [],
    });
  }
  return {
    ...boundary,
    comparison,
    checkRuns,
    result,
    mergeGateProjection,
    mergeGateResult,
    status: effectiveStatus(result, mergeGateProjection, mergeGateResult),
  };
}

async function waitForUpdatedHead(repository, prNumber, token, beforeHeadSha, options) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    await sleep(options.pollMs);
    const after = await readBoundary(repository, prNumber, token);
    if (after.support.status !== 'SUPPORTED') return { changed: true, after, reason: after.support.status };
    if (after.headSha !== beforeHeadSha) return { changed: true, after, reason: 'HEAD_CHANGED' };
  }
  return { changed: false, after: null, reason: 'TIMEOUT' };
}

async function waitForMergeability(repository, prNumber, token, options) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    await sleep(options.pollMs);
    const snapshot = await readSnapshot(repository, prNumber, token);
    if (snapshot.support.status !== 'SUPPORTED' || snapshot.result.status !== 'WAIT_MERGEABILITY') {
      return snapshot;
    }
  }
  return null;
}

async function waitForMergeGates(repository, snapshot, token, options) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    await sleep(options.pollMs);
    const current = await readSnapshot(repository, snapshot.pr.number, token);
    if (current.support.status !== 'SUPPORTED') return { status: current.support.status, snapshot: current };
    const restart = shouldRestartFinalization(
      { mainSha: snapshot.mainSha, headSha: snapshot.headSha, validationSha: snapshot.validationSha },
      { mainSha: current.mainSha, headSha: current.headSha, validationSha: current.validationSha },
    );
    if (restart.restart) return { status: 'RESTART', reason: restart.reason, snapshot: current };
    if (current.result.status !== 'READY_TO_MERGE') return { status: current.result.status, snapshot: current };
    if (current.mergeGateResult.status === 'PASS') return { status: 'PASS', snapshot: current };
    if (current.mergeGateResult.status === 'MERGE_GATE_REQUIRED' || current.mergeGateResult.status === 'MERGE_GATE_PENDING') continue;
    return { status: current.mergeGateResult.status, snapshot: current };
  }
  return {
    status: 'BLOCKER_MERGE_GATE_TIMEOUT',
    expectedHeadSha: snapshot.headSha,
    mergeGates: snapshot.mergeGateProjection.mergeGates,
  };
}

async function waitForPostMergeVerification(repository, prNumber, mergeSha, expectedHeadSha, token, options) {
  const deadline = Date.now() + Math.min(options.timeoutMs, 60_000);
  let last = null;
  while (Date.now() < deadline) {
    const [mergedPr, mainAfter, mergeCommit] = await Promise.all([
      githubRequest(repository, `/pulls/${prNumber}`, token),
      githubRequest(repository, '/branches/main', token),
      githubRequest(repository, `/commits/${mergeSha}`, token),
    ]);
    const parentShas = (mergeCommit?.parents ?? []).map(parent => parent?.sha).filter(Boolean);
    last = { mergedPr, mainAfter, mergeCommit, parentShas };
    if (mergedPr?.merged_at != null && mergeCommit?.sha === mergeSha && parentShas.includes(expectedHeadSha)) {
      return { verified: true, ...last };
    }
    await sleep(options.pollMs);
  }
  return { verified: false, ...last };
}

async function ensureValidationRef(repository, refName, validationSha, token) {
  try {
    await githubRequest(repository, '/git/refs', token, {
      method: 'POST',
      body: { ref: `refs/heads/${refName}`, sha: validationSha },
    });
    return { created: true, refName };
  } catch (error) {
    if (!(error instanceof GitHubHttpError) || error.status !== 422) throw error;
    const existing = await githubRequest(repository, `/git/ref/heads/${refName}`, token);
    const existingSha = existing?.object?.sha ?? null;
    if (existingSha !== validationSha) {
      return { status: 'BLOCKER_VALIDATION_REF_COLLISION', refName, expectedSha: validationSha, actualSha: existingSha };
    }
    return { created: false, refName };
  }
}

async function deleteValidationRef(repository, refName, token) {
  try {
    await githubRequest(repository, `/git/refs/heads/${refName}`, token, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof GitHubHttpError && error.status === 404) return;
    throw error;
  }
}

async function dispatchProjectCheck(repository, snapshot, token, options) {
  const validationSha = snapshot.validationSha;
  if (!validationSha) return { status: 'BLOCKER_SYNTHETIC_MERGE_SHA_MISSING' };

  const syntheticMerge = await githubRequest(repository, `/commits/${validationSha}`, token);
  const parentValidation = validateSyntheticMergeParents(syntheticMerge, snapshot.mainSha, snapshot.headSha);
  if (parentValidation.status !== 'PASS') return parentValidation;

  const refName = validationRefName(snapshot.pr.number, validationSha);
  const refResult = await ensureValidationRef(repository, refName, validationSha, token);
  if (refResult.status) return refResult;

  try {
    const body = {
      ref: refName,
      inputs: {
        base_sha: snapshot.mainSha,
        expected_head_sha: validationSha,
        pr: String(snapshot.pr.number),
      },
      return_run_details: true,
    };
    const dispatch = await githubRequest(
      repository,
      `/actions/workflows/${PROJECT_CHECK_WORKFLOW}/dispatches`,
      token,
      { method: 'POST', body },
    );
    const runId = Number(dispatch?.workflow_run_id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return { status: 'BLOCKER_PROJECT_CHECK_DISPATCH_ID_MISSING', dispatch };
    }

    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      await sleep(options.pollMs);
      const boundary = await readBoundary(repository, snapshot.pr.number, token);
      if (boundary.support.status !== 'SUPPORTED') {
        return { status: boundary.support.status, runId, boundary };
      }
      const restart = shouldRestartFinalization(
        { mainSha: snapshot.mainSha, headSha: snapshot.headSha, validationSha },
        { mainSha: boundary.mainSha, headSha: boundary.headSha, validationSha: boundary.validationSha },
      );
      if (restart.restart) return { status: 'RESTART', reason: restart.reason, runId, boundary };

      const run = await githubRequest(repository, `/actions/runs/${runId}`, token);
      if (run?.head_sha !== validationSha || run?.event !== 'workflow_dispatch') {
        return {
          status: 'BLOCKER_PROJECT_CHECK_DISPATCH_MISMATCH',
          runId,
          expectedValidationSha: validationSha,
          actualHeadSha: run?.head_sha ?? null,
          event: run?.event ?? null,
        };
      }
      if (run.status !== 'completed') continue;
      if (run.conclusion !== 'success') {
        return { status: 'BLOCKER_OWNING_VALIDATOR', runId, conclusion: run.conclusion ?? null };
      }

      const jobs = await githubRequest(repository, `/actions/runs/${runId}/jobs?per_page=100`, token);
      const projectCheckJob = (jobs?.jobs ?? []).find(job => job?.name === REQUIRED_PROJECT_CHECK.name);
      if (!projectCheckJob || projectCheckJob.status !== 'completed' || projectCheckJob.conclusion !== 'success') {
        return {
          status: 'BLOCKER_PROJECT_CHECK_JOB_IDENTITY',
          runId,
          job: projectCheckJob ? {
            id: projectCheckJob.id,
            name: projectCheckJob.name,
            status: projectCheckJob.status,
            conclusion: projectCheckJob.conclusion,
          } : null,
        };
      }

      const checks = await githubRequest(repository, `/commits/${validationSha}/check-runs?per_page=100`, token);
      const exact = findExactProjectCheckForWorkflowRun(
        checks?.check_runs ?? [],
        validationSha,
        runId,
        REQUIRED_PROJECT_CHECK,
      );
      if (!exact) continue;
      if (exact.status !== 'completed' || exact.conclusion !== 'success') {
        return { status: 'BLOCKER_OWNING_VALIDATOR', runId, checkId: exact.id, conclusion: exact.conclusion ?? null };
      }
      return { status: 'PASS', runId, checkId: exact.id, validationSha, validationRef: refName };
    }
    return { status: 'BLOCKER_PROJECT_CHECK_TIMEOUT', validationSha };
  } finally {
    await deleteValidationRef(repository, refName, token);
  }
}

async function executeFinalization(args, token) {
  if (!token) return blocker('BLOCKER_TOKEN_MISSING');
  let restarts = 0;
  let updates = 0;
  let dispatches = 0;

  while (true) {
    const snapshot = await readSnapshot(args.repository, args.pr, token);
    if (snapshot.support.status !== 'SUPPORTED') return blocker(snapshot.support.status, snapshot.support);

    const status = snapshot.status;
    if (
      status === 'BLOCKER_PR_NOT_OPEN'
      || status === 'BLOCKER_DRAFT'
      || status === 'BLOCKER_CONFLICT'
      || status === 'BLOCKER_OWNING_VALIDATOR'
      || status === 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE'
      || status === 'BLOCKER_MERGE_GATE_CONTRACT'
      || status === 'BLOCKER_MERGE_GATE'
    ) {
      return blocker(status, { snapshot: snapshot.result, mergeGate: snapshot.mergeGateResult, projection: snapshot.mergeGateProjection });
    }

    if (args.mergeOnly && status !== 'READY_TO_MERGE') {
      return handoff('MERGE_ADMISSION_REVALIDATION_REQUIRED', {
        reason: status,
        observedMainSha: snapshot.mainSha,
        observedHeadSha: snapshot.headSha,
        observedValidationSha: snapshot.validationSha,
      });
    }

    if (status === 'WAIT_MERGEABILITY') {
      const settled = await waitForMergeability(
        args.repository,
        args.pr,
        token,
        { pollMs: args.pollMs, timeoutMs: Math.min(args.timeoutMs, 60_000) },
      );
      if (!settled) return blocker('BLOCKER_MERGEABILITY_TIMEOUT', { snapshot: snapshot.result });
      continue;
    }

    if (status === 'UPDATE_REQUIRED') {
      if (args.prepare) {
        return handoff('PREPARE_REVALIDATION_REQUIRED', {
          reason: 'UPDATE_REQUIRED',
          observedMainSha: snapshot.mainSha,
          observedHeadSha: snapshot.headSha,
          observedValidationSha: snapshot.validationSha,
        });
      }
      try {
        await githubRequest(
          args.repository,
          `/pulls/${args.pr}/update-branch`,
          token,
          { method: 'PUT', body: { expected_head_sha: snapshot.headSha } },
        );
      } catch (error) {
        if (error instanceof GitHubHttpError && error.status === 422) {
          restarts += 1;
          if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: 'UPDATE_HEAD_RACE', restarts });
          continue;
        }
        throw error;
      }
      updates += 1;
      const changed = await waitForUpdatedHead(
        args.repository,
        args.pr,
        token,
        snapshot.headSha,
        args,
      );
      if (!changed.changed) return blocker('BLOCKER_UPDATE_TIMEOUT', { expectedHeadSha: snapshot.headSha });
      restarts += 1;
      if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: changed.reason, restarts });
      continue;
    }

    if (status === 'CHECK_REQUIRED' || status === 'CHECK_PENDING' || status === 'CHECK_NOT_SUCCESSFUL') {
      const validation = await dispatchProjectCheck(args.repository, snapshot, token, args);
      dispatches += 1;
      if (validation.status === 'RESTART') {
        if (args.prepare) return handoff('PREPARE_REVALIDATION_REQUIRED', { reason: validation.reason });
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: validation.reason, restarts });
        continue;
      }
      if (validation.status !== 'PASS') return blocker(validation.status, validation);
      const afterValidation = await readSnapshot(args.repository, args.pr, token);
      const restart = shouldRestartFinalization(
        { mainSha: snapshot.mainSha, headSha: snapshot.headSha, validationSha: snapshot.validationSha },
        { mainSha: afterValidation.mainSha, headSha: afterValidation.headSha, validationSha: afterValidation.validationSha },
      );
      if (restart.restart) {
        if (args.prepare) return handoff('PREPARE_REVALIDATION_REQUIRED', { reason: restart.reason });
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: restart.reason, restarts });
        continue;
      }
      if (afterValidation.result.status !== 'READY_TO_MERGE') {
        return blocker(afterValidation.result.status, { snapshot: afterValidation.result, validation });
      }
      continue;
    }

    if (status === 'MERGE_GATE_REQUIRED' || status === 'MERGE_GATE_PENDING') {
      const gate = await waitForMergeGates(args.repository, snapshot, token, args);
      if (gate.status === 'RESTART') {
        if (args.prepare) return handoff('PREPARE_REVALIDATION_REQUIRED', { reason: gate.reason });
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: gate.reason, restarts });
        continue;
      }
      if (gate.status !== 'PASS') return blocker(gate.status, gate);
      continue;
    }

    if (status !== 'READY_TO_MERGE') return blocker(status, {
      snapshot: snapshot.result,
      mergeGate: snapshot.mergeGateResult,
      projection: snapshot.mergeGateProjection,
    });

    const guard = await readSnapshot(args.repository, args.pr, token);
    const restart = shouldRestartFinalization(
      { mainSha: snapshot.mainSha, headSha: snapshot.headSha, validationSha: snapshot.validationSha },
      { mainSha: guard.mainSha, headSha: guard.headSha, validationSha: guard.validationSha },
    );
    if (restart.restart) {
      if (args.mergeOnly) return handoff('MERGE_ADMISSION_REVALIDATION_REQUIRED', { reason: restart.reason });
      if (args.prepare) return handoff('PREPARE_REVALIDATION_REQUIRED', { reason: restart.reason });
      restarts += 1;
      if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: restart.reason, restarts });
      continue;
    }
    if (guard.status !== 'READY_TO_MERGE') {
      if (args.mergeOnly) return handoff('MERGE_ADMISSION_REVALIDATION_REQUIRED', { reason: guard.status });
      if (
        guard.status === 'UPDATE_REQUIRED'
        || guard.status === 'CHECK_REQUIRED'
        || guard.status === 'CHECK_PENDING'
        || guard.status === 'MERGE_GATE_REQUIRED'
        || guard.status === 'MERGE_GATE_PENDING'
      ) {
        if (args.prepare) return handoff('PREPARE_REVALIDATION_REQUIRED', { reason: guard.status });
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: guard.status, restarts });
        continue;
      }
      return blocker(guard.status, {
        snapshot: guard.result,
        mergeGate: guard.mergeGateResult,
        projection: guard.mergeGateProjection,
      });
    }

    if (args.prepare) {
      output({
        status: 'PREPARED_FOR_MERGE_ADMISSION',
        mode: 'PREPARE',
        mutationAttempted: false,
        repository: args.repository,
        prNumber: args.pr,
        validatedMainSha: guard.mainSha,
        validatedHeadSha: guard.headSha,
        validatedMergeResultSha: guard.validationSha,
        updates,
        dispatches,
        restarts,
        requiredCheck: REQUIRED_PROJECT_CHECK,
        mergeGates: guard.mergeGateProjection.mergeGates,
        mergeGateResult: guard.mergeGateResult,
      });
      return null;
    }

    let merge;
    try {
      merge = await githubRequest(
        args.repository,
        `/pulls/${args.pr}/merge`,
        token,
        { method: 'PUT', body: { sha: guard.headSha, merge_method: 'merge' } },
      );
    } catch (error) {
      if (error instanceof GitHubHttpError && [405, 409, 422].includes(error.status)) {
        return blocker('BLOCKER_MERGE_REJECTED', { httpStatus: error.status, message: error.message });
      }
      throw error;
    }
    if (merge?.merged !== true || typeof merge?.sha !== 'string') {
      return blocker('BLOCKER_MERGE_REJECTED', { merge });
    }

    const verification = await waitForPostMergeVerification(
      args.repository,
      args.pr,
      merge.sha,
      guard.headSha,
      token,
      args,
    );
    const mergedPr = verification?.mergedPr ?? null;
    const mainAfter = verification?.mainAfter ?? null;
    const mergeCommit = verification?.mergeCommit ?? null;
    const firstParent = mergeCommit?.parents?.[0]?.sha ?? null;
    const postMergeBaseRace = firstParent !== guard.mainSha;
    if (verification?.verified !== true) {
      return blocker('BLOCKER_POST_MERGE_VERIFICATION', {
        mergeSha: merge.sha,
        mergedAt: mergedPr?.merged_at ?? null,
        observedMergeCommitSha: mergeCommit?.sha ?? null,
        expectedHeadParentFound: verification?.parentShas?.includes(guard.headSha) ?? false,
      });
    }

    output({
      status: postMergeBaseRace ? 'MERGED_REVIEW_POST_MERGE_BASE_RACE' : 'MERGED',
      mode: args.mergeOnly ? 'MERGE_ONLY' : 'EXECUTE',
      repository: args.repository,
      prNumber: args.pr,
      validatedMainSha: guard.mainSha,
      validatedHeadSha: guard.headSha,
      validatedMergeResultSha: guard.validationSha,
      mergeSha: merge.sha,
      mainAfterSha: mainAfter?.commit?.sha ?? null,
      firstParent,
      updates,
      dispatches,
      restarts,
      requiredCheck: REQUIRED_PROJECT_CHECK,
      mergeGates: guard.mergeGateProjection.mergeGates,
      mergeGateResult: guard.mergeGateResult,
    });
    if (postMergeBaseRace) process.exitCode = 3;
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  if (!args.execute && !args.prepare && !args.mergeOnly) {
    const snapshot = await readSnapshot(args.repository, args.pr, token);
    output({
      mode: 'DRY_RUN',
      mutationAttempted: false,
      repository: args.repository,
      support: snapshot.support,
      ...snapshot.result,
      status: snapshot.status,
      mergeGateProjection: snapshot.mergeGateProjection,
      mergeGateResult: snapshot.mergeGateResult,
    });
    return;
  }
  await executeFinalization(args, token);
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKER_TOOLING', error: error.message }, null, 2));
  process.exitCode = 2;
});
