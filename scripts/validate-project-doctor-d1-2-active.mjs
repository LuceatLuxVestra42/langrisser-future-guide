import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/project-doctor-d1-0-contract.v1.json';
const GATE_PATH = 'data/contracts/project-doctor-d1-2-health-gate.v1.json';
const REGISTRY_PATH = 'data/generated/project-doctor-active-source-registry.v1.json';
const INPUT_PATH = 'data/generated/project-doctor-d1-1-status.v1.json';
const OUTPUT_PATH = 'data/validation/project-doctor-d1-2-summary.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(Object(value), key);

const acceptedStatus = rawStatus => typeof rawStatus === 'string' && (
  rawStatus.toUpperCase().startsWith('PASS') || rawStatus === 'READY_FOR_ASSET_EVIDENCE'
);
const noteItems = (record, key) => (record.notes ?? []).flatMap(note => {
  if (!isObject(note) || !hasOwn(note, key)) return [];
  return Array.isArray(note[key]) ? note[key] : [note[key]];
});
const classifyHealth = record => {
  if (record.primarySource?.readError) return 'MISSING';
  const explicitFailureSignals = noteItems(record, 'explicitFailureSignals');
  const zeroRequiredViolations = noteItems(record, 'zeroRequiredViolations');
  const rawFailed = typeof record.rawStatus === 'string' && record.rawStatus.toUpperCase().includes('FAIL');
  if ((typeof record.hardErrorCount === 'number' && record.hardErrorCount > 0) || explicitFailureSignals.length > 0 || zeroRequiredViolations.length > 0 || rawFailed) return 'FAIL';
  if (noteItems(record, 'consistencyIssues').length > 0) return 'INCONSISTENT';
  if ((record.reviews?.length ?? 0) > 0 || (record.blockers?.length ?? 0) > 0) return 'REVIEW';
  if (acceptedStatus(record.rawStatus)) return 'PASS';
  return 'UNKNOWN';
};
const classifyProjectHealth = (healthCounts, precedence) => precedence.find(health => (healthCounts[health] ?? 0) > 0) ?? 'UNKNOWN';

const failures = [];
const check = (name, condition, detail = null) => {
  if (!condition) failures.push({ name, detail });
  return { name, pass: Boolean(condition), ...(detail === null ? {} : { detail }) };
};

const contract = readJson(CONTRACT_PATH);
const gate = readJson(GATE_PATH);
const registry = readJson(REGISTRY_PATH);
const input = readJson(INPUT_PATH);
const checks = [];

