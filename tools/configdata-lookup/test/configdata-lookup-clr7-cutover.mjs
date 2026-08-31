import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));

function trackedState() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || 'git status failed');
  return result.stdout;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const predecessor = readJson('data/contracts/project-tooling-configdata-lookup-clr6-shadow-parity.v1.json');
assert.equal(predecessor.completion, 'CONFIGDATA_LOOKUP_CLR6_SHADOW_PARITY_FROZEN');

const beforeTrackedState = trackedState();
const pkg = readJson('package.json');
const expectedScripts = {
  lookup: 'node tools/configdata-lookup/cli/run.mjs lookup',
  refs: 'node tools/configdata-lookup/cli/run.mjs refs',
  find: 'node tools/configdata-lookup/cli/run.mjs find',
};
for (const [name, expected] of Object.entries(expectedScripts)) {
  assert.equal(pkg.scripts?.[name], expected, `${name}: package CLI authority did not cut over to NEW ConfigData Lookup`);
  assert.equal(pkg.scripts[name].includes('scripts/configdata-lookup-cli.mjs'), false, `${name}: legacy Stage 5 CLI remains authoritative`);
}

const cliCases = [
  { script: 'lookup', args: ['Hero', '6', '--json'], legacy: ['lookup', 'Hero', '6', '--json'] },
  { script: 'refs', args: ['Skill', '3001', '--json'], legacy: ['refs', 'Skill', '3001', '--json'] },
  { script: 'find', args: ['Soldier', '枪兵', '--limit=5', '--json'], legacy: ['find', 'Soldier', '枪兵', '--limit=5', '--json'] },
  { script: 'lookup', args: ['Hero', '999999999', '--json'], legacy: ['lookup', 'Hero', '999999999', '--json'] },
];
for (const fixture of cliCases) {
  const legacy = run(process.execPath, ['scripts/configdata-lookup-cli.mjs', ...fixture.legacy]);
  const current = run('npm', ['run', '--silent', fixture.script, '--', ...fixture.args]);
  assert.equal(current.status, legacy.status, `${fixture.script}: npm/legacy exit mismatch`);
  assert.equal(current.stdout, legacy.stdout, `${fixture.script}: npm/legacy stdout mismatch`);
  assert.equal(current.stderr, legacy.stderr, `${fixture.script}: npm/legacy stderr mismatch`);
}

const stage7ContractPath = 'data/contracts/configdata-lookup-stage7-smart-regression-contract.v1.json';
const stage8ContractPath = 'data/contracts/configdata-lookup-stage8-project-doctor-expansion-contract.v1.json';
const stage7ValidatorPath = 'scripts/validate-configdata-lookup-stage7.mjs';
const stage8ValidatorPath = 'scripts/validate-configdata-lookup-stage8.mjs';
for (const path of [stage7ContractPath, stage8ContractPath, stage7ValidatorPath, stage8ValidatorPath]) {
  assert.equal(fs.existsSync(path), true, `historical Stage 7/8 evidence missing: ${path}`);
}
const stage7 = readJson(stage7ContractPath);
const stage8 = readJson(stage8ContractPath);
assert.equal(stage7.stage, 'CONFIGDATA_LOOKUP_STAGE_7');
assert.equal(stage8.stage, 'CONFIGDATA_LOOKUP_STAGE_8');

const forbiddenActiveTokens = [
  'validate-configdata-lookup-stage7.mjs',
  'validate-configdata-lookup-stage8.mjs',
  'configdata-lookup-stage7-smart-regression',
  'configdata-lookup-stage8-project-doctor-expansion',
  'selectSmartRegression',
  'selectProjectDoctorExpansion',
];
const packageText = fs.readFileSync('package.json', 'utf8');
for (const token of forbiddenActiveTokens) {
  assert.equal(packageText.includes(token), false, `package.json still exposes legacy Stage 7/8 authority: ${token}`);
}

const workflowFiles = fs.readdirSync('.github/workflows')
  .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort();
const activeLegacyWorkflowRefs = [];
for (const name of workflowFiles) {
  const text = fs.readFileSync(`.github/workflows/${name}`, 'utf8');
  for (const token of forbiddenActiveTokens) {
    if (text.includes(token)) activeLegacyWorkflowRefs.push({ workflow: name, token });
  }
}
assert.deepEqual(activeLegacyWorkflowRefs, [], 'active workflow still invokes legacy Stage 7/8 authority');

const newRuntimePaths = [
  'tools/configdata-lookup/lib/lookup.mjs',
  'tools/configdata-lookup/lib/freshness.mjs',
  'tools/configdata-lookup/cli/run.mjs',
  'tools/configdata-lookup/cli/check-freshness.mjs',
  'tools/configdata-lookup/cli/rebuild.mjs',
];
for (const path of newRuntimePaths) {
  const text = fs.readFileSync(path, 'utf8');
  for (const token of ['configdata-lookup-stage7', 'configdata-lookup-stage8', 'selectSmartRegression', 'selectProjectDoctorExpansion']) {
    assert.equal(text.includes(token), false, `${path}: NEW runtime depends on legacy Stage 7/8 authority`);
  }
}

const afterTrackedState = trackedState();
assert.equal(afterTrackedState, beforeTrackedState, 'CLR7 validation changed tracked repository state');

const result = {
  status: 'PASS',
  completion: 'CONFIGDATA_LOOKUP_CLR7_CUTOVER',
  predecessor: predecessor.completion,
  packageCliAuthority: {
    lookup: expectedScripts.lookup,
    refs: expectedScripts.refs,
    find: expectedScripts.find,
    legacyAliasCount: 0,
    parityCaseCount: cliCases.length,
  },
  legacyAuthority: {
    stage7HistoricalEvidencePreserved: true,
    stage8HistoricalEvidencePreserved: true,
    activePackageReferenceCount: 0,
    activeWorkflowReferenceCount: activeLegacyWorkflowRefs.length,
    newRuntimeDependencyCount: 0,
  },
  boundaries: {
    stage0To6MaterializationMutationCount: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    writerExecutionCount: 0,
    trackedMutationCount: 0,
  },
};
console.log(JSON.stringify(result, null, 2));
export default result;
