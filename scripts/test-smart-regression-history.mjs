#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fixturePath = path.join(repoRoot, 'data', 'fixtures', 'smart-regression-sr7-history.v1.json');
const runnerPath = path.join(repoRoot, 'scripts', 'smart-regression-sr4.mjs');
const MAX_BUFFER = 50 * 1024 * 1024;

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function verifyCommit(ref) {
  const result = spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Historical ref is unavailable in checkout: ${ref}: ${result.stderr?.trim() || 'git cat-file failed'}`);
  }
}

function runReplay(fixture) {
  verifyCommit(fixture.base);
  verifyCommit(fixture.head);

  const child = spawnSync(process.execPath, [
    runnerPath,
    '--dry-run',
    '--json',
    '--base', fixture.base,
    '--head', fixture.head,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });

  let report;
  try {
    report = JSON.parse(child.stdout || '{}');
  } catch (error) {
    return {
      fixtureId: fixture.id,
      pass: false,
      falseNegatives: [],
      replayErrors: [`Smart Regression JSON parse failed: ${error.message}`],
      exitCode: Number.isInteger(child.status) ? child.status : 1,
      stdoutTail: (child.stdout ?? '').slice(-2000),
      stderrTail: (child.stderr ?? '').slice(-2000),
    };
  }

  const requested = new Set(report.requestedGates ?? []);
  const composite = new Set(report.compositeGates ?? []);
  const leaf = new Set(report.leafGates ?? []);
  const falseNegatives = [];
  const replayErrors = [];

  for (const gate of fixture.requiredRequestedGates ?? []) {
    if (!requested.has(gate)) falseNegatives.push(`requested:${gate}`);
  }
  for (const gate of fixture.requiredCompositeGates ?? []) {
    if (!composite.has(gate)) falseNegatives.push(`composite:${gate}`);
  }
  for (const gate of fixture.requiredLeafGates ?? []) {
    if (!leaf.has(gate)) falseNegatives.push(`leaf:${gate}`);
  }

  const exitCode = Number.isInteger(child.status) ? child.status : 1;
  if (![0, 2].includes(exitCode)) {
    replayErrors.push(`unexpected dry-run exit code: ${exitCode}`);
  }
  if (!(fixture.allowedStatuses ?? []).includes(report.status)) {
    replayErrors.push(`status ${String(report.status)} is not allowed for this historical replay`);
  }

  return {
    fixtureId: fixture.id,
    domain: fixture.domain,
    pass: falseNegatives.length === 0 && replayErrors.length === 0,
    falseNegatives,
    replayErrors,
    legacyEvidence: fixture.legacyEvidence,
    observed: {
      base: fixture.base,
      head: fixture.head,
      exitCode,
      status: report.status ?? null,
      changedFileCount: report.changedFiles?.length ?? null,
      changedFiles: report.changedFiles ?? [],
      affectedDomains: report.affectedDomains ?? [],
      matchedRules: report.matchedRules ?? [],
      requestedGates: report.requestedGates ?? [],
      compositeGates: report.compositeGates ?? [],
      leafGates: report.leafGates ?? [],
      executableGateIds: report.executableGates?.map((row) => row.id) ?? [],
      unboundGateIds: report.unboundGates?.map((row) => row.id) ?? [],
      unknownPaths: report.unknownPaths ?? [],
    },
  };
}

function main() {
  const fixtureDoc = loadJson(fixturePath);
  if (fixtureDoc.schemaVersion !== 1 || !Array.isArray(fixtureDoc.cases)) {
    throw new Error('Unsupported or invalid SR-7 history fixture document.');
  }

  const cases = fixtureDoc.cases.map(runReplay);
  const falseNegativeCount = cases.reduce((sum, row) => sum + row.falseNegatives.length, 0);
  const replayErrorCount = cases.reduce((sum, row) => sum + row.replayErrors.length, 0);
  const failedCaseCount = cases.filter((row) => !row.pass).length;
  const preexistingFailureCount = fixtureDoc.cases.reduce((sum, fixture) => {
    const failure = fixture.legacyEvidence?.relatedLegacyFailure;
    return sum + (failure?.classification === 'PREEXISTING_UNCHANGED_INPUT' ? 1 : 0);
  }, 0);

  const summary = {
    version: 1,
    stage: 'SMART_REGRESSION_SR7',
    status: failedCaseCount === 0 && falseNegativeCount === 0 && replayErrorCount === 0 ? 'PASS' : 'FAIL',
    completion: failedCaseCount === 0 && falseNegativeCount === 0 && replayErrorCount === 0
      ? 'SR7_REAL_HISTORY_COMPARISON_COMPLETE'
      : null,
    policy: fixtureDoc.falseNegativePolicy,
    metrics: {
      historicalCaseCount: cases.length,
      passedCaseCount: cases.length - failedCaseCount,
      failedCaseCount,
      observedFalseNegativeCount: falseNegativeCount,
      replayErrorCount,
      preexistingUnchangedInputFailureCount: preexistingFailureCount,
    },
    cases,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`SMART REGRESSION SR-7 HISTORY ERROR: ${error.message}`);
  process.exitCode = 1;
}
