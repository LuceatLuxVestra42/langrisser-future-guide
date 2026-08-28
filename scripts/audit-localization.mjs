import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-stage5.v1.json';
const SNAPSHOT_PATH = 'data/validation/localization-audit-stage5.v1.json';
const STAGE4_SCRIPT = 'scripts/audit-localization-stage4.mjs';

const readText = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function runNode(script, args = []) {
  const run = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    status: run.status ?? 1,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
  };
}

function loadStage4() {
  const check = runNode(STAGE4_SCRIPT, ['--check']);
  if (check.status !== 0) {
    throw new Error(`Stage 4 audit gate failed before Stage 5 formalization.\n${check.stdout}${check.stderr}`);
  }

  const json = runNode(STAGE4_SCRIPT, ['--json']);
  if (json.status !== 0) {
    throw new Error(`Stage 4 machine result failed before Stage 5 formalization.\n${json.stdout}${json.stderr}`);
  }

  return JSON.parse(json.stdout);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function buildResult(stage4 = loadStage4()) {
  const contract = readJson(CONTRACT_PATH);
  const packageJson = readJson('package.json');
  const stage2_1Source = readText(contract.historicalCompatibility.stage2_1Runner);
  const ciSource = readText(contract.ci.workflow);
  const errors = [];

  const contractFrozen =
    contract.schemaId === 'localization-audit-stage5-contract/v1' &&
    contract.stage === 5 &&
    contract.status === 'FROZEN' &&
    contract.scope?.mode === 'READ_ONLY_AUDIT';
  if (!contractFrozen) {
    errors.push(fail('STAGE5_CONTRACT_MISMATCH', 'Stage 5 localization audit contract is not the expected frozen read-only contract.'));
  }

  const stage4SchemaMatches = stage4.schemaId === contract.inheritance.requiredSchemaId && stage4.stage === contract.inheritance.requiredStage;
  if (!stage4SchemaMatches) {
    errors.push(fail('STAGE4_INHERITANCE_MISMATCH', 'Stage 4 schema/stage does not match the frozen Stage 5 inheritance contract.'));
  }

  const stage4StatusAccepted = contract.inheritance.allowedStatuses.includes(stage4.status);
  if (!stage4StatusAccepted) {
    errors.push(fail('STAGE4_GATE_NOT_ACCEPTED', `Stage 4 status ${stage4.status} is not accepted by Stage 5.`));
  }

  const baseline = contract.inheritance.expectedBaseline;
  const stage4Baseline = {
    soldierRecords: stage4.effectiveDisplay?.soldier?.records ?? null,
    heroRecords: stage4.effectiveDisplay?.hero?.listRecords ?? null,
    equipmentRecords: stage4.effectiveDisplay?.equipment?.canonicalRecords ?? null,
    equipmentPublicRecords: stage4.effectiveDisplay?.equipment?.admittedRecords ?? null,
    errors: stage4.summary?.errors ?? null,
    reviews: stage4.summary?.reviews ?? null,
    frontendLocalizationLeakErrors: stage4.summary?.frontendLocalizationLeakErrors ?? null,
  };
  const baselineMatches = JSON.stringify(stable(stage4Baseline)) === JSON.stringify(stable(baseline));
  if (!baselineMatches) {
    errors.push(fail('STAGE4_BASELINE_MISMATCH', 'Stage 4 baseline no longer matches the frozen Stage 5 adoption baseline.', {
      expected: baseline,
      actual: stage4Baseline,
    }));
  }

  const packageScriptExact = packageJson.scripts?.[contract.command.packageScript] === contract.command.packageCommand;
  if (!packageScriptExact) {
    errors.push(fail('FORMAL_COMMAND_MISMATCH', `package.json must define ${contract.command.packageScript} exactly as ${contract.command.packageCommand}.`));
  }

  const historicalStage2RunnerExists = fileExists(contract.historicalCompatibility.stage2Runner);
  if (!historicalStage2RunnerExists) {
    errors.push(fail('HISTORICAL_STAGE2_RUNNER_MISSING', 'Preserved Stage 2 localization audit runner is missing.'));
  }

  const stage2_1UsesPreservedStage2 = stage2_1Source.includes(`const STAGE2_SCRIPT = '${contract.historicalCompatibility.requiredStage2_1Reference}';`);
  if (!stage2_1UsesPreservedStage2) {
    errors.push(fail('HISTORICAL_STAGE2_BRIDGE_MISMATCH', 'Stage 2.1 does not point to the preserved Stage 2 runner.'));
  }

  const requiredCiMarkers = [
    'name: Localization Audit',
    'pull_request:',
    'push:',
    'workflow_dispatch:',
    'npm run audit:localization -- --check --report',
    'npm run audit:localization -- --self-test',
    contract.ci.reportArtifact,
  ];
  const permanentCiDeclared = requiredCiMarkers.every((marker) => ciSource.includes(marker));
  if (!permanentCiDeclared) {
    errors.push(fail('PERMANENT_CI_MISMATCH', 'Permanent localization audit CI does not match the Stage 5 contract.'));
  }

  const status = errors.length > 0 ? 'FAIL' : stage4.status;

  return {
    version: 1,
    schemaId: 'localization-audit-stage5/v1',
    stage: 5,
    status,
    mode: 'READ_ONLY_AUDIT',
    purpose: 'formalize the completed localization audit as one package command, deterministic machine report, and permanent CI gate',
    sources: {
      contract: CONTRACT_PATH,
      inheritedStage4Runner: STAGE4_SCRIPT,
      inheritedStage4Snapshot: contract.inheritance.snapshot,
      packageJson: 'package.json',
      ciWorkflow: contract.ci.workflow,
      historicalStage2Runner: contract.historicalCompatibility.stage2Runner,
      stage2_1Runner: contract.historicalCompatibility.stage2_1Runner,
    },
    command: {
      packageScript: contract.command.packageScript,
      packageCommand: contract.command.packageCommand,
      entrypoint: contract.command.entrypoint,
      supportedOptions: contract.command.supportedOptions,
    },
    inheritedStage4: {
      schemaId: stage4.schemaId,
      status: stage4.status,
      soldierRecords: stage4Baseline.soldierRecords,
      soldierEffectiveKoreanDisplays: stage4.effectiveDisplay?.soldier?.effectiveKoreanDisplays ?? null,
      heroRecords: stage4Baseline.heroRecords,
      heroEffectiveKoreanDisplays: stage4.effectiveDisplay?.hero?.effectiveKoreanDisplays ?? null,
      equipmentRecords: stage4Baseline.equipmentRecords,
      equipmentPublicRecords: stage4Baseline.equipmentPublicRecords,
      equipmentEffectiveKoreanDisplays: stage4.effectiveDisplay?.equipment?.effectiveKoreanDisplays ?? null,
      equipmentNonPublicAdmitted: stage4.effectiveDisplay?.equipment?.nonPublicAdmitted ?? null,
      frontendFilesChecked: stage4.frontendBoundary?.filesChecked ?? null,
      errors: stage4Baseline.errors,
      reviews: stage4Baseline.reviews,
      frontendLocalizationLeakErrors: stage4Baseline.frontendLocalizationLeakErrors,
    },
    machineReport: {
      schemaId: contract.machineReport.schemaId,
      format: contract.machineReport.format,
      stdoutFlag: contract.machineReport.stdoutFlag,
      fileFlag: contract.machineReport.fileFlag,
      deterministic: contract.machineReport.deterministic,
      repositoryInputMutationAllowed: contract.machineReport.repositoryInputMutationAllowed,
    },
    ci: {
      workflow: contract.ci.workflow,
      permanent: contract.ci.permanent,
      triggers: contract.ci.triggers,
      reportArtifact: contract.ci.reportArtifact,
    },
    checks: {
      contractFrozen,
      stage4SnapshotGatePassed: true,
      stage4SchemaMatches,
      stage4StatusAccepted,
      baselineMatches,
      packageScriptExact,
      historicalStage2RunnerExists,
      stage2_1UsesPreservedStage2,
      permanentCiDeclared,
      readOnlyExecution: true,
    },
    summary: {
      errors: (stage4Baseline.errors ?? 0) + errors.length,
      reviews: stage4Baseline.reviews,
      frontendLocalizationLeakErrors: stage4Baseline.frontendLocalizationLeakErrors,
      soldierRecords: stage4Baseline.soldierRecords,
      heroRecords: stage4Baseline.heroRecords,
      equipmentRecords: stage4Baseline.equipmentRecords,
      equipmentPublicRecords: stage4Baseline.equipmentPublicRecords,
    },
    errors,
    readOnlyExecution: true,
  };
}

function writeReport(outputPath, result) {
  const resolved = path.resolve(ROOT, outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resolved;
}

function runSelfTest() {
  const inheritedRun = runNode(STAGE4_SCRIPT, ['--self-test']);
  const inheritedText = `${inheritedRun.stdout}\n${inheritedRun.stderr}`;
  const inheritedMatch = inheritedText.match(/PASS\s*\((\d+)\/(\d+)\)/u);
  const inheritedPassed = inheritedRun.status === 0 && inheritedMatch ? Number(inheritedMatch[1]) : 0;
  const inheritedTotal = inheritedMatch ? Number(inheritedMatch[2]) : 23;

  const stage4 = loadStage4();
  const baseline = buildResult(stage4);
  const contract = readJson(CONTRACT_PATH);
  const tests = [];

  tests.push({
    name: 'formal-package-command',
    passed: baseline.checks.packageScriptExact,
  });
  tests.push({
    name: 'historical-stage2-bridge',
    passed: baseline.checks.historicalStage2RunnerExists && baseline.checks.stage2_1UsesPreservedStage2,
  });
  tests.push({
    name: 'permanent-ci-contract',
    passed: baseline.checks.permanentCiDeclared,
  });
  tests.push({
    name: 'deterministic-machine-report',
    passed: JSON.stringify(stable(baseline)) === JSON.stringify(stable(buildResult(stage4))),
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localization-audit-stage5-'));
  const tempReport = path.join(tempDir, 'report.json');
  let reportRoundTrip = false;
  try {
    writeReport(tempReport, baseline);
    reportRoundTrip = JSON.stringify(stable(readJson(path.relative(ROOT, tempReport)))) === JSON.stringify(stable(baseline));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tests.push({ name: 'machine-report-file-roundtrip', passed: reportRoundTrip });

  const failedStage4 = clone(stage4);
  failedStage4.status = 'FAIL';
  tests.push({
    name: 'inherited-fail-propagation',
    passed: buildResult(failedStage4).status === 'FAIL',
  });

  const additionsPassed = tests.filter((test) => test.passed).length;
  const additionsTotal = tests.length;
  const inheritedOk = inheritedRun.status === 0 && inheritedPassed === inheritedTotal;
  const status = inheritedOk && additionsPassed === additionsTotal ? 'PASS' : 'FAIL';

  return {
    status,
    passed: inheritedPassed + additionsPassed,
    total: inheritedTotal + additionsTotal,
    inherited: { passed: inheritedPassed, total: inheritedTotal },
    additions: { passed: additionsPassed, total: additionsTotal, tests },
    contractSchemaId: contract.schemaId,
  };
}

function parseCli(argv) {
  const options = {
    check: false,
    json: false,
    selfTest: false,
    reportPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--report') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--report requires an output path.');
      options.reportPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown localization audit option: ${arg}`);
    }
  }
  return options;
}

let options;
try {
  options = parseCli(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (options.selfTest) {
  const selfTest = runSelfTest();
  console.log(`Localization Audit Stage 5 self-test: ${selfTest.status} (${selfTest.passed}/${selfTest.total})`);
  console.log(`Inherited Stage 4: ${selfTest.inherited.passed}/${selfTest.inherited.total}; Stage 5 additions: ${selfTest.additions.passed}/${selfTest.additions.total}`);
  if (selfTest.status !== 'PASS') {
    for (const test of selfTest.additions.tests.filter((row) => !row.passed)) console.error(`FAILED ${test.name}`);
    process.exit(1);
  }
  process.exit(0);
}

let result;
try {
  result = buildResult();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let reportPath = null;
if (options.reportPath) {
  reportPath = writeReport(options.reportPath, result);
}

if (result.status === 'FAIL') {
  console.error('Localization Audit Stage 5: FAIL');
  for (const row of result.errors) console.error(`${row.code}: ${row.message}`);
  process.exit(1);
}

if (options.check) {
  const expected = readJson(SNAPSHOT_PATH);
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization Audit Stage 5 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 5: ${result.status}`);
  console.log(`Soldier ${result.summary.soldierRecords}, Hero ${result.summary.heroRecords}, Equipment ${result.summary.equipmentRecords} / public ${result.summary.equipmentPublicRecords}`);
  console.log(`errors ${result.summary.errors}, reviews ${result.summary.reviews}, frontend leaks ${result.summary.frontendLocalizationLeakErrors}`);
  if (reportPath) console.log(`machine report: ${reportPath}`);
} else if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log('LOCALIZATION AUDIT — Stage 5 / formal project gate');
  console.log(`status: ${result.status}`);
  console.log(`Soldier: ${result.inheritedStage4.soldierEffectiveKoreanDisplays}/${result.inheritedStage4.soldierRecords}`);
  console.log(`Hero: ${result.inheritedStage4.heroEffectiveKoreanDisplays}/${result.inheritedStage4.heroRecords}`);
  console.log(`Equipment public: ${result.inheritedStage4.equipmentEffectiveKoreanDisplays}/${result.inheritedStage4.equipmentPublicRecords}`);
  console.log(`errors: ${result.summary.errors}`);
  console.log(`reviews: ${result.summary.reviews}`);
  if (reportPath) console.log(`machine report: ${reportPath}`);
}
