const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  fullRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  fullValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  classificationValidation: 'data/validation/soldier-stage6-2-classification.v1.json',
  representativeFixtures: 'data/fixtures/soldier-stage6-3-fixtures.v1.json',
  representativeValidation: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
  listValidation: 'data/validation/soldier-stage5-7-list.v1.json',
  output: 'data/validation/soldier-stage6-4-filter-qa.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
}
function ids(records) { return uniqueSorted(records.map((record) => record.soldierId)); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
}
function hasStoredName(record, query) {
  const needle = normalizeText(query);
  if (!needle) return true;
  return [record?.identity?.nameKr, record?.identity?.nameCn]
    .filter((value) => typeof value === 'string')
    .some((value) => normalizeText(value).includes(needle));
}

// UI rank/SP toggles are one dimension: OR within the selected tokens.
// Other dimensions are ANDed. armyTypes/uiGroups support OR within their own dimension.
function applyFilters(records, filters = {}) {
  const kindTokens = Array.isArray(filters.kindTokens) ? new Set(filters.kindTokens) : null;
  const armyTypes = Array.isArray(filters.armyTypes) ? new Set(filters.armyTypes) : null;
  const uiGroups = Array.isArray(filters.uiGroups) ? new Set(filters.uiGroups) : null;
  const nameQuery = typeof filters.nameQuery === 'string' ? filters.nameQuery : '';

  return records.filter((record) => {
    const identity = record?.identity ?? {};

    if (kindTokens && kindTokens.size) {
      const matchesKind = identity.isSp === true
        ? kindTokens.has('SP')
        : kindTokens.has(`TIER_${identity.tier}`);
      if (!matchesKind) return false;
    }
    if (armyTypes && armyTypes.size && !armyTypes.has(identity.armyType)) return false;
    if (uiGroups && uiGroups.size && !uiGroups.has(identity.uiGroup)) return false;
    if (nameQuery && !hasStoredName(record, nameQuery)) return false;
    return true;
  });
}

