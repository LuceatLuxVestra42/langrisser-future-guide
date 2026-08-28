import fs from 'node:fs';
import path from 'node:path';
import {
  analyzePaths,
  buildEffectiveMap,
  parseStdinText,
} from './analyze-project-doctor-d2-impact.mjs';

const CONTRACT_PATH = process.argv[2] ?? 'data/contracts/project-doctor-d2-impact-contract.v1.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d2-impact-summary.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();

const failures = [];
const checks = [];
const check = (name, condition, detail = null) => {
  const row = { name, pass: Boolean(condition), ...(detail === null ? {} : { detail }) };
  checks.push(row);
  if (!condition) failures.push(row);
};

const contract = readJson(CONTRACT_PATH);
const baseMap = readJson(contract.baseMap);
const effectiveMap = buildEffectiveMap(baseMap, contract);

check('impact contract frozen', contract.status === 'DESIGN_FROZEN', contract.status);
check('base map frozen', baseMap.status === 'DESIGN_FROZEN', baseMap.status);
check('base map schema expected', baseMap.schemaId === 'project-doctor-d2-dependency-map/v1', baseMap.schemaId);
check('overlay adds path rules only', (contract.pathRuleOverlays ?? []).every(rule => Array.isArray(rule.directNodes) && !('propagationEdges' in rule)));
check('overlay count exact', (contract.pathRuleOverlays ?? []).length === 4, (contract.pathRuleOverlays ?? []).length);
check('overlay ids unique', new Set((contract.pathRuleOverlays ?? []).map(rule => rule.id)).size === (contract.pathRuleOverlays ?? []).length);
check('soldier WebP overlay present', (contract.pathRuleOverlays ?? []).some(rule => rule.id === 'soldier-webp-assets-post-map'));
check('Project Doctor workflow overlay present', (contract.pathRuleOverlays ?? []).some(rule => rule.id === 'project-doctor-workflow-post-map'));
check('Project Status derived-sync overlay present', (contract.pathRuleOverlays ?? []).some(rule => rule.id === 'project-status-derived-sync'));
check('Regression Coverage Promotion V1 overlay present', (contract.pathRuleOverlays ?? []).some(rule => rule.id === 'regression-coverage-promotion-v1-meta-contract'));

const fixtureResults = [];
for (const fixture of contract.fixtures ?? []) {
  const result = analyzePaths(fixture.paths, effectiveMap);
  const fixtureFailures = [];
  const expect = (label, condition, detail) => {
    if (!condition) fixtureFailures.push({ label, detail });
  };
  expect('status', result.status === fixture.expectedStatus, { expected: fixture.expectedStatus, actual: result.status });
  if (fixture.expectedChangedFileCount !== undefined) {
    expect('changedFileCount', result.changedFileCount === fixture.expectedChangedFileCount, { expected: fixture.expectedChangedFileCount, actual: result.changedFileCount });
  }
  expect('directNodes', same(result.directNodes, sorted(fixture.expectedDirectNodes ?? [])), { expected: sorted(fixture.expectedDirectNodes ?? []), actual: result.directNodes });
  expect('domains', same(result.domains, sorted(fixture.expectedDomains ?? [])), { expected: sorted(fixture.expectedDomains ?? []), actual: result.domains });
  const pass = fixtureFailures.length === 0;
  fixtureResults.push({ id: fixture.id, pass, failures: fixtureFailures, result });
  if (!pass) failures.push({ name: `fixture ${fixture.id}`, pass: false, detail: fixtureFailures });
}

const stdinLineResult = parseStdinText('src/routes/heroes.tsx\npublic/images/soldiers/5102.png\n');
const stdinJsonResult = parseStdinText('["src/routes/heroes.tsx","package.json"]');
check('stdin newline parser', same(stdinLineResult, ['src/routes/heroes.tsx', 'public/images/soldiers/5102.png']), stdinLineResult);
check('stdin JSON parser', same(stdinJsonResult, ['src/routes/heroes.tsx', 'package.json']), stdinJsonResult);

const pass = failures.length === 0;
const summary = {
  version: 1,
  stage: 'D2-IMPACT',
  checkpoint: 'PROJECT_DOCTOR_D2_IMPACT_ANALYZER',
  status: pass ? 'PASS_PROJECT_DOCTOR_D2_IMPACT' : 'FAIL_PROJECT_DOCTOR_D2_IMPACT',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  baseMap: contract.baseMap,
  analyzer: 'scripts/analyze-project-doctor-d2-impact.mjs',
  validator: 'scripts/validate-project-doctor-d2-impact.mjs',
  scope: contract.scope,
  inputModes: contract.inputModes,
  exitPolicy: contract.exitPolicy,
  counts: {
    fixtureCount: fixtureResults.length,
    fixturePassCount: fixtureResults.filter(item => item.pass).length,
    fixtureFailureCount: fixtureResults.filter(item => !item.pass).length,
    pathRuleOverlayCount: (contract.pathRuleOverlays ?? []).length,
  },
  keyBoundaries: [
    'D2-IMPACT consumes explicit changed-file paths; it does not inspect git diff yet.',
    'Only D2-MAP explicit propagation edges may expand impact.',
    'Unmatched paths remain MANUAL_REVIEW; no all-domain fanout or filename-similarity inference is allowed.',
    'Soldier WebP delivery is a presentation-only post-map overlay and does not reopen Soldier canonical semantics.',
    'Project Doctor workflow files map to the project-doctor tooling node only and do not reopen semantic domain pipelines.',
    'Project Status builder/workflow/generated views map to project-doctor tooling only; they remain deterministic D1 projections and do not reopen semantic domain pipelines.',
    'Regression Coverage Promotion V1 contract/summary/validator paths map to project-doctor tooling only; candidate domain validators remain unpromoted.',
    'No validators are selected or executed in D2-IMPACT.'
  ],
  verificationEvidence: {
    localNodeSyntaxCheck: 'PASS',
    isolatedFunctionalExecution: pass ? `PASS_${fixtureResults.filter(item => item.pass).length}_OF_${fixtureResults.length}` : 'FAIL',
    stdinLineParsing: checks.find(item => item.name === 'stdin newline parser')?.pass ?? false,
    stdinJsonParsing: checks.find(item => item.name === 'stdin JSON parser')?.pass ?? false,
    repositoryLiveCliExecution: 'NOT_RUN_NO_REPOSITORY_EXECUTION_CONNECTOR'
  },
  checks,
  fixtureResults: fixtureResults.map(item => ({
    id: item.id,
    pass: item.pass,
    status: item.result.status,
    changedFileCount: item.result.changedFileCount,
    directNodes: item.result.directNodes,
    domains: item.result.domains,
    failures: item.failures,
  })),
  failures,
  hardErrorCount: failures.length,
  nextStage: pass ? contract.nextStage : null,
  nextStageGoal: pass ? contract.nextStageGoal : null
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
if (!pass) process.exitCode = 1;
console.log(summary.status);