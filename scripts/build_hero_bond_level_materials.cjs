'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/generated/hero-bond-level-materials.v1.json');
const SUMMARY = path.join(ROOT, 'data/validation/hero-bond-level-materials-summary.v1.json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
function positiveInteger(value, label) {
  invariant(Number.isSafeInteger(value) && value > 0, `${label}: expected positive integer, got ${value}`);
  return value;
}
function costLevels({ maxLevel, gold, materials, skills, label }) {
  invariant(maxLevel === 10, `${label}: MaxLevel must be 10`);
  invariant(Array.isArray(gold) && gold.length === 9, `${label}: LevelUpGold must contain levels 2-10`);
  invariant(Array.isArray(materials), `${label}: LevelUpMaterials must be an array`);
  invariant(Array.isArray(skills) && skills.length === 10, `${label}: level skill array must contain levels 1-10`);

  const byLevel = new Map(Array.from({ length: 9 }, (_, i) => [i + 2, []]));
  for (const row of materials) {
    const level = positiveInteger(Number(row?.Level), `${label}.Level`);
    invariant(byLevel.has(level), `${label}: material target level outside 2-10: ${level}`);
    const itemType = positiveInteger(Number(row?.ItemType), `${label}.ItemType`);
    const itemId = positiveInteger(Number(row?.ItemId), `${label}.ItemId`);
    const count = positiveInteger(Number(row?.Count), `${label}.Count`);
    byLevel.get(level).push({ itemType, itemId, count });
  }

  return Array.from({ length: 9 }, (_, index) => {
    const targetLevel = index + 2;
    const goldCost = Number(gold[index]);
    invariant(Number.isSafeInteger(goldCost) && goldCost >= 0, `${label}: invalid gold for level ${targetLevel}`);
    const skillId = positiveInteger(Number(skills[targetLevel - 1]), `${label}: skill level ${targetLevel}`);
    const levelMaterials = byLevel.get(targetLevel);
    invariant(levelMaterials.length > 0, `${label}: level ${targetLevel} has no explicit material rows`);
    return { targetLevel, skillId, goldCost, materials: levelMaterials };
  });
}
function aggregate(levels) {
  const materials = new Map();
  let gold = 0;
  for (const level of levels) {
    gold += level.goldCost;
    for (const material of level.materials) {
      const key = `${material.itemType}:${material.itemId}`;
      const current = materials.get(key) || { itemType: material.itemType, itemId: material.itemId, count: 0 };
      current.count += material.count;
      materials.set(key, current);
    }
  }
  return {
    gold,
    materials: [...materials.values()].sort((a, b) => a.itemType - b.itemType || a.itemId - b.itemId),
  };
}
function mergeTotals(parts) {
  const materials = new Map();
  let gold = 0;
  for (const part of parts) {
    gold += part.gold;
    for (const material of part.materials) {
      const key = `${material.itemType}:${material.itemId}`;
      const current = materials.get(key) || { itemType: material.itemType, itemId: material.itemId, count: 0 };
      current.count += material.count;
      materials.set(key, current);
    }
  }
  return {
    gold,
    materials: [...materials.values()].sort((a, b) => a.itemType - b.itemType || a.itemId - b.itemId),
  };
}

const master = readJson('data/hero-name-master.v1.json');
const heartEvidence = readJson('data/generated/hero-heart-fetter-raw-condition.v1.json');
invariant(master.version === 1 && master.recordCount === 267 && master.records.length === 267, 'Hero master coverage drift');
invariant(heartEvidence.status === 'RAW_EVIDENCE' && heartEvidence.heroPopulationCount === 267, 'HeartFetter raw evidence boundary drift');

const heartDescriptorByHero = new Map();
for (const row of heartEvidence.records || []) {
  const heroId = positiveInteger(Number(row?.heroId), 'heart evidence heroId');
  const heartFetterId = positiveInteger(Number(row?.heroHeartFetterId), `hero ${heroId} heartFetterId`);
  const sourceIndex = Number(row?.sourceProvenance?.heroHeartFetterSourceIndex);
  invariant(Number.isSafeInteger(sourceIndex) && sourceIndex >= 0, `hero ${heroId}: invalid HeartFetter source index`);
  const prior = heartDescriptorByHero.get(heroId);
  if (prior) {
    invariant(prior.heartFetterId === heartFetterId && prior.sourceIndex === sourceIndex, `hero ${heroId}: inconsistent HeartFetter evidence locator`);
  } else {
    heartDescriptorByHero.set(heroId, { heartFetterId, sourceIndex });
  }
}
invariant(heartDescriptorByHero.size === 267, `HeartFetter evidence hero coverage drift: ${heartDescriptorByHero.size}`);

const heartRows = loadArray('ConfigDataHeroHeartFetterInfo');
const itemRows = loadArray('ConfigDataItemInfo');
const allMaterialKeys = new Set();
const records = [];
let regularFetterRefs = 0;

for (const hero of master.records) {
  const heroId = positiveInteger(Number(hero.heroId), 'master heroId');
  const shardPath = path.join(ROOT, 'data/generated/hero-detail/by-id', `${heroId}.json`);
  invariant(fs.existsSync(shardPath), `hero ${heroId}: frozen Hero shard missing`);
  const shard = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  invariant(shard.heroId === heroId, `hero ${heroId}: shard identity mismatch`);
  invariant(Array.isArray(shard.bonds) && shard.bonds.length === 5, `hero ${heroId}: expected five frozen regular Fetter rows`);

  const regularFetters = shard.bonds.map((bond, index) => {
    invariant(Number.isSafeInteger(Number(bond.order)), `hero ${heroId}: invalid frozen regular Fetter order`);
    invariant(bond.sourceResolved === true, `hero ${heroId} Fetter ${bond.fetterId}: source is not resolved`);
    const levels = costLevels({
      maxLevel: bond.maxLevel,
      gold: bond.levelUpGold,
      materials: bond.levelUpMaterials,
      skills: bond.gotSkillIds,
      label: `hero ${heroId} Fetter ${bond.fetterId}`,
    });
    for (const level of levels) for (const material of level.materials) {
      invariant(material.itemType === 6, `hero ${heroId} Fetter ${bond.fetterId}: unsupported material ItemType ${material.itemType}`);
      allMaterialKeys.add(`${material.itemType}:${material.itemId}`);
    }
    regularFetterRefs += 1;
    return {
      order: bond.order,
      fetterId: positiveInteger(Number(bond.fetterId), `hero ${heroId} fetterId`),
      nameCn: typeof bond.nameCn === 'string' ? bond.nameCn : null,
      maxLevel: 10,
      levels,
      total: aggregate(levels),
    };
  });

  const descriptor = heartDescriptorByHero.get(heroId);
  invariant(descriptor, `hero ${heroId}: HeartFetter evidence missing`);
  const heartSource = heartRows[descriptor.sourceIndex];
  invariant(heartSource && Number(heartSource.ID) === descriptor.heartFetterId, `hero ${heroId}: HeartFetter source-index/ID mismatch`);
  const heartLevels = costLevels({
    maxLevel: Number(heartSource.MaxLevel),
    gold: heartSource.LevelUpGold,
    materials: heartSource.LevelUpMaterials,
    skills: heartSource.HeroHeartFetterSkills,
    label: `hero ${heroId} HeartFetter ${descriptor.heartFetterId}`,
  });
  for (const level of heartLevels) for (const material of level.materials) {
    invariant(material.itemType === 6, `hero ${heroId} HeartFetter: unsupported material ItemType ${material.itemType}`);
    allMaterialKeys.add(`${material.itemType}:${material.itemId}`);
  }
  const heartFetter = {
    heartFetterId: descriptor.heartFetterId,
    sourceIndex: descriptor.sourceIndex,
    nameCn: typeof heartSource.Name === 'string' ? heartSource.Name : null,
    maxLevel: 10,
    levels: heartLevels,
    total: aggregate(heartLevels),
  };

  const regularTotal = mergeTotals(regularFetters.map((row) => row.total));
  const heartTotal = heartFetter.total;
  records.push({
    heroId,
    identity: { nameKr: hero.nameKr, nameCn: hero.nameCn, nameEn: hero.nameEn },
    regularFetters,
    heartFetter,
    totals: {
      regular: regularTotal,
      heart: heartTotal,
      combined: mergeTotals([regularTotal, heartTotal]),
    },
  });
}

invariant(records.length === 267, 'output Hero coverage drift');
invariant(regularFetterRefs === 1335, `regular Fetter reference count drift: ${regularFetterRefs}`);

const referencedItemIds = [...allMaterialKeys]
  .map((key) => Number(key.split(':')[1]))
  .sort((a, b) => a - b);
const itemCatalog = referencedItemIds.map((itemId) => {
  const matches = itemRows.filter((row) => Number(row?.ID) === itemId);
  invariant(matches.length > 0, `material Item ${itemId}: missing ConfigDataItemInfo row`);
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
  invariant(variants.size === 1, `material Item ${itemId}: conflicting ConfigDataItemInfo metadata across source rows`);
  return [...variants.values()][0];
});

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
    materialItems: itemCatalog.length,
  },
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
    targetLevelsPerTrack: 9,
    targetLevelRange: [2, 10],
    unresolvedMaterialItems: 0,
    conflictingMaterialMetadata: 0,
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
console.log(JSON.stringify({ status: 'PASS', artifact: path.relative(ROOT, OUT), summary: path.relative(ROOT, SUMMARY), counts: artifact.counts }, null, 2));
