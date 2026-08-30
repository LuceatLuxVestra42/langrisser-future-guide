import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD2V7Context } from './analyze-project-doctor-d2-impact-v7.mjs';

const context = loadProjectDoctorD2V7Context();
const { contract, predecessor, effectiveMap } = context;
const failures = [];
const results = [];
const same = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

if (contract.extends !== 'data/contracts/project-doctor-d2-impact-contract.v6.json') failures.push('PREDECESSOR');
if (predecessor.schemaId !== 'project-doctor-d2-impact-contract/v6') failures.push('V6_PRESERVATION');
if (contract.overlayPolicy?.mayAddImpactNodes !== false || contract.overlayPolicy?.mayAddPropagationEdges !== false) failures.push('GRAPH_POLICY');

for (const fixture of contract.fixtures ?? []) {
  const result = analyzePaths(fixture.paths, effectiveMap);
  const pass = result.status === fixture.expectedStatus && same(result.directNodes, fixture.expectedDirectNodes ?? []);
  results.push({ id: fixture.id, pass, status: result.status, directNodes: result.directNodes });
  if (!pass) failures.push(`FIXTURE:${fixture.id}`);
}

const frozenInput = analyzePaths(['data/generated/soldier-training-material-iteminfo.v1.json'], effectiveMap);
if (frozenInput.directNodes.includes('soldier-canonical')) failures.push('SEMANTIC_FANOUT_NOT_SUPPRESSED');

const inherited = analyzePaths(['data/generated/soldier-stage6-7-site-admission.v1.json'], effectiveMap);
if (inherited.status !== 'MAPPED' || !inherited.directNodes.includes('soldier-canonical')) failures.push('V6_INHERITED_ROUTING');

const pass = failures.length === 0;
console.log(JSON.stringify({
  version: 7,
  schemaId: 'project-doctor-d2-impact-summary/v7',
  status: pass ? 'PASS_PROJECT_DOCTOR_D2_IMPACT_V7' : 'FAIL_PROJECT_DOCTOR_D2_IMPACT_V7',
  fixtureCount: results.length,
  fixturePassCount: results.filter(item => item.pass).length,
  semanticFanoutSuppressed: !frozenInput.directNodes.includes('soldier-canonical'),
  failures,
  results,
}, null, 2));
if (!pass) process.exitCode = 1;
