import { spawnSync } from 'node:child_process';
import {
  collectChangedPaths,
  executeProjectCheck,
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

const repoRoot = process.cwd();
const contracts = loadProjectCheckContracts({ repoRoot });

function fail(message, detail = null) {
  const suffix = detail === null ? '' : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function sameSet(actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

function expect(condition, message, detail = null) {
  if (!condition) fail(message, detail);
}

function oldCheckIds(plan) {
  return (plan.selectedChecks ?? []).map(item => item.id).sort();
}

function oldDirectNodes(plan) {
  return [...(plan.impact?.directNodes ?? [])].sort();
}

function runOldPlan(paths) {
  const result = spawnSync(
    'node',
    ['scripts/plan-project-doctor-d3-v6.mjs', '--json', '--paths', ...paths],
    { cwd: repoRoot, encoding: 'utf8', shell: false },
  );
  if (result.error) fail('OLD D3 V6 planner could not start.', { error: result.error.message });
  if (![0, 3].includes(result.status)) {
    fail('OLD D3 V6 planner returned an unexpected exit code.', {
      exitCode: result.status,
      stderr: String(result.stderr ?? '').trim(),
      stdout: String(result.stdout ?? '').trim(),
    });
  }
  let plan;
  try {
    plan = JSON.parse(String(result.stdout ?? '').trim());
  } catch (error) {
    fail('OLD D3 V6 planner did not emit parseable JSON.', {
      error: error instanceof Error ? error.message : String(error),
      stdout: String(result.stdout ?? '').trim(),
    });
  }
  return { plan, exitCode: result.status };
}

function routeNew(paths) {
  return routeProjectCheckPaths(paths, contracts);
}

function isMigrationPath(filePath) {
  return [
    /^tools\/status-source\//,
    /^tools\/project-status\//,
    /^tools\/project-check\//,
    /^data\/contracts\/project-tooling-status-source-.*\.json$/,
    /^data\/contracts\/project-tooling-project-status-.*\.json$/,
    /^data\/contracts\/project-tooling-project-check-.*\.json$/,
    /^data\/contracts\/project-tooling-migration-r0\.v1\.json$/,
    /^\.github\/workflows\/project-tooling-r1-status-source\.yml$/,
    /^\.github\/workflows\/project-tooling-r2-project-status\.yml$/,
    /^\.github\/workflows\/project-tooling-r3-project-check\.yml$/,
  ].some(pattern => pattern.test(filePath));
}

function checkAdmittedFixture(fixture) {
  const newRoute = routeNew([fixture.path]);
  expect(newRoute.status === 'PLAN_READY', `${fixture.id}: NEW route must be PLAN_READY.`, newRoute);
  expect(sameSet(newRoute.owners, fixture.newOwners), `${fixture.id}: NEW owners differ.`, {
    actual: newRoute.owners,
    expected: fixture.newOwners,
  });
  expect(sameSet(newRoute.validators.map(item => item.id), fixture.newValidators), `${fixture.id}: NEW validators differ.`, {
    actual: newRoute.validators.map(item => item.id),
    expected: fixture.newValidators,
  });
  expect(newRoute.manualReviews.length === 0, `${fixture.id}: NEW route unexpectedly requested manual review.`, newRoute.manualReviews);

  const old = runOldPlan([fixture.path]);
  expect(old.exitCode === 0 && old.plan.status === 'PLAN_READY', `${fixture.id}: OLD planner must admit the representative path.`, old);
  for (const node of fixture.oldDirectNodes) {
    expect(oldDirectNodes(old.plan).includes(node), `${fixture.id}: OLD direct owning node missing: ${node}.`, old.plan.impact);
  }
  for (const checkId of fixture.oldChecks) {
    expect(oldCheckIds(old.plan).includes(checkId), `${fixture.id}: OLD owning validator missing: ${checkId}.`, old.plan.selectedChecks);
  }

  return {
    id: fixture.id,
    path: fixture.path,
    newOwners: newRoute.owners,
    newValidators: newRoute.validators.map(item => item.id),
    oldDirectNodes: oldDirectNodes(old.plan),
    oldOwningChecksObserved: fixture.oldChecks.filter(id => oldCheckIds(old.plan).includes(id)),
    oldAdditionalChecks: oldCheckIds(old.plan).filter(id => !fixture.oldChecks.includes(id)),
  };
}

function checkManualFixture(fixture) {
  const newRoute = routeNew([fixture.path]);
  expect(newRoute.status === 'MANUAL_REVIEW', `${fixture.id}: NEW route must remain MANUAL_REVIEW.`, newRoute);
  expect(newRoute.manualReviews.length > 0, `${fixture.id}: NEW manual review evidence missing.`, newRoute);
  if (fixture.newManualOwner) {
    expect(newRoute.manualReviews.some(item => item.ownerId === fixture.newManualOwner), `${fixture.id}: NEW manual owner missing.`, newRoute.manualReviews);
  }
  if (fixture.newUnmatched) {
    expect(newRoute.manualReviews.some(item => item.type === 'UNMATCHED_PATH'), `${fixture.id}: NEW unmatched-path review missing.`, newRoute.manualReviews);
  }

  const old = runOldPlan([fixture.path]);
  expect(old.exitCode === 3 && old.plan.status === 'MANUAL_REVIEW', `${fixture.id}: OLD planner must remain MANUAL_REVIEW.`, old);
  if (fixture.oldManualNode) {
    expect(old.plan.manualReviews.some(item => item.node === fixture.oldManualNode), `${fixture.id}: OLD manual owner missing.`, old.plan.manualReviews);
  }
  if (fixture.oldUnmatched) {
    expect(old.plan.manualReviews.some(item => item.path === fixture.path), `${fixture.id}: OLD unmatched-path review missing.`, old.plan.manualReviews);
  }

  return {
    id: fixture.id,
    path: fixture.path,
    newOwners: newRoute.owners,
    newValidators: newRoute.validators.map(item => item.id),
    newManualReviewCount: newRoute.manualReviews.length,
    oldDirectNodes: oldDirectNodes(old.plan),
    oldChecks: oldCheckIds(old.plan),
    oldManualReviewCount: old.plan.manualReviews.length,
  };
}

function parseArgs(argv) {
  const options = { base: null, head: 'HEAD' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') options.base = argv[++i];
    else if (argv[i] === '--head') options.head = argv[++i];
    else fail(`Unknown option: ${argv[i]}`);
  }
  if (!options.base) fail('--base is required.');
  return options;
}

const options = parseArgs(process.argv.slice(2));
const migrationPaths = collectChangedPaths({ repoRoot, base: options.base, head: options.head });
expect(migrationPaths.length > 0, 'Shadow comparison requires a non-empty migration diff.');
const nonMigrationPaths = migrationPaths.filter(filePath => !isMigrationPath(filePath));
expect(nonMigrationPaths.length === 0, 'Migration-only comparison contains paths outside the frozen migration namespace.', nonMigrationPaths);

const newMigration = executeProjectCheck(migrationPaths, {
  repoRoot,
  contracts,
  planOnly: true,
  preflight: { pass: true, failures: [] },
});
expect(newMigration.status === 'PASS' && newMigration.exitCode === 0, 'NEW Project Check must PASS the migration-only diff.', newMigration);
expect(newMigration.route.manualReviews.length === 0, 'NEW migration-only diff must have zero manual reviews.', newMigration.route.manualReviews);
expect(sameSet(newMigration.route.owners, ['project-check', 'project-status', 'status-source']), 'NEW migration-only owners differ from the frozen migration boundary.', newMigration.route.owners);
expect(sameSet(newMigration.route.validators.map(item => item.id), [
  'status-source-artifact-bridge',
  'status-source-lifecycle',
  'status-source-producer-gate',
  'status-source-promotion',
  'status-source-selection',
  'project-status-parity',
  'project-check-self-test',
]), 'NEW migration-only validator set differs from the frozen R3 set.', newMigration.route.validators.map(item => item.id));

const oldMigration = runOldPlan(migrationPaths);
expect(oldMigration.exitCode === 3 && oldMigration.plan.status === 'MANUAL_REVIEW', 'OLD Doctor must fail closed on the migration-only namespace.', oldMigration);
expect((oldMigration.plan.selectedChecks ?? []).length === 0, 'OLD Doctor must not select legacy checks for the NEW migration namespace.', oldMigration.plan.selectedChecks);
expect(oldMigration.plan.manualReviews.length === migrationPaths.length, 'OLD Doctor migration mismatch must be path-local MANUAL_REVIEW for every migration file.', {
  changedFileCount: migrationPaths.length,
  manualReviewCount: oldMigration.plan.manualReviews.length,
});

const admittedFixtures = [
  {
    id: 'HERO_CANONICAL',
    path: 'data/validation/hero-stage6-4-final.v1.json',
    newOwners: ['hero-canonical'],
    newValidators: ['hero-canonical'],
    oldDirectNodes: ['hero-canonical'],
    oldChecks: ['coverage-hero-canonical'],
  },
  {
    id: 'HERO_SOLDIER_RELATION',
    path: 'data/validation/hero-soldier-integration-stageC-final.v1.json',
    newOwners: ['hero-soldier-relation'],
    newValidators: ['hero-soldier-relation'],
    oldDirectNodes: ['hero-soldier-relation'],
    oldChecks: ['coverage-hero-soldier-relation'],
  },
  {
    id: 'HERO_ASSET',
    path: 'public/images/heroes/cards/6.png',
    newOwners: ['hero-assets', 'hero-frontend'],
    newValidators: ['hero-assets', 'production-build'],
    oldDirectNodes: ['hero-assets'],
    oldChecks: ['hero-artwork-final', 'production-build'],
  },
  {
    id: 'EQUIPMENT_FRONTEND',
    path: 'src/routes/equipment.tsx',
    newOwners: ['equipment-frontend'],
    newValidators: ['production-build'],
    oldDirectNodes: ['equipment-frontend'],
    oldChecks: ['production-build'],
  },
].map(checkAdmittedFixture);

const manualFixtures = [
  {
    id: 'BANNER_ASSET_MANUAL',
    path: 'public/images/banners/Banner/probe.png',
    newManualOwner: 'banner-assets',
    oldManualNode: 'banner-assets',
  },
  {
    id: 'SKIN_ASSET_MANUAL',
    path: 'data/evidence/skin-stage3-2-static-source-evidence.v1.json',
    newManualOwner: 'skin-assets',
    oldManualNode: 'skin-assets',
  },
  {
    id: 'UNMATCHED_PATH',
    path: 'shadow-probes/unmapped-project-check-fixture.txt',
    newUnmatched: true,
    oldUnmatched: true,
  },
].map(checkManualFixture);

const validatorFailure = executeProjectCheck(['data/validation/hero-stage6-4-final.v1.json'], {
  repoRoot,
  contracts,
  preflight: { pass: true, failures: [] },
  executor: validator => ({
    validatorId: validator.id,
    exitCode: validator.id === 'hero-canonical' ? 41 : 0,
    signal: null,
  }),
});
expect(validatorFailure.status === 'BLOCKER', 'NEW validator failure must aggregate to BLOCKER.', validatorFailure);
expect(validatorFailure.exitCode === 2, 'NEW validator failure must use blocker exit code 2.', validatorFailure);
expect(validatorFailure.failedValidatorId === 'hero-canonical', 'NEW validator failure must identify the owning validator.', validatorFailure);

const result = {
  version: 1,
  schemaId: 'project-tooling-shadow-comparison-result/v1',
  status: 'PASS',
  checkpoint: 'PROJECT_TOOLING_OLD_NEW_SHADOW_COMPARISON',
  migrationOnly: {
    changedFileCount: migrationPaths.length,
    newStatus: newMigration.status,
    newExitCode: newMigration.exitCode,
    newOwners: newMigration.route.owners,
    newValidatorCount: newMigration.route.validatorCount,
    newManualReviewCount: newMigration.route.manualReviews.length,
    oldStatus: oldMigration.plan.status,
    oldExitCode: oldMigration.exitCode,
    oldSelectedCheckCount: oldMigration.plan.selectedChecks.length,
    oldManualReviewCount: oldMigration.plan.manualReviews.length,
    routingClassification: 'EXPECTED_LEGACY_DOCTOR_MISMATCH_ROUTING_SHAPE',
  },
  admittedFixtures,
  manualFixtures,
  validatorFailure: {
    status: validatorFailure.status,
    exitCode: validatorFailure.exitCode,
    failedValidatorId: validatorFailure.failedValidatorId,
  },
  boundaries: {
    oldDoctorRole: 'OBSERVE_AND_COMPARE_ONLY',
    oldPlannerInvokedAsSeparateProcess: true,
    oldPlannerImportedIntoNewRuntime: false,
    oldDoctorMutation: false,
    oldDoctorContractExpansion: false,
    requiredCheckCutoverPerformed: false,
    statusSourceWriterActivated: false,
    projectStatusWriterActivated: false,
  },
};

console.log(JSON.stringify(result, null, 2));
