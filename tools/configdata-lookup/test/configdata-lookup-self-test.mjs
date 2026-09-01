import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import * as lookup from '../lib/lookup.mjs';
import { checkLookupFreshness } from '../lib/freshness.mjs';
import * as legacyLookup from '../../../scripts/lib/configdata-lookup-stage5.mjs';

const repoRoot = process.cwd();
const readJson = relative => JSON.parse(fs.readFileSync(relative, 'utf8'));

function trackedState() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || 'git status failed');
  return result.stdout;
}

function runCli(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const predecessor = readJson('data/contracts/project-tooling-project-check-configdata-lookup-clr2-namespace.v1.json');
assert.equal(predecessor.completion, 'CONFIGDATA_LOOKUP_CLR2_NAMESPACE_FROZEN');

const runtime = readJson('tools/configdata-lookup/contracts/runtime.v1.json');
assert.equal(runtime.schemaId, 'configdata-lookup-runtime/v1');
assert.equal(runtime.runtimeBoundary.readOnly, true);
assert.equal(runtime.runtimeBoundary.rebuildExposed, false);
assert.equal(runtime.runtimeBoundary.repositoryMutation, false);
assert.equal(runtime.runtimeBoundary.semanticMutation, false);
assert.equal(runtime.runtimeBoundary.domainFanOut, false);
assert.equal(runtime.runtimeBoundary.pageValidatorSelection, false);
assert.equal(runtime.runtimeBoundary.hostedQaSelection, false);
assert.equal(runtime.runtimeBoundary.browserUiSelection, false);
assert.equal(runtime.runtimeBoundary.projectDoctorRuntimeDependency, false);

const beforeTrackedState = trackedState();

const lookupFixtures = [
  ['Hero', '6'],
  ['Soldier', '102'],
  ['Equipment', '273'],
  ['Hero', '999999999'],
];
for (const [entity, id] of lookupFixtures) {
  const [actual, expected] = await Promise.all([
    lookup.lookupEntity(entity, id),
    legacyLookup.lookupEntity(entity, id),
  ]);
  assert.deepEqual(actual, expected, `lookup parity failed for ${entity} ${id}`);
}

const [actualRefs, expectedRefs] = await Promise.all([
  lookup.refsEntity('Skill', '3001'),
  legacyLookup.refsEntity('Skill', '3001'),
]);
assert.deepEqual(actualRefs, expectedRefs, 'refs parity failed for Skill 3001');

const [actualFind, expectedFind] = await Promise.all([
  lookup.findEntity('Soldier', '枪兵', '5'),
  legacyLookup.findEntity('Soldier', '枪兵', '5'),
]);
assert.deepEqual(actualFind, expectedFind, 'find parity failed for Soldier literal fixture');

await assert.rejects(() => lookup.lookupEntity('Hero', '0'), /positive integer ID/);
await assert.rejects(() => lookup.lookupEntity('UnknownEntity', '1'), /unsupported entity/);
await assert.rejects(() => lookup.findEntity('Soldier', ''), /must not be empty/);

const cliCases = [
  ['lookup', 'Hero', '6', '--json'],
  ['refs', 'Skill', '3001', '--json'],
  ['find', 'Soldier', '枪兵', '--limit=5', '--json'],
  ['lookup', 'Hero', '999999999', '--json'],
];
for (const args of cliCases) {
  const legacy = runCli('scripts/configdata-lookup-cli.mjs', args);
  const current = runCli('tools/configdata-lookup/cli/run.mjs', args);
  assert.equal(current.status, legacy.status, `CLI exit parity failed: ${args.join(' ')}`);
  assert.equal(current.stdout, legacy.stdout, `CLI stdout parity failed: ${args.join(' ')}`);
  assert.equal(current.stderr, legacy.stderr, `CLI stderr parity failed: ${args.join(' ')}`);
}

const freshness = await checkLookupFreshness();
assert.equal(freshness.status, 'CLEAN_CONFIGDATA_LOOKUP_STAGE6');
assert.equal(freshness.staleCount, 0);

const runtimeCodePaths = [
  'tools/configdata-lookup/lib/lookup.mjs',
  'tools/configdata-lookup/lib/freshness.mjs',
  'tools/configdata-lookup/cli/run.mjs',
  'tools/configdata-lookup/cli/check-freshness.mjs',
];
const forbiddenRuntimeTokens = [
  'configdata-lookup-stage7',
  'configdata-lookup-stage8',
  'project-doctor',
  'rebuildIncrementally',
  'writeFile',
  'appendFile',
  'child_process',
];
for (const codePath of runtimeCodePaths) {
  const text = fs.readFileSync(codePath, 'utf8');
  for (const token of forbiddenRuntimeTokens) {
    assert.equal(text.includes(token), false, `${codePath} must not depend on ${token}`);
  }
}

const lookupAdapterText = fs.readFileSync('tools/configdata-lookup/lib/lookup.mjs', 'utf8');
assert.equal(lookupAdapterText.includes('scripts/lib/configdata-lookup-stage5.mjs'), true);
const freshnessAdapterText = fs.readFileSync('tools/configdata-lookup/lib/freshness.mjs', 'utf8');
assert.equal(freshnessAdapterText.includes('scripts/lib/configdata-lookup-stage6.mjs'), true);

const legacyStage6Workflow = fs.readFileSync('.github/workflows/configdata-lookup-stage6.yml', 'utf8');
assert.equal(legacyStage6Workflow.includes('contents: read'), true);
assert.equal(legacyStage6Workflow.includes('contents: write'), false);
assert.equal(legacyStage6Workflow.includes('rebuild:configdata-lookup-stage6'), false);
assert.equal(legacyStage6Workflow.includes('git push'), false);
assert.equal(legacyStage6Workflow.includes('git commit'), false);
assert.equal(legacyStage6Workflow.includes('Require read-only tracked state'), true);

const generalValidationWorkflow = fs.readFileSync('.github/workflows/project-tooling-configdata-lookup-clr2.yml', 'utf8');
assert.equal(generalValidationWorkflow.includes('contents: read'), true);
assert.equal(generalValidationWorkflow.includes('contents: write'), false);
assert.equal(generalValidationWorkflow.includes('tools/configdata-lookup/cli/rebuild.mjs'), false);

const writerWorkflow = fs.readFileSync('.github/workflows/project-tooling-configdata-lookup-writer.yml', 'utf8');
const writerTriggers = writerWorkflow.split('\npermissions:')[0];
assert.equal(writerTriggers.includes('workflow_dispatch:'), true);
assert.equal(writerTriggers.includes('pull_request:'), false);
assert.equal(writerTriggers.includes('\n  push:'), false);
assert.equal(writerWorkflow.includes('contents: write'), true);
assert.equal(writerWorkflow.includes('APPLY_CONFIGDATA_LOOKUP_REBUILD'), true);
assert.equal(writerWorkflow.includes("test \"$TARGET_BRANCH\" != 'main'"), true);
assert.equal(writerWorkflow.includes("test \"$TARGET_BRANCH\" != 'gh-pages'"), true);
assert.equal(writerWorkflow.includes('[[ "$TARGET_BRANCH" == work/* ]]'), true);
assert.equal(writerWorkflow.includes('tools/configdata-lookup/cli/rebuild.mjs --apply --json'), true);
assert.equal(writerWorkflow.includes('git push origin "HEAD:${TARGET_BRANCH}"'), true);

const writerCliText = fs.readFileSync('tools/configdata-lookup/cli/rebuild.mjs', 'utf8');
assert.equal(writerCliText.includes("if (!args.has('--apply'))"), true);
assert.equal(writerCliText.includes('rebuildIncrementally'), true);
const writerWithoutApply = runCli('tools/configdata-lookup/cli/rebuild.mjs', []);
assert.notEqual(writerWithoutApply.status, 0);
assert.match(writerWithoutApply.stderr, /explicit --apply is required/);

const afterTrackedState = trackedState();
assert.equal(afterTrackedState, beforeTrackedState, 'read-only self-test changed tracked repository state');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'CONFIGDATA_LOOKUP_CLR3_READ_ONLY_SELF_TEST',
  predecessor: predecessor.completion,
  parity: {
    lookupFixtureCount: lookupFixtures.length,
    refsFixtureCount: 1,
    findFixtureCount: 1,
    cliParityCaseCount: cliCases.length,
    negativeFixtureCount: 3,
  },
  freshness: {
    status: freshness.status,
    staleCount: freshness.staleCount,
  },
  boundaries: {
    trackedMutationCount: 0,
    rebuildApiExposed: false,
    semanticMutationCount: 0,
    domainFanOutCount: 0,
    stage7RuntimeDependencyCount: 0,
    stage8RuntimeDependencyCount: 0,
    projectDoctorRuntimeDependencyCount: 0,
    automaticWriterWorkflowCount: 0,
    explicitWriterWorkflowCount: 1,
    validationWorkflowWritePermissionCount: 0,
    writerRequiresApplyFlag: true,
    writerRejectsMainAndGhPages: true,
  },
}, null, 2));
