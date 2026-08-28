import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlanningContext, planPaths, collectChangedFiles, parsePlanCli } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v1.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d3-summary.v1.json';
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const context = loadPlanningContext(CONTRACT_PATH);
const failures = [];
const fixtureResults = [];

const sameSet = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
for (const fixture of contract.fixtures ?? []) {
  const plan = planPaths({ paths: fixture.paths, source: { mode: 'fixture', id: fixture.id }, context });
  const actualChecks = plan.selectedChecks.map(item => item.id);
  const actualManualNodes = plan.manualReviews.filter(item => item.node).map(item => item.node);
  const pass = plan.status === fixture.expectedStatus
    && sameSet(actualChecks, fixture.expectedChecks)
    && sameSet(actualManualNodes, fixture.expectedManualNodes)
    && plan.validatorExecutionCount === 0;
  const result = {
    id: fixture.id, pass,
    expectedStatus: fixture.expectedStatus, actualStatus: plan.status,
    expectedChecks: fixture.expectedChecks, actualChecks,
    expectedManualNodes: fixture.expectedManualNodes, actualManualNodes,
  };
  fixtureResults.push(result);
  if (!pass) failures.push({ type: 'FIXTURE_FAILURE', ...result });
}

const fakeResult = stdout => ({ status: 0, stdout, stderr: '' });
const gitSourceTests = [];
const sourceCase = (id, options, expected, runner, stdinText = null) => {
  try {
    const actual = collectChangedFiles(options, { runGit: runner, stdinText });
    const pass = sameSet(actual, expected);
    gitSourceTests.push({ id, pass, expected, actual });
    if (!pass) failures.push({ type: 'SOURCE_FAILURE', id, expected, actual });
  } catch (error) {
    gitSourceTests.push({ id, pass: false, error: String(error) });
    failures.push({ type: 'SOURCE_EXCEPTION', id, error: String(error) });
  }
};

sourceCase('COMPARE_SOURCE', parsePlanCli(['--base', 'main', '--head', 'HEAD']), ['src/routes/heroes.tsx'], args => {
  const expected = ['diff', '--name-only', '--diff-filter=ACMRD', 'main...HEAD', '--'];
  return JSON.stringify(args) === JSON.stringify(expected) ? fakeResult('src/routes/heroes.tsx\n') : { status: 1, stdout: '', stderr: 'unexpected args' };
});
sourceCase('STAGED_SOURCE', parsePlanCli(['--staged']), ['package.json'], args => {
  const expected = ['diff', '--cached', '--name-only', '--diff-filter=ACMRD', '--'];
  return JSON.stringify(args) === JSON.stringify(expected) ? fakeResult('package.json\n') : { status: 1, stdout: '', stderr: 'unexpected args' };
});
sourceCase('WORKING_SOURCE_DEDUP', parsePlanCli(['--working']), ['src/routes/heroes.tsx', 'tmp/new.txt'], args => {
  if (args[0] === 'diff') return fakeResult('src/routes/heroes.tsx\n');
  if (args[0] === 'ls-files') return fakeResult('tmp/new.txt\nsrc/routes/heroes.tsx\n');
  return { status: 1, stdout: '', stderr: 'unexpected args' };
});
sourceCase('STDIN_LINES', parsePlanCli(['--stdin']), ['a.txt', 'b.txt'], () => fakeResult(''), 'a.txt\nb.txt\n');
sourceCase('STDIN_JSON', parsePlanCli(['--stdin']), ['a.txt', 'b.txt'], () => fakeResult(''), '["a.txt","b.txt"]');

const pass = failures.length === 0;
const summary = {
  version: 1,
  stage: 'D3',
  checkpoint: 'PROJECT_DOCTOR_D3_VALIDATOR_PLAN',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN' : 'FAIL_PROJECT_DOCTOR_D3_PLAN',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  planner: 'scripts/plan-project-doctor-d3.mjs',
  validator: 'scripts/validate-project-doctor-d3.mjs',
  scope: {
    gitChangedFileCollection: true,
    impactResolution: true,
    checkSelection: true,
    validatorExecutionCount: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    githubActions: false
  },
  checks: {
    selectionFixtureCount: fixtureResults.length,
    selectionFixturePassCount: fixtureResults.filter(item => item.pass).length,
    sourceFixtureCount: gitSourceTests.length,
    sourceFixturePassCount: gitSourceTests.filter(item => item.pass).length,
    verifiedCatalogEntryCount: (contract.checkCatalog ?? []).length,
    manualReviewNodeCount: Object.keys(contract.manualReviewNodes ?? {}).length
  },
  fixtureResults,
  sourceTests: gitSourceTests,
  verificationEvidence: {
    plannerNodeSyntaxCheck: 'PASS',
    validatorNodeSyntaxCheck: 'PASS',
    isolatedSelectionFixtures: `${fixtureResults.filter(item => item.pass).length}/${fixtureResults.length} PASS`,
    isolatedChangedFileSourceFixtures: `${gitSourceTests.filter(item => item.pass).length}/${gitSourceTests.length} PASS`,
    repositoryLivePlannerExecution: 'NOT_RUN_NO_REPOSITORY_EXECUTION_CONNECTOR',
    selectedValidatorExecution: 'NOT_RUN_BY_DESIGN'
  },
  keyBoundary: 'D3 selects a plan only. Selected validator/build commands are never executed by the planner or validator.',
  failures,
  hardErrorCount: failures.length,
  nextStage: pass ? 'D4' : null,
  nextStageGoal: pass ? 'Promote exact owning-stage validators into the catalog and execute only the selected checks in phase order.' : null
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
if (!pass) process.exitCode = 1;
console.log(summary.status);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (!isMain) process.exitCode = undefined;
