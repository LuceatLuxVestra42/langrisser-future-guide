import fs from 'node:fs';
import { buildRegistry, resolveRegistry } from './build-project-doctor-active-source-registry.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const failures = [];
const checks = [];
const check = (name, condition, detail = null) => {
  const row = { name, pass: Boolean(condition), ...(detail === null ? {} : { detail }) };
  checks.push(row);
  if (!condition) failures.push(row);
};

const actual = buildRegistry({ write: true });
const actualResult = actual.result;
check('actual registry passes', actualResult.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY', actualResult.failures);
check('six domains selected', actualResult.selectedCount === 6, actualResult.selectedCount);
check('no raw ConfigData reads', actualResult.rawConfigDataReadCount === 0, actualResult.rawConfigDataReadCount);
check('no semantic recomputation', actualResult.semanticRecomputationCount === 0, actualResult.semanticRecomputationCount);
check('no canonical JOIN recomputation', actualResult.canonicalJoinRecomputationCount === 0, actualResult.canonicalJoinRecomputationCount);

const baseContract = actual.contract;
const baseD1 = actual.d1Contract;
const baselineFile = JSON.parse(fs.readFileSync('data/status-sources/baseline.v1.json', 'utf8'));
const baselineEntries = baselineFile.entries.map(entry => ({ ...entry, sourceEntryFile: 'data/status-sources/baseline.v1.json' }));
const sourceCache = new Map();
const sourceLoader = sourcePath => {
  if (!sourceCache.has(sourcePath)) sourceCache.set(sourcePath, JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
  return sourceCache.get(sourcePath);
};

const heroRoot = baselineEntries.find(entry => entry.domain === 'hero');
const promotionEntries = [
  ...clone(baselineEntries),
  {
    id: 'fixture-hero-approved-successor',
    domain: 'hero',
    state: 'APPROVED',
    sourcePath: heroRoot.sourcePath,
    facet: 'canonical',
    successorOf: heroRoot.id,
    admission: clone(heroRoot.admission),
    sourceEntryFile: 'fixture.json'
  }
];
const promotion = resolveRegistry({ contract: baseContract, d1Contract: baseD1, entries: promotionEntries, sourceLoader });
check('explicit successor promotes terminal entry', promotion.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY'
  && promotion.domains.hero.selectedId === 'fixture-hero-approved-successor'
  && JSON.stringify(promotion.domains.hero.lineage) === JSON.stringify([heroRoot.id, 'fixture-hero-approved-successor']), promotion.domains.hero);

const branchEntries = [
  ...promotionEntries,
  {
    id: 'fixture-hero-second-successor',
    domain: 'hero',
    state: 'APPROVED',
    sourcePath: heroRoot.sourcePath,
    facet: 'canonical',
    successorOf: heroRoot.id,
    admission: clone(heroRoot.admission),
    sourceEntryFile: 'fixture.json'
  }
];
const branching = resolveRegistry({ contract: baseContract, d1Contract: baseD1, entries: branchEntries, sourceLoader });
check('multiple successors are blocked', branching.status === 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY'
  && branching.failures.some(item => item.type === 'MULTIPLE_SUCCESSORS'), branching.failures);

const badAdmissionEntries = clone(promotionEntries);
const badAdmission = badAdmissionEntries.find(entry => entry.id === 'fixture-hero-approved-successor');
badAdmission.admission = [{ pointer: '/status', equals: 'THIS_STATUS_MUST_NOT_EXIST' }];
const rejected = resolveRegistry({ contract: baseContract, d1Contract: baseD1, entries: badAdmissionEntries, sourceLoader });
check('failed admission blocks promotion', rejected.status === 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY'
  && rejected.failures.some(item => item.type === 'ADMISSION_FAILED'), rejected.failures);

const crossDomainEntries = clone(promotionEntries);
const crossDomain = crossDomainEntries.find(entry => entry.id === 'fixture-hero-approved-successor');
crossDomain.domain = 'soldier';
const crossDomainResult = resolveRegistry({ contract: baseContract, d1Contract: baseD1, entries: crossDomainEntries, sourceLoader });
check('cross-domain successor is blocked', crossDomainResult.status === 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY'
  && crossDomainResult.failures.some(item => item.type === 'CROSS_DOMAIN_SUCCESSOR'), crossDomainResult.failures);

const projectionEntries = clone(promotionEntries);
const projection = projectionEntries.find(entry => entry.id === 'fixture-hero-approved-successor');
projection.projectionOverride = { nextWorkSelectors: ['/nextStartPoint'] };
const projected = resolveRegistry({ contract: baseContract, d1Contract: baseD1, entries: projectionEntries, sourceLoader });
check('approved projection override is explicit and inherited', projected.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY'
  && projected.effectiveDomains.hero.primaryStatusSource === heroRoot.sourcePath
  && JSON.stringify(projected.effectiveDomains.hero.nextWorkSelectors) === JSON.stringify(['/nextStartPoint'])
  && projected.effectiveDomains.hero.requiredSelectors.rawStatus === baseD1.domains.hero.requiredSelectors.rawStatus, projected.effectiveDomains.hero);

const pass = failures.length === 0;
const summary = {
  version: 1,
  schemaId: 'project-doctor-active-source-registry-validation/v1',
  stage: 'PROJECT-STATUS-STAGE2',
  status: pass ? 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY_VALIDATION' : 'FAIL_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY_VALIDATION',
  completion: pass ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passCount: checks.filter(item => item.pass).length,
  failureCount: failures.length,
  checks,
  failures,
  hardErrorCount: failures.length,
  boundaries: {
    rawConfigDataRead: false,
    semanticRecomputation: false,
    filenameInference: false,
    stageNumberInference: false,
    timestampInference: false
  }
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/project-doctor-active-source-registry-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(summary.status);
if (!pass) process.exitCode = 1;
