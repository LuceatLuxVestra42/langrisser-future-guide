import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const CONTRACT_PATH = 'data/contracts/project-tooling-configdata-lookup-b5-5-operational-cutover.v1.json';

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

function requireIncludes(text, expected, label) {
  assert.equal(text.includes(expected), true, `${label}: missing ${expected}`);
}

function requireExcludes(text, forbidden, label) {
  assert.equal(text.includes(forbidden), false, `${label}: forbidden ${forbidden}`);
}

function validateExternalWorkflow(text, label) {
  requireIncludes(text, 'echo "CONFIGDATA_SOURCE_ROOT=$RUNNER_TEMP/', label);
  requireIncludes(text, '>> "$GITHUB_ENV"', label);
  requireIncludes(text, 'scripts/hydrate-configdata-source-pack-v1.mjs --target-dir "$CONFIGDATA_SOURCE_ROOT"', label);
  requireIncludes(text, 'test "$count" = "753"', label);
  requireIncludes(text, 'external ConfigData source root must stay outside repository', label);
  requireIncludes(text, 'tracked_raw="$GITHUB_WORKSPACE/data/configdata"', label);
  requireIncludes(text, 'test ! -e "$tracked_raw"', label);
  requireIncludes(text, 'if: always()', label);
  requireIncludes(text, 'mv "$hidden_raw" "$tracked_raw"', label);
}

