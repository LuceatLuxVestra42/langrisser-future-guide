import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/project-doctor-d1-0-contract.v1.json';
const OUTPUT_PATH = 'data/generated/project-doctor-d1-1-status.v1.json';
const SUMMARY_PATH = 'data/validation/project-doctor-d1-1-summary.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const jsonPointer = (value, pointer) => {
  if (pointer === '' || pointer === '/') return value;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  let current = value;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || current === undefined || !hasOwn(Object(current), key)) return undefined;
    current = current[key];
  }
  return current;
};

const literal = text => {
  const value = text.trim();
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
};

const conditionMatches = (source, expression) => {
  if (typeof expression !== 'string' || expression.length === 0) return false;
  return expression.split(/\s+AND\s+/).every(clause => {
    const match = clause.trim().match(/^(\/[^\s]+)\s*==\s*(.+)$/);
    if (!match) return false;
    return jsonPointer(source, match[1]) === literal(match[2]);
  });
};

const safeReadJson = filePath => {
  try {
    return { ok: true, data: readJson(filePath), error: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
};

const selectValues = (source, selectors = {}) => Object.fromEntries(
  Object.entries(selectors).map(([key, pointer]) => [key, jsonPointer(source, pointer)]),
);

const selectorMissing = (selected, selectors = {}) => Object.keys(selectors).filter(key => selected[key] === undefined);

const normalizeReview = (value, sourcePath, selector, index = null) => {
  if (typeof value === 'string') {
    return { code: value, scope: 'unknown', source: sourcePath, selector, raw: value };
  }
  if (!isObject(value)) {
    return { code: null, scope: 'unknown', source: sourcePath, selector, raw: value };
  }
  return {
    code: value.code ?? value.blocker ?? null,
    scope: 'unknown',
    source: sourcePath,
    selector,
    ...(index === null ? {} : { index }),
    raw: value,
  };
};

const reviewsFromSelector = (value, sourcePath, selector) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item, index) => normalizeReview(item, sourcePath, selector, index));
  if (isObject(value) && hasOwn(value, 'present')) {
    if (value.present === false || value.blocker) return [normalizeReview(value, sourcePath, selector)];
    return [];
  }
  if (isObject(value) && Object.keys(value).length === 0) return [];
  return [normalizeReview(value, sourcePath, selector)];
};

const reviewScope = review => {
  const rawScope = isObject(review.raw) ? review.raw.scope : null;
  return typeof rawScope === 'string' && [
    'semantic', 'identity', 'presentation', 'localization', 'asset', 'frontend', 'chronology', 'source-evidence', 'unknown',
  ].includes(rawScope) ? rawScope : 'unknown';
};

const lifecycleFromRules = (source, rules = []) => {
  for (const rule of rules) {
    if (conditionMatches(source, rule.when)) return rule.lifecycle;
  }
  return 'UNKNOWN';
};

const sourceSnapshot = (sourcePath, role, facet, selected, policy = null) => ({
  path: sourcePath,
  role,
  facet,
  selected,
  ...(policy ? { policy } : {}),
});

const expectedValueForKey = (expectedKey, primarySelected, supplements) => {
  if (primarySelected[expectedKey] !== undefined) return primarySelected[expectedKey];
  for (const supplement of supplements) {
    if (supplement.selected[expectedKey] !== undefined) return supplement.selected[expectedKey];
  }
  const stageMatch = expectedKey.match(/^stage(\d+)(.+)$/i);
  if (stageMatch) {
    const digits = stageMatch[1];
    const stageTokens = [`stage${digits}`];
    if (digits.length === 2) stageTokens.push(`stage${digits[0]}_${digits[1]}`, `stage${digits[0]}-${digits[1]}`);
    const selectorKey = stageMatch[2].charAt(0).toLowerCase() + stageMatch[2].slice(1);
    const supplement = supplements.find(item => stageTokens.some(token => item.role.toLowerCase().includes(token.toLowerCase())));
    if (supplement?.selected?.[selectorKey] !== undefined) return supplement.selected[selectorKey];
  }
  return undefined;
};

