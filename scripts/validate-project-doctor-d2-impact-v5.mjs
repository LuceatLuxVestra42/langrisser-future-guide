import fs from 'node:fs';
import path from 'node:path';
import { analyzePaths, buildEffectiveMap } from './analyze-project-doctor-d2-impact.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v5.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d2-impact-summary.v5.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const contract = read(CONTRACT_PATH);
const base = read(contract.baseMap);
const map = buildEffectiveMap(base, contract);
const failures = [];
const results = [];

if (contract.schemaId !== 'project-doctor-d2-impact-contract/v5' || contract.status !== 'DESIGN_FROZEN') failures.push('CONTRACT');
if (contract.supersedes !== 'data/contracts/project-doctor-d2-impact-contract.v4.json') failures.push('SUPERSEDES');
const intake = contract.pathRuleOverlays.find(item => item.id === 'asset-intake-shared-tooling');
if (!intake || intake.changeClass !== 'asset-intake-tooling' || !same(intake.directNodes, ['project-doctor'])) failures.push('ASSET_INTAKE_OVERLAY');
for (const required of ['tools/asset-intake/**', 'data/validation/asset-intake-*', 'docs/checkpoints/asset-intake-*']) {
  if (!(intake?.patterns ?? []).includes(required)) failures.push(`ASSET_INTAKE_PATTERN:${required}`);
}
const hero = contract.pathRuleOverlays.find(item => item.id === 'hero-artwork-final-owner');
if (!hero || hero.changeClass !== 'asset-pipeline' || !same(hero.directNodes, ['hero-assets'])) failures.push('HERO_OVERLAY_PRESERVATION');
if (contract.overlayPolicy?.mayAddImpactNodes !== false || contract.overlayPolicy?.mayAddPropagationEdges !== false || contract.overlayPolicy?.mayRewriteBaseRulePatterns !== false) failures.push('GRAPH_POLICY');

for (const fixture of contract.fixtures ?? []) {
  const result = analyzePaths(fixture.paths, map);
  const pass = result.status === fixture.expectedStatus
    && same(result.directNodes, fixture.expectedDirectNodes ?? [])
    && same(result.domains, fixture.expectedDomains ?? []);
  results.push({ id: fixture.id, pass, status: result.status, directNodes: result.directNodes, domains: result.domains });
  if (!pass) failures.push(`FIXTURE:${fixture.id}`);
}

const pass = failures.length === 0;
const output = {
  version: 5,
  schemaId: 'project-doctor-d2-impact-summary/v5',
  status: pass ? 'PASS_PROJECT_DOCTOR_D2_IMPACT_V5' : 'FAIL_PROJECT_DOCTOR_D2_IMPACT_V5',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  fixtureCount: results.length,
  fixturePassCount: results.filter(item => item.pass).length,
  assetIntakeOwningNode: 'project-doctor',
  assetIntakeDomainOwnerPromotion: false,
  failures,
  results,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(output.status);
if (!pass) process.exitCode = 1;
