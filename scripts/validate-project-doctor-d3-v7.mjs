import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { buildPlanFromImpact } from './plan-project-doctor-d3.mjs';
import { loadProjectDoctorD3V7Context } from './plan-project-doctor-d3-v7.mjs';

const context = loadProjectDoctorD3V7Context();
const failures = [];
const results = [];
const requiredCheck = 'soldier-training-material-assets-final';

if (context.delta.extends !== 'data/contracts/project-doctor-d3-validator-plan.v6.json') failures.push('PREDECESSOR');
if (context.predecessor.schemaId !== 'project-doctor-d3-validator-plan/v6') failures.push('V6_PRESERVATION');
const catalog = context.contract.checkCatalog ?? [];
const added = catalog.find(item => item.id === requiredCheck);
if (!added || added.command !== 'npm run validate:soldier-training-material-assets-final') failures.push('ASSET_CHECK_CATALOG');

for (const fixture of context.delta.fixtures ?? []) {
  const impact = analyzePaths(fixture.paths, context.effectiveMap);
  const plan = buildPlanFromImpact({ source: { mode: 'fixture' }, changedFiles: fixture.paths, impact, contract: context.contract });
  const ids = plan.selectedChecks.map(item => item.id);
  const expected = fixture.expectedChecks ?? [];
  const pass = plan.status === fixture.expectedStatus
    && expected.every(id => ids.includes(id))
    && plan.manualReviews.length === (fixture.expectedManualReviewCount ?? 0)
    && !plan.impact.directNodes.includes('soldier-canonical');
  results.push({ id: fixture.id, pass, status: plan.status, checks: ids, manualReviews: plan.manualReviews.length, directNodes: plan.impact.directNodes });
  if (!pass) failures.push(`FIXTURE:${fixture.id}`);
}

const unknown = analyzePaths(['data/configdata/ConfigDataUnknownFutureTable.json'], context.effectiveMap);
const unknownPlan = buildPlanFromImpact({ source: { mode: 'fixture' }, changedFiles: ['data/configdata/ConfigDataUnknownFutureTable.json'], impact: unknown, contract: context.contract });
if (unknownPlan.status !== 'MANUAL_REVIEW') failures.push('MANUAL_REVIEW_POLICY');

const pass = failures.length === 0;
console.log(JSON.stringify({
  version: 7,
  schemaId: 'project-doctor-d3-summary/v7',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN_V7' : 'FAIL_PROJECT_DOCTOR_D3_PLAN_V7',
  fixtureCount: results.length + 1,
  fixturePassCount: results.filter(item => item.pass).length + (unknownPlan.status === 'MANUAL_REVIEW' ? 1 : 0),
  failures,
  results,
}, null, 2));
if (!pass) process.exitCode = 1;
