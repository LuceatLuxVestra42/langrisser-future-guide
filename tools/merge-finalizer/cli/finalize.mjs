#!/usr/bin/env node
import {
  assertSha,
  classifyExecutionBoundary,
  classifyMergeFinalization,
  findExactProjectCheckForWorkflowRun,
  PROJECT_CHECK_WORKFLOW,
  REQUIRED_PROJECT_CHECK,
  shouldRestartFinalization,
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
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRestarts: DEFAULT_MAX_RESTARTS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repository') args.repository = argv[++i] ?? null;
    else if (arg === '--pr') args.pr = Number(argv[++i]);
    else if (arg === '--execute') args.execute = true;
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
  return { mainSha, headSha, pr, support };
}

async function readSnapshot(repository, prNumber, token) {
  const boundary = await readBoundary(repository, prNumber, token);
  if (boundary.support.status !== 'SUPPORTED') {
    return { ...boundary, result: boundary.support, comparison: null, checkRuns: [] };
  }
  const [comparison, checks] = await Promise.all([
    githubRequest(repository, `/compare/${boundary.mainSha}...${boundary.headSha}`, token),
    githubRequest(repository, `/commits/${boundary.headSha}/check-runs?per_page=100`, token),
  ]);
  const checkRuns = checks?.check_runs ?? [];
  const result = classifyMergeFinalization({
    mainSha: boundary.mainSha,
    pr: boundary.pr,
    comparison,
    checkRuns,
  });
  return { ...boundary, comparison, checkRuns, result };
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

async function dispatchProjectCheck(repository, snapshot, token, options) {
  const body = {
    ref: snapshot.pr.head.ref,
    inputs: {
      base_sha: snapshot.mainSha,
      expected_head_sha: snapshot.headSha,
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
      { mainSha: snapshot.mainSha, headSha: snapshot.headSha },
      { mainSha: boundary.mainSha, headSha: boundary.headSha },
    );
    if (restart.restart) return { status: 'RESTART', reason: restart.reason, runId, boundary };

    const run = await githubRequest(repository, `/actions/runs/${runId}`, token);
    if (run?.head_sha !== snapshot.headSha || run?.event !== 'workflow_dispatch') {
      return {
        status: 'BLOCKER_PROJECT_CHECK_DISPATCH_MISMATCH',
        runId,
        expectedHeadSha: snapshot.headSha,
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

    const checks = await githubRequest(repository, `/commits/${snapshot.headSha}/check-runs?per_page=100`, token);
    const exact = findExactProjectCheckForWorkflowRun(
      checks?.check_runs ?? [],
      snapshot.headSha,
      runId,
      REQUIRED_PROJECT_CHECK,
    );
    if (!exact) continue;
    if (exact.status !== 'completed' || exact.conclusion !== 'success') {
      return { status: 'BLOCKER_OWNING_VALIDATOR', runId, checkId: exact.id, conclusion: exact.conclusion ?? null };
    }
    return { status: 'PASS', runId, checkId: exact.id };
  }
  return { status: 'BLOCKER_PROJECT_CHECK_TIMEOUT', headSha: snapshot.headSha };
}

async function executeFinalization(args, token) {
  if (!token) return blocker('BLOCKER_TOKEN_MISSING');
  let restarts = 0;
  let updates = 0;
  let dispatches = 0;

  while (true) {
    const snapshot = await readSnapshot(args.repository, args.pr, token);
    if (snapshot.support.status !== 'SUPPORTED') return blocker(snapshot.support.status, snapshot.support);

    const status = snapshot.result.status;
    if (status === 'BLOCKER_PR_NOT_OPEN' || status === 'BLOCKER_DRAFT' || status === 'BLOCKER_CONFLICT' || status === 'BLOCKER_OWNING_VALIDATOR') {
      return blocker(status, { snapshot: snapshot.result });
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
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: validation.reason, restarts });
        continue;
      }
      if (validation.status !== 'PASS') return blocker(validation.status, validation);
      const afterValidation = await readSnapshot(args.repository, args.pr, token);
      const restart = shouldRestartFinalization(
        { mainSha: snapshot.mainSha, headSha: snapshot.headSha },
        { mainSha: afterValidation.mainSha, headSha: afterValidation.headSha },
      );
      if (restart.restart) {
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: restart.reason, restarts });
        continue;
      }
      if (afterValidation.result.status !== 'READY_TO_MERGE') {
        return blocker(afterValidation.result.status, { snapshot: afterValidation.result, validation });
      }
      continue;
    }

    if (status !== 'READY_TO_MERGE') return blocker(status, { snapshot: snapshot.result });

    const guard = await readSnapshot(args.repository, args.pr, token);
    const restart = shouldRestartFinalization(
      { mainSha: snapshot.mainSha, headSha: snapshot.headSha },
      { mainSha: guard.mainSha, headSha: guard.headSha },
    );
    if (restart.restart) {
      restarts += 1;
      if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: restart.reason, restarts });
      continue;
    }
    if (guard.result.status !== 'READY_TO_MERGE') {
      if (guard.result.status === 'UPDATE_REQUIRED' || guard.result.status === 'CHECK_REQUIRED' || guard.result.status === 'CHECK_PENDING') {
        restarts += 1;
        if (restarts > args.maxRestarts) return blocker('BLOCKER_RESTART_EXHAUSTED', { reason: guard.result.status, restarts });
        continue;
      }
      return blocker(guard.result.status, { snapshot: guard.result });
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

    const [mergedPr, mainAfter, mergeCommit] = await Promise.all([
      githubRequest(args.repository, `/pulls/${args.pr}`, token),
      githubRequest(args.repository, '/branches/main', token),
      githubRequest(args.repository, `/commits/${merge.sha}`, token),
    ]);
    const firstParent = mergeCommit?.parents?.[0]?.sha ?? null;
    const postMergeBaseRace = firstParent !== guard.mainSha;
    if (mergedPr?.merged !== true || mergedPr?.merge_commit_sha !== merge.sha) {
      return blocker('BLOCKER_POST_MERGE_VERIFICATION', {
        mergeSha: merge.sha,
        merged: mergedPr?.merged ?? null,
        mergeCommitSha: mergedPr?.merge_commit_sha ?? null,
      });
    }

    output({
      status: postMergeBaseRace ? 'MERGED_REVIEW_POST_MERGE_BASE_RACE' : 'MERGED',
      mode: 'EXECUTE',
      repository: args.repository,
      prNumber: args.pr,
      validatedMainSha: guard.mainSha,
      validatedHeadSha: guard.headSha,
      mergeSha: merge.sha,
      mainAfterSha: mainAfter?.commit?.sha ?? null,
      firstParent,
      updates,
      dispatches,
      restarts,
      requiredCheck: REQUIRED_PROJECT_CHECK,
    });
    if (postMergeBaseRace) process.exitCode = 3;
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  if (!args.execute) {
    const snapshot = await readSnapshot(args.repository, args.pr, token);
    output({
      mode: 'DRY_RUN',
      mutationAttempted: false,
      repository: args.repository,
      support: snapshot.support,
      ...snapshot.result,
    });
    return;
  }
  await executeFinalization(args, token);
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKER_TOOLING', error: error.message }, null, 2));
  process.exitCode = 2;
});