function main() {
  const full = loadJson(paths.fullRecords);
  const fullValidation = loadJson(paths.fullValidation);
  const classificationValidation = loadJson(paths.classificationValidation);
  const representativeFixtures = loadJson(paths.representativeFixtures);
  const representativeValidation = loadJson(paths.representativeValidation);
  const listValidation = loadJson(paths.listValidation);

  const records = Array.isArray(full.records) ? full.records : [];
  const errors = [];
  const reviews = [];
  const tests = [];

  const addTest = (name, status, details = {}) => {
    tests.push({ name, status: status ? 'PASS' : 'FAIL', ...details });
    if (!status) errors.push(`Filter QA failed: ${name}`);
  };

  const upstreamStatuses = {
    fullRecords: full.status,
    fullValidation: fullValidation.status,
    classificationValidation: classificationValidation.status,
    representativeFixtures: representativeFixtures.status,
    representativeValidation: representativeValidation.status,
    listValidation: listValidation.status,
  };
  const upstreamNonPass = Object.entries(upstreamStatuses)
    .filter(([key, value]) => key !== 'representativeFixtures' ? value !== 'PASS' : value !== 'FROZEN');
  if (upstreamNonPass.length) {
    errors.push(`Upstream non-PASS/FROZEN inputs: ${upstreamNonPass.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  const allIds = ids(records);
  addTest('baseline-224-records', records.length === 224 && allIds.length === 224, {
    recordCount: records.length,
    uniqueIdCount: allIds.length,
  });

  const tier1 = applyFilters(records, { kindTokens: ['TIER_1'] });
  const tier2 = applyFilters(records, { kindTokens: ['TIER_2'] });
  const tier3 = applyFilters(records, { kindTokens: ['TIER_3'] });
  const sp = applyFilters(records, { kindTokens: ['SP'] });
  const partitionIds = [...ids(tier1), ...ids(tier2), ...ids(tier3), ...ids(sp)];
  const partitionUnique = uniqueSorted(partitionIds);

  addTest('kind-partition-covers-all-records-once', partitionIds.length === records.length && same(partitionUnique, allIds), {
    tier1: tier1.length,
    tier2: tier2.length,
    tier3: tier3.length,
    sp: sp.length,
    partitionCount: partitionIds.length,
  });
  addTest('tier3-is-normal-only-and-baseline-129', tier3.length === 129 && tier3.every((r) => r.identity.isSp !== true && r.identity.tier === 3), {
    count: tier3.length,
  });
  addTest('sp-filter-is-explicit-and-baseline-56', sp.length === 56 && sp.every((r) => r.identity.isSp === true), {
    count: sp.length,
  });
  addTest('lower-tier-baseline-39', tier1.length + tier2.length === 39, {
    tier1: tier1.length,
    tier2: tier2.length,
    total: tier1.length + tier2.length,
  });

  const defaultVisible = applyFilters(records, { kindTokens: ['TIER_3', 'SP'] });
  addTest('default-tier3-plus-sp-is-union', defaultVisible.length === 185 && ids(defaultVisible).length === 185, {
    count: defaultVisible.length,
    expectedFromFrozenBaseline: 185,
  });

  const armyTypes = uniqueSorted(records.map((r) => r?.identity?.armyType).filter((v) => typeof v === 'string'));
  const armyTypeCounts = {};
  let armyTypeContamination = 0;
  for (const armyType of armyTypes) {
    const bucket = applyFilters(records, { armyTypes: [armyType] });
    armyTypeCounts[armyType] = bucket.length;
    armyTypeContamination += bucket.filter((r) => r.identity.armyType !== armyType).length;
  }
  addTest('actual-army-type-buckets-exact', armyTypeContamination === 0 && Object.values(armyTypeCounts).reduce((a, b) => a + b, 0) === records.length, {
    distinctArmyTypes: armyTypes.length,
    contamination: armyTypeContamination,
    counts: armyTypeCounts,
  });

  const uiGroups = uniqueSorted(records.map((r) => r?.identity?.uiGroup).filter((v) => typeof v === 'string'));
  const uiGroupCounts = {};
  let uiGroupContamination = 0;
  for (const uiGroup of uiGroups) {
    const bucket = applyFilters(records, { uiGroups: [uiGroup] });
    uiGroupCounts[uiGroup] = bucket.length;
    uiGroupContamination += bucket.filter((r) => r.identity.uiGroup !== uiGroup).length;
  }
  addTest('ui-group-buckets-exact', uiGroupContamination === 0 && Object.values(uiGroupCounts).reduce((a, b) => a + b, 0) === records.length, {
    distinctUiGroups: uiGroups.length,
    contamination: uiGroupContamination,
    counts: uiGroupCounts,
  });

  const boundary = representativeFixtures?.fixtures?.classUiGroupBoundary;
  const boundaryGroup = boundary?.uiGroup;
  const left = boundary?.left;
  const right = boundary?.right;
  const boundaryGroupIds = ids(applyFilters(records, { uiGroups: [boundaryGroup] }));
  const leftTypeIds = ids(applyFilters(records, { armyTypes: [left?.armyType] }));
  const rightTypeIds = ids(applyFilters(records, { armyTypes: [right?.armyType] }));
  const boundaryPass = Number.isInteger(left?.soldierId)
    && Number.isInteger(right?.soldierId)
    && left?.armyType !== right?.armyType
    && boundaryGroupIds.includes(left.soldierId)
    && boundaryGroupIds.includes(right.soldierId)
    && leftTypeIds.includes(left.soldierId)
    && !leftTypeIds.includes(right.soldierId)
    && rightTypeIds.includes(right.soldierId)
    && !rightTypeIds.includes(left.soldierId);
  addTest('actual-class-vs-ui-group-boundary', boundaryPass, {
    uiGroup: boundaryGroup,
    left,
    right,
  });

  const normalFixtureId = representativeFixtures?.fixtures?.normalTier3?.soldierId;
  const normalFixture = records.find((r) => r.soldierId === normalFixtureId);
  const krName = normalFixture?.identity?.nameKr;
  const cnName = normalFixture?.identity?.nameCn;
  const krSearchIds = typeof krName === 'string' ? ids(applyFilters(records, { nameQuery: krName })) : [];
  const cnSearchIds = typeof cnName === 'string' ? ids(applyFilters(records, { nameQuery: cnName })) : [];
  addTest('stored-korean-name-search', typeof krName === 'string' && krSearchIds.includes(normalFixtureId), {
    soldierId: normalFixtureId,
    query: krName ?? null,
    matchCount: krSearchIds.length,
  });
  addTest('stored-chinese-name-search', typeof cnName === 'string' && cnSearchIds.includes(normalFixtureId), {
    soldierId: normalFixtureId,
    query: cnName ?? null,
    matchCount: cnSearchIds.length,
  });

  const nullKrRecord = records.find((r) => r?.identity?.nameKr === null && typeof r?.identity?.nameCn === 'string');
  const nullKrCnSearch = nullKrRecord ? ids(applyFilters(records, { nameQuery: nullKrRecord.identity.nameCn })) : [];
  addTest('name-search-uses-stored-cn-without-invented-kr-name', !!nullKrRecord && nullKrCnSearch.includes(nullKrRecord.soldierId), {
    soldierId: nullKrRecord?.soldierId ?? null,
    nameKr: nullKrRecord?.identity?.nameKr ?? null,
    query: nullKrRecord?.identity?.nameCn ?? null,
  });

  const combinedTier3Group = applyFilters(records, {
    kindTokens: ['TIER_3'],
    uiGroups: [boundaryGroup],
  });
  const combinedPass = combinedTier3Group.every((r) => r.identity.isSp !== true && r.identity.tier === 3 && r.identity.uiGroup === boundaryGroup);
  addTest('combined-kind-and-ui-group-use-intersection', combinedPass, {
    uiGroup: boundaryGroup,
    count: combinedTier3Group.length,
  });

  const spTwoStageId = representativeFixtures?.fixtures?.spTwoStage?.soldierId;
  const spTwoStage = records.find((r) => r.soldierId === spTwoStageId);
  const spCombined = spTwoStage ? applyFilters(records, {
    kindTokens: ['SP'],
    uiGroups: [spTwoStage.identity.uiGroup],
    nameQuery: spTwoStage.identity.nameKr ?? spTwoStage.identity.nameCn,
  }) : [];
  addTest('combined-sp-ui-group-name-filter', !!spTwoStage && spCombined.some((r) => r.soldierId === spTwoStageId)
    && spCombined.every((r) => r.identity.isSp === true && r.identity.uiGroup === spTwoStage.identity.uiGroup), {
    soldierId: spTwoStageId ?? null,
    count: spCombined.length,
  });

  const malformedFilterFields = records.filter((record) => {
    const identity = record?.identity ?? {};
    return !Number.isInteger(identity.tier)
      || typeof identity.armyType !== 'string'
      || typeof identity.uiGroup !== 'string'
      || typeof identity.isSp !== 'boolean'
      || (identity.nameKr !== null && typeof identity.nameKr !== 'string')
      || typeof identity.nameCn !== 'string';
  }).map((r) => r.soldierId);
  addTest('filter-source-fields-well-formed', malformedFilterFields.length === 0, {
    malformedSoldierIds: malformedFilterFields,
  });

  if (classificationValidation.classificationStatus === 'PASS_WITH_REVIEW') {
    reviews.push('Stage 6-2 REVIEW classifications remain non-blocking for filter membership; filters must not hide records merely because release/name presentation metadata is unresolved.');
  }
  reviews.push('Name-search QA covers stored Korean/Chinese names only; fuzzy search, romanization aliases and inferred translations are outside Stage 6-4 and must not be silently synthesized.');

  const failedTests = tests.filter((test) => test.status === 'FAIL');
  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = full.generatedAt ?? fullValidation.generatedAt ?? null;
  const sources = {
    fullRecords: { path: paths.fullRecords, gitBlobSha: gitBlobSha(paths.fullRecords) },
    fullValidation: { path: paths.fullValidation, gitBlobSha: gitBlobSha(paths.fullValidation) },
    classificationValidation: { path: paths.classificationValidation, gitBlobSha: gitBlobSha(paths.classificationValidation) },
    representativeFixtures: { path: paths.representativeFixtures, gitBlobSha: gitBlobSha(paths.representativeFixtures) },
    representativeValidation: { path: paths.representativeValidation, gitBlobSha: gitBlobSha(paths.representativeValidation) },
    listValidation: { path: paths.listValidation, gitBlobSha: gitBlobSha(paths.listValidation) },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-4-filter-qa/v1',
    stage: '6-4',
    status,
    generatedAt,
    purpose: 'Validate Soldier list filter semantics against frozen Stage 6 page-data without creating a second Soldier master or inferring missing presentation metadata.',
    filterSemantics: {
      kindDimension: 'TIER_1/TIER_2/TIER_3/SP are OR within one display-kind dimension; tier tokens match normal Soldiers only and SP matches explicit isSp=true.',
      actualClass: 'armyType exact equality; actual class remains distinct from uiGroup.',
      uiGroup: 'uiGroup exact equality; combined groups may contain multiple distinct armyType values.',
      nameSearch: 'NFKC-normalized substring match over stored nameKr/nameCn only; no fuzzy, romanization or inferred aliases.',
      crossDimensionCombination: 'AND between kind, armyType, uiGroup and name-search dimensions.',
    },
    sources,
    checks: {
      upstreamNonPass: upstreamNonPass.length,
      failedTests: failedTests.length,
      malformedFilterFields: malformedFilterFields.length,
      kindPartitionMismatch: tests.find((t) => t.name === 'kind-partition-covers-all-records-once')?.status === 'PASS' ? 0 : 1,
      actualArmyTypeContamination: armyTypeContamination,
      uiGroupContamination,
      classUiGroupBoundaryMismatch: boundaryPass ? 0 : 1,
    },
    coverage: {
      canonicalSoldiers: records.length,
      kindCounts: {
        TIER_1: tier1.length,
        TIER_2: tier2.length,
        TIER_3: tier3.length,
        SP: sp.length,
        DEFAULT_TIER3_PLUS_SP: defaultVisible.length,
      },
      armyTypeCounts,
      uiGroupCounts,
      testCount: tests.length,
      passedTests: tests.length - failedTests.length,
      failedTests: failedTests.length,
    },
    tests,
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  console.log(`Soldier Stage 6-4 Filter QA: ${status}`);
  console.log(`Tests: ${tests.length - failedTests.length}/${tests.length} PASS`);
  console.log(`Kind counts: T1=${tier1.length}, T2=${tier2.length}, T3=${tier3.length}, SP=${sp.length}, default=${defaultVisible.length}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
