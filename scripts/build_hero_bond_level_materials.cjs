'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/generated/hero-bond-level-materials.v1.json');
const SUMMARY = path.join(ROOT, 'data/validation/hero-bond-level-materials-summary.v1.json');

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const positiveInteger = (value, label) => {
  invariant(Number.isSafeInteger(value) && value > 0, `${label}: expected positive integer, got ${value}`);
  return value;
};
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function projectCost({ maxLevel, gold, materials, label }) {
  invariant(Number(maxLevel) === 10, `${label}: MaxLevel must be 10`);
  invariant(Array.isArray(gold) && gold.length === 9, `${label}: LevelUpGold must contain levels 2-10`);
  invariant(Array.isArray(materials), `${label}: LevelUpMaterials must be an array`);
  const grouped = new Map(Array.from({ length: 9 }, (_, i) => [i + 2, []]));
  for (const row of materials) {
    const targetLevel = positiveInteger(Number(row?.Level), `${label}.Level`);
    invariant(grouped.has(targetLevel), `${label}: material level outside 2-10: ${targetLevel}`);
    const itemType = positiveInteger(Number(row?.ItemType), `${label}.ItemType`);
    const itemId = positiveInteger(Number(row?.ItemId), `${label}.ItemId`);
    const count = positiveInteger(Number(row?.Count), `${label}.Count`);
    invariant(itemType === 6, `${label}: unsupported material ItemType ${itemType}`);
    grouped.get(targetLevel).push({ itemType, itemId, count });
  }
  return Array.from({ length: 9 }, (_, index) => {
    const targetLevel = index + 2;
    const goldCost = Number(gold[index]);
    invariant(Number.isSafeInteger(goldCost) && goldCost >= 0, `${label}: invalid gold at level ${targetLevel}`);
    const levelMaterials = grouped.get(targetLevel);
    invariant(levelMaterials.length > 0, `${label}: no explicit materials at level ${targetLevel}`);
    return { targetLevel, goldCost, materials: levelMaterials };
  });
}
function total(levels) {
  const map = new Map();
  let gold = 0;
  for (const level of levels) {
    gold += level.goldCost;
    for (const material of level.materials) {
      const key = `${material.itemType}:${material.itemId}`;
      const row = map.get(key) || { itemType: material.itemType, itemId: material.itemId, count: 0 };
      row.count += material.count;
      map.set(key, row);
    }
  }
  return { gold, materials: [...map.values()].sort((a,b)=>a.itemType-b.itemType||a.itemId-b.itemId) };
}
function profileRegistry(prefix) {
  const bySignature = new Map();
  const byId = new Map();
  return {
    add(levels) {
      const signature = JSON.stringify(levels);
      if (bySignature.has(signature)) return bySignature.get(signature).profileId;
      const profileId = `${prefix}-${crypto.createHash('sha256').update(signature).digest('hex').slice(0,16)}`;
      invariant(!byId.has(profileId), `${prefix}: truncated hash collision for ${profileId}`);
      const profile = { profileId, levels, total: total(levels) };
      bySignature.set(signature, profile);
      byId.set(profileId, profile);
      return profileId;
    },
    values() { return [...byId.values()].sort((a,b)=>a.profileId.localeCompare(b.profileId)); },
  };
}

const master = readJson('data/hero-name-master.v1.json');
const heartEvidence = readJson('data/generated/hero-heart-fetter-raw-condition.v1.json');
invariant(master.version === 1 && master.recordCount === 267 && master.records.length === 267, 'Hero master coverage drift');
invariant(heartEvidence.status === 'RAW_EVIDENCE' && heartEvidence.heroPopulationCount === 267, 'HeartFetter evidence boundary drift');

const heartDescriptorByHero = new Map();
for (const row of heartEvidence.records || []) {
  const heroId = positiveInteger(Number(row?.heroId), 'heart evidence heroId');
  const candidate = {
    heartFetterId: positiveInteger(Number(row?.heroHeartFetterId), `hero ${heroId} heartFetterId`),
    sourceIndex: Number(row?.sourceProvenance?.heroHeartFetterSourceIndex),
  };
  invariant(Number.isSafeInteger(candidate.sourceIndex) && candidate.sourceIndex >= 0, `hero ${heroId}: invalid HeartFetter source index`);
  const prior = heartDescriptorByHero.get(heroId);
  if (prior) invariant(JSON.stringify(prior) === JSON.stringify(candidate), `hero ${heroId}: inconsistent HeartFetter evidence locator`);
  else heartDescriptorByHero.set(heroId, candidate);
}
invariant(heartDescriptorByHero.size === 267, `HeartFetter evidence coverage drift: ${heartDescriptorByHero.size}`);

const heartRows = loadArray('ConfigDataHeroHeartFetterInfo');
const itemRows = loadArray('ConfigDataItemInfo');
const regularProfiles = profileRegistry('RF');
const heartProfiles = profileRegistry('HF');
const materialItemIds = new Set();
const records = [];
let regularFetterRefs = 0;

function rememberMaterials(levels) {
  for (const level of levels) for (const material of level.materials) materialItemIds.add(material.itemId);
}

