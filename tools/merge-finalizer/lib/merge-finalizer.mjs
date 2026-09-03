export const REQUIRED_PROJECT_CHECK = Object.freeze({
  name: 'project-check',
  appId: 15368,
});

const BLOCKING_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'stale',
  'timed_out',
]);

function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`${label} must be a 40-character Git SHA`);
  }
}

function newestExactCheck(checkRuns, headSha, requiredCheck) {
  const exact = (checkRuns ?? []).filter(check => (
    check?.name === requiredCheck.name
    && check?.app?.id === requiredCheck.appId
    && check?.head_sha === headSha
  ));
  exact.sort((a, b) => {
    const aTime = Date.parse(a?.started_at ?? a?.completed_at ?? '') || 0;
    const bTime = Date.parse(b?.started_at ?? b?.completed_at ?? '') || 0;
    if (aTime !== bTime) return bTime - aTime;
    return Number(b?.id ?? 0) - Number(a?.id ?? 0);
  });
  return exact[0] ?? null;
}

export function classifyMergeFinalization(snapshot, options = {}) {
  const requiredCheck = options.requiredCheck ?? REQUIRED_PROJECT_CHECK;
  const { mainSha, pr, comparison, checkRuns = [] } = snapshot ?? {};

  assertSha(mainSha, 'mainSha');
  assertSha(pr?.head?.sha, 'pr.head.sha');

  const resultBase = {
    mainSha,
    prNumber: pr.number,
    headSha: pr.head.sha,
    mergeable: pr.mergeable ?? null,
    mergeableState: pr.mergeable_state ?? null,
    behindBy: Number(comparison?.behind_by ?? 0),
    requiredCheck,
  };

  if (pr.state !== 'open') return { ...resultBase, status: 'BLOCKER_PR_NOT_OPEN' };
  if (pr.draft === true) return { ...resultBase, status: 'BLOCKER_DRAFT' };
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
    return { ...resultBase, status: 'BLOCKER_CONFLICT' };
  }
  if (pr.mergeable == null || pr.mergeable_state === 'unknown') {
    return { ...resultBase, status: 'WAIT_MERGEABILITY' };
  }
  if (!Number.isInteger(resultBase.behindBy) || resultBase.behindBy < 0) {
    throw new Error('comparison.behind_by must be a non-negative integer');
  }
  if (resultBase.behindBy > 0) return { ...resultBase, status: 'UPDATE_REQUIRED' };

  const check = newestExactCheck(checkRuns, pr.head.sha, requiredCheck);
  if (!check) return { ...resultBase, status: 'CHECK_REQUIRED', check: null };
  if (check.status !== 'completed') {
    return { ...resultBase, status: 'CHECK_PENDING', check: summarizeCheck(check) };
  }
  if (check.conclusion === 'success') {
    return { ...resultBase, status: 'READY_TO_MERGE', check: summarizeCheck(check) };
  }
  if (BLOCKING_CONCLUSIONS.has(check.conclusion)) {
    return { ...resultBase, status: 'BLOCKER_OWNING_VALIDATOR', check: summarizeCheck(check) };
  }
  return { ...resultBase, status: 'CHECK_NOT_SUCCESSFUL', check: summarizeCheck(check) };
}

export function shouldRestartFinalization(before, after) {
  assertSha(before?.mainSha, 'before.mainSha');
  assertSha(before?.headSha, 'before.headSha');
  assertSha(after?.mainSha, 'after.mainSha');
  assertSha(after?.headSha, 'after.headSha');
  if (before.mainSha !== after.mainSha) return { restart: true, reason: 'MAIN_CHANGED' };
  if (before.headSha !== after.headSha) return { restart: true, reason: 'HEAD_CHANGED' };
  return { restart: false, reason: null };
}

function summarizeCheck(check) {
  return {
    id: check.id ?? null,
    name: check.name,
    appId: check.app?.id ?? null,
    headSha: check.head_sha,
    status: check.status,
    conclusion: check.conclusion ?? null,
    startedAt: check.started_at ?? null,
    completedAt: check.completed_at ?? null,
  };
}
