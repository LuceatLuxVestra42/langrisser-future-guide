'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.join(ROOT, 'data/generated/hero-bond-level-materials.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/hero-bond-level-materials-summary.v1.json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}
function normalizeMaterials(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    itemType: Number(row.ItemType ?? row.itemType),
    itemId: Number(row.ItemId ?? row.itemId),
    count: Number(row.Count ?? row.count),
  }));
}
function sourceLevel(row, targetLevel, skills, label) {
  assert.equal(Number(row.MaxLevel ?? row.maxLevel), 10, `${label}: maxLevel`);
  const gold = row.LevelUpGold ?? row.levelUpGold;
  const materials = row.LevelUpMaterials ?? row.levelUpMaterials;
  assert(Array.isArray(gold) && gold.length === 9, `${label}: gold shape`);
  assert(Array.isArray(materials), `${label}: material shape`);
  assert(Array.isArray(skills) && skills.length === 10, `${label}: skill shape`);
  return {
    targetLevel,
    skillId: Number(skills[targetLevel - 1]),
    goldCost: Number(gold[targetLevel - 2]),
    materials: normalizeMaterials(materials.filter((entry) => Number(entry.Level ?? entry.targetLevel) === targetLevel)),
  };
}
function aggregate(levels) {
  const byKey = new Map();
  let gold = 0;
  for (const level of levels) {
    gold += level.goldCost;
    for (const material of level.materials) {
      const key = `${material.itemType}:${material.itemId}`;
      const value = byKey.get(key) || { itemType: material.itemType, itemId: material.itemId, count: 0 };
      value.count += material.count;
      byKey.set(key, value);
    }
  }
  return { gold, materials: [...byKey.values()].sort((a,b)=>a.itemType-b.itemType||a.itemId-b.itemId) };
}
function mergeTotals(parts) {
  const levels = [];
  let synthetic = 2;
  for (const part of parts) {
    levels.push({ targetLevel: synthetic++, skillId: 1, goldCost: part.gold, materials: part.materials });
  }
  return aggregate(levels);
}

assert(fs.existsSync(ARTIFACT_PATH), 'generated Hero bond material artifact missing');
assert(fs.existsSync(SUMMARY_PATH), 'Hero bond material validation summary missing');

const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
const master = readJson('data/hero-name-master.v1.json');
const heartEvidence = readJson('data/generated/hero-heart-fetter-raw-condition.v1.json');
const heartRows = loadArray('ConfigDataHeroHeartFetterInfo');
const itemRows = loadArray('ConfigDataItemInfo');

assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.stage, 'hero-bond-level-materials-v1');
assert.equal(artifact.status, 'FROZEN_CANDIDATE');
assert.equal(artifact.semanticAuthority, false);
assert.equal(artifact.owner, 'hero-canonical');
assert.equal(master.recordCount, 267);
assert.equal(artifact.records.length, 267);
assert.equal(artifact.counts.heroes, 267);
assert.equal(artifact.counts.regularFetterRefs, 1335);
assert.equal(artifact.counts.heartFetterRefs, 267);

const masterIds = master.records.map((row) => Number(row.heroId));
assert.deepStrictEqual(artifact.records.map((row) => row.heroId), masterIds, 'Hero order/population differs from current Hero master');

const descriptors = new Map();
for (const evidence of heartEvidence.records || []) {
  const heroId = Number(evidence.heroId);
  const candidate = {
    heartFetterId: Number(evidence.heroHeartFetterId),
    sourceIndex: Number(evidence?.sourceProvenance?.heroHeartFetterSourceIndex),
  };
  if (descriptors.has(heroId)) assert.deepStrictEqual(descriptors.get(heroId), candidate, `hero ${heroId}: inconsistent HeartFetter locator evidence`);
  else descriptors.set(heroId, candidate);
}
assert.equal(descriptors.size, 267, 'HeartFetter evidence coverage drift');