export async function runB55OperationalCutover({ emit = true } = {}) {
  const contract = await readJson(CONTRACT_PATH);
  assert.equal(contract.version, 1);
  assert.equal(contract.schemaId, 'configdata-lookup-b5-5-operational-cutover/v1');
  assert.equal(contract.stage, 'repository-size-reduction-B5.5');
  assert.ok(['READY_FOR_VALIDATION', 'PASS'].includes(contract.status));
  assert.equal(contract.owner, 'configdata-lookup');
  assert.equal(contract.supportingOwner, 'configdata-source-pack');

  const [b2, b3, b4, b5] = await Promise.all([
    readJson(contract.authoritativePredecessors.sourcePack.path),
    readJson(contract.authoritativePredecessors.sourceRootCutover.path),
    readJson(contract.authoritativePredecessors.externalCleanRoom.path),
    readJson(contract.authoritativePredecessors.deletionAdmission.path),
  ]);
  assert.equal(b2.stage, 'repository-size-reduction-B2');
  assert.equal(b2.status, 'PASS');
  assert.equal(b2.coverage.fileCount, 753);
  assert.equal(b3.completion, 'CONFIGDATA_LOOKUP_B3_SOURCE_ROOT_CUTOVER_COMPLETE');
  assert.equal(b3.status, 'PASS');
  assert.equal(b4.completion, 'CONFIGDATA_LOOKUP_B4_EXTERNAL_ONLY_CLEAN_ROOM_COMPLETE');
  assert.equal(b4.status, 'PASS');
  assert.equal(b5.completion, 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_COMPLETE');
  assert.equal(b5.status, 'PASS');
  assert.equal(b5.deletionAdmission.admittedDeletionCount, 753);

  const workflowPaths = {
    stage0: contract.operationalBoundary.stage0Workflow,
    stage1: contract.operationalBoundary.stage1Workflow,
    stage2: contract.operationalBoundary.stage2Workflow,
    stage6: contract.operationalBoundary.stage6Workflow,
    owner: contract.operationalBoundary.ownerWorkflow,
    writer: contract.operationalBoundary.writerWorkflow,
  };
  const workflows = Object.fromEntries(
    await Promise.all(Object.entries(workflowPaths).map(async ([key, filePath]) => [key, await readText(filePath)])),
  );
  for (const [key, text] of Object.entries(workflows)) validateExternalWorkflow(text, `${key} workflow`);

  requireIncludes(workflows.stage0, 'npm run validate:configdata-lookup-stage0', 'Stage0 workflow');
  requireIncludes(workflows.stage1, 'node tools/configdata-lookup/cli/build-stage1.mjs', 'Stage1 workflow');
  requireIncludes(workflows.stage1, 'node tools/configdata-lookup/cli/validate-stage1.mjs', 'Stage1 workflow');
  requireIncludes(workflows.stage2, 'node tools/configdata-lookup/cli/validate-stage1.mjs', 'Stage2 workflow');
  requireIncludes(workflows.stage2, 'node tools/configdata-lookup/cli/build-stage2.mjs', 'Stage2 workflow');
  requireIncludes(workflows.stage2, 'node tools/configdata-lookup/cli/validate-stage2.mjs', 'Stage2 workflow');
  requireIncludes(workflows.stage6, 'node tools/configdata-lookup/test/configdata-lookup-stage6-current-validator.mjs', 'Stage6 workflow');
  requireIncludes(workflows.stage6, 'node tools/configdata-lookup/cli/check-freshness.mjs', 'Stage6 workflow');
  requireIncludes(workflows.owner, 'node tools/configdata-lookup/cli/check-freshness.mjs', 'owner workflow');
  requireIncludes(workflows.owner, 'node tools/configdata-lookup/test/configdata-lookup-owner-self-test.mjs', 'owner workflow');
  requireIncludes(workflows.writer, 'node tools/configdata-lookup/cli/rebuild.mjs --apply --json', 'writer workflow');
  requireIncludes(workflows.writer, 'node tools/configdata-lookup/cli/check-freshness.mjs', 'writer workflow');
  requireExcludes(workflows.owner, 'node scripts/configdata-lookup-stage6.mjs check', 'owner workflow');
  requireExcludes(workflows.writer, 'npm run check:configdata-lookup-stage6', 'writer workflow');

  const stage0Validator = await readText(contract.operationalBoundary.stage0ValidatorEntrypoint);
  requireIncludes(stage0Validator, 'process.env.CONFIGDATA_SOURCE_ROOT', 'Stage0 validator');
  requireIncludes(stage0Validator, 'path.isAbsolute(configuredSourceRoot)', 'Stage0 validator');
  requireIncludes(stage0Validator, 'sourcePathExists(expectedSource)', 'Stage0 validator');

  const wrapperExpected = {
    [contract.operationalBoundary.stage1BuilderEntrypoint]: "import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';\n\ninstallConfigDataSourceRootReadRedirect();\nawait import('../../../scripts/build-configdata-lookup-stage1.mjs');\n",
    [contract.operationalBoundary.stage1ValidatorEntrypoint]: "import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';\n\ninstallConfigDataSourceRootReadRedirect();\nawait import('../../../scripts/validate-configdata-lookup-stage1.mjs');\n",
    [contract.operationalBoundary.stage2BuilderEntrypoint]: "import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';\n\ninstallConfigDataSourceRootReadRedirect();\nawait import('../../../scripts/build-configdata-lookup-stage2.mjs');\n",
    [contract.operationalBoundary.stage2ValidatorEntrypoint]: "import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';\n\ninstallConfigDataSourceRootReadRedirect();\nawait import('../../../scripts/validate-configdata-lookup-stage2.mjs');\n",
  };
  for (const [filePath, expected] of Object.entries(wrapperExpected)) {
    assert.equal(await readText(filePath), expected, `${filePath}: wrapper must remain adapter-only`);
  }

  const packageJson = await readJson('package.json');
  assert.equal(packageJson.scripts['build:configdata-lookup-stage1'], 'node tools/configdata-lookup/cli/build-stage1.mjs');
  assert.equal(packageJson.scripts['validate:configdata-lookup-stage1'], 'node tools/configdata-lookup/cli/validate-stage1.mjs');
  assert.equal(packageJson.scripts['build:configdata-lookup-stage2'], 'node tools/configdata-lookup/cli/build-stage2.mjs');
  assert.equal(packageJson.scripts['validate:configdata-lookup-stage2'], 'node tools/configdata-lookup/cli/validate-stage2.mjs');
  assert.equal(packageJson.scripts['check:configdata-lookup-stage6'], 'node tools/configdata-lookup/cli/check-freshness.mjs');
  assert.equal(packageJson.scripts['rebuild:configdata-lookup-stage6'], 'node tools/configdata-lookup/cli/rebuild.mjs --apply');
  assert.equal(packageJson.scripts['validate:configdata-lookup-stage6'], 'node tools/configdata-lookup/test/configdata-lookup-stage6-current-validator.mjs');

  const ownerMap = await readJson('tools/project-check/contracts/owners.v1.json');
  const lookupRule = ownerMap.pathRules.find((rule) => rule.id === 'configdata-lookup-tooling');
  assert.ok(lookupRule, 'configdata-lookup-tooling routing rule missing');
  assert.deepEqual(lookupRule.owners, ['configdata-lookup']);
  assert.equal(lookupRule.patterns.includes('.github/workflows/configdata-lookup-stage0.yml'), true);
  assert.equal(lookupRule.patterns.includes('scripts/validate-configdata-lookup-stage0.mjs'), true);
  assert.equal(lookupRule.patterns.includes('.github/workflows/configdata-lookup-stage1.yml'), true);
  assert.equal(lookupRule.patterns.includes('.github/workflows/configdata-lookup-stage2.yml'), true);

  const b3Fixture = await readText('tools/configdata-lookup/test/configdata-source-root-cutover-b3.mjs');
  requireIncludes(b3Fixture, 'getConfiguredConfigDataSourceRoot', 'B3 source-root fixture');
  requireIncludes(b3Fixture, 'const seedRoot = sourceRootEnvBefore === null ? repoRoot : configuredRoot;', 'B3 source-root fixture');

  const queryCli = await readText('tools/configdata-lookup/cli/run.mjs');
  requireExcludes(queryCli, 'configdata-source-root', 'materialized query CLI');
  requireExcludes(queryCli, 'CONFIGDATA_SOURCE_ROOT', 'materialized query CLI');

  assert.equal(contract.operationalBoundary.legacyStage0ContractMeaningChanged, false);
  assert.equal(contract.operationalBoundary.legacyStage1AlgorithmModified, false);
  assert.equal(contract.operationalBoundary.legacyStage2AlgorithmModified, false);
  assert.equal(contract.operationalBoundary.legacyStage6AlgorithmModified, false);
  assert.equal(contract.operationalBoundary.stage0ValidatorOnlyResolvesPhysicalExistenceThroughConfiguredRoot, true);
  assert.equal(contract.operationalBoundary.normalLookupRefsFindRemainMaterializedOnly, true);
  assert.equal(contract.operationalBoundary.trackedRawDeletionOccursInThisStage, false);
  assert.equal(contract.semanticBoundary.semanticAuthorityChanged, false);
  assert.equal(contract.semanticBoundary.frozenSemanticDomainsReopened, false);
  assert.equal(contract.routingBoundary.ownerPropagation, false);
  assert.equal(contract.routingBoundary.changeClassFanOut, false);
  assert.equal(contract.routingBoundary.manualReviewAllowedForB5_5ChangedPaths, false);

  const result = {
    status: 'PASS',
    completion: 'CONFIGDATA_LOOKUP_B5_5_OPERATIONAL_CUTOVER_STATIC_GUARD',
    externalWorkflowCount: Object.keys(workflows).length,
    sourceRootAwareStage0ValidatorCount: 1,
    sourceRootAwareWrapperCount: Object.keys(wrapperExpected).length,
    explicitStageWorkflowRoutingCount: 4,
    logicalRawPathNamespace: contract.operationalBoundary.logicalRawPathNamespace,
    physicalSourceRootSelector: contract.operationalBoundary.physicalSourceRootSelector,
    externalHydrationFileCount: contract.operationalBoundary.externalHydrationFileCount,
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    trackedRawDeletionCount: 0,
  };
  if (emit) console.log(JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runB55OperationalCutover().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