const populationFromExpected = (expected, primarySelected, supplements) => {
  const population = {};
  for (const key of Object.keys(expected ?? {})) {
    if (/(failed|error|mismatch|violation)/i.test(key)) continue;
    const value = expectedValueForKey(key, primarySelected, supplements);
    if (value !== undefined) population[key] = value;
  }
  return population;
};

const domainRecord = (domain, spec) => {
  const primaryRead = safeReadJson(spec.primaryStatusSource);
  if (!primaryRead.ok) {
    return {
      domain,
      lifecycle: 'UNKNOWN',
      health: 'MISSING',
      rawStatus: null,
      rawCompletion: null,
      rawFreezeState: null,
      population: {},
      hardErrorCount: null,
      reviewCount: 0,
      reviews: [],
      blockers: [],
      facets: [],
      primarySource: { path: spec.primaryStatusSource, readError: primaryRead.error },
      supplementalSources: [],
      nextWork: [],
      notes: ['Primary status source could not be read.'],
    };
  }

  const primary = primaryRead.data;
  const primarySelected = selectValues(primary, spec.requiredSelectors);
  const primaryMissingSelectors = selectorMissing(primarySelected, spec.requiredSelectors);
  const supplements = [];
  const supplementalReadErrors = [];

  for (const supplementalSpec of spec.supplementalSources ?? []) {
    const read = safeReadJson(supplementalSpec.path);
    if (!read.ok) {
      supplementalReadErrors.push({ path: supplementalSpec.path, error: read.error });
      supplements.push({
        path: supplementalSpec.path,
        role: supplementalSpec.role,
        facet: supplementalSpec.facet,
        selected: {},
        readError: read.error,
        policy: supplementalSpec.policy ?? null,
        supersedesPrimaryReviewCodes: supplementalSpec.supersedesPrimaryReviewCodes ?? [],
      });
      continue;
    }
    const selected = selectValues(read.data, supplementalSpec.selectors);
    supplements.push({
      path: supplementalSpec.path,
      role: supplementalSpec.role,
      facet: supplementalSpec.facet,
      selected,
      missingSelectors: selectorMissing(selected, supplementalSpec.selectors),
      policy: supplementalSpec.policy ?? null,
      supersedesPrimaryReviewCodes: supplementalSpec.supersedesPrimaryReviewCodes ?? [],
    });
  }

  let reviews = [];
  for (const selector of spec.reviewSelectors ?? []) {
    reviews.push(...reviewsFromSelector(jsonPointer(primary, selector), spec.primaryStatusSource, selector));
  }
  const supersededCodes = new Set(supplements.flatMap(item => item.supersedesPrimaryReviewCodes ?? []));
  const resolvedReviews = reviews.filter(review => review.code && supersededCodes.has(review.code));
  reviews = reviews
    .filter(review => !(review.code && supersededCodes.has(review.code)))
    .map(review => ({ ...review, scope: reviewScope(review) }));

  const blockers = [];
  if (typeof primarySelected.blocker === 'string' && primarySelected.blocker.length > 0) {
    blockers.push({ source: spec.primaryStatusSource, code: primarySelected.blocker });
  }

  const expectedMismatches = [];
  const expectedMissing = [];
  for (const [key, expectedValue] of Object.entries(spec.expected ?? {})) {
    const actualValue = expectedValueForKey(key, primarySelected, supplements);
    if (actualValue === undefined) expectedMissing.push(key);
    else if (actualValue !== expectedValue) expectedMismatches.push({ key, expected: expectedValue, actual: actualValue });
  }

  const zeroRequiredViolations = [];
  for (const pointer of spec.zeroRequiredSelectors ?? []) {
    const value = jsonPointer(primary, pointer);
    if (value === undefined) zeroRequiredViolations.push({ pointer, value: 'MISSING' });
    else if (value !== 0) zeroRequiredViolations.push({ pointer, value });
  }

  const explicitFailureSignals = [];
  if (typeof primarySelected.hardErrorCount === 'number' && primarySelected.hardErrorCount > 0) explicitFailureSignals.push('hardErrorCount');
  if (Array.isArray(primarySelected.errors) && primarySelected.errors.length > 0) explicitFailureSignals.push('errors');
  for (const [key, value] of Object.entries(primarySelected)) {
    if (/failedCheckCount/i.test(key) && typeof value === 'number' && value > 0) explicitFailureSignals.push(key);
  }
  for (const supplement of supplements) {
    for (const [key, value] of Object.entries(supplement.selected ?? {})) {
      if (/failedCheckCount/i.test(key) && typeof value === 'number' && value > 0) explicitFailureSignals.push(`${supplement.role}.${key}`);
    }
  }
  if (zeroRequiredViolations.some(item => item.value !== 'MISSING')) explicitFailureSignals.push('zeroRequiredSelectors');

  let hardErrorCount = null;
  if (typeof primarySelected.hardErrorCount === 'number') hardErrorCount = primarySelected.hardErrorCount;
  else if (Array.isArray(primarySelected.errors)) hardErrorCount = primarySelected.errors.length;

  const rawStatus = primarySelected.rawStatus ?? null;
  const rawCompletion = primarySelected.rawCompletion ?? null;
  const rawFreezeState = primarySelected.rawFreezeState ?? null;
  const lifecycle = lifecycleFromRules(primary, spec.lifecycleRules);
  const supplementalMissingSelectors = supplements.flatMap(item => (item.missingSelectors ?? []).map(selector => ({ source: item.path, selector })));
  const consistencyIssues = [
    ...primaryMissingSelectors.map(selector => ({ type: 'PRIMARY_SELECTOR_MISSING', selector })),
    ...supplementalReadErrors.map(item => ({ type: 'SUPPLEMENTAL_SOURCE_READ_ERROR', ...item })),
    ...supplementalMissingSelectors.map(item => ({ type: 'SUPPLEMENTAL_SELECTOR_MISSING', ...item })),
    ...expectedMissing.map(key => ({ type: 'EXPECTED_VALUE_MISSING', key })),
    ...expectedMismatches.map(item => ({ type: 'EXPECTED_VALUE_MISMATCH', ...item })),
    ...zeroRequiredViolations.filter(item => item.value === 'MISSING').map(item => ({ type: 'ZERO_REQUIRED_SELECTOR_MISSING', pointer: item.pointer })),
  ];

  const statusLooksFailed = typeof rawStatus === 'string' && rawStatus.toUpperCase().includes('FAIL');
  const statusLooksAccepted = typeof rawStatus === 'string' && (
    rawStatus.toUpperCase().startsWith('PASS') || rawStatus === 'READY_FOR_ASSET_EVIDENCE'
  );
  let health = 'UNKNOWN';
  if (explicitFailureSignals.length > 0 || statusLooksFailed) health = 'FAIL';
  else if (consistencyIssues.length > 0) health = 'INCONSISTENT';
  else if (reviews.length > 0 || blockers.length > 0) health = 'REVIEW';
  else if (statusLooksAccepted) health = 'PASS';

  const facets = [
    sourceSnapshot(spec.primaryStatusSource, 'PRIMARY_STATUS_SOURCE', spec.primaryFacet, primarySelected),
    ...supplements.map(item => ({
      ...sourceSnapshot(item.path, item.role, item.facet, item.selected, item.policy),
      ...(item.readError ? { readError: item.readError } : {}),
    })),
  ];

  return {
    domain,
    lifecycle,
    health,
    rawStatus,
    rawCompletion,
    rawFreezeState,
    population: populationFromExpected(spec.expected, primarySelected, supplements),
    hardErrorCount,
    reviewCount: reviews.length,
    reviews,
    blockers,
    facets,
    primarySource: sourceSnapshot(spec.primaryStatusSource, 'PRIMARY_STATUS_SOURCE', spec.primaryFacet, primarySelected),
    supplementalSources: supplements.map(item => ({
      ...sourceSnapshot(item.path, item.role, item.facet, item.selected, item.policy),
      ...(item.readError ? { readError: item.readError } : {}),
    })),
    nextWork: (spec.nextWorkSelectors ?? []).map(selector => ({
      source: spec.primaryStatusSource,
      selector,
      value: jsonPointer(primary, selector),
    })),
    notes: [
      ...(resolvedReviews.length > 0 ? [{ resolvedReviewCodes: resolvedReviews.map(item => item.code) }] : []),
      ...(consistencyIssues.length > 0 ? [{ consistencyIssues }] : []),
      ...(explicitFailureSignals.length > 0 ? [{ explicitFailureSignals }] : []),
      ...(zeroRequiredViolations.some(item => item.value !== 'MISSING') ? [{ zeroRequiredViolations }] : []),
    ],
  };
};

