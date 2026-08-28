import fs from 'node:fs';
import path from 'node:path';
import { analyzePaths, buildEffectiveMap, parseStdinText } from './analyze-project-doctor-d2-impact.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v2.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d2-impact-summary.v2.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();

const contract = readJson(CONTRACT_PATH);
const baseMap = readJson(contract.baseMap);
const effectiveMap = buildEffectiveMap(baseMap, contract);
const failures = [];
const checks = [];
const check = (name, condition, detail = null) => {
  const row = { name, pass: Boolean(condition), ...(detail === null ? {} : { detail }) };
  checks.push(row);
  if (!condition) failures.push(row);
};

check('v2 contract frozen', contract.schemaId === 'project-doctor-d2-impact-contract/v2' && contract.status === 'DESIGN_FROZEN');
check('base map v1 preserved', contract.baseMap === 'data/contracts/project-doctor-d2-dependency-map.v1.json' && baseMap.status === 'DESIGN_FROZEN');
check('overlay adds path rules only', (contract.pathRuleOverlays ?? []).every(rule => Array.isArray(rule.directNodes) && !('propagationEdges' in rule)));
check('overlay count exact', (contract.pathRuleOverlays ?? []).length === 5, (contract.pathRuleOverlays ?? []).map(rule => rule.id));
for (const id of ['soldier-webp-assets-post-map','project-doctor-workflow-post-map','project-status-derived-sync','regression-coverage-promotion-v1-meta-contract','localization-audit-stage6-integration']) {
  check(`overlay present: ${id}`, (contract.pathRuleOverlays ?? []).some(rule => rule.id === id));
}
const localizationOverlay = (contract.pathRuleOverlays ?? []).find(rule => rule.id === 'localization-audit-stage6-integration');
check('localization overlay tooling-only', same(sorted(localizationOverlay?.directNodes ?? []), ['project-doctor']) && localizationOverlay?.changeClass === 'localization-tooling');
check('localization overlay no semantic node mutation', contract.overlayPolicy?.mayAddImpactNodes === false && contract.overlayPolicy?.mayAddPropagationEdges === false);

const fixtureResults = [];
for (const fixture of contract.fixtures ?? []) {
  const result = analyzePaths(fixture.paths, effectiveMap);
  const fixtureFailures = [];
  const expect = (label, condition, detail) => { if (!condition) fixtureFailures.push({ label, detail }); };
  expect('status', result.status === fixture.expectedStatus, { expected: fixture.expectedStatus, actual: result.status });
  if (fixture.expectedChangedFileCount !== undefined) expect('changedFileCount', result.changedFileCount === fixture.expectedChangedFileCount, { expected: fixture.expectedChangedFileCount, actual: result.changedFileCount });
  expect('directNodes', same(result.directNodes, sorted(fixture.expectedDirectNodes ?? [])), { expected: sorted(fixture.expectedDirectNodes ?? []), actual: result.directNodes });
  expect('domains', same(result.domains, sorted(fixture.expectedDomains ?? [])), { expected: sorted(fixture.expectedDomains ?? []), actual: result.domains });
  const pass = fixtureFailures.length === 0;
  fixtureResults.push({ id: fixture.id, pass, failures: fixtureFailures, result });
  if (!pass) failures.push({ name: `fixture ${fixture.id}`, pass: false, detail: fixtureFailures });
}

check('stdin newline parser', same(parseStdinText('src/routes/heroes.tsx\npublic/images/soldiers/5102.png\n'), ['src/routes/heroes.tsx','public/images/soldiers/5102.png']));
check('stdin JSON parser', same(parseStdinText('["src/routes/heroes.tsx","package.json"]'), ['src/routes/heroes.tsx','package.json']));

const pass = failures.length === 0;
const summary = {
  version: 2,
  schemaId: 'project-doctor-d2-impact-summary/v2',
  stage: 'D2-IMPACT',
  checkpoint: 'PROJECT_DOCTOR_D2_IMPACT_ANALYZER_V2',
  status: pass ? 'PASS_PROJECT_DOCTOR_D2_IMPACT_V2' : 'FAIL_PROJECT_DOCTOR_D2_IMPACT_V2',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  baseMap: contract.baseMap,
  counts: { fixtureCount: fixtureResults.length, fixturePassCount: fixtureResults.filter(item => item.pass).length, pathRuleOverlayCount: contract.pathRuleOverlays.length, hardErrorCount: failures.length },
  localizationOverlay: { id: localizationOverlay?.id ?? null, changeClass: localizationOverlay?.changeClass ?? null, directNodes: localizationOverlay?.directNodes ?? [], patternCount: localizationOverlay?.patterns?.length ?? 0 },
  checks,
  fixtureResults: fixtureResults.map(item => ({ id: item.id, pass: item.pass, status: item.result.status, changedFileCount: item.result.changedFileCount, directNodes: item.result.directNodes, domains: item.result.domains, failures: item.failures })),
  failures,
  hardErrorCount: failures.length,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(summary.status);
if (!pass) process.exitCode = 1;