let regularCount = 0;
const materialKeys = new Set();
for (let index = 0; index < artifact.records.length; index += 1) {
  const actual = artifact.records[index];
  const masterHero = master.records[index];
  assert.equal(actual.heroId, masterHero.heroId);
  assert.deepStrictEqual(actual.identity, { nameKr: masterHero.nameKr, nameCn: masterHero.nameCn, nameEn: masterHero.nameEn });

  const shard = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/generated/hero-detail/by-id', `${actual.heroId}.json`), 'utf8'));
  assert(Array.isArray(shard.bonds) && shard.bonds.length === 5, `hero ${actual.heroId}: frozen bond count`);
  assert.equal(actual.regularFetters.length, 5, `hero ${actual.heroId}: output bond count`);

  for (let b = 0; b < 5; b += 1) {
    const source = shard.bonds[b];
    const projected = actual.regularFetters[b];
    assert.equal(source.sourceResolved, true, `hero ${actual.heroId} Fetter ${source.fetterId}: unresolved source`);
    assert.equal(projected.order, source.order);
    assert.equal(projected.fetterId, source.fetterId);
    assert.equal(projected.nameCn, source.nameCn ?? null);
    assert.equal(projected.maxLevel, 10);
    assert.equal(projected.levels.length, 9);
    const expectedLevels = Array.from({ length: 9 }, (_, i) => sourceLevel(source, i + 2, source.gotSkillIds, `hero ${actual.heroId} Fetter ${source.fetterId}`));
    assert.deepStrictEqual(projected.levels, expectedLevels, `hero ${actual.heroId} Fetter ${source.fetterId}: level cost parity`);
    assert.deepStrictEqual(projected.total, aggregate(expectedLevels), `hero ${actual.heroId} Fetter ${source.fetterId}: total parity`);
    for (const level of projected.levels) for (const material of level.materials) {
      assert.equal(material.itemType, 6, `hero ${actual.heroId} Fetter ${source.fetterId}: material namespace drift`);
      materialKeys.add(`${material.itemType}:${material.itemId}`);
    }
    regularCount += 1;
  }

  const descriptor = descriptors.get(actual.heroId);
  assert(descriptor, `hero ${actual.heroId}: HeartFetter locator missing`);
  assert.equal(actual.heartFetter.heartFetterId, descriptor.heartFetterId);
  assert.equal(actual.heartFetter.sourceIndex, descriptor.sourceIndex);
  const sourceHeart = heartRows[descriptor.sourceIndex];
  assert(sourceHeart, `hero ${actual.heroId}: HeartFetter source index missing`);
  assert.equal(Number(sourceHeart.ID), descriptor.heartFetterId, `hero ${actual.heroId}: HeartFetter source ID mismatch`);
  assert.equal(actual.heartFetter.nameCn, sourceHeart.Name ?? null);
  assert.equal(actual.heartFetter.maxLevel, 10);
  const expectedHeartLevels = Array.from({ length: 9 }, (_, i) => sourceLevel(sourceHeart, i + 2, sourceHeart.HeroHeartFetterSkills, `hero ${actual.heroId} HeartFetter ${descriptor.heartFetterId}`));
  assert.deepStrictEqual(actual.heartFetter.levels, expectedHeartLevels, `hero ${actual.heroId}: HeartFetter cost parity`);
  assert.deepStrictEqual(actual.heartFetter.total, aggregate(expectedHeartLevels), `hero ${actual.heroId}: HeartFetter total parity`);
  for (const level of actual.heartFetter.levels) for (const material of level.materials) {
    assert.equal(material.itemType, 6, `hero ${actual.heroId} HeartFetter: material namespace drift`);
    materialKeys.add(`${material.itemType}:${material.itemId}`);
  }

  const regularTotal = mergeTotals(actual.regularFetters.map((row) => row.total));
  const heartTotal = actual.heartFetter.total;
  assert.deepStrictEqual(actual.totals.regular, regularTotal, `hero ${actual.heroId}: regular aggregate mismatch`);
  assert.deepStrictEqual(actual.totals.heart, heartTotal, `hero ${actual.heroId}: HeartFetter aggregate mismatch`);
  assert.deepStrictEqual(actual.totals.combined, mergeTotals([regularTotal, heartTotal]), `hero ${actual.heroId}: combined aggregate mismatch`);
}
assert.equal(regularCount, 1335);

const expectedItemIds = [...materialKeys].map((key)=>Number(key.split(':')[1])).sort((a,b)=>a-b);
assert.deepStrictEqual(artifact.itemCatalog.map((row)=>row.itemId), expectedItemIds, 'material item catalog ID coverage mismatch');
for (const item of artifact.itemCatalog) {
  assert.equal(item.itemType, 6);
  const matches = itemRows.filter((row) => Number(row?.ID) === item.itemId);
  assert(matches.length > 0, `Item ${item.itemId}: source row missing`);
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

assert.equal(artifact.counts.materialItems, artifact.itemCatalog.length);
assert.equal(summary.status, 'PASS');
assert.equal(summary.owner, 'hero-canonical');
assert.deepStrictEqual(summary.counts, artifact.counts);
assert.equal(summary.coverage.heroPopulationComplete, true);
assert.equal(summary.coverage.fiveRegularFettersPerHero, true);
assert.equal(summary.coverage.oneHeartFetterPerHero, true);
assert.equal(summary.coverage.unresolvedMaterialItems, 0);
assert.equal(summary.coverage.conflictingMaterialMetadata, 0);
assert.equal(summary.boundaries.regularCostsReusedFromFrozenHeroConsumer, true);
assert.equal(summary.boundaries.heartRelationReusedFromFrozenRawEvidence, true);
assert.equal(summary.boundaries.rawHeroInfoReselection, false);
assert.equal(summary.boundaries.nameJoin, false);
assert.equal(summary.boundaries.idArithmetic, false);
assert.equal(summary.boundaries.newBondEffectSemantics, false);

console.log(JSON.stringify({
  status: 'PASS',
  heroes: artifact.counts.heroes,
  regularFetterRefs: artifact.counts.regularFetterRefs,
  heartFetterRefs: artifact.counts.heartFetterRefs,
  materialItems: artifact.counts.materialItems,
  boundaries: summary.boundaries,
}, null, 2));
