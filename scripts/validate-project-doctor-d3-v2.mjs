import fs from 'node:fs';
import path from 'node:path';
import { loadPlanningContext, planPaths, collectChangedFiles, parsePlanCli } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v2.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d3-summary.v2.json';
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const context = loadPlanningContext(CONTRACT_PATH);
const failures = [];
const sameSet = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const fixtureResults = [];

for (const fixture of contract.fixtures ?? []) {
  const plan = planPaths({ paths: fixture.paths, source: { mode: 'fixture', id: fixture.id }, context });
  const actualChecks = plan.selectedChecks.map(item => item.id);
  const actualManualNodes = plan.manualReviews.filter(item => item.node).map(item => item.node);
  const pass = plan.status === fixture.expectedStatus && sameSet(actualChecks, fixture.expectedChecks) && sameSet(actualManualNodes, fixture.expectedManualNodes) && plan.validatorExecutionCount === 0;
  const result = { id: fixture.id, pass, expectedStatus: fixture.expectedStatus, actualStatus: plan.status, expectedChecks: fixture.expectedChecks, actualChecks, expectedManualNodes: fixture.expectedManualNodes, actualManualNodes };
  fixtureResults.push(result);
  if (!pass) failures.push({ type: 'FIXTURE_FAILURE', ...result });
}

const fakeResult = stdout => ({ status: 0, stdout, stderr: '' });
const sourceTests = [];
const sourceCase = (id, options, expected, runner, stdinText = null) => {
  try {
    const actual = collectChangedFiles(options, { runGit: runner, stdinText });
    const pass = sameSet(actual, expected);
    sourceTests.push({ id, pass, expected, actual });
    if (!pass) failures.push({ type: 'SOURCE_FAILURE', id, expected, actual });
  } catch (error) {
    sourceTests.push({ id, pass: false, error: String(error) });
    failures.push({ type: 'SOURCE_EXCEPTION', id, error: String(error) });
  }
};
sourceCase('COMPARE_SOURCE', parsePlanCli(['--contract', CONTRACT_PATH, '--base', 'main', '--head', 'HEAD']), ['src/routes/heroes.tsx'], args => JSON.stringify(args) === JSON.stringify(['diff','--name-only','--diff-filter=ACMRD','main...HEAD','--']) ? fakeResult('src/routes/heroes.tsx\n') : { status: 1, stdout: '', stderr: 'unexpected args' });
sourceCase('STAGED_SOURCE', parsePlanCli(['--contract', CONTRACT_PATH, '--staged']), ['package.json'], args => JSON.stringify(args) === JSON.stringify(['diff','--cached','--name-only','--diff-filter=ACMRD','--']) ? fakeResult('package.json\n') : { status: 1, stdout: '', stderr: 'unexpected args' });
sourceCase('STDIN_JSON', parsePlanCli(['--contract', CONTRACT_PATH, '--stdin']), ['a.txt','b.txt'], () => fakeResult(''), '["a.txt","b.txt"]');

const localization = (contract.checkCatalog ?? []).find(item => item.id === 'localization-audit');
if (!localization || localization.command !== 'npm run audit:localization:check' || localization.phase !== 4) failures.push({ type: 'LOCALIZATION_CATALOG_MISMATCH', localization });
const v1 = JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v1.json', 'utf8'));
if (!sameSet(Object.keys(v1.manualReviewNodes ?? {}), Object.keys(contract.manualReviewNodes ?? {}))) failures.push({ type: 'MANUAL_REVIEW_BOUNDARY_CHANGED' });

const pass = failures.length === 0;
const summary = {
  version: 2,
  schemaId: 'project-doctor-d3-summary/v2',
  stage: 'D3',
  checkpoint: 'PROJECT_DOCTOR_D3_VALIDATOR_PLAN_V2',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN_V2' : 'FAIL_PROJECT_DOCTOR_D3_PLAN_V2',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  checks: { selectionFixtureCount: fixtureResults.length, selectionFixturePassCount: fixtureResults.filter(item => item.pass).length, sourceFixtureCount: sourceTests.length, sourceFixturePassCount: sourceTests.filter(item => item.pass).length, verifiedCatalogEntryCount: contract.checkCatalog.length, manualReviewNodeCount: Object.keys(contract.manualReviewNodes).length, localizationAuditCataloged: Boolean(localization) },
  fixtureResults,
  sourceTests,
  failures,
  hardErrorCount: failures.length,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(summary.status);
if (!pass) process.exitCode = 1;
