import fs from 'node:fs';
import path from 'node:path';
import { loadPlanningContext, planPaths } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v5.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d3-summary.v5.json';
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const context = loadPlanningContext(CONTRACT_PATH);
const failures = [];
const results = [];
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

for (const fixture of contract.fixtures ?? []) {
  const plan = planPaths({ paths: fixture.paths, source: { mode: 'fixture', id: fixture.id }, context });
  const checks = plan.selectedChecks.map(item => item.id);
  const manual = plan.manualReviews.filter(item => item.node).map(item => item.node);
  const pass = plan.status === fixture.expectedStatus
    && same(checks, fixture.expectedChecks)
    && same(manual, fixture.expectedManualNodes)
    && plan.validatorExecutionCount === 0;
  results.push({ id: fixture.id, pass, actualStatus: plan.status, checks, manual });
  if (!pass) failures.push(`FIXTURE:${fixture.id}`);
}

if (contract.schemaId !== 'project-doctor-d3-validator-plan/v5' || contract.status !== 'DESIGN_FROZEN') failures.push('CONTRACT');
if (contract.supersedes !== 'data/contracts/project-doctor-d3-validator-plan.v4.json') failures.push('SUPERSEDES');
const owners = (contract.admittedOwners ?? []).map(item => item.node);
if (owners.length !== 11 || !owners.includes('hero-assets') || owners.includes('skin-assets')) failures.push('OWNER_SET');
if (!same(Object.keys(contract.manualReviewNodes ?? {}), ['banner-assets', 'skin-assets'])) failures.push('MANUAL_SET');
const intake = contract.checkCatalog.find(item => item.id === 'asset-intake-self-test');
if (!intake || intake.phase !== 3 || intake.command !== 'npm run asset:intake:validate' || !same(intake.triggerChangeClasses, ['asset-intake-tooling'])) failures.push('ASSET_INTAKE_CATALOG');
const tooling = (contract.toolingAdmissions ?? []).find(item => item.checkId === 'asset-intake-self-test');
if (!tooling || tooling.node !== 'project-doctor' || tooling.domainOwnerPromotion !== false) failures.push('ASSET_INTAKE_TOOLING_ADMISSION');

const pass = failures.length === 0;
const output = {
  version: 5,
  schemaId: 'project-doctor-d3-summary/v5',
  status: pass ? 'PASS_PROJECT_DOCTOR_D3_PLAN_V5' : 'FAIL_PROJECT_DOCTOR_D3_PLAN_V5',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  fixtureCount: results.length,
  fixturePassCount: results.filter(item => item.pass).length,
  admittedOwnerCount: owners.length,
  manualReviewNodeCount: Object.keys(contract.manualReviewNodes ?? {}).length,
  assetIntakeToolingCheck: intake?.id ?? null,
  failures,
  results,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(output.status);
if (!pass) process.exitCode = 1;