for (const hero of master.records) {
  const heroId = positiveInteger(Number(hero.heroId), 'master heroId');
  const shardPath = path.join(ROOT, 'data/generated/hero-detail/by-id', `${heroId}.json`);
  invariant(fs.existsSync(shardPath), `hero ${heroId}: frozen Hero shard missing`);
  const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  invariant(shard.heroId === heroId, `hero ${heroId}: shard identity mismatch`);
  invariant(Array.isArray(shard.bonds) && shard.bonds.length === 5, `hero ${heroId}: expected five frozen regular Fetter rows`);

  const regularFetters = shard.bonds.map((bond) => {
    invariant(bond.sourceResolved === true, `hero ${heroId} Fetter ${bond.fetterId}: source unresolved`);
    const levels = projectCost({
      maxLevel: bond.maxLevel,
      gold: bond.levelUpGold,
      materials: bond.levelUpMaterials,
      label: `hero ${heroId} Fetter ${bond.fetterId}`,
    });
    rememberMaterials(levels);
    regularFetterRefs += 1;
    return {
      order: Number(bond.order),
      fetterId: positiveInteger(Number(bond.fetterId), `hero ${heroId} fetterId`),
      nameCn: typeof bond.nameCn === 'string' ? bond.nameCn : null,
      costProfileId: regularProfiles.add(levels),
    };
  });

  const descriptor = heartDescriptorByHero.get(heroId);
  invariant(descriptor, `hero ${heroId}: HeartFetter evidence missing`);
  const heartSource = heartRows[descriptor.sourceIndex];
  invariant(heartSource && Number(heartSource.ID) === descriptor.heartFetterId, `hero ${heroId}: HeartFetter source-index/ID mismatch`);
  const heartLevels = projectCost({
    maxLevel: heartSource.MaxLevel,
    gold: heartSource.LevelUpGold,
    materials: heartSource.LevelUpMaterials,
    label: `hero ${heroId} HeartFetter ${descriptor.heartFetterId}`,
  });
  rememberMaterials(heartLevels);

  records.push({
    heroId,
    identity: { nameKr: hero.nameKr, nameCn: hero.nameCn, nameEn: hero.nameEn },
    regularFetters,
    heartFetter: {
      heartFetterId: descriptor.heartFetterId,
      sourceIndex: descriptor.sourceIndex,
      nameCn: typeof heartSource.Name === 'string' ? heartSource.Name : null,
      costProfileId: heartProfiles.add(heartLevels),
    },
  });
}
invariant(records.length === 267, 'output Hero coverage drift');
invariant(regularFetterRefs === 1335, `regular Fetter reference count drift: ${regularFetterRefs}`);

const itemCatalog = [...materialItemIds].sort((a,b)=>a-b).map((itemId) => {
  const matches = itemRows.filter((row) => Number(row?.ID) === itemId);
  invariant(matches.length > 0, `material Item ${itemId}: source row missing`);
  const variants = new Map();
  for (const row of matches) {
    const value = {
      itemType: 6,
      itemId,
      nameCn: typeof row.Name === 'string' ? row.Name : null,
      descriptionCn: typeof (row.Desc ?? row.Description) === 'string' ? (row.Desc ?? row.Description) : null,
      icon: typeof row.Icon === 'string' ? row.Icon : null,
    };
    variants.set(JSON.stringify(value), value);
  }
  invariant(variants.size === 1, `material Item ${itemId}: conflicting Item metadata`);
  return [...variants.values()][0];
});

const regularCostProfiles = regularProfiles.values();
const heartCostProfiles = heartProfiles.values();
const artifact = {
  schemaVersion: 1,
  stage: 'hero-bond-level-materials-v1',
  status: 'FROZEN_CANDIDATE',
  semanticAuthority: false,
  owner: 'hero-canonical',
  source: {
    heroPopulation: 'data/hero-name-master.v1.json',
    regularFetterConsumer: 'data/generated/hero-detail/by-id/*.json',
    heartFetterEvidence: 'data/generated/hero-heart-fetter-raw-condition.v1.json',
    heartFetterLogicalSource: 'data/configdata/ConfigDataHeroHeartFetterInfo.json',
    itemLogicalSource: 'data/configdata/ConfigDataItemInfo.json',
  },
  counts: {
    heroes: records.length,
    regularFetterRefs,
    heartFetterRefs: records.length,
    regularCostProfiles: regularCostProfiles.length,
    heartCostProfiles: heartCostProfiles.length,
    materialItems: itemCatalog.length,
  },
  regularCostProfiles,
  heartCostProfiles,
  itemCatalog,
  records,
};
const summary = {
  version: 1,
  stage: 'hero-bond-level-materials-v1',
  status: 'PASS',
  owner: 'hero-canonical',
  counts: artifact.counts,
  coverage: {
    heroPopulationComplete: records.length === 267,
    fiveRegularFettersPerHero: regularFetterRefs === 1335,
    oneHeartFetterPerHero: records.length === 267,
    targetLevelsPerProfile: 9,
    targetLevelRange: [2, 10],
    unresolvedMaterialItems: 0,
    conflictingMaterialMetadata: 0,
  },
  normalization: {
    perHeroCostRowsDuplicated: false,
    regularCostProfiles: regularCostProfiles.length,
    heartCostProfiles: heartCostProfiles.length,
  },
  boundaries: {
    regularCostsReusedFromFrozenHeroConsumer: true,
    heartRelationReusedFromFrozenRawEvidence: true,
    rawHeroInfoReselection: false,
    nameJoin: false,
    idArithmetic: false,
    newBondEffectSemantics: false,
    frontendMutation: false,
  },
};
writeJson(OUT, artifact);
writeJson(SUMMARY, summary);
console.log(JSON.stringify({ status: 'PASS', counts: artifact.counts }, null, 2));
