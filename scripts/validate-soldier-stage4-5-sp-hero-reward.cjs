const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  readJson,
  loadSpHeroes,
} = require('./lib/configdata-direct.cjs');

const BASELINE_PATH = process.env.BASELINE_STAGE3_PATH;
if (!BASELINE_PATH) throw new Error('BASELINE_STAGE3_PATH is required');

const CURRENT_STAGE3_PATH = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const STAGE3_VALIDATION_PATH = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');
const HERO_MASTER_PATH = path.join(ROOT, 'data/hero-name-master.v1.json');
const SOLDIER_MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const OUT_PATH = path.join(ROOT, 'data/validation/soldier-stage4-5-sp-hero-reward.v1.json');

function uniqueSorted(xs) { return [...new Set(xs)].sort((a, b) => a - b); }
function stableRewards(rows) {
  return rows.map((r) => ({
    spHeroInfoId: Number(r.spHeroInfoId),
    heroId: Number(r.heroId),
    heroInformationId: Number(r.heroInformationId),
    rewardSoldierIds: uniqueSorted((r.rewardSoldierIds || []).map(Number)),
  })).sort((a, b) => a.heroId - b.heroId || a.spHeroInfoId - b.spHeroInfoId);
}
function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function key(heroId, soldierId) { return `${heroId}:${soldierId}`; }
function edgeSet(rows) {
  const out = new Set();
  for (const r of rows) for (const sid of r.rewardSoldierIds) out.add(key(r.heroId, sid));
  return out;
}
function diffCount(a, b) {
  let n = 0;
  for (const x of a) if (!b.has(x)) n++;
  return n;
}
function duplicates(xs) {
  const seen = new Set(); const dup = new Set();
  for (const x of xs) seen.has(x) ? dup.add(x) : seen.add(x);
  return [...dup];
}

const baselineStage3 = readJson(BASELINE_PATH);
const currentStage3 = readJson(CURRENT_STAGE3_PATH);
const stage3Validation = readJson(STAGE3_VALIDATION_PATH);
const heroMaster = readJson(HERO_MASTER_PATH).records;
const soldierMaster = readJson(SOLDIER_MASTER_PATH).records;
const sourceSpHeroes = loadSpHeroes();

const heroIds = new Set(heroMaster.map((x) => Number(x.heroId)));
const soldierIds = new Set(soldierMaster.map((x) => Number(x.soldierId)));

const baselineRewards = stableRewards(baselineStage3.spHeroRewards || []);
const currentRewards = stableRewards(currentStage3.spHeroRewards || []);
const recomputedRewards = stableRewards(sourceSpHeroes
  .filter((x) => x.rewardSoldierIds.length)
  .map((x) => ({
    spHeroInfoId: x.spHeroInfoId,
    heroId: x.heroId,
    heroInformationId: x.heroInformationId,
    rewardSoldierIds: x.rewardSoldierIds,
  })));

const baselineEdges = edgeSet(baselineRewards);
const currentEdges = edgeSet(currentRewards);
const recomputedEdges = edgeSet(recomputedRewards);

const checks = {
  spHeroRecordCountMismatch: sourceSpHeroes.length === 25 ? 0 : 1,
  rewardRecordCountMismatch: recomputedRewards.length === baselineRewards.length ? 0 : Math.abs(recomputedRewards.length - baselineRewards.length),
  rewardEdgeCountMismatch: recomputedEdges.size === baselineEdges.size ? 0 : Math.abs(recomputedEdges.size - baselineEdges.size),
  duplicateSpHeroIds: duplicates(sourceSpHeroes.map((x) => x.spHeroInfoId)).length,
  duplicateRewardEdges: sourceSpHeroes.reduce((acc, h) => acc + h.rewardSoldierIds.length, 0) - recomputedEdges.size,
  canonicalHeroIdMismatch: sourceSpHeroes.filter((x) => x.heroId !== x.spHeroInfoId).length,
  missingCanonicalHeroIds: recomputedRewards.filter((r) => !heroIds.has(r.heroId)).length,
  missingRewardSoldierIds: recomputedRewards.reduce((n, r) => n + r.rewardSoldierIds.filter((sid) => !soldierIds.has(sid)).length, 0),
  baselineMissingEdges: diffCount(recomputedEdges, baselineEdges),
  baselineExtraEdges: diffCount(baselineEdges, recomputedEdges),
  currentMissingEdges: diffCount(recomputedEdges, currentEdges),
  currentExtraEdges: diffCount(currentEdges, recomputedEdges),
  baselineSemanticMismatch: JSON.stringify(baselineRewards) === JSON.stringify(recomputedRewards) ? 0 : 1,
  currentSemanticMismatch: JSON.stringify(currentRewards) === JSON.stringify(recomputedRewards) ? 0 : 1,
  baselineVsCurrentMismatch: JSON.stringify(baselineRewards) === JSON.stringify(currentRewards) ? 0 : 1,
  stage3SpHeroCheckRegression: (stage3Validation.checks?.missingSpHeroIds || 0) + (stage3Validation.checks?.missingRewardSoldiers || 0) + (stage3Validation.checks?.spHeroMappingUnmapped || 0) + (stage3Validation.checks?.spHeroMappingAmbiguous || 0),
  reverseIndexMissing: 0,
  reverseIndexExtra: 0,
};

