import fs from 'node:fs';
import {
  assertRepositoryPath,
  getJsonPointer,
  selectActiveSources,
} from '../../status-source/lib/select-active-sources.mjs';

export const DEFAULT_NORMALIZATION_CONTRACT = 'tools/project-status/contracts/normalization.v1.json';
export const DEFAULT_REVIEW_LIFECYCLE_CONTRACT = 'tools/project-status/contracts/review-lifecycle.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(Object(value), key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function loadNormalizationContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_NORMALIZATION_CONTRACT,
} = {}) {
  const contract = readJson(assertRepositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'project-status-normalization/v1') {
    throw new Error(`Unsupported Project Status normalization schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') {
    throw new Error(`Project Status normalization contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  return contract;
}

export function loadReviewLifecycleContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_REVIEW_LIFECYCLE_CONTRACT,
} = {}) {
  const contract = readJson(assertRepositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'project-status-review-lifecycle/v1') {
    throw new Error(`Unsupported Project Status review lifecycle schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (contract.status !== 'DESIGN_FROZEN') {
    throw new Error(`Project Status review lifecycle contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  if (!Array.isArray(contract.reviewLifecycleValues) || contract.reviewLifecycleValues.length === 0) {
    throw new Error('Project Status review lifecycle contract must declare reviewLifecycleValues.');
  }
  if (!Array.isArray(contract.rules)) throw new Error('Project Status review lifecycle contract rules must be an array.');
  return contract;
}

const literal = text => {
  const value = String(text).trim();
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
    return Object.is(getJsonPointer(source, match[1]), literal(match[2]));
  });
};

