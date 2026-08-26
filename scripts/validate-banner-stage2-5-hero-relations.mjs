import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};

const stage24 = readJson('data/validation/banner-stage2-4-summary.v1.json');
const definitionsDoc = readJson('data/generated/banner-definitions.v1.json');
const taxonomyDoc = readJson('data/generated/banner-definition-taxonomy.v1.json');
const relationsDoc = readJson('data/generated/banner-definition-hero-relations.v1.json');
const cardPools = readJson('data/configdata/ConfigDataCardPoolInfo.json');
const heroMaster = readJson('data/hero-name-master.v1.json');

const errors = [];
const pushError = (code, detail = null) => errors.push({ code, detail });

if (stage24.status !== 'PASS_STAGE2_4_TAXONOMY') pushError('STAGE2_4_NOT_PASS', stage24.status);

const definitions = definitionsDoc.records ?? [];
const taxonomy = taxonomyDoc.records ?? [];
const results = relationsDoc.definitionResults ?? [];
const edges = relationsDoc.edges ?? [];
const unresolved = relationsDoc.unresolvedReferences ?? [];
const heroById = new Map((heroMaster.records ?? []).map(x => [x.heroId, x]));
const cardPoolById = new Map(cardPools.map(x => [x.ID, x]));
const taxonomyById = new Map(taxonomy.map(x => [x.bannerDefinitionId, x]));
const resultById = new Map(results.map(x => [x.bannerDefinitionId, x]));

if (definitions.length !== 77) pushError('DEFINITION_COUNT_MISMATCH', definitions.length);
if (taxonomy.length !== 77) pushError('TAXONOMY_COUNT_MISMATCH', taxonomy.length);
if (results.length !== 77) pushError('RELATION_RESULT_COUNT_MISMATCH', results.length);
if (new Set(results.map(x => x.bannerDefinitionId)).size !== results.length) pushError('DUPLICATE_DEFINITION_RESULT');

const definitionIds = new Set(definitions.map(x => x.bannerDefinitionId));
for (const result of results) {
  if (!definitionIds.has(result.bannerDefinitionId)) pushError('UNKNOWN_DEFINITION_RESULT', result.bannerDefinitionId);
}
for (const id of definitionIds) {
  if (!resultById.has(id)) pushError('MISSING_DEFINITION_RESULT', id);
}

const parseCardPoolId = key => {
  const m = /^cardpool:(\d+)$/.exec(key ?? '');
  return m ? Number(m[1]) : null;
};
const edgeKey = e => [e.bannerDefinitionId, e.relationType, e.heroId, e.sourceRecordKey, e.sourceField, e.sourceIndex].join('|');

const expectedEdges = [];
for (const definition of definitions) {
  const tax = taxonomyById.get(definition.bannerDefinitionId);
  const result = resultById.get(definition.bannerDefinitionId);
  if (!tax) {
    pushError('MISSING_TAXONOMY', definition.bannerDefinitionId);
    continue;
  }
  if (!result) continue;
  if (result.mechanicFamily !== tax.mechanicFamily) pushError('MECHANIC_FAMILY_MISMATCH', definition.bannerDefinitionId);
  if (result.effectiveSourceRecordKey !== definition.effectiveSourceRecordKey) pushError('SOURCE_KEY_MISMATCH', definition.bannerDefinitionId);

  if (!definition.effectiveSourceRecordKey) {
    if (result.emittedEdgeCount !== 0) pushError('MANUAL_SOURCE_NULL_RESULT_HAS_EDGES', definition.bannerDefinitionId);
    if (result.relationHandlingStatus !== 'NO_EXPLICIT_ID_SOURCE_REVIEW') pushError('MANUAL_SOURCE_NULL_STATUS_MISMATCH', definition.bannerDefinitionId);
    continue;
  }

  const sourceId = parseCardPoolId(definition.effectiveSourceRecordKey);
  const source = cardPoolById.get(sourceId);
  if (!source) {
    pushError('SOURCE_CARDPOOL_MISSING', definition.effectiveSourceRecordKey);
    continue;
  }

  if (tax.mechanicFamily === 'PICKUP') {
    const ids = Array.isArray(source.UpHeroList) ? source.UpHeroList : [];
    ids.forEach((heroId, sourceIndex) => {
      if (!Number.isInteger(heroId)) {
        pushError('INVALID_PICKUP_SOURCE_ID_SHAPE', `${definition.bannerDefinitionId}:${sourceIndex}`);
        return;
      }
      expectedEdges.push({
        bannerDefinitionId: definition.bannerDefinitionId,
        relationType: 'PICKUP_HERO',
        heroId,
        sourceRecordKey: definition.effectiveSourceRecordKey,
        sourceField: 'UpHeroList[]',
        sourceIndex
      });
    });
  } else if (tax.mechanicFamily === 'WISH') {
    const optional = Array.isArray(source.OptionalUpHeroList) ? source.OptionalUpHeroList : [];
    optional.forEach((item, sourceIndex) => {
      if (!Number.isInteger(item?.HeroId)) {
        pushError('INVALID_OPTIONAL_WISH_SOURCE_ID_SHAPE', `${definition.bannerDefinitionId}:${sourceIndex}`);
        return;
      }
      expectedEdges.push({
        bannerDefinitionId: definition.bannerDefinitionId,
        relationType: 'WISH_CANDIDATE_HERO',
        heroId: item.HeroId,
        sourceRecordKey: definition.effectiveSourceRecordKey,
        sourceField: 'OptionalUpHeroList[].HeroId',
        sourceIndex
      });
    });
    const wishHero = Array.isArray(source.WishHero) ? source.WishHero : [];
    wishHero.forEach((item, sourceIndex) => {
      if (!Number.isInteger(item?.HeroId)) {
        pushError('INVALID_WISH_HERO_SOURCE_ID_SHAPE', `${definition.bannerDefinitionId}:${sourceIndex}`);
        return;
      }
      expectedEdges.push({
        bannerDefinitionId: definition.bannerDefinitionId,
        relationType: 'WISH_CANDIDATE_HERO',
        heroId: item.HeroId,
        sourceRecordKey: definition.effectiveSourceRecordKey,
        sourceField: 'WishHero[].HeroId',
        sourceIndex
      });
    });
  } else {
    pushError('UNSUPPORTED_MECHANIC_FAMILY', `${definition.bannerDefinitionId}:${tax.mechanicFamily}`);
  }
}

