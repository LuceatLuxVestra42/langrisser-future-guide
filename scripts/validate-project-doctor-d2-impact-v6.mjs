import fs from 'node:fs';
import path from 'node:path';
import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD2V6Context } from './analyze-project-doctor-d2-impact-v6.mjs';

const OUTPUT_PATH = 'data/validation/project-doctor-d2-impact-summary.v6.json';
const context = loadProjectDoctorD2V6Context();
const { contract, predecessor, effectiveMap } = context;
const failures = [];
const results = [];
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

if (contract.extends !== 'data/contracts/project-doctor-d2-impact-contract.v5.json') failures.push('PREDECESSOR');
if (predecessor.schemaId !== 'project-doctor-d2-impact-contract/v5') failures.push('V5_PRESERVATION');
if (contract.overlayPolicy?.mayAddImpactNodes !== false || contract.overlayPolicy?.mayAddPropagationEdges !== false) failures.push('GRAPH_POLICY');

for (const fixture of contract.fixtures ?? []) {
  const result = analyzePaths(fixture.paths, effectiveMap);
  const pass = result.status === fixture.expectedStatus && same(result.directNodes, fixture.expectedDirectNodes ?? []);
  results.push({ id: fixture.id, pass, status: result.status, directNodes: result.directNodes });
  if (!pass) failures.push(`FIXTURE:${fixture.id}`);
}

const inherited = analyzePaths(['tools/asset-intake/core/engine-v1.mjs'], effectiveMap);
if (inherited.status !== 'MAPPED' || !same(inherited.directNodes, ['project-doctor'])) failures.push('V5_INHERITED_ROUTING');

const pass = failures.length === 0;
const output = {
  version: 6,
  schemaId: 'project-doctor-d2-impact-summary/v6',
  status: pass ? 'PASS_PROJECT_DOCTOR_D2_IMPACT_V6' : 'FAIL_PROJECT_DOCTOR_D2_IMPACT_V6',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  fixtureCount: results.length,
  fixturePassCount: results.filter(item => item.pass).length,
  predecessorPreserved: predecessor.schemaId === 'project-doctor-d2-impact-contract/v5',
  failures,
  results,
};
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(output.status);
if (!pass) process.exitCode = 1;