const safeReadJson = (repoRoot, relativePath) => {
  try {
    const absolute = assertRepositoryPath(repoRoot, relativePath);
    return { ok: true, data: readJson(absolute), error: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
};

const selectValues = (source, selectors = {}) => Object.fromEntries(
  Object.entries(selectors).map(([key, pointer]) => [key, getJsonPointer(source, pointer)]),
);

const selectorMissing = (selected, selectors = {}) => Object.keys(selectors)
  .filter(key => selected[key] === undefined);

const reviewKeyFor = ({ sourcePath, selector, index, code }) => {
  if (typeof code === 'string' && code.length > 0) return `${sourcePath}#${code}`;
  return `${sourcePath}#${selector}${index === null ? '' : `[${index}]`}`;
};

const reviewCountFor = value => (
  isObject(value) && typeof value.count === 'number' && Number.isFinite(value.count)
    ? value.count
    : null
);

export const normalizeReview = (value, sourcePath, selector, index = null) => {
  const code = typeof value === 'string'
    ? value
    : isObject(value)
      ? value.code ?? value.blocker ?? null
      : null;
  const reportedCount = reviewCountFor(value);
  return {
    reviewKey: reviewKeyFor({ sourcePath, selector, index, code }),
    code,
    scope: 'unknown',
    lifecycle: 'ACTIVE_REVIEW',
    healthImpact: true,
    reportedCount,
    resolvedCount: reportedCount === null ? null : 0,
    remainingCount: reportedCount,
    resolutionEvidence: [],
    countEvidence: null,
    issueKey: null,
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

const reviewScope = (review, allowedScopes) => {
  const rawScope = isObject(review.raw) ? review.raw.scope : null;
  return typeof rawScope === 'string' && allowedScopes.includes(rawScope) ? rawScope : 'unknown';
};

const reviewRuleMatches = (review, rule, domain) => {
  if (!isObject(rule) || rule.domain !== domain || !isObject(rule.match)) return false;
  const match = rule.match;
  if (!hasOwn(match, 'reviewKey') && !hasOwn(match, 'code')) return false;
  if (hasOwn(match, 'reviewKey') && review.reviewKey !== match.reviewKey) return false;
  if (hasOwn(match, 'code') && review.code !== match.code) return false;
  if (hasOwn(match, 'source') && review.source !== match.source) return false;
  if (hasOwn(match, 'selector') && review.selector !== match.selector) return false;
  return true;
};

const selectedEvidenceSource = (evidence, primarySelected, supplements) => {
  if (evidence.sourceRole === 'PRIMARY_STATUS_SOURCE') return primarySelected;
  return supplements.find(item => item.role === evidence.sourceRole)?.selected;
};

const evaluateReviewEvidence = (evidenceRules, primarySelected, supplements) => (evidenceRules ?? []).map(evidence => {
  if (!isObject(evidence) || typeof evidence.sourceRole !== 'string' || typeof evidence.key !== 'string') {
    return { sourceRole: evidence?.sourceRole ?? null, key: evidence?.key ?? null, expected: evidence?.equals, actual: undefined, pass: false };
  }
  const selected = selectedEvidenceSource(evidence, primarySelected, supplements);
  const actual = selected?.[evidence.key];
  return {
    sourceRole: evidence.sourceRole,
    key: evidence.key,
    expected: evidence.equals,
    actual,
    pass: selected !== undefined && Object.is(actual, evidence.equals),
  };
});

const resolveReviewCount = ({ review, rule, primarySelected, supplements }) => {
  const hasLiteralRemaining = hasOwn(rule, 'remainingCount');
  const hasEvidenceRemaining = hasOwn(rule, 'remainingCountFromEvidence');
  if (hasLiteralRemaining && hasEvidenceRemaining) {
    return { ok: false, reason: 'BOTH_LITERAL_AND_EVIDENCE_REMAINING_COUNT', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence: null };
  }

  if (!hasLiteralRemaining && !hasEvidenceRemaining) {
    const remainingCount = rule.lifecycle === 'RESOLVED_BY_EVIDENCE' ? 0 : review.remainingCount;
    if (remainingCount !== null && rule.lifecycle === 'RESOLVED_BY_EVIDENCE' && remainingCount !== 0) {
      return { ok: false, reason: 'FULL_RESOLUTION_REQUIRES_ZERO_REMAINING', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence: null };
    }
    return {
      ok: true,
      remainingCount,
      resolvedCount: review.reportedCount === null || remainingCount === null ? null : review.reportedCount - remainingCount,
      countEvidence: null,
    };
  }

  if (!Number.isInteger(review.reportedCount) || review.reportedCount < 0) {
    return { ok: false, reason: 'PARTIAL_RESOLUTION_REQUIRES_REPORTED_COUNT', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence: null };
  }

  let remainingCount;
  let countEvidence = null;
  if (hasLiteralRemaining) {
    remainingCount = rule.remainingCount;
  } else {
    const ref = rule.remainingCountFromEvidence;
    if (!isObject(ref) || typeof ref.sourceRole !== 'string' || typeof ref.key !== 'string') {
      return { ok: false, reason: 'INVALID_REMAINING_COUNT_EVIDENCE_REFERENCE', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence: null };
    }
    const selected = selectedEvidenceSource(ref, primarySelected, supplements);
    remainingCount = selected?.[ref.key];
    countEvidence = {
      sourceRole: ref.sourceRole,
      key: ref.key,
      actual: remainingCount,
      pass: selected !== undefined && Number.isInteger(remainingCount),
    };
    if (countEvidence.pass !== true) {
      return { ok: false, reason: 'REMAINING_COUNT_EVIDENCE_NOT_AVAILABLE', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence };
    }
  }

  if (!Number.isInteger(remainingCount) || remainingCount < 0 || remainingCount > review.reportedCount) {
    return { ok: false, reason: 'REMAINING_COUNT_OUT_OF_BOUNDS', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence };
  }
  if (rule.lifecycle === 'RESOLVED_BY_EVIDENCE' && remainingCount !== 0) {
    return { ok: false, reason: 'FULL_RESOLUTION_REQUIRES_ZERO_REMAINING', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence };
  }
  if (remainingCount > 0 && rule.healthImpact === false) {
    return { ok: false, reason: 'PARTIAL_RESOLUTION_MUST_RETAIN_HEALTH_IMPACT', remainingCount: review.remainingCount, resolvedCount: review.resolvedCount, countEvidence };
  }

  return {
    ok: true,
    remainingCount,
    resolvedCount: review.reportedCount - remainingCount,
    countEvidence,
  };
};

const applyReviewLifecycleRules = ({ reviews, domain, lifecycleContract, primarySelected, supplements }) => {
  const failures = [];
  const allowedLifecycles = new Set(lifecycleContract.reviewLifecycleValues ?? []);
  const rules = lifecycleContract.rules ?? [];
  const normalized = reviews.map(review => {
    const matches = rules.filter(rule => reviewRuleMatches(review, rule, domain));
    if (matches.length === 0) return review;
    if (matches.length > 1) {
      failures.push({ type: 'REVIEW_LIFECYCLE_RULE_AMBIGUOUS', reviewKey: review.reviewKey, ruleIds: matches.map(rule => rule.id ?? null) });
      return review;
    }

    const rule = matches[0];
    if (!allowedLifecycles.has(rule.lifecycle) || typeof rule.healthImpact !== 'boolean') {
      failures.push({ type: 'REVIEW_LIFECYCLE_RULE_INVALID', reviewKey: review.reviewKey, ruleId: rule.id ?? null });
      return review;
    }

    const evidence = evaluateReviewEvidence(rule.evidence, primarySelected, supplements);
    const requiresEvidence = rule.lifecycle === 'RESOLVED_BY_EVIDENCE';
    if ((requiresEvidence && evidence.length === 0) || evidence.some(item => item.pass !== true)) {
      failures.push({
        type: 'REVIEW_LIFECYCLE_EVIDENCE_NOT_SATISFIED',
        reviewKey: review.reviewKey,
        ruleId: rule.id ?? null,
        evidence,
      });
      return review;
    }

    const countResult = resolveReviewCount({ review, rule, primarySelected, supplements });
    if (!countResult.ok) {
      failures.push({
        type: 'REVIEW_LIFECYCLE_COUNT_INVALID',
        reviewKey: review.reviewKey,
        ruleId: rule.id ?? null,
        reason: countResult.reason,
        reportedCount: review.reportedCount,
        requestedRemainingCount: hasOwn(rule, 'remainingCount') ? rule.remainingCount : null,
        countEvidence: countResult.countEvidence,
      });
      return review;
    }

    return {
      ...review,
      lifecycle: rule.lifecycle,
      healthImpact: rule.healthImpact,
      remainingCount: countResult.remainingCount,
      resolvedCount: countResult.resolvedCount,
      resolutionEvidence: evidence,
      countEvidence: countResult.countEvidence,
      issueKey: typeof rule.issueKey === 'string' && rule.issueKey.length > 0 ? rule.issueKey : null,
      lifecycleRuleId: rule.id ?? null,
    };
  });
  return { reviews: normalized, failures };
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

const effectiveDomainSpec = (baseSpec, activeMeta) => {
  const override = isObject(activeMeta?.projectionOverride) ? activeMeta.projectionOverride : {};
  return {
    ...baseSpec,
    ...override,
    primaryFacet: override.primaryFacet ?? baseSpec.primaryFacet ?? activeMeta?.facet ?? null,
  };
};

const expectedValueForKey = (expectedKey, primarySelected, supplements) => {
  if (primarySelected[expectedKey] !== undefined) return primarySelected[expectedKey];
  for (const supplement of supplements) {
    if (supplement.selected?.[expectedKey] !== undefined) return supplement.selected[expectedKey];
  }
  const stageMatch = expectedKey.match(/^stage(\d+)(.+)$/i);
  if (!stageMatch) return undefined;
  const digits = stageMatch[1];
  const stageTokens = [`stage${digits}`];
  if (digits.length === 2) stageTokens.push(`stage${digits[0]}_${digits[1]}`, `stage${digits[0]}-${digits[1]}`);
  const selectorKey = stageMatch[2].charAt(0).toLowerCase() + stageMatch[2].slice(1);
  const supplement = supplements.find(item => stageTokens.some(token => item.role.toLowerCase().includes(token.toLowerCase())));
  return supplement?.selected?.[selectorKey];
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

export function normalizeDomain({ domain, baseSpec, activeMeta, contract, reviewLifecycleContract, repoRoot }) {
  const spec = effectiveDomainSpec(baseSpec, activeMeta);
  const sourcePath = activeMeta?.sourcePath;
  const missingResult = (readError, note) => ({
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
    primarySource: { path: sourcePath ?? null, readError },
    supplementalSources: [],
    nextWork: [],
    activeSource: activeMeta ?? null,
    notes: [note],
  });

  if (!sourcePath) return missingResult('R1 selected source missing.', 'R1 Status Source did not provide an active source.');
  const primaryRead = safeReadJson(repoRoot, sourcePath);
  if (!primaryRead.ok) return missingResult(primaryRead.error, 'Selected primary status source could not be read.');

  const primary = primaryRead.data;
  const primarySelected = selectValues(primary, spec.requiredSelectors);
  const primaryMissingSelectors = selectorMissing(primarySelected, spec.requiredSelectors);
  const supplements = [];
  const supplementalReadErrors = [];

  for (const supplementalSpec of spec.supplementalSources ?? []) {
    const read = safeReadJson(repoRoot, supplementalSpec.path);
    if (!read.ok) {
      supplementalReadErrors.push({ path: supplementalSpec.path, error: read.error });
      supplements.push({
        path: supplementalSpec.path,
        role: supplementalSpec.role,
        facet: supplementalSpec.facet ?? null,
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
      facet: supplementalSpec.facet ?? null,
      selected,
      missingSelectors: selectorMissing(selected, supplementalSpec.selectors),
      policy: supplementalSpec.policy ?? null,
      supersedesPrimaryReviewCodes: supplementalSpec.supersedesPrimaryReviewCodes ?? [],
    });
  }

  let reviews = [];
  for (const selector of spec.reviewSelectors ?? []) {
    reviews.push(...reviewsFromSelector(getJsonPointer(primary, selector), sourcePath, selector));
  }
  const supersededCodes = new Set(supplements.flatMap(item => item.supersedesPrimaryReviewCodes ?? []));
  const resolvedReviews = reviews
    .filter(review => review.code && supersededCodes.has(review.code))
    .map(review => ({
      ...review,
      lifecycle: 'RESOLVED_BY_EVIDENCE',
      healthImpact: false,
      remainingCount: 0,
      resolvedCount: review.reportedCount,
    }));
  reviews = reviews
    .filter(review => !(review.code && supersededCodes.has(review.code)))
    .map(review => ({ ...review, scope: reviewScope(review, contract.normalizedModel.reviewScopes) }));
  const reviewLifecycleResult = applyReviewLifecycleRules({
    reviews,
    domain,
    lifecycleContract: reviewLifecycleContract,
    primarySelected,
    supplements,
  });
  reviews = reviewLifecycleResult.reviews;

  const blockers = [];
  if (typeof primarySelected.blocker === 'string' && primarySelected.blocker.length > 0) {
    blockers.push({ source: sourcePath, code: primarySelected.blocker });
  }

  const expectedMismatches = [];
  const expectedMissing = [];
  for (const [key, expectedValue] of Object.entries(spec.expected ?? {})) {
    const actualValue = expectedValueForKey(key, primarySelected, supplements);
    if (actualValue === undefined) expectedMissing.push(key);
    else if (!Object.is(actualValue, expectedValue)) expectedMismatches.push({ key, expected: expectedValue, actual: actualValue });
  }

  const zeroRequiredViolations = [];
  for (const pointer of spec.zeroRequiredSelectors ?? []) {
    const value = getJsonPointer(primary, pointer);
    if (value === undefined) zeroRequiredViolations.push({ pointer, value: 'MISSING' });
    else if (!Object.is(value, 0)) zeroRequiredViolations.push({ pointer, value });
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
  const supplementalMissingSelectors = supplements.flatMap(item => (item.missingSelectors ?? [])
    .map(selector => ({ source: item.path, selector })));

  const consistencyIssues = [
    ...primaryMissingSelectors.map(selector => ({ type: 'PRIMARY_SELECTOR_MISSING', selector })),
    ...supplementalReadErrors.map(item => ({ type: 'SUPPLEMENTAL_SOURCE_READ_ERROR', ...item })),
    ...supplementalMissingSelectors.map(item => ({ type: 'SUPPLEMENTAL_SELECTOR_MISSING', ...item })),
    ...expectedMissing.map(key => ({ type: 'EXPECTED_VALUE_MISSING', key })),
    ...expectedMismatches.map(item => ({ type: 'EXPECTED_VALUE_MISMATCH', ...item })),
    ...zeroRequiredViolations.filter(item => item.value === 'MISSING')
      .map(item => ({ type: 'ZERO_REQUIRED_SELECTOR_MISSING', pointer: item.pointer })),
    ...reviewLifecycleResult.failures,
  ];

  const statusLooksFailed = typeof rawStatus === 'string' && rawStatus.toUpperCase().includes('FAIL');
  const statusLooksAccepted = typeof rawStatus === 'string'
    && (rawStatus.toUpperCase().startsWith('PASS') || rawStatus === 'READY_FOR_ASSET_EVIDENCE');

  let health = 'UNKNOWN';
  if (explicitFailureSignals.length > 0 || statusLooksFailed) health = 'FAIL';
  else if (consistencyIssues.length > 0) health = 'INCONSISTENT';
  else if (reviews.length > 0 || blockers.length > 0) health = 'REVIEW';
  else if (statusLooksAccepted) health = 'PASS';

  const primaryFacet = spec.primaryFacet ?? activeMeta?.facet ?? null;
  const facets = [
    sourceSnapshot(sourcePath, 'PRIMARY_STATUS_SOURCE', primaryFacet, primarySelected),
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
    primarySource: sourceSnapshot(sourcePath, 'PRIMARY_STATUS_SOURCE', primaryFacet, primarySelected),
    supplementalSources: supplements.map(item => ({
      ...sourceSnapshot(item.path, item.role, item.facet, item.selected, item.policy),
      ...(item.readError ? { readError: item.readError } : {}),
    })),
    nextWork: (spec.nextWorkSelectors ?? []).map(selector => ({
      source: sourcePath,
      selector,
      value: getJsonPointer(primary, selector),
    })),
    activeSource: activeMeta,
    notes: [
      ...(resolvedReviews.length > 0 ? [{
        resolvedReviewCodes: resolvedReviews.map(item => item.code),
        resolvedReviewKeys: resolvedReviews.map(item => item.reviewKey),
      }] : []),
      ...(reviewLifecycleResult.failures.length > 0 ? [{ reviewLifecycleRuleFailures: reviewLifecycleResult.failures }] : []),
      ...(consistencyIssues.length > 0 ? [{ consistencyIssues }] : []),
      ...(explicitFailureSignals.length > 0 ? [{ explicitFailureSignals }] : []),
      ...(zeroRequiredViolations.some(item => item.value !== 'MISSING') ? [{ zeroRequiredViolations }] : []),
    ],
  };
}

export function normalizeProjectStatus(runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadNormalizationContract({ repoRoot });
  const reviewLifecycleContract = runtime.reviewLifecycleContract ?? loadReviewLifecycleContract({
    repoRoot,
    contractPath: runtime.reviewLifecycleContractPath ?? DEFAULT_REVIEW_LIFECYCLE_CONTRACT,
  });
  const selection = runtime.selection ?? selectActiveSources({ repoRoot });

  if (selection?.status !== 'PASS' || selection?.completion !== 'SELECTION_COMPLETE') {
    throw new Error(`R1 Status Source selection is not accepted: ${selection?.status ?? 'missing'}/${selection?.completion ?? 'missing'}`);
  }

  const domainNames = Object.keys(contract.domains ?? {});
  if (domainNames.length !== 6) throw new Error(`Project Status contract must define six domains, found ${domainNames.length}.`);
  for (const domain of domainNames) {
    if (!selection.domains?.[domain]) throw new Error(`R1 Status Source selection missing domain: ${domain}`);
  }

  const domains = domainNames.map(domain => normalizeDomain({
    domain,
    baseSpec: contract.domains[domain],
    activeMeta: selection.domains[domain],
    contract,
    reviewLifecycleContract,
    repoRoot,
  }));

  const healthCounts = Object.fromEntries(contract.normalizedModel.healthValues
    .map(value => [value, domains.filter(item => item.health === value).length]));
  const lifecycleCounts = Object.fromEntries(contract.normalizedModel.lifecycleValues
    .map(value => [value, domains.filter(item => item.lifecycle === value).length]));
  const projectHealth = contract.globalHealthPrecedence
    .find(value => healthCounts[value] > 0) ?? 'UNKNOWN';

  return {
    version: 1,
    schemaId: 'project-status-normalized/v1',
    stage: 'R2',
    status: 'COLLECTED',
    completion: 'NORMALIZATION_COMPLETE',
    readOnly: true,
    sourceAuthority: {
      schemaId: selection.schemaId,
      status: selection.status,
      completion: selection.completion,
      selectedCount: selection.selectedCount,
      declarationFiles: selection.declarationFiles,
    },
    reviewLifecycleAuthority: {
      schemaId: reviewLifecycleContract.schemaId,
      status: reviewLifecycleContract.status,
      ruleCount: reviewLifecycleContract.rules.length,
    },
    validatorExecutionCount: 0,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    canonicalJoinRecomputationCount: 0,
    legacyProjectDoctorRuntimeImportCount: 0,
    legacyGeneratedStatusReadCount: 0,
    projectHealth,
    healthCounts,
    lifecycleCounts,
    knownHardErrorTotal: domains.reduce((sum, item) => sum + (typeof item.hardErrorCount === 'number' ? item.hardErrorCount : 0), 0),
    reviewTotal: domains.reduce((sum, item) => sum + item.reviewCount, 0),
    blockerTotal: domains.reduce((sum, item) => sum + item.blockers.length, 0),
    domains,
  };
}
