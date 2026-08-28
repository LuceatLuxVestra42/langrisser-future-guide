import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadPlanningContext, planPaths, collectChangedFiles, parsePlanCli } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v3.json';
const historicalV2 = spawnSync(process.execPath, ['scripts/validate-project-doctor-d3-v2.mjs'], { stdio: 'inherit', shell: false });
if (historicalV2.error || historicalV2.status !== 0) {
  console.error('Historical D3 v2 self-test failed; v3 must preserve frozen v2 selection coverage.');
  process.exit(historicalV2.status ?? 1);
}

const OUTPUT_PATH = 'data/validation/project-doctor-d3-summary.v3.json';
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
const equipment = (contract.checkCatalog ?? []).find(item => item.id === 'equipment-image-final');
if (!equipment || equipment.command !== 'npm run validate:equipment-image-final' || equipment.phase !== 3 || !sameSet(equipment.triggerNodes, ['equipment-assets'])) failures.push({ type: 'EQUIPMENT_IMAGE_CATALOG_MISMATCH', equipment });

const v2 = JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v2.json', 'utf8'));
const expectedManual = Object.keys(v2.manualReviewNodes ?? {}).filter(node => node !== 'equipment-assets');
if (!sameSet(expectedManual, Object.keys(contract.manualReviewNodes ?? {}))) failures.push({ type: 'MANUAL_REVIEW_BOUNDARY_CHANGED', expectedManual, actual: Object.keys(contract.manualReviewNodes ?? {}) });
if ('equipment-assets' in (contract.manualReviewNodes ?? {})) failures.push({ type: 'EQUIPMENT_ASSETS_NOT_PROMOTED' });
if (!('equipment-canonical' in (contract.manualReviewNodes ?? {}))) failures.push({ type: 'EQUIPMENT_CANONICAL_WAS_BROADENED' });

const pass = failures.length === 0;
const summary = {
  version: 3,
  schemaId: 'project-doctor-d3-summary/v3',
  stage: 'D3',
  checkpoint: 'PROJECT_DOCTOR_D3_VALIDATOR_PLAN_V3',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN_V3' : 'FAIL_PROJECT_DOCTOR_D3_PLAN_V3',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  checks: { selectionFixtureCount: fixtureResults.length, selectionFixturePassCount: fixtureResults.filter(item => item.pass).length, sourceFixtureCount: sourceTests.length, sourceFixturePassCount: sourceTests.filter(item => item.pass).length, verifiedCatalogEntryCount: contract.checkCatalog.length, manualReviewNodeCount: Object.keys(contract.manualReviewNodes).length, localizationAuditCataloged: Boolean(localization), equipmentImageFinalOwnerCataloged: Boolean(equipment) },
  fixtureResults,
  sourceTests,
  failures,
  hardErrorCount: failures.length,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(summary.status);
if (!pass) process.exitCode = 1;
