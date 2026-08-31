import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const readText = path => fs.readFileSync(path, 'utf8');

function trackedState() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || 'git status failed');
  return result.stdout;
}

const beforeTrackedState = trackedState();

const predecessorChain = [
  ['CLR0', 'data/contracts/project-tooling-project-check-configdata-lookup-clr0-baseline.v1.json', 'CONFIGDATA_LOOKUP_CLR0_BASELINE_FROZEN'],
  ['CLR1', 'data/contracts/project-tooling-project-check-configdata-lookup-clr1-boundary.v1.json', 'CONFIGDATA_LOOKUP_CLR1_BOUNDARY_FROZEN'],
  ['CLR2', 'data/contracts/project-tooling-project-check-configdata-lookup-clr2-namespace.v1.json', 'CONFIGDATA_LOOKUP_CLR2_NAMESPACE_FROZEN'],
  ['CLR3', 'data/contracts/project-tooling-project-check-configdata-lookup-clr3-self-test.v1.json', 'CONFIGDATA_LOOKUP_CLR3_READ_ONLY_SELF_TEST_FROZEN'],
  ['CLR4', 'data/contracts/project-tooling-configdata-lookup-clr4-admission.v1.json', 'CONFIGDATA_LOOKUP_CLR4_PROJECT_CHECK_ADMISSION_FROZEN'],
  ['CLR5', 'data/contracts/project-tooling-configdata-lookup-clr5-writer-separation.v1.json', 'CONFIGDATA_LOOKUP_CLR5_WRITER_SEPARATION_FROZEN'],
  ['CLR6', 'data/contracts/project-tooling-configdata-lookup-clr6-shadow-parity.v1.json', 'CONFIGDATA_LOOKUP_CLR6_SHADOW_PARITY_FROZEN'],
  ['CLR7', 'data/contracts/project-tooling-configdata-lookup-clr7-cutover.v1.json', 'CONFIGDATA_LOOKUP_CLR7_CUTOVER_FROZEN'],
];

for (const [stage, path, completion] of predecessorChain) {
  const checkpoint = readJson(path);
  assert.equal(checkpoint.stage, stage, `${path}: stage mismatch`);
  assert.equal(checkpoint.completion, completion, `${path}: predecessor is not frozen`);
  assert.ok(!checkpoint.blockers?.length, `${path}: predecessor has blockers`);
}

const packageJson = readJson('package.json');
const expectedAliases = {
  lookup: 'node tools/configdata-lookup/cli/run.mjs lookup',
  refs: 'node tools/configdata-lookup/cli/run.mjs refs',
  find: 'node tools/configdata-lookup/cli/run.mjs find',
};
for (const [name, command] of Object.entries(expectedAliases)) {
  assert.equal(packageJson.scripts?.[name], command, `package ${name} authority drifted`);
}

const runtime = readJson('tools/configdata-lookup/contracts/runtime.v1.json');
assert.equal(runtime.runtimeBoundary.readOnly, true);
assert.equal(runtime.runtimeBoundary.rebuildExposed, false);
assert.equal(runtime.runtimeBoundary.repositoryMutation, false);
assert.equal(runtime.runtimeBoundary.semanticMutation, false);
assert.equal(runtime.runtimeBoundary.domainFanOut, false);
assert.equal(runtime.runtimeBoundary.projectDoctorRuntimeDependency, false);

const generalWorkflow = readText('.github/workflows/project-tooling-configdata-lookup-clr2.yml');
assert.equal(generalWorkflow.includes('contents: read'), true);
assert.equal(generalWorkflow.includes('contents: write'), false);
assert.equal(generalWorkflow.includes('tools/configdata-lookup/cli/rebuild.mjs'), false);
assert.equal(generalWorkflow.includes('tools/configdata-lookup/test/configdata-lookup-owner-self-test.mjs'), true);

const stage6Workflow = readText('.github/workflows/configdata-lookup-stage6.yml');
assert.equal(stage6Workflow.includes('contents: read'), true);
assert.equal(stage6Workflow.includes('contents: write'), false);
assert.equal(stage6Workflow.includes('npm run validate:configdata-lookup-stage5'), true);
assert.equal(stage6Workflow.includes('tools/configdata-lookup/test/configdata-lookup-stage6-current-validator.mjs'), true);
assert.equal(stage6Workflow.includes('git push'), false);
assert.equal(stage6Workflow.includes('git commit'), false);

