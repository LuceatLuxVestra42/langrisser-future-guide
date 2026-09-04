import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function runGit(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function normalizeStatusLines(text) {
  return text
    .split(/\r?\n/u)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .sort();
}

export function collectTrackedMutationSignature(repoRoot = process.cwd()) {
  const statusText = runGit(repoRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
  ]);
  const lines = normalizeStatusLines(statusText);
  const diff = runGit(repoRoot, [
    'diff',
    '--binary',
    '--no-ext-diff',
    '--no-color',
    'HEAD',
  ]);

  return {
    lines,
    diffSha256: crypto.createHash('sha256').update(diff).digest('hex'),
  };
}

export function isEmptyTrackedMutation(signature) {
  return signature.lines.length === 0;
}

export function sameTrackedMutation(headSignature, baseSignature) {
  return (
    JSON.stringify(headSignature.lines) === JSON.stringify(baseSignature.lines) &&
    headSignature.diffSha256 === baseSignature.diffSha256
  );
}

export function classifyTrackedMutation(headSignature, baseSignature) {
  if (isEmptyTrackedMutation(headSignature)) {
    return {
      status: 'PASS',
      exitCode: 0,
      reason: 'NO_TRACKED_MUTATION',
    };
  }

  if (
    baseSignature &&
    !isEmptyTrackedMutation(baseSignature) &&
    sameTrackedMutation(headSignature, baseSignature)
  ) {
    return {
      status: 'REVIEW_EXISTING_DRIFT',
      exitCode: 0,
      reason: 'EXACT_BASE_HAS_IDENTICAL_TRACKED_MUTATION',
    };
  }

  return {
    status: 'REGRESSION_BLOCKER',
    exitCode: 1,
    reason: 'HEAD_TRACKED_MUTATION_NOT_IDENTICAL_ON_EXACT_BASE',
  };
}
