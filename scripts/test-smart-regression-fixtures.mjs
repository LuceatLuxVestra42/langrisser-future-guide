#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fixturePath = path.join(repoRoot, 'data', 'fixtures', 'smart-regression-sr5-cases.v1.json');
const sr4Runner = path.join(repoRoot, 'scripts', 'smart-regression-sr4.mjs');
const sr3Runner = path.join(repoRoot, 'scripts', 'smart-regression.mjs');
const MAX_BUFFER = 50 * 1024 * 1024;

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function setOf(report, field) {
  const value = report[field] ?? [];
  if (field === 'executableGates' || field === 'unboundGates') return new Set(value.map((row) => row.id));
  return new Set(value);
}

function checkIncludes(actualSet, expected = [], label, failures, falseNegatives) {
  for (const value of expected) {
    if (!actualSet.has(value)) {
      failures.push(`${label} missing: ${value}`);
      falseNegatives.push(`${label}:${value}`);
    }
  }
}

function checkForbidden(actualSet, forbidden = [], label, failures) {
  for (const value of forbidden) {
    if (actualSet.has(value)) failures.push(`${label} unexpectedly contains: ${value}`);
  }
}

function runJson(command, args) {
  const child = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });
  let report = null;
  try {
    report = JSON.parse(child.stdout || '{}');
  } catch (error) {
    return {
      exitCode: Number.isInteger(child.status) ? child.status : 1,
      report: null,
      parseError: error.message,
      stdout: child.stdout ?? '',
      stderr: child.stderr ?? '',
    };
  }
  return {
    exitCode: Number.isInteger(child.status) ? child.status : 1,
    report,
    parseError: null,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  };
}

function runSelectionCase(fixture) {
  const args = [sr4Runner, '--dry-run', '--json'];
  for (const file of fixture.files) args.push('--file', file);
  const result = runJson(process.execPath, args);
  const failures = [];
  const falseNegatives = [];

  if (result.parseError) {
    failures.push(`JSON parse failed: ${result.parseError}`);
    return { fixtureId: fixture.id, pass: false, failures, falseNegatives: ['REPORT_NOT_PARSEABLE'], result };
  }

  const report = result.report;
  if (result.exitCode !== fixture.expectedExitCode) failures.push(`exitCode expected=${fixture.expectedExitCode} actual=${result.exitCode}`);
  if (report.status !== fixture.expectedStatus) failures.push(`status expected=${fixture.expectedStatus} actual=${report.status}`);

  const fields = {
    RequestedGates: setOf(report, 'requestedGates'),
    CompositeGates: setOf(report, 'compositeGates'),
    LeafGates: setOf(report, 'leafGates'),
    ExecutableGates: setOf(report, 'executableGates'),
    UnboundGates: setOf(report, 'unboundGates'),
    MatchedRules: setOf(report, 'matchedRules'),
    UnknownPaths: setOf(report, 'unknownPaths'),
    Domains: setOf(report, 'affectedDomains'),
  };

  for (const [suffix, actual] of Object.entries(fields)) {
    checkIncludes(actual, fixture[`required${suffix}`] ?? [], suffix, failures, falseNegatives);
    checkForbidden(actual, fixture[`forbidden${suffix}`] ?? [], suffix, failures);
  }

  return {
    fixtureId: fixture.id,
    pass: failures.length === 0,
    failures,
    falseNegatives,
    observed: {
      exitCode: result.exitCode,
      status: report.status,
      matchedRules: report.matchedRules,
      requestedGates: report.requestedGates,
      leafGates: report.leafGates,
      executableGateIds: report.executableGates?.map((row) => row.id) ?? [],
      unboundGateIds: report.unboundGates?.map((row) => row.id) ?? [],
      unknownPaths: report.unknownPaths,
      affectedDomains: report.affectedDomains,
    },
  };
}