for (const stage of [7, 8]) {
  const workflow = readText(`.github/workflows/configdata-lookup-stage${stage}.yml`);
  const triggerSection = workflow.split('\npermissions:')[0];
  assert.equal(workflow.includes(`ConfigData Lookup Stage ${stage} (Retired)`), true);
  assert.equal(triggerSection.includes('workflow_dispatch:'), true);
  assert.equal(triggerSection.includes('pull_request:'), false);
  assert.equal(triggerSection.includes('\n  push:'), false);
  assert.equal(workflow.includes('contents: read'), true);
  assert.equal(workflow.includes('contents: write'), false);
  assert.equal(workflow.includes(`scripts/configdata-lookup-stage${stage}.mjs`), false);
  assert.equal(workflow.includes(`scripts/validate-configdata-lookup-stage${stage}.mjs`), false);
}

const writerWorkflow = readText('.github/workflows/project-tooling-configdata-lookup-writer.yml');
const writerTriggers = writerWorkflow.split('\npermissions:')[0];
assert.equal(writerTriggers.includes('workflow_dispatch:'), true);
assert.equal(writerTriggers.includes('pull_request:'), false);
assert.equal(writerTriggers.includes('\n  push:'), false);
assert.equal(writerWorkflow.includes('contents: write'), true);
assert.equal(writerWorkflow.includes('APPLY_CONFIGDATA_LOOKUP_REBUILD'), true);
assert.equal(writerWorkflow.includes("test \"$TARGET_BRANCH\" != 'main'"), true);
assert.equal(writerWorkflow.includes("test \"$TARGET_BRANCH\" != 'gh-pages'"), true);
assert.equal(writerWorkflow.includes('[[ "$TARGET_BRANCH" == work/* ]]'), true);
assert.equal(writerWorkflow.includes('npm run validate:configdata-lookup-stage5'), true);
assert.equal(writerWorkflow.includes('tools/configdata-lookup/cli/rebuild.mjs --apply --json'), true);
assert.equal(writerWorkflow.includes('tools/configdata-lookup/test/configdata-lookup-stage6-current-validator.mjs'), true);
assert.equal(writerWorkflow.includes('git push origin "HEAD:${TARGET_BRANCH}"'), true);

const owners = readJson('tools/project-check/contracts/owners.v1.json');
const configdataOwner = owners.owners.find(owner => owner.id === 'configdata-lookup');
assert.deepEqual(configdataOwner?.validators, ['configdata-lookup-self-test']);
const configdataRule = owners.pathRules.find(rule => rule.id === 'configdata-lookup-tooling');
assert.deepEqual(configdataRule?.owners, ['configdata-lookup']);
for (const requiredPattern of [
  'tools/configdata-lookup/**',
  'data/contracts/project-tooling-configdata-lookup-*.json',
  '.github/workflows/project-tooling-configdata-lookup-clr2.yml',
  '.github/workflows/project-tooling-configdata-lookup-writer.yml',
  '.github/workflows/configdata-lookup-stage6.yml',
  '.github/workflows/configdata-lookup-stage7.yml',
  '.github/workflows/configdata-lookup-stage8.yml',
]) {
  assert.equal(configdataRule?.patterns?.includes(requiredPattern), true, `missing Project Check pattern ${requiredPattern}`);
}

const validators = readJson('tools/project-check/contracts/validators.v1.json');
const validator = validators.validators.find(item => item.id === 'configdata-lookup-self-test');
assert.equal(validator?.phase, 6);
assert.equal(validator?.executable, 'node');
assert.deepEqual(validator?.args, ['tools/configdata-lookup/test/configdata-lookup-owner-self-test.mjs']);
assert.equal(validator?.owner, 'configdata-lookup');

const afterTrackedState = trackedState();
assert.equal(afterTrackedState, beforeTrackedState, 'CLR8 final freeze gate changed tracked repository state');

const result = {
  status: 'PASS',
  completion: 'CONFIGDATA_LOOKUP_CLR8_FINAL_FREEZE_READY',
  predecessorCount: predecessorChain.length,
  packageAuthority: expectedAliases,
  inventory: {
    readOnlyValidationWorkflowCount: 2,
    explicitWriterWorkflowCount: 1,
    retiredLegacyOrchestrationWorkflowCount: 2,
    projectCheckOwnerCount: 1,
    projectCheckValidatorCount: 1,
  },
  boundaries: {
    semanticMutationCount: 0,
    rawConfigDataReadCount: 0,
    materializationRebuildCount: 0,
    writerExecutionCount: 0,
    stage7ActiveAuthorityCount: 0,
    stage8ActiveAuthorityCount: 0,
    trackedMutationCount: 0,
  },
};

console.log(JSON.stringify(result, null, 2));
export default result;