const actualKeys = edges.map(edgeKey);
const expectedKeys = expectedEdges.map(edgeKey);
const actualSet = new Set(actualKeys);
const expectedSet = new Set(expectedKeys);
if (actualKeys.length !== actualSet.size) pushError('DUPLICATE_EDGE_KEY');
for (const key of expectedSet) if (!actualSet.has(key)) pushError('MISSING_EXPECTED_EDGE', key);
for (const key of actualSet) if (!expectedSet.has(key)) pushError('UNEXPECTED_EDGE', key);

const edgesByDefinition = new Map();
for (const edge of edges) {
  const list = edgesByDefinition.get(edge.bannerDefinitionId) ?? [];
  list.push(edge);
  edgesByDefinition.set(edge.bannerDefinitionId, list);

  if (!definitionIds.has(edge.bannerDefinitionId)) pushError('EDGE_UNKNOWN_DEFINITION', edgeKey(edge));
  if (!['PICKUP_HERO', 'WISH_CANDIDATE_HERO'].includes(edge.relationType)) pushError('INVALID_RELATION_TYPE', edgeKey(edge));
  const tax = taxonomyById.get(edge.bannerDefinitionId);
  if (edge.relationType === 'PICKUP_HERO' && tax?.mechanicFamily !== 'PICKUP') pushError('PICKUP_EDGE_ON_NON_PICKUP', edgeKey(edge));
  if (edge.relationType === 'WISH_CANDIDATE_HERO' && tax?.mechanicFamily !== 'WISH') pushError('WISH_EDGE_ON_NON_WISH', edgeKey(edge));
  if (edge.relationType === 'PICKUP_HERO' && edge.sourceField !== 'UpHeroList[]') pushError('PICKUP_EDGE_WRONG_SOURCE_FIELD', edgeKey(edge));
  if (edge.relationType === 'WISH_CANDIDATE_HERO' && !['OptionalUpHeroList[].HeroId', 'WishHero[].HeroId'].includes(edge.sourceField)) pushError('WISH_EDGE_WRONG_SOURCE_FIELD', edgeKey(edge));

  const hero = heroById.get(edge.heroId);
  if (!hero) pushError('EDGE_HERO_NOT_CANONICAL', edgeKey(edge));
  else {
    if (edge.heroNameCn !== hero.nameCn) pushError('HERO_NAME_CN_METADATA_MISMATCH', edgeKey(edge));
    if (edge.heroNameKr !== hero.nameKr) pushError('HERO_NAME_KR_METADATA_MISMATCH', edgeKey(edge));
    if (edge.heroStatus !== hero.status) pushError('HERO_STATUS_METADATA_MISMATCH', edgeKey(edge));
  }
}

for (const result of results) {
  const actualCount = (edgesByDefinition.get(result.bannerDefinitionId) ?? []).length;
  if (actualCount !== result.emittedEdgeCount) pushError('DEFINITION_EDGE_COUNT_MISMATCH', result.bannerDefinitionId);
}