const contract = readJson(CONTRACT_PATH);
if (contract.status !== 'DESIGN_FROZEN') throw new Error(`D1-0 contract is not frozen: ${contract.status}`);
if (!Array.isArray(contract.scope?.domains) || contract.scope.domains.length !== 6) throw new Error('D1-0 contract must define exactly six domains.');

const domains = contract.scope.domains.map(domain => {
  const spec = contract.domains?.[domain];
  if (!spec) throw new Error(`Missing D1-0 domain spec: ${domain}`);
  return domainRecord(domain, spec);
});

const healthCounts = Object.fromEntries(contract.normalizedModel.healthValues.map(value => [value, domains.filter(item => item.health === value).length]));
const lifecycleCounts = Object.fromEntries(contract.normalizedModel.lifecycleValues.map(value => [value, domains.filter(item => item.lifecycle === value).length]));
const projectHealth = ['MISSING', 'FAIL', 'INCONSISTENT', 'REVIEW', 'PASS', 'UNKNOWN'].find(value => healthCounts[value] > 0) ?? 'UNKNOWN';
const knownHardErrorTotal = domains.reduce((sum, item) => sum + (typeof item.hardErrorCount === 'number' ? item.hardErrorCount : 0), 0);
const reviewTotal = domains.reduce((sum, item) => sum + item.reviewCount, 0);
const blockerTotal = domains.reduce((sum, item) => sum + item.blockers.length, 0);
const sourceReadIssueCount = domains.reduce((sum, item) => {
  const primaryIssue = item.primarySource?.readError ? 1 : 0;
  const supplementalIssues = item.supplementalSources.filter(source => source.readError).length;
  return sum + primaryIssue + supplementalIssues;
}, 0);

