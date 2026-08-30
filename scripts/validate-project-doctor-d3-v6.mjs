import assert from 'node:assert/strict';
import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD3V6Context } from './plan-project-doctor-d3-v6.mjs';
import { applyProjectDoctorFreshnessV2 } from './classify-project-doctor-frozen-freshness-v2.mjs';
import { buildPlanFromImpact } from './plan-project-doctor-d3.mjs';

const context = loadProjectDoctorD3V6Context();
const failures = [];
const results = [];
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

for (const fixture of context.delta.fixtures ?? []) {
  const impact = analyzePaths(fixture.paths, context.effectiveMap);
  const pass = impact.status === fixture.expectedStatus && same(impact.directNodes, fixture.expectedDirectNodes ?? []);
  results.push({ id: fixture.id, pass, status: impact.status, directNodes: impact.directNodes });
  if (!pass) failures.push(`D2_FIXTURE:${fixture.id}`);
}

const artifactPath = 'data/generated/soldier-stage6-7-site-admission.v1.json';
const candidate = analyzePaths([artifactPath], context.effectiveMap);
const routed = applyProjectDoctorFreshnessV2(candidate, [{ path: artifactPath, supported: true, classification: 'PROVENANCE_ONLY_CHANGED' }]);
const plan = buildPlanFromImpact({ source: { mode: 'fixture' }, changedFiles: [artifactPath], impact: routed, contract: context.contract });
const ids = plan.selectedChecks.map(item => item.id);
if (plan.status !== 'PLAN_READY') failures.push('PROVENANCE_PLAN_STATUS');
if (!ids.includes('frozen-freshness-v2-self-test')) failures.push('PROVENANCE_SELF_TEST_SELECTION');
if (ids.includes('coverage-soldier-canonical') || ids.includes('coverage-hero-soldier-relation') || ids.includes('production-build')) failures.push('PROVENANCE_DOMAIN_FANOUT');
if (plan.manualReviews.length !== 0) failures.push('PROVENANCE_MANUAL_REVIEW');

const semanticPlan = buildPlanFromImpact({ source: { mode: 'fixture' }, changedFiles: [artifactPath], impact: candidate, contract: context.contract });
assert.ok(semanticPlan.selectedChecks.some(item => item.id === 'coverage-soldier-canonical'));

if (context.delta.extends !== 'data/contracts/project-doctor-d3-validator-plan.v5.json') failures.push('PREDECESSOR');
if (!same(Object.keys(context.contract.manualReviewNodes ?? {}), ['banner-assets', 'skin-assets'])) failures.push('MANUAL_BOUNDARY');
const freshnessCheck = context.contract.checkCatalog.find(item => item.id === 'frozen-freshness-v2-self-test');
if (!freshnessCheck || freshnessCheck.command !== 'npm run doctor:freshness:v2:self-test') failures.push('FRESHNESS_CHECK');

const pass = failures.length === 0;
console.log(JSON.stringify({
  version: 6,
  schemaId: 'project-doctor-d3-summary/v6',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN_V6' : 'FAIL_PROJECT_DOCTOR_D3_PLAN_V6',
  fixtureCount: results.length + 2,
  fixturePassCount: pass ? results.length + 2 : results.filter(item => item.pass).length,
  provenanceSelectedChecks: ids,
  failures,
  results,
}, null, 2));
if (!pass) process.exitCode = 1;