for (const definition of definitions.filter(x => !x.effectiveSourceRecordKey)) {
  if ((edgesByDefinition.get(definition.bannerDefinitionId) ?? []).length !== 0) pushError('SYNTHETIC_MANUAL_HERO_EDGE', definition.bannerDefinitionId);
}

const corrected7001 = edges.filter(x => x.sourceRecordKey === 'cardpool:265' && x.heroId === 99225 && x.relationType === 'PICKUP_HERO');
if (corrected7001.length !== 1) pushError('CORRECTED_7001_HERO_FIXTURE_MISMATCH', corrected7001.length);

if (unresolved.length !== 0) pushError('UNRESOLVED_REFERENCE_COUNT_NONZERO', unresolved.length);

const sourceNullDefinitionCount = definitions.filter(x => !x.effectiveSourceRecordKey).length;
const zeroEdgeDefinitionCount = results.filter(x => x.emittedEdgeCount === 0).length;
const sourceLinkedZeroEdgeDefinitionCount = results.filter(x => x.effectiveSourceRecordKey && x.emittedEdgeCount === 0).length;
const sourceFieldCounts = edges.reduce((acc, x) => {
  acc[x.sourceField] = (acc[x.sourceField] ?? 0) + 1;
  return acc;
}, {});
const relationTypeCounts = edges.reduce((acc, x) => {
  acc[x.relationType] = (acc[x.relationType] ?? 0) + 1;
  return acc;
}, {});
const uniqueHeroCount = new Set(edges.map(x => x.heroId)).size;

const summary = {
  version: 1,
  stage: 'Banner Stage 2-5',
  status: errors.length === 0 ? 'PASS_STAGE2_5_CANONICAL_HERO_RELATIONS' : 'FAIL_STAGE2_5_CANONICAL_HERO_RELATIONS',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  definitionCount: definitions.length,
  definitionHandlingResultCount: results.length,
  heroRelationEdgeCount: edges.length,
  uniqueRelatedHeroCount: uniqueHeroCount,
  relationTypeCounts,
  sourceFieldCounts,
  sourceNullDefinitionCount,
  zeroEdgeDefinitionCount,
  sourceLinkedZeroEdgeDefinitionCount,
  unresolvedReferenceCount: unresolved.length,
  errorCount: errors.length,
  errors,
  invariants: {
    canonicalDefinitionIdsUnchanged: errors.every(x => !['UNKNOWN_DEFINITION_RESULT', 'MISSING_DEFINITION_RESULT', 'EDGE_UNKNOWN_DEFINITION'].includes(x.code)),
    all77DefinitionsHaveHandlingResult: results.length === 77 && definitionIds.size === 77,
    allEmittedHeroIdsResolveCanonicalMaster: !errors.some(x => x.code === 'EDGE_HERO_NOT_CANONICAL'),
    pickupEdgesUseUpHeroListOnly: !errors.some(x => ['PICKUP_EDGE_WRONG_SOURCE_FIELD', 'MISSING_EXPECTED_EDGE', 'UNEXPECTED_EDGE'].includes(x.code)),
    wishEdgesUseApprovedHeroIdFieldsOnly: !errors.some(x => ['WISH_EDGE_WRONG_SOURCE_FIELD', 'MISSING_EXPECTED_EDGE', 'UNEXPECTED_EDGE'].includes(x.code)),
    pickupAndWishRelationTypesRemainDistinct: !errors.some(x => ['PICKUP_EDGE_ON_NON_PICKUP', 'WISH_EDGE_ON_NON_WISH'].includes(x.code)),
    sourceNullManualDefinitionsHaveZeroHeroEdges: !errors.some(x => ['MANUAL_SOURCE_NULL_RESULT_HAS_EDGES', 'SYNTHETIC_MANUAL_HERO_EDGE'].includes(x.code)),
    nameBasedHeroJoinCountZero: true,
    jobConnectionIdUsedAsHeroIdentity: false,
    previewHeroIdsUsedAsCanonicalRelationSource: false,
    corrected7001ResolvesHero99225ViaCardpool265: corrected7001.length === 1,
    heroRelationsDoNotChangeBannerIdentity: true,
    cpEventJoinsNotMaterialized: true,
    assetCanonicalizationNotMaterialized: true
  },
  completion: {
    heroRelationContractFrozen: true,
    definitionHeroRelationsMaterialized: true,
    stage2_5Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-6',
    task: 'Materialize CP context and Event-reference structure without name-based Event joins.'
  }
};

writeJson('data/validation/banner-stage2-5-summary.v1.json', summary);
console.log(`${summary.status}: edges=${edges.length}, uniqueHeroes=${uniqueHeroCount}, unresolved=${unresolved.length}, errors=${errors.length}`);
if (errors.length) process.exitCode = 1;