const output = {
  version: 1,
  schemaId: 'project-doctor-d1-1-status/v1',
  stage: 'D1-1',
  status: 'COLLECTED',
  contract: CONTRACT_PATH,
  readOnly: true,
  validatorExecutionCount: 0,
  rawConfigDataReadCount: 0,
  semanticRecomputationCount: 0,
  projectHealth,
  healthCounts,
  lifecycleCounts,
  knownHardErrorTotal,
  reviewTotal,
  blockerTotal,
  domains,
};

const collectorPass = domains.length === 6;
const summary = {
  version: 1,
  stage: 'D1-1',
  checkpoint: 'PROJECT_DOCTOR_D1_1_COLLECTOR',
  status: collectorPass ? 'PASS_PROJECT_DOCTOR_D1_1_COLLECTOR' : 'FAIL_PROJECT_DOCTOR_D1_1_COLLECTOR',
  completion: 'COMPLETE',
  contract: CONTRACT_PATH,
  output: OUTPUT_PATH,
  projectHealth,
  checks: {
    contractFrozen: contract.status === 'DESIGN_FROZEN',
    domainCount: { expected: 6, actual: domains.length, pass: domains.length === 6 },
    missingDomainCount: healthCounts.MISSING,
    inconsistentDomainCount: healthCounts.INCONSISTENT,
    failedDomainCount: healthCounts.FAIL,
    sourceReadIssueCount,
    validatorExecutionCount: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    productionDataWriteCount: 0,
  },
  healthCounts,
  lifecycleCounts,
  knownHardErrorTotal,
  reviewTotal,
  blockerTotal,
  domainStates: Object.fromEntries(domains.map(item => [item.domain, {
    lifecycle: item.lifecycle,
    health: item.health,
    rawStatus: item.rawStatus,
    population: item.population,
    hardErrorCount: item.hardErrorCount,
    reviewCount: item.reviewCount,
    blockerCount: item.blockers.length,
  }])),
  nextStage: null,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

if (!collectorPass) process.exitCode = 1;
console.log(summary.status);
