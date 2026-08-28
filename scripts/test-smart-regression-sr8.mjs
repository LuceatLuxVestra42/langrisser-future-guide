#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const admissionPath = path.join(repoRoot, 'scripts', 'smart-regression-sr8-admission.mjs');
const MAX_BUFFER = 50 * 1024 * 1024;

function runCase(testCase) {
  const child = spawnSync(process.execPath, [admissionPath, '--json', ...testCase.args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: MAX_BUFFER,
  });

  let report = null;
  const failures = [];
  try {
    report = JSON.parse(child.stdout || '{}');
  } catch (error) {
    failures.push(`JSON parse failed: ${error.message}`);
  }

  const exitCode = Number.isInteger(child.status) ? child.status : 1;
  if (exitCode !== testCase.expectedExitCode) failures.push(`exit ${exitCode} != ${testCase.expectedExitCode}`);
  if (report?.decision !== testCase.expectedDecision) failures.push(`decision ${String(report?.decision)} != ${testCase.expectedDecision}`);
  if (report?.replacementEligible !== testCase.expectedEligible) failures.push(`eligible ${String(report?.replacementEligible)} != ${testCase.expectedEligible}`);
  if (testCase.expectedClassId !== undefined && report?.replacementClassId !== testCase.expectedClassId) {
    failures.push(`class ${String(report?.replacementClassId)} != ${String(testCase.expectedClassId)}`);
  }
  for (const gateId of testCase.requiredLeafGates ?? []) {
    if (!(report?.selector?.leafGates ?? []).includes(gateId)) failures.push(`missing leaf gate ${gateId}`);
  }
  for (const gateId of testCase.forbiddenLeafGates ?? []) {
    if ((report?.selector?.leafGates ?? []).includes(gateId)) failures.push(`forbidden leaf gate selected ${gateId}`);
  }
  if (testCase.expectedExecutionStatus !== undefined && report?.execution?.status !== testCase.expectedExecutionStatus) {
    failures.push(`execution ${String(report?.execution?.status)} != ${String(testCase.expectedExecutionStatus)}`);
  }
  if (testCase.expectedPlannedCommandCount !== undefined && report?.execution?.plannedCommandCount !== testCase.expectedPlannedCommandCount) {
    failures.push(`planned commands ${String(report?.execution?.plannedCommandCount)} != ${testCase.expectedPlannedCommandCount}`);
  }

  return {
    id: testCase.id,
    pass: failures.length === 0,
    failures,
    exitCode,
    stderrTail: (child.stderr ?? '').slice(-2000),
    observed: report ? {
      decision: report.decision,
      replacementEligible: report.replacementEligible,
      replacementClassId: report.replacementClassId,
      selectorStatus: report.selector?.status ?? null,
      changedFiles: report.selector?.changedFiles ?? [],
      leafGates: report.selector?.leafGates ?? [],
      unboundGateIds: report.selector?.unboundGateIds ?? [],
      unknownPaths: report.selector?.unknownPaths ?? [],
      execution: report.execution,
    } : null,
  };
}

function main() {
  const cases = [
    {
      id: 'historical-c1-pr-admission',
      args: ['--dry-run', '--base', '4b3deac6fbd4ed08ba71af947d49e1d1cd4cf420', '--head', '6cb318c51db6ac44e799d378619d90fe06d1aea4'],
      expectedExitCode: 0,
      expectedDecision: 'REPLACEMENT_ELIGIBLE',
      expectedEligible: true,
      expectedClassId: 'hero-soldier-pair-parity',
      requiredLeafGates: ['hero-soldier.pair-parity'],
    },
    {
      id: 'explicit-c1-frozen-artifact-admission',
      args: ['--dry-run', '--file', 'data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json'],
      expectedExitCode: 0,
      expectedDecision: 'REPLACEMENT_ELIGIBLE',
      expectedEligible: true,
      expectedClassId: 'hero-soldier-pair-parity',
      requiredLeafGates: ['hero-soldier.pair-parity'],
    },
    {
      id: 'soldier-224-history-remains-legacy',
      args: ['--dry-run', '--base', 'e736d4d031e0a20bde28ece6a8460935e0b477f0', '--head', '4428d59d42133054c512283e5e67ce6fd1124ba3'],
      expectedExitCode: 3,
      expectedDecision: 'LEGACY_REQUIRED',
      expectedEligible: false,
      expectedClassId: null,
      requiredLeafGates: ['soldier.portrait.integrity', 'soldier.frontend.route'],
    },
    {
      id: 'docs-only-remains-nonreplacement',
      args: ['--dry-run', '--file', 'README.md'],
      expectedExitCode: 3,
      expectedDecision: 'LEGACY_REQUIRED',
      expectedEligible: false,
      expectedClassId: null,
    },
    {
      id: 'historical-c1-pr-executes-through-smart-runner',
      args: ['--execute', '--base', '4b3deac6fbd4ed08ba71af947d49e1d1cd4cf420', '--head', '6cb318c51db6ac44e799d378619d90fe06d1aea4'],
      expectedExitCode: 0,
      expectedDecision: 'REPLACEMENT_EXECUTED',
      expectedEligible: true,
      expectedClassId: 'hero-soldier-pair-parity',
      requiredLeafGates: ['hero-soldier.pair-parity'],
      expectedExecutionStatus: 'PASS_EXECUTED',
      expectedPlannedCommandCount: 1,
    }
  ];

  const results = cases.map(runCase);
  const failed = results.filter((row) => !row.pass);
  const summary = {
    version: 1,
    stage: 'SMART_REGRESSION_SR8',
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    completion: failed.length === 0 ? 'SR8_PARTIAL_REPLACEMENT_TESTS_COMPLETE' : null,
    metrics: {
      caseCount: results.length,
      passedCaseCount: results.length - failed.length,
      failedCaseCount: failed.length,
      eligibleAdmissionCaseCount: results.filter((row) => row.observed?.replacementEligible).length,
      actualReplacementExecutionCount: results.filter((row) => row.observed?.decision === 'REPLACEMENT_EXECUTED').length,
      legacyRequiredCaseCount: results.filter((row) => row.observed?.decision === 'LEGACY_REQUIRED').length
    },
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`SMART REGRESSION SR-8 TEST ERROR: ${error.message}`);
  process.exitCode = 1;
}