checks.push(check('D1-0 contract frozen', contract.status === 'DESIGN_FROZEN', contract.status));
checks.push(check('Active Source Registry passed', registry.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY', registry.status));
checks.push(check('Active Source Registry selected six domains', registry.selectedCount === 6, registry.selectedCount));
checks.push(check('D1-1 input collected', input.status === 'COLLECTED', input.status));
checks.push(check('D1-1 references Active Source Registry', input.activeSourceRegistry === REGISTRY_PATH, input.activeSourceRegistry));
checks.push(check('D1-1 input read-only', input.readOnly === true));
checks.push(check('D1-1 validator execution remains zero', input.validatorExecutionCount === 0, input.validatorExecutionCount));
checks.push(check('D1-1 raw ConfigData reads remain zero', input.rawConfigDataReadCount === 0, input.rawConfigDataReadCount));
checks.push(check('D1-1 semantic recomputation remains zero', input.semanticRecomputationCount === 0, input.semanticRecomputationCount));

const expectedDomains = contract.scope?.domains ?? [];
const actualDomains = input.domains ?? [];
checks.push(check('domain count exact', actualDomains.length === expectedDomains.length, { expected: expectedDomains.length, actual: actualDomains.length }));
checks.push(check('domain names exact', JSON.stringify(actualDomains.map(item => item.domain)) === JSON.stringify(expectedDomains), { expected: expectedDomains, actual: actualDomains.map(item => item.domain) }));
checks.push(check('domain names unique', new Set(actualDomains.map(item => item.domain)).size === actualDomains.length));

const allowedHealth = new Set(contract.normalizedModel?.healthValues ?? []);
const allowedLifecycle = new Set(contract.normalizedModel?.lifecycleValues ?? []);
const requiredFields = contract.normalizedModel?.domainRecordFields ?? [];
const domainChecks = [];

for (const record of actualDomains) {
  const baseSpec = contract.domains?.[record.domain];
  const spec = registry.effectiveDomains?.[record.domain];
  const active = registry.domains?.[record.domain];
  const missingFields = requiredFields.filter(field => !hasOwn(record, field));
  const derivedHealth = classifyHealth(record);
  const expectedPopulation = spec?.expected ?? {};
  const populationMismatches = [];
  for (const [key, expected] of Object.entries(expectedPopulation)) {
    if (/(failed|error|mismatch|violation)/i.test(key)) continue;
    if (hasOwn(record.population ?? {}, key) && record.population[key] !== expected) populationMismatches.push({ key, expected, actual: record.population[key] });
  }
  const sourceMatches = record.primarySource?.path === active?.sourcePath && record.primarySource?.path === spec?.primaryStatusSource;
  const result = {
    domain: record.domain,
    pass: Boolean(baseSpec) && Boolean(spec) && Boolean(active)
      && missingFields.length === 0
      && allowedHealth.has(record.health)
      && allowedLifecycle.has(record.lifecycle)
      && sourceMatches
      && record.activeSource?.selectedId === active.selectedId
      && derivedHealth === record.health
      && record.reviewCount === (record.reviews?.length ?? 0)
      && populationMismatches.length === 0,
    derivedHealth,
    actualHealth: record.health,
    lifecycle: record.lifecycle,
    missingFields,
    populationMismatches,
    primarySourceMatchesRegistry: sourceMatches,
    activeSourceIdMatchesRegistry: record.activeSource?.selectedId === active?.selectedId,
    reviewCountMatches: record.reviewCount === (record.reviews?.length ?? 0),
  };
  domainChecks.push(result);
  if (!result.pass) failures.push({ name: `domain contract: ${record.domain}`, detail: result });
}

const recomputedHealthCounts = Object.fromEntries([...allowedHealth].map(value => [value, actualDomains.filter(item => item.health === value).length]));
const recomputedLifecycleCounts = Object.fromEntries([...allowedLifecycle].map(value => [value, actualDomains.filter(item => item.lifecycle === value).length]));
const precedence = (contract.globalHealthPrecedence ?? []).sort((a, b) => a.order - b.order).map(item => item.health);
const recomputedProjectHealth = classifyProjectHealth(recomputedHealthCounts, precedence);
const recomputedHardErrorTotal = actualDomains.reduce((sum, item) => sum + (typeof item.hardErrorCount === 'number' ? item.hardErrorCount : 0), 0);
const recomputedReviewTotal = actualDomains.reduce((sum, item) => sum + (item.reviews?.length ?? 0), 0);
const recomputedBlockerTotal = actualDomains.reduce((sum, item) => sum + (item.blockers?.length ?? 0), 0);

checks.push(check('health counts exact', JSON.stringify(input.healthCounts) === JSON.stringify(recomputedHealthCounts), { input: input.healthCounts, recomputed: recomputedHealthCounts }));
checks.push(check('lifecycle counts exact', JSON.stringify(input.lifecycleCounts) === JSON.stringify(recomputedLifecycleCounts), { input: input.lifecycleCounts, recomputed: recomputedLifecycleCounts }));
checks.push(check('project health precedence exact', input.projectHealth === recomputedProjectHealth, { input: input.projectHealth, recomputed: recomputedProjectHealth, precedence }));
checks.push(check('known hard error total exact', input.knownHardErrorTotal === recomputedHardErrorTotal, { input: input.knownHardErrorTotal, recomputed: recomputedHardErrorTotal }));
checks.push(check('review total exact', input.reviewTotal === recomputedReviewTotal, { input: input.reviewTotal, recomputed: recomputedReviewTotal }));
checks.push(check('blocker total exact', input.blockerTotal === recomputedBlockerTotal, { input: input.blockerTotal, recomputed: recomputedBlockerTotal }));

const fixtureResults = (gate.classificationFixtures ?? []).map(fixture => {
  const actual = classifyHealth(fixture.record);
  const pass = actual === fixture.expectedHealth;
  if (!pass) failures.push({ name: `fixture: ${fixture.id}`, detail: { expected: fixture.expectedHealth, actual } });
  return { id: fixture.id, expectedHealth: fixture.expectedHealth, actualHealth: actual, pass };
});

const currentSnapshot = {
  projectHealth: input.projectHealth,
  healthCounts: input.healthCounts,
  lifecycleCounts: input.lifecycleCounts,
  knownHardErrorTotal: input.knownHardErrorTotal,
  reviewTotal: input.reviewTotal,
  blockerTotal: input.blockerTotal,
};
const gatePass = failures.length === 0;
const summary = {
  version: 1,
  stage: 'D1-2',
  checkpoint: 'PROJECT_DOCTOR_D1_2_HEALTH_GATE',
  status: gatePass ? 'PASS_PROJECT_DOCTOR_D1_2_HEALTH_GATE' : 'FAIL_PROJECT_DOCTOR_D1_2_HEALTH_GATE',
  completion: gatePass ? 'COMPLETE' : 'BLOCKED',
  contract: CONTRACT_PATH,
  gateContract: GATE_PATH,
  activeSourceRegistry: REGISTRY_PATH,
  input: INPUT_PATH,
  scope: { classificationOnly: true, validatorExecution: false, rawConfigDataRead: false, semanticRecomputation: false, staleOutputHashCheck: false, repositoryMutation: false },
  checks,
  domainChecks,
  classificationFixtures: fixtureResults,
  fixtureCount: fixtureResults.length,
  fixturePassCount: fixtureResults.filter(item => item.pass).length,
  currentSnapshot,
  failures,
  hardErrorCount: failures.length,
  nextStage: gatePass ? 'D1-3' : null,
  nextStageGoal: gatePass ? 'Wire the registry-backed read-only collector/health gate into the stable CLI entry point.' : null,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
if (!gatePass) process.exitCode = 1;
console.log(summary.status);