const expectedBySoldier = new Map();
for (const r of recomputedRewards) for (const sid of r.rewardSoldierIds) {
  if (!expectedBySoldier.has(sid)) expectedBySoldier.set(sid, []);
  expectedBySoldier.get(sid).push(r.heroId);
}
const currentRecordBySoldier = new Map((currentStage3.records || []).map((r) => [Number(r.soldierId), r]));
for (const sid of soldierIds) {
  const expected = new Set(uniqueSorted(expectedBySoldier.get(sid) || []));
  const actual = new Set(uniqueSorted((currentRecordBySoldier.get(sid)?.heroes?.spHeroAddedHeroIds || []).map(Number)));
  checks.reverseIndexMissing += diffCount(expected, actual);
  checks.reverseIndexExtra += diffCount(actual, expected);
}

const informative = {
  heroInformationDiffersFromCanonical: sourceSpHeroes.filter((x) => x.heroInformationId !== x.heroId).length,
  heroesWithRewardSoldiers: recomputedRewards.length,
  rewardEdges: recomputedEdges.size,
  distinctRewardSoldiers: new Set(recomputedRewards.flatMap((r) => r.rewardSoldierIds)).size,
};

const errors = Object.entries(checks).filter(([, v]) => v !== 0).map(([k, v]) => `${k}=${v}`);
const output = {
  version: 1,
  stage: 'soldier-page-4-5',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Regress SP Hero -> reward Soldier source edges after UnityDataTool direct-JSON migration while preserving the shared Relation Layer ownership boundary.',
  baseline: {
    commit: 'c2276d1162dae52a1762e6381e7dd195c917da2f',
    artifact: 'data/generated/soldier-stage3.v1.json',
    role: 'pre-4-1 SP Hero reward semantic regression reference',
  },
  inputs: {
    spHero: 'data/configdata/ConfigDataSPHeroInfo.json',
    heroMaster: 'data/hero-name-master.v1.json',
    soldierMaster: 'data/generated/soldier-master.v1.json',
    currentStage3: 'data/generated/soldier-stage3.v1.json',
    stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
  },
  hashes: {
    baselineRewardSemanticSha256: hash(baselineRewards),
    currentRewardSemanticSha256: hash(currentRewards),
    recomputedRewardSemanticSha256: hash(recomputedRewards),
  },
  counts: {
    spHeroRecords: sourceSpHeroes.length,
    rewardRecords: recomputedRewards.length,
    rewardEdges: recomputedEdges.size,
    distinctRewardSoldiers: informative.distinctRewardSoldiers,
    heroInformationDiffersFromCanonical: informative.heroInformationDiffersFromCanonical,
  },
  checks,
  policy: {
    canonicalHeroKey: 'ConfigDataSPHeroInfo.ID is the canonical heroId for SecondStageRewardSoldiers.',
    heroInformationId: 'HeroInformation_ID is preserved as metadata only and must not replace SPHeroInfo.ID as the Hero JOIN key.',
    rewardJoin: 'SecondStageRewardSoldiers contains canonical Soldier IDs and is reverse-indexed by Soldier ID without name or numeric-pattern inference.',
    relationBoundary: '4-5 validates the directed SP_HERO_REWARD source edges only. Final canonical Hero-Soldier membership remains owned by the shared Relation Layer and is handled after A-9.',
  },
  errors,
  completion: errors.length ? null : 'All SP Hero reward-Soldier source edges reproduce the pre-4-1 semantics from current direct JSON and resolve to canonical Hero/Soldier masters with an exact Stage3 reverse index.',
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
