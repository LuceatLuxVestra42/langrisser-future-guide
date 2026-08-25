const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  configPath,
  readJson,
  loadSoldiers,
  loadTrainingTechs,
  loadTrainingLevels,
} = require('./lib/configdata-direct.cjs');

const MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const CURRENT_STAGE3_PATH = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const STAGE3_VALIDATION_PATH = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');
const TRAINING_PATH = configPath('ConfigDataTrainingTechInfo');
const TRAINING_LEVEL_PATH = configPath('ConfigDataTrainingTechLevelInfo');
const BASELINE_PATH = process.env.BASELINE_STAGE3_PATH;
const BASELINE_COMMIT = 'c2276d1162dae52a1762e6381e7dd195c917da2f';
const OUT_PATH = path.join(ROOT, 'data/validation/soldier-stage4-3-trainingtech.v1.json');

if (!BASELINE_PATH || !fs.existsSync(BASELINE_PATH)) {
  throw new Error('BASELINE_STAGE3_PATH must point to the pre-4-1 stage3 generated artifact');
}

function gitBlobSha(p) {
  const body = fs.readFileSync(p);
  const header = Buffer.from(`blob ${body.length}\0`);
  return crypto.createHash('sha1').update(header).update(body).digest('hex');
}
function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function uniqSorted(xs) {
  return [...new Set(xs)].sort((a, b) => a - b);
}
function canonGoods(items) {
  return (items ?? []).map(x => ({goodsType:x.goodsType,itemId:x.itemId,count:x.count}))
    .sort((a,b)=>a.goodsType-b.goodsType || a.itemId-b.itemId || a.count-b.count);
}
function sumGoods(levels, limit) {
  const picked = levels.slice(0, limit);
  const byKey = new Map();
  let gold = 0;
  for (const l of picked) {
    gold += l.gold;
    for (const g of l.materials ?? []) {
      const key = `${g.goodsType}:${g.itemId}`;
      const prev = byKey.get(key) ?? {goodsType:g.goodsType,itemId:g.itemId,count:0};
      prev.count += g.count;
      byKey.set(key, prev);
    }
  }
  return {
    levelsIncluded: picked.length,
    gold,
    materials: [...byKey.values()].sort((a,b)=>a.goodsType-b.goodsType || a.itemId-b.itemId),
  };
}
function normalizeCost(cost) {
  return {
    levelsIncluded: cost?.levelsIncluded ?? 0,
    gold: cost?.gold ?? 0,
    materials: canonGoods(cost?.materials),
  };
}
function normalizeProfile(p) {
  if (!p) return null;
  return {
    soldierId: p.soldierId,
    getSoldierTechId: p.getSoldierTechId,
    linkedTechs: (p.linkedTechs ?? []).map(t => ({
      techId: t.techId,
      name: t.name,
      techType: t.techType,
      armyIds: uniqSorted(t.armyIds ?? []),
      roomLevelRequired: t.roomLevelRequired,
      preTechIds: uniqSorted(t.preTechIds ?? []),
      preTechLevels: [...(t.preTechLevels ?? [])],
      isSummon: Boolean(t.isSummon),
      isLocked: Boolean(t.isLocked),
      getSoldierTechIdMatch: Boolean(t.getSoldierTechIdMatch),
      levelInfoIds: [...(t.levelInfoIds ?? [])],
      levels: (t.levels ?? []).map(l => ({
        sequenceLevel: l.sequenceLevel,
        levelInfoId: l.levelInfoId,
        missing: Boolean(l.missing),
        description: l.description ?? '',
        gold: l.gold ?? 0,
        materials: canonGoods(l.materials),
        roomExp: l.roomExp ?? 0,
        soldierIdUnlocked: l.soldierIdUnlocked ?? 0,
        soldierSkillLevel: l.soldierSkillLevel ?? 0,
        soldierSkillId: l.soldierSkillId ?? 0,
      })),
      costToLevel5: normalizeCost(t.costToLevel5),
      costToLevel10: normalizeCost(t.costToLevel10),
    })).sort((a,b)=>a.techId-b.techId),
    primaryTenLevelTechId: p.primaryTenLevelTechId ?? null,
    tenLevelTechIds: uniqSorted(p.tenLevelTechIds ?? []),
  };
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const master = readJson(MASTER_PATH).records ?? [];
const currentStage3 = readJson(CURRENT_STAGE3_PATH);
const baselineStage3 = readJson(BASELINE_PATH);
const stage3Validation = readJson(STAGE3_VALIDATION_PATH);
const soldiers = loadSoldiers();
const trainings = loadTrainingTechs();
const trainingLevels = loadTrainingLevels();

const soldierById = new Map(soldiers.map(x => [x.soldierId, x]));
const levelById = new Map(trainingLevels.map(x => [x.levelInfoId, x]));
const trainingBySoldier = new Map();
for (const t of trainings) {
  for (const soldierId of t.soldierIds) {
    if (!trainingBySoldier.has(soldierId)) trainingBySoldier.set(soldierId, []);
    trainingBySoldier.get(soldierId).push(t);
  }
}

const tier3Ids = master.filter(x => !x.isSp && x.tier === 3).map(x => x.soldierId).sort((a,b)=>a-b);
const currentById = new Map((currentStage3.trainingProfiles ?? []).map(x => [x.soldierId, x]));
const baselineById = new Map((baselineStage3.trainingProfiles ?? []).map(x => [x.soldierId, x]));

let missingTrainingLevelRefs = 0;
let tier3WithoutTraining = 0;
let tier3WithoutTenLevel = 0;
let tier3MultipleTenLevel = 0;
let primaryPathDescriptionMissing = 0;
let costAggregationMismatch = 0;
let baselineProfileMissing = 0;
let currentProfileMissing = 0;
let baselineSemanticMismatch = 0;
let currentSemanticMismatch = 0;
let baselineVsCurrentMismatch = 0;
let linkedTechRecords = 0;
let primaryLevelRecords = 0;
let tier3WithAdditionalLinkedTechs = 0;
const uniqueReferencedLevelIds = new Set();
const recomputedProfiles = [];

for (const soldierId of tier3Ids) {
  const soldier = soldierById.get(soldierId);
  const linked = (trainingBySoldier.get(soldierId) ?? []).map(t => {
    const levels = t.levelInfoIds.map((id, index) => {
      uniqueReferencedLevelIds.add(id);
      const x = levelById.get(id);
      if (!x) {
        missingTrainingLevelRefs++;
        return {sequenceLevel:index+1,levelInfoId:id,missing:true};
      }
      return {
        sequenceLevel:index+1,
        levelInfoId:id,
        description:x.description,
        gold:x.gold,
        materials:x.materials,
        roomExp:x.roomExp,
        soldierIdUnlocked:x.soldierIdUnlocked,
        soldierSkillLevel:x.soldierSkillLevel,
        soldierSkillId:x.soldierSkillId,
      };
    });
    return {
      techId:t.techId,
      name:t.name,
      techType:t.techType,
      armyIds:t.armyIds,
      roomLevelRequired:t.roomLevelRequired,
      preTechIds:t.preTechIds,
      preTechLevels:t.preTechLevels,
      isSummon:t.isSummon,
      isLocked:t.isLocked,
      getSoldierTechIdMatch:soldier?.getSoldierTechId === t.techId,
      levelInfoIds:t.levelInfoIds,
      levels,
      costToLevel5:sumGoods(levels.filter(x=>!x.missing), 5),
      costToLevel10:sumGoods(levels.filter(x=>!x.missing), 10),
    };
  });

  linkedTechRecords += linked.length;
  if (linked.length > 1) tier3WithAdditionalLinkedTechs++;
  if (!linked.length) tier3WithoutTraining++;
  const tenLevel = linked.filter(t => t.levels.length === 10 && t.levels.every((l,i)=>!l.missing && l.soldierSkillLevel === i+1));
  if (!tenLevel.length) tier3WithoutTenLevel++;
  if (tenLevel.length > 1) tier3MultipleTenLevel++;

  const primary = tenLevel.length === 1 ? tenLevel[0] : null;
  if (primary) {
    primaryLevelRecords += primary.levels.length;
    primaryPathDescriptionMissing += primary.levels.filter(l => !String(l.description ?? '').trim()).length;
    if (!same(normalizeCost(primary.costToLevel5), normalizeCost(sumGoods(primary.levels, 5)))) costAggregationMismatch++;
    if (!same(normalizeCost(primary.costToLevel10), normalizeCost(sumGoods(primary.levels, 10)))) costAggregationMismatch++;
  }

  const recomputed = {
    soldierId,
    getSoldierTechId:soldier?.getSoldierTechId ?? 0,
    linkedTechs:linked,
    primaryTenLevelTechId:tenLevel.length === 1 ? tenLevel[0].techId : null,
    tenLevelTechIds:tenLevel.map(x=>x.techId),
  };
  recomputedProfiles.push(recomputed);

  const baseline = baselineById.get(soldierId);
  const current = currentById.get(soldierId);
  if (!baseline) baselineProfileMissing++;
  if (!current) currentProfileMissing++;
  const nr = normalizeProfile(recomputed);
  const nb = normalizeProfile(baseline);
  const nc = normalizeProfile(current);
  if (baseline && !same(nb, nr)) baselineSemanticMismatch++;
  if (current && !same(nc, nr)) currentSemanticMismatch++;
  if (baseline && current && !same(nb, nc)) baselineVsCurrentMismatch++;
}

const normalizedBaseline = tier3Ids.map(id => normalizeProfile(baselineById.get(id)));
const normalizedCurrent = tier3Ids.map(id => normalizeProfile(currentById.get(id)));
const normalizedRecomputed = recomputedProfiles.map(normalizeProfile).sort((a,b)=>a.soldierId-b.soldierId);

const checks = {
  tier3CountMismatch: tier3Ids.length === 129 ? 0 : 1,
  trainingTechCountMismatch: trainings.length === 287 ? 0 : 1,
  trainingLevelCountMismatch: trainingLevels.length === 2945 ? 0 : 1,
  missingTrainingLevelRefs,
  tier3WithoutTraining,
  tier3WithoutTenLevel,
  tier3MultipleTenLevel,
  primaryPathDescriptionMissing,
  costAggregationMismatch,
  baselineProfileMissing,
  currentProfileMissing,
  baselineSemanticMismatch,
  currentSemanticMismatch,
  baselineVsCurrentMismatch,
  stage3TrainingCheckRegression:
    (stage3Validation.counts?.tier3WithoutTraining ?? 1) === 0 &&
    (stage3Validation.counts?.tier3WithoutTenLevel ?? 1) === 0 &&
    (stage3Validation.counts?.tier3MultipleTenLevel ?? 1) === 0 &&
    (stage3Validation.checks?.missingTrainingLevelRefs ?? 1) === 0 ? 0 : 1,
};

const errors = Object.entries(checks).filter(([,v]) => v !== 0).map(([k,v]) => `${k}: ${v}`);
const output = {
  version:1,
  stage:'soldier-page-4-3',
  status:errors.length ? 'FAIL' : 'PASS',
  purpose:'Regress general tier-3 Soldier TrainingTech semantics after UnityDataTool direct-JSON migration. SP-specific description semantics remain reserved for stage 4-4.',
  baseline:{
    commit:BASELINE_COMMIT,
    artifact:'data/generated/soldier-stage3.v1.json',
    role:'pre-4-1 semantic regression reference',
  },
  inputs:{
    soldierMaster:'data/generated/soldier-master.v1.json',
    trainingTech:'data/configdata/ConfigDataTrainingTechInfo.json',
    trainingLevel:'data/configdata/ConfigDataTrainingTechLevelInfo.json',
    currentStage3:'data/generated/soldier-stage3.v1.json',
    stage3Validation:'data/validation/soldier-stage3-final.v1.json',
  },
  hashes:{
    trainingTechBlobSha:gitBlobSha(TRAINING_PATH),
    trainingLevelBlobSha:gitBlobSha(TRAINING_LEVEL_PATH),
    baselineTier3SemanticSha256:sha256(normalizedBaseline),
    currentTier3SemanticSha256:sha256(normalizedCurrent),
    recomputedTier3SemanticSha256:sha256(normalizedRecomputed),
  },
  counts:{
    trainingTechRecords:trainings.length,
    trainingLevelRecords:trainingLevels.length,
    tier3Normal:tier3Ids.length,
    linkedTechRecords,
    uniqueReferencedLevelIds:uniqueReferencedLevelIds.size,
    primaryTenLevelPaths:tier3Ids.length - tier3WithoutTenLevel - tier3MultipleTenLevel,
    primaryLevelRecords,
    tier3WithAdditionalLinkedTechs,
  },
  checks,
  policy:{
    join:'Reverse-search ConfigDataTrainingTechInfo.SoldierIDRelated by canonical soldierId.',
    primaryPath:'Among linked techs, the soldier-specific path is the unique 10-level TechLevelupInfoList whose TrainingTechLevelInfo.SoldierSkillLevelup sequence is exactly 1..10.',
    getSoldierTechId:'Validation metadata only; it is not the authoritative TrainingTech JOIN.',
    levelOrder:'TechLevelupInfoList order defines sequenceLevel; SoldierSkillLevelup is preserved independently and validates the soldier-skill Lv1..10 path.',
    costs:'Preserve LevelupGoldCost and LevelupMaterialsCost per level; Lv5/Lv10 totals are derived from those exact level records.',
    spBoundary:'SpSoidlierDescription is not asserted in 4-3 and is validated with SP-specific semantics in 4-4.',
  },
  errors,
  completion:errors.length ? 'Stage 4-3 TrainingTech regression failed.' : 'All 129 general tier-3 TrainingTech profiles reproduce the pre-4-1 semantics from current direct JSON with unique Lv1-10 paths, intact descriptions and exact per-level-derived Lv5/Lv10 costs.',
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