function runSyntheticExecutorChecks() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'smart-regression-sr5-executor-'));
  const mapPath = path.join(tempDir, 'map.json');
  const bindingsPath = path.join(tempDir, 'bindings.json');
  const map = {
    schemaVersion: 1,
    id: 'smart-regression-sr5-synthetic',
    status: 'SR5_SYNTHETIC',
    docsOnly: { globs: [], selectedGates: [] },
    gates: {
      'synthetic.a': { domain: 'global', kind: 'LEAF', command: 'node -e "process.exit(0)"', executable: true, resolutionStatus: 'VERIFIED_EXECUTABLE' },
      'synthetic.b': { domain: 'global', kind: 'LEAF', command: 'node -e "process.exit(0)"', executable: true, resolutionStatus: 'VERIFIED_EXECUTABLE' },
      'synthetic.fail': { domain: 'global', kind: 'LEAF', command: 'node -e "process.exit(7)"', executable: true, resolutionStatus: 'VERIFIED_EXECUTABLE' },
      'synthetic.after': { domain: 'global', kind: 'LEAF', command: 'node -e "process.exit(0)"', executable: true, resolutionStatus: 'VERIFIED_EXECUTABLE' }
    },
    rules: [
      { id: 'dedupe', domain: 'global', match: ['__sr5__/dedupe'], select: ['synthetic.a', 'synthetic.b'] },
      { id: 'fail-fast', domain: 'global', match: ['__sr5__/fail-fast'], select: ['synthetic.fail', 'synthetic.after'] }
    ],
    fallback: { unknownPath: [] }
  };
  const bindings = {
    schemaVersion: 1,
    id: 'smart-regression-sr5-synthetic-bindings',
    status: 'SR5_SYNTHETIC',
    impactMapId: map.id,
    bindings: {},
    unresolvedGateIds: []
  };
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  writeFileSync(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`);

  try {
    const dedupe = runJson(process.execPath, [sr3Runner, '--execute', '--json', '--file', '__sr5__/dedupe', '--map', mapPath, '--bindings', bindingsPath]);
    const failFast = runJson(process.execPath, [sr3Runner, '--execute', '--json', '--file', '__sr5__/fail-fast', '--map', mapPath, '--bindings', bindingsPath]);
    const failures = [];

    if (dedupe.exitCode !== 0 || dedupe.report?.status !== 'PASS_EXECUTED') failures.push('dedupe execution did not PASS_EXECUTED');
    if (dedupe.report?.execution?.plannedCommandCount !== 1) failures.push(`dedupe plannedCommandCount expected=1 actual=${dedupe.report?.execution?.plannedCommandCount}`);
    const dedupeRows = dedupe.report?.execution?.results ?? [];
    if (dedupeRows.length !== 1 || dedupeRows[0]?.status !== 'PASS') failures.push('dedupe result count/status mismatch');
    const dedupeGateIds = [...(dedupeRows[0]?.gateIds ?? [])].sort();
    if (JSON.stringify(dedupeGateIds) !== JSON.stringify(['synthetic.a', 'synthetic.b'])) failures.push(`dedupe gateIds mismatch: ${JSON.stringify(dedupeGateIds)}`);

    if (failFast.exitCode !== 1 || failFast.report?.status !== 'FAILED_VALIDATOR') failures.push('fail-fast execution did not FAILED_VALIDATOR/exit1');
    const failRows = failFast.report?.execution?.results ?? [];
    if (failRows.length !== 2) failures.push(`fail-fast result count expected=2 actual=${failRows.length}`);
    if (failRows[0]?.status !== 'FAIL' || failRows[0]?.exitCode !== 7) failures.push('fail-fast first command did not fail with exit 7');
    if (failRows[1]?.status !== 'NOT_RUN' || failRows[1]?.reason !== 'FAIL_FAST') failures.push('fail-fast second command was not marked NOT_RUN/FAIL_FAST');

    return {
      pass: failures.length === 0,
      failures,
      dedupe: {
        exitCode: dedupe.exitCode,
        status: dedupe.report?.status ?? null,
        plannedCommandCount: dedupe.report?.execution?.plannedCommandCount ?? null,
        results: dedupe.report?.execution?.results ?? []
      },
      failFast: {
        exitCode: failFast.exitCode,
        status: failFast.report?.status ?? null,
        results: failFast.report?.execution?.results ?? []
      }
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const fixtureDoc = loadJson(fixturePath);
  const cases = fixtureDoc.cases.map(runSelectionCase);
  const executor = runSyntheticExecutorChecks();
  const falseNegativeCount = cases.reduce((sum, row) => sum + row.falseNegatives.length, 0);
  const failedCaseCount = cases.filter((row) => !row.pass).length;
  const summary = {
    version: 1,
    stage: 'SMART_REGRESSION_SR5',
    status: failedCaseCount === 0 && falseNegativeCount === 0 && executor.pass ? 'PASS' : 'FAIL',
    completion: failedCaseCount === 0 && falseNegativeCount === 0 && executor.pass ? 'SR5_REPRESENTATIVE_FIXTURES_COMPLETE' : null,
    metrics: {
      representativeCaseCount: cases.length,
      passedCaseCount: cases.length - failedCaseCount,
      failedCaseCount,
      falseNegativeCount,
      executorControlChecksPassed: executor.pass
    },
    cases,
    executor
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`SMART REGRESSION SR-5 FIXTURE ERROR: ${error.message}`);
  process.exitCode = 1;
}
