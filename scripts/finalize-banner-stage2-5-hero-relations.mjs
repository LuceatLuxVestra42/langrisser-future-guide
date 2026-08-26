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
const cardPools = readJson('data/configdata/ConfigDataCardPoolInfo.json');
const heroMaster = readJson('data/hero-name-master.v1.json');

if (stage24.status !== 'PASS_STAGE2_4_TAXONOMY') {
  throw new Error(`Stage 2-4 not PASS: ${stage24.status}`);
}

const definitions = definitionsDoc.records ?? [];
if (definitions.length !== 77) throw new Error(`Expected 77 definitions, got ${definitions.length}`);

const taxonomyById = new Map((taxonomyDoc.records ?? []).map(x => [x.bannerDefinitionId, x]));
const cardPoolById = new Map(cardPools.map(x => [x.ID, x]));
const heroById = new Map((heroMaster.records ?? []).map(x => [x.heroId, x]));

const parseCardPoolId = sourceRecordKey => {
  const m = /^cardpool:(\d+)$/.exec(sourceRecordKey ?? '');
  return m ? Number(m[1]) : null;
};

const definitionResults = [];
const edges = [];
const unresolvedReferences = [];

const emitEdge = ({ definition, relationType, sourceField, sourceIndex, heroId }) => {
  const hero = heroById.get(heroId) ?? null;
  const edge = {
    bannerDefinitionId: definition.bannerDefinitionId,
    relationType,
    heroId,
    sourceRecordKey: definition.effectiveSourceRecordKey,
    sourceField,
    sourceIndex,
    heroNameCn: hero?.nameCn ?? null,
    heroNameKr: hero?.nameKr ?? null,
    heroStatus: hero?.status ?? null
  };
  edges.push(edge);
  if (!hero) {
    unresolvedReferences.push({
      bannerDefinitionId: definition.bannerDefinitionId,
      relationType,
      heroId,
      sourceRecordKey: definition.effectiveSourceRecordKey,
      sourceField,
      sourceIndex,
      reason: 'HERO_ID_NOT_IN_CANONICAL_MASTER'
    });
  }
};

