'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/generated/hero-bond-level-materials.v1.json'), 'utf8'));
const summary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/validation/hero-bond-level-materials-summary.v1.json'), 'utf8'));
const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hero-name-master.v1.json'), 'utf8'));
const heartEvidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/generated/hero-heart-fetter-raw-condition.v1.json'), 'utf8'));
const heartRows = loadArray('ConfigDataHeroHeartFetterInfo');
const itemRows = loadArray('ConfigDataItemInfo');

function sourceLevels({ maxLevel, gold, materials, label }) {
  assert.equal(Number(maxLevel), 10, `${label}: MaxLevel`);
  assert(Array.isArray(gold) && gold.length === 9, `${label}: LevelUpGold shape`);
  assert(Array.isArray(materials), `${label}: LevelUpMaterials shape`);
  return Array.from({ length: 9 }, (_, index) => {
    const targetLevel = index + 2;
    const goldCost = Number(gold[index]);
    assert(Number.isSafeInteger(goldCost) && goldCost >= 0, `${label}: gold ${targetLevel}`);
    const levelMaterials = materials
      .filter((row) => Number(row?.Level) === targetLevel)
      .map((row) => ({
        itemType: Number(row.ItemType),
        itemId: Number(row.ItemId),
        count: Number(row.Count),
      }));
    assert(levelMaterials.length > 0, `${label}: materials ${targetLevel}`);
    for (const row of levelMaterials) {
      assert.equal(row.itemType, 6, `${label}: material namespace`);
      assert(Number.isSafeInteger(row.itemId) && row.itemId > 0, `${label}: item ID`);
      assert(Number.isSafeInteger(row.count) && row.count > 0, `${label}: count`);
    }
    return { targetLevel, goldCost, materials: levelMaterials };
  });
}
function profileId(prefix, levels) {
  return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(levels)).digest('hex').slice(0,16)}`;
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

assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.stage, 'hero-bond-level-materials-v1');
assert.equal(artifact.status, 'FROZEN_CANDIDATE');
assert.equal(artifact.owner, 'hero-canonical');
assert.equal(artifact.semanticAuthority, false);
assert.equal(master.recordCount, 267);
assert.equal(master.records.length, 267);
assert.equal(artifact.records.length, 267);

const regularProfiles = new Map(artifact.regularCostProfiles.map((row) => [row.profileId, row]));
const heartProfiles = new Map(artifact.heartCostProfiles.map((row) => [row.profileId, row]));
assert.equal(regularProfiles.size, artifact.regularCostProfiles.length, 'duplicate regular profile IDs');
assert.equal(heartProfiles.size, artifact.heartCostProfiles.length, 'duplicate HeartFetter profile IDs');

for (const profile of artifact.regularCostProfiles) {
  assert.equal(profile.profileId, profileId('RF', profile.levels), `regular profile hash mismatch: ${profile.profileId}`);
  assert.deepStrictEqual(profile.total, total(profile.levels), `regular profile total mismatch: ${profile.profileId}`);
}
for (const profile of artifact.heartCostProfiles) {
  assert.equal(profile.profileId, profileId('HF', profile.levels), `HeartFetter profile hash mismatch: ${profile.profileId}`);
  assert.deepStrictEqual(profile.total, total(profile.levels), `HeartFetter profile total mismatch: ${profile.profileId}`);
}

const descriptors = new Map();
for (const evidence of heartEvidence.records || []) {
  const heroId = Number(evidence.heroId);
  const candidate = {
    heartFetterId: Number(evidence.heroHeartFetterId),
    sourceIndex: Number(evidence?.sourceProvenance?.heroHeartFetterSourceIndex),
  };
  if (descriptors.has(heroId)) assert.deepStrictEqual(descriptors.get(heroId), candidate, `hero ${heroId}: inconsistent HeartFetter evidence`);
  else descriptors.set(heroId, candidate);
}
assert.equal(descriptors.size, 267, 'HeartFetter evidence coverage');

const referencedItems = new Set();
const seenRegularProfiles = new Set();
const seenHeartProfiles = new Set();
let regularRefs = 0;
for (let index = 0; index < master.records.length; index += 1) {
  const hero = master.records[index];
  const actual = artifact.records[index];
  assert.equal(actual.heroId, hero.heroId, 'Hero ordering');
  assert.deepStrictEqual(actual.identity, { nameKr: hero.nameKr, nameCn: hero.nameCn, nameEn: hero.nameEn });
  assert.equal(actual.regularFetters.length, 5, `hero ${hero.heroId}: regular Fetter count`);

  const shard = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/generated/hero-detail/by-id', `${hero.heroId}.json`), 'utf8'));
  assert.equal(shard.heroId, hero.heroId);
  assert(Array.isArray(shard.bonds) && shard.bonds.length === 5, `hero ${hero.heroId}: frozen Fetter count`);
  for (let bondIndex = 0; bondIndex < 5; bondIndex += 1) {
    const source = shard.bonds[bondIndex];
    const projected = actual.regularFetters[bondIndex];
    assert.equal(source.sourceResolved, true);
    assert.equal(projected.order, Number(source.order));
    assert.equal(projected.fetterId, Number(source.fetterId));
    assert.equal(projected.nameCn, source.nameCn ?? null);
    const levels = sourceLevels({ maxLevel: source.maxLevel, gold: source.levelUpGold, materials: source.levelUpMaterials, label: `hero ${hero.heroId} Fetter ${source.fetterId}` });
    const expectedProfileId = profileId('RF', levels);
    assert.equal(projected.costProfileId, expectedProfileId, `hero ${hero.heroId} Fetter ${source.fetterId}: profile mapping`);
    const profile = regularProfiles.get(expectedProfileId);
    assert(profile, `regular profile missing: ${expectedProfileId}`);
    assert.deepStrictEqual(profile.levels, levels, `regular profile parity: ${expectedProfileId}`);
    seenRegularProfiles.add(expectedProfileId);
    for (const level of levels) for (const material of level.materials) referencedItems.add(material.itemId);
    regularRefs += 1;
  }

  const descriptor = descriptors.get(hero.heroId);
  assert(descriptor, `hero ${hero.heroId}: HeartFetter descriptor missing`);
  assert.equal(actual.heartFetter.heartFetterId, descriptor.heartFetterId);
  assert.equal(actual.heartFetter.sourceIndex, descriptor.sourceIndex);
  const heartSource = heartRows[descriptor.sourceIndex];
  assert(heartSource && Number(heartSource.ID) === descriptor.heartFetterId, `hero ${hero.heroId}: HeartFetter source parity`);
  assert.equal(actual.heartFetter.nameCn, heartSource.Name ?? null);
  const heartLevels = sourceLevels({ maxLevel: heartSource.MaxLevel, gold: heartSource.LevelUpGold, materials: heartSource.LevelUpMaterials, label: `hero ${hero.heroId} HeartFetter ${descriptor.heartFetterId}` });
  const expectedHeartProfile = profileId('HF', heartLevels);
  assert.equal(actual.heartFetter.costProfileId, expectedHeartProfile, `hero ${hero.heroId}: HeartFetter profile mapping`);
  const heartProfile = heartProfiles.get(expectedHeartProfile);
  assert(heartProfile, `HeartFetter profile missing: ${expectedHeartProfile}`);
  assert.deepStrictEqual(heartProfile.levels, heartLevels, `HeartFetter profile parity: ${expectedHeartProfile}`);
  seenHeartProfiles.add(expectedHeartProfile);
  for (const level of heartLevels) for (const material of level.materials) referencedItems.add(material.itemId);
}
assert.equal(regularRefs, 1335);
assert.equal(seenRegularProfiles.size, regularProfiles.size, 'unused regular cost profile');
assert.equal(seenHeartProfiles.size, heartProfiles.size, 'unused HeartFetter cost profile');

const expectedItemIds = [...referencedItems].sort((a,b)=>a-b);
assert.deepStrictEqual(artifact.itemCatalog.map((row)=>row.itemId), expectedItemIds, 'material catalog coverage');
for (const item of artifact.itemCatalog) {
  assert.equal(item.itemType, 6);
  const matches = itemRows.filter((row) => Number(row?.ID) === item.itemId);
  assert(matches.length > 0, `Item ${item.itemId}: source missing`);
  const variants = new Set(matches.map((row) => JSON.stringify({
    itemType: 6,
    itemId: item.itemId,
    nameCn: typeof row.Name === 'string' ? row.Name : null,
    descriptionCn: typeof (row.Desc ?? row.Description) === 'string' ? (row.Desc ?? row.Description) : null,
    icon: typeof row.Icon === 'string' ? row.Icon : null,
  })));
  assert.equal(variants.size, 1, `Item ${item.itemId}: conflicting source metadata`);
  assert.equal(JSON.stringify(item), [...variants][0], `Item ${item.itemId}: metadata parity`);
}

assert.deepStrictEqual(artifact.counts, {
  heroes: 267,
  regularFetterRefs: 1335,
  heartFetterRefs: 267,
  regularCostProfiles: regularProfiles.size,
  heartCostProfiles: heartProfiles.size,
  materialItems: artifact.itemCatalog.length,
});
assert.equal(regularProfiles.size, 15, 'regular cost-profile distribution changed');
assert.equal(heartProfiles.size, 24, 'HeartFetter cost-profile distribution changed');
assert.equal(artifact.itemCatalog.length, 43, 'material item population changed');
assert.equal(summary.status, 'PASS');
assert.deepStrictEqual(summary.counts, artifact.counts);
assert.equal(summary.normalization.perHeroCostRowsDuplicated, false);
assert.equal(summary.boundaries.regularCostsReusedFromFrozenHeroConsumer, true);
assert.equal(summary.boundaries.heartRelationReusedFromFrozenRawEvidence, true);
assert.equal(summary.boundaries.rawHeroInfoReselection, false);
assert.equal(summary.boundaries.nameJoin, false);
assert.equal(summary.boundaries.idArithmetic, false);
assert.equal(summary.boundaries.newBondEffectSemantics, false);
assert.equal(summary.boundaries.frontendMutation, false);

console.log(JSON.stringify({
  status: 'PASS',
  counts: artifact.counts,
  normalized: true,
  boundaries: summary.boundaries,
}, null, 2));