for (const definition of definitions) {
  const taxonomy = taxonomyById.get(definition.bannerDefinitionId);
  if (!taxonomy) throw new Error(`Missing taxonomy for ${definition.bannerDefinitionId}`);

  const before = edges.length;
  if (!definition.effectiveSourceRecordKey) {
    definitionResults.push({
      bannerDefinitionId: definition.bannerDefinitionId,
      mechanicFamily: taxonomy.mechanicFamily,
      effectiveSourceRecordKey: null,
      relationHandlingStatus: 'NO_EXPLICIT_ID_SOURCE_REVIEW',
      emittedEdgeCount: 0,
      approvedManualHeroIdMappingApplied: false
    });
    continue;
  }

  const cardPoolId = parseCardPoolId(definition.effectiveSourceRecordKey);
  const cardPool = cardPoolById.get(cardPoolId) ?? null;
  if (!cardPool) {
    unresolvedReferences.push({
      bannerDefinitionId: definition.bannerDefinitionId,
      sourceRecordKey: definition.effectiveSourceRecordKey,
      reason: 'CARDPOOL_SOURCE_NOT_FOUND'
    });
    definitionResults.push({
      bannerDefinitionId: definition.bannerDefinitionId,
      mechanicFamily: taxonomy.mechanicFamily,
      effectiveSourceRecordKey: definition.effectiveSourceRecordKey,
      relationHandlingStatus: 'SOURCE_RECORD_UNRESOLVED',
      emittedEdgeCount: 0,
      approvedManualHeroIdMappingApplied: false
    });
    continue;
  }

  if (taxonomy.mechanicFamily === 'PICKUP') {
    const ids = Array.isArray(cardPool.UpHeroList) ? cardPool.UpHeroList : [];
    ids.forEach((heroId, sourceIndex) => {
      if (!Number.isInteger(heroId)) {
        unresolvedReferences.push({
          bannerDefinitionId: definition.bannerDefinitionId,
          sourceRecordKey: definition.effectiveSourceRecordKey,
          sourceField: 'UpHeroList[]',
          sourceIndex,
          rawValue: heroId,
          reason: 'INVALID_PICKUP_HERO_ID_SHAPE'
        });
        return;
      }
      emitEdge({ definition, relationType: 'PICKUP_HERO', sourceField: 'UpHeroList[]', sourceIndex, heroId });
    });
  } else if (taxonomy.mechanicFamily === 'WISH') {
    const optional = Array.isArray(cardPool.OptionalUpHeroList) ? cardPool.OptionalUpHeroList : [];
    optional.forEach((item, sourceIndex) => {
      const heroId = item?.HeroId;
      if (!Number.isInteger(heroId)) {
        unresolvedReferences.push({
          bannerDefinitionId: definition.bannerDefinitionId,
          sourceRecordKey: definition.effectiveSourceRecordKey,
          sourceField: 'OptionalUpHeroList[].HeroId',
          sourceIndex,
          rawValue: heroId ?? item ?? null,
          reason: 'INVALID_WISH_HERO_ID_SHAPE'
        });
        return;
      }
      emitEdge({ definition, relationType: 'WISH_CANDIDATE_HERO', sourceField: 'OptionalUpHeroList[].HeroId', sourceIndex, heroId });
    });

    const wishHero = Array.isArray(cardPool.WishHero) ? cardPool.WishHero : [];
    wishHero.forEach((item, sourceIndex) => {
      const heroId = item?.HeroId;
      if (!Number.isInteger(heroId)) {
        unresolvedReferences.push({
          bannerDefinitionId: definition.bannerDefinitionId,
          sourceRecordKey: definition.effectiveSourceRecordKey,
          sourceField: 'WishHero[].HeroId',
          sourceIndex,
          rawValue: heroId ?? item ?? null,
          reason: 'INVALID_WISH_HERO_ID_SHAPE'
        });
        return;
      }
      emitEdge({ definition, relationType: 'WISH_CANDIDATE_HERO', sourceField: 'WishHero[].HeroId', sourceIndex, heroId });
    });
  } else {
    unresolvedReferences.push({
      bannerDefinitionId: definition.bannerDefinitionId,
      sourceRecordKey: definition.effectiveSourceRecordKey,
      mechanicFamily: taxonomy.mechanicFamily,
      reason: 'UNSUPPORTED_MECHANIC_FAMILY'
    });
  }

  const emittedEdgeCount = edges.length - before;
  definitionResults.push({
    bannerDefinitionId: definition.bannerDefinitionId,
    mechanicFamily: taxonomy.mechanicFamily,
    effectiveSourceRecordKey: definition.effectiveSourceRecordKey,
    relationHandlingStatus: emittedEdgeCount > 0 ? 'EXPLICIT_ID_RELATIONS_MATERIALIZED' : 'EXPLICIT_SOURCE_HAS_ZERO_APPROVED_HERO_EDGES',
    emittedEdgeCount,
    approvedManualHeroIdMappingApplied: false
  });
}

edges.sort((a, b) =>
  a.bannerDefinitionId.localeCompare(b.bannerDefinitionId) ||
  a.relationType.localeCompare(b.relationType) ||
  a.sourceField.localeCompare(b.sourceField) ||
  a.sourceIndex - b.sourceIndex ||
  a.heroId - b.heroId
);
definitionResults.sort((a, b) => a.bannerDefinitionId.localeCompare(b.bannerDefinitionId));

const out = {
  version: 1,
  stage: 'Banner Stage 2-5',
  status: 'CANONICAL_HERO_RELATIONS_MATERIALIZED',
  definitionCount: definitionResults.length,
  edgeCount: edges.length,
  pickupHeroEdgeCount: edges.filter(x => x.relationType === 'PICKUP_HERO').length,
  wishCandidateHeroEdgeCount: edges.filter(x => x.relationType === 'WISH_CANDIDATE_HERO').length,
  sourceNullDefinitionCount: definitionResults.filter(x => x.effectiveSourceRecordKey === null).length,
  zeroEdgeDefinitionCount: definitionResults.filter(x => x.emittedEdgeCount === 0).length,
  unresolvedReferenceCount: unresolvedReferences.length,
  definitionResults,
  edges,
  unresolvedReferences
};

writeJson('data/generated/banner-definition-hero-relations.v1.json', out);
console.log(`Materialized ${edges.length} Hero relation edges across ${definitionResults.length} definitions; unresolved=${unresolvedReferences.length}.`);
