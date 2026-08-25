const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  configPath,
  readJson,
  loadSoldiers,
  loadSpSoldiers,
  loadTrainingTechs,
  loadTrainingLevels,
  loadMissions,
  loadMissionSubmitBundles,
} = require('./lib/configdata-direct.cjs');

const CURRENT_STAGE3 = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const STAGE3_VALIDATION = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');
const HERO_MASTER = path.join(ROOT, 'data/hero-name-master.v1.json');
const OUT = path.join(ROOT, 'data/validation/soldier-stage4-4-sp-mission.v1.json');
const BASELINE_STAGE3 = process.env.BASELINE_STAGE3_PATH;
if (!BASELINE_STAGE3) throw new Error('BASELINE_STAGE3_PATH is required');

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function gitBlobSha(p) {
  const body = fs.readFileSync(p);
  const header = Buffer.from(`blob ${body.length}\0`);
  return crypto.createHash('sha1').update(header).update(body).digest('hex');
}
function uniqueSorted(xs) { return [...new Set(xs)].sort((a,b)=>a-b); }
function duplicates(xs) {
  const seen = new Set(), dup = new Set();
  for (const x of xs) seen.has(x) ? dup.add(x) : seen.add(x);
  return [...dup].sort((a,b)=>a-b);
}
function stableGoods(xs) {
  return (xs ?? []).map(x => ({goodsType:x.goodsType,itemId:x.itemId,count:x.count}));
}
function canonicalMission(m) {
  if (!m) return null;
  return {
    missionId: m.missionId,
    missionType: m.missionType,
    param1: m.param1,
    param2: m.param2,
    param3: m.param3,
    param4: m.param4,
    param5: m.param5 ?? [],
    param6: m.param6 ?? [],
    submitBundleId: m.missionType === 73 ? (m.submitBundleId ?? m.param1) : null,
    submitItems: m.missionType === 73 ? stableGoods(m.submitItems ?? []) : null,
  };
}

const soldiers = loadSoldiers();
const spRows = loadSpSoldiers();
const trainings = loadTrainingTechs();
const trainingLevels = loadTrainingLevels();
const missions = loadMissions();
const submitBundles = loadMissionSubmitBundles();
const current = readJson(CURRENT_STAGE3);
const baseline = readJson(BASELINE_STAGE3);
const stage3Validation = readJson(STAGE3_VALIDATION);
const heroMaster = readJson(HERO_MASTER).records ?? [];

const soldierById = new Map(soldiers.map(x=>[x.soldierId,x]));
const trainingLevelById = new Map(trainingLevels.map(x=>[x.levelInfoId,x]));
const trainingBySoldier = new Map();
for (const t of trainings) for (const sid of t.soldierIds) {
  if (!trainingBySoldier.has(sid)) trainingBySoldier.set(sid, []);
  trainingBySoldier.get(sid).push(t);
}
const missionById = new Map(missions.map(x=>[x.missionId,x]));
const submitById = new Map(submitBundles.map(x=>[x.bundleId,x]));
const heroIds = new Set(heroMaster.map(x=>x.heroId));

function primaryTrainingForSoldier(soldierId) {
  const linked = trainingBySoldier.get(soldierId) ?? [];
  const candidates = linked.map(t => ({
    techId: t.techId,
    levels: t.levelInfoIds.map(id => trainingLevelById.get(id) ?? null),
  })).filter(t => t.levels.length === 10 && t.levels.every((x,i)=>x && x.soldierSkillLevel === i+1));
  return {linkedCount:linked.length,candidates};
}

function recomputedMission(id) {
  const m = missionById.get(id);
  if (!m) return null;
  const out = {...m};
  if (m.missionType === 73) {
    out.submitBundleId = m.param1;
    out.submitItems = submitById.get(m.param1)?.items ?? [];
  }
  return canonicalMission(out);
}

function recomputedSemantic() {
  return [...spRows].sort((a,b)=>a.spSoldierId-b.spSoldierId).map(r => {
    const p = primaryTrainingForSoldier(r.normalSoldierId);
    const primary = p.candidates.length === 1 ? p.candidates[0] : null;
    return {
      normalSoldierId:r.normalSoldierId,
      spSoldierId:r.spSoldierId,
      spAbility: primary ? {
        techId: primary.techId,
        levels: primary.levels.map((x,i)=>({
          sequenceLevel:i+1,
          levelInfoId:x.levelInfoId,
          soldierSkillLevel:x.soldierSkillLevel,
          spDescription:x.spDescription,
        })),
      } : null,
      firstStage:{
        awakenLevelId:r.firstStageAwakenLevelId,
        awakenMaterials:stableGoods(r.firstStageAwakenMaterials),
        missions:r.firstStageMissionIds.map(recomputedMission),
      },
      secondStageUnlock:r.secondStageUnlock,
      secondStage:r.secondStageUnlock ? {
        awakenLevelId:r.secondStageAwakenLevelId,
        awakenMaterials:stableGoods(r.secondStageAwakenMaterials),
        missions:r.secondStageMissionIds.map(recomputedMission),
        expandHeroIds:uniqueSorted(r.secondStageExpandHeroIds),
      } : null,
    };
  });
}

function semanticFromStage3(doc) {
  const profiles = new Map((doc.trainingProfiles ?? []).map(x=>[x.soldierId,x]));
  return [...(doc.spRelations ?? [])].sort((a,b)=>a.spSoldierId-b.spSoldierId).map(r => {
    const p = profiles.get(r.normalSoldierId);
    const tech = p?.linkedTechs?.find(x=>x.techId===p.primaryTenLevelTechId) ?? null;
    return {
      normalSoldierId:r.normalSoldierId,
      spSoldierId:r.spSoldierId,
      spAbility: tech ? {
        techId:tech.techId,
        levels:tech.levels.map(x=>({
          sequenceLevel:x.sequenceLevel,
          levelInfoId:x.levelInfoId,
          soldierSkillLevel:x.soldierSkillLevel,
          spDescription:x.spDescription,
        })),
      } : null,
      firstStage:{
        awakenLevelId:r.firstStage?.awakenLevelId ?? null,
        awakenMaterials:stableGoods(r.firstStage?.awakenMaterials ?? []),
        missions:(r.firstStage?.missions ?? []).map(canonicalMission),
      },
      secondStageUnlock:Boolean(r.secondStageUnlock),
      secondStage:r.secondStageUnlock ? {
        awakenLevelId:r.secondStage?.awakenLevelId ?? null,
        awakenMaterials:stableGoods(r.secondStage?.awakenMaterials ?? []),
        missions:(r.secondStage?.missions ?? []).map(canonicalMission),
        expandHeroIds:uniqueSorted(r.secondStage?.expandHeroIds ?? []),
      } : null,
    };
  });
}

const baselineSemantic = semanticFromStage3(baseline);
const currentSemantic = semanticFromStage3(current);
const recomputed = recomputedSemantic();
const baselineMap = new Map(baselineSemantic.map(x=>[x.spSoldierId,x]));
const currentMap = new Map(currentSemantic.map(x=>[x.spSoldierId,x]));

const missionTypes = new Map();
let missingNormalSoldier=0, missingSpSoldier=0, stage1MissionCountMismatch=0, stage2MissionCountMismatch=0;
let falseWithStage2Data=0, missingMissionRefs=0, missingSubmitBundles=0, missingExpandHeroIds=0;
let primaryTrainingMissing=0, primaryTrainingMultiple=0, spDescriptionMissing=0;
let spDescriptionLevelRecords=0, firstStageAwakenMaterialEntries=0, secondStageAwakenMaterialEntries=0, expandedHeroEdges=0;
const submitBundleIds = new Set();

for (const r of spRows) {
  if (!soldierById.has(r.normalSoldierId)) missingNormalSoldier++;
  if (!soldierById.has(r.spSoldierId)) missingSpSoldier++;
  if (r.firstStageMissionIds.length !== 2) stage1MissionCountMismatch++;
  if (r.secondStageUnlock && r.secondStageMissionIds.length !== 1) stage2MissionCountMismatch++;
  if (!r.secondStageUnlock && (r.secondStageMissionIds.length || r.secondStageExpandHeroIds.length || r.secondStageAwakenMaterials.length || r.secondStageAwakenLevelId)) falseWithStage2Data++;

  firstStageAwakenMaterialEntries += r.firstStageAwakenMaterials.length;
  secondStageAwakenMaterialEntries += r.secondStageAwakenMaterials.length;
  expandedHeroEdges += r.secondStageExpandHeroIds.length;
  for (const hid of r.secondStageExpandHeroIds) if (!heroIds.has(hid)) missingExpandHeroIds++;

  for (const mid of [...r.firstStageMissionIds, ...r.secondStageMissionIds]) {
    const m = missionById.get(mid);
    if (!m) { missingMissionRefs++; continue; }
    missionTypes.set(m.missionType, (missionTypes.get(m.missionType) ?? 0) + 1);
    if (m.missionType === 73) {
      submitBundleIds.add(m.param1);
      if (!submitById.has(m.param1)) missingSubmitBundles++;
    }
  }

  const p = primaryTrainingForSoldier(r.normalSoldierId);
  if (p.candidates.length === 0) primaryTrainingMissing++;
  if (p.candidates.length > 1) primaryTrainingMultiple++;
  if (p.candidates.length === 1) {
    const nonEmpty = p.candidates[0].levels.filter(x=>Boolean(x.spDescription)).length;
    spDescriptionLevelRecords += nonEmpty;
    if (nonEmpty === 0) spDescriptionMissing++;
  }
}

const secondStageTrue = spRows.filter(x=>x.secondStageUnlock).length;
const secondStageFalse = spRows.length - secondStageTrue;
const expectedMissionTypes = {73:56,123:56,124:45};
let missionTypeCountMismatch = 0;
for (const [k,v] of Object.entries(expectedMissionTypes)) if ((missionTypes.get(Number(k)) ?? 0) !== v) missionTypeCountMismatch++;
for (const [k,v] of missionTypes.entries()) if (!(String(k) in expectedMissionTypes) && v) missionTypeCountMismatch++;

let baselineRelationMissing=0, currentRelationMissing=0;
for (const r of spRows) {
  if (!baselineMap.has(r.spSoldierId)) baselineRelationMissing++;
  if (!currentMap.has(r.spSoldierId)) currentRelationMissing++;
}

const checks = {
  spCountMismatch: spRows.length === 56 ? 0 : 1,
  secondStageSplitMismatch: secondStageTrue === 45 && secondStageFalse === 11 ? 0 : 1,
  duplicateSpIds: duplicates(spRows.map(x=>x.spSoldierId)).length,
  duplicateSpNormalIds: duplicates(spRows.map(x=>x.normalSoldierId)).length,
  missingNormalSoldier,
  missingSpSoldier,
  stage1MissionCountMismatch,
  stage2MissionCountMismatch,
  falseWithStage2Data,
  missingMissionRefs,
  missingSubmitBundles,
  missionTypeCountMismatch,
  missingExpandHeroIds,
  primaryTrainingMissing,
  primaryTrainingMultiple,
  spDescriptionMissing,
  baselineRelationMissing,
  currentRelationMissing,
  baselineSemanticMismatch: sha256(baselineSemantic) === sha256(recomputed) ? 0 : 1,
  currentSemanticMismatch: sha256(currentSemantic) === sha256(recomputed) ? 0 : 1,
  baselineVsCurrentMismatch: sha256(baselineSemantic) === sha256(currentSemantic) ? 0 : 1,
  stage3SpCheckRegression: 0,
};

const stage3Counts = stage3Validation.counts ?? {};
const stage3Checks = stage3Validation.checks ?? {};
if (stage3Counts.spSoldierRecords !== 56 || stage3Counts.secondStageTrue !== 45 || stage3Counts.secondStageFalse !== 11) checks.stage3SpCheckRegression++;
if (JSON.stringify(stage3Counts.spMissionTypes ?? {}) !== JSON.stringify(expectedMissionTypes)) checks.stage3SpCheckRegression++;
for (const key of ['duplicateSpIds','duplicateSpNormalIds','missingNormalSoldier','missingSpSoldier','missingMissionRefs','missingSubmitBundles','stage1MissionCountMismatch','stage2MissionCountMismatch','falseWithStage2Data','missingExpandHeroIds']) {
  if ((stage3Checks[key] ?? 0) !== 0) checks.stage3SpCheckRegression++;
}
if ((stage3Counts.spNormalsWithoutSpDescription ?? 0) !== 0) checks.stage3SpCheckRegression++;

const errors = Object.entries(checks).filter(([,v])=>v!==0).map(([k,v])=>`${k}: ${v}`);
const output = {
  version:1,
  stage:'soldier-page-4-4',
  status:errors.length ? 'FAIL' : 'PASS',
  purpose:'Regress SP Soldier structure, SP ability text, stage missions/materials and SecondStageUnlock semantics after UnityDataTool direct-JSON migration without creating canonical Hero-Soldier membership.',
  baseline:{
    commit:'c2276d1162dae52a1762e6381e7dd195c917da2f',
    artifact:'data/generated/soldier-stage3.v1.json',
    role:'pre-4-1 SP semantic regression reference',
  },
  inputs:{
    spSoldier:'data/configdata/ConfigDataSPSoldierInfo.json',
    soldier:'data/configdata/ConfigDataSoldierInfo.json',
    trainingTech:'data/configdata/ConfigDataTrainingTechInfo.json',
    trainingLevel:'data/configdata/ConfigDataTrainingTechLevelInfo.json',
    mission:'data/configdata/ConfigDataMissionInfo.json',
    missionSubmit:'data/configdata/ConfigDataMissionSumitItemInfo.json',
    heroMaster:'data/hero-name-master.v1.json',
    currentStage3:'data/generated/soldier-stage3.v1.json',
    stage3Validation:'data/validation/soldier-stage3-final.v1.json',
  },
  hashes:{
    spSoldierBlobSha:gitBlobSha(configPath('ConfigDataSPSoldierInfo')),
    trainingLevelBlobSha:gitBlobSha(configPath('ConfigDataTrainingTechLevelInfo')),
    missionBlobSha:gitBlobSha(configPath('ConfigDataMissionInfo')),
    missionSubmitBlobSha:gitBlobSha(configPath('ConfigDataMissionSumitItemInfo')),
    baselineSpSemanticSha256:sha256(baselineSemantic),
    currentSpSemanticSha256:sha256(currentSemantic),
    recomputedSpSemanticSha256:sha256(recomputed),
  },
  counts:{
    spSoldierRecords:spRows.length,
    secondStageTrue,
    secondStageFalse,
    missionTypes:Object.fromEntries([...missionTypes.entries()].sort((a,b)=>a[0]-b[0])),
    uniqueSubmitBundlesReferenced:submitBundleIds.size,
    spDescriptionLevelRecords,
    firstStageAwakenMaterialEntries,
    secondStageAwakenMaterialEntries,
    expandedHeroEdges,
  },
  checks,
  policy:{
    spRelation:'ConfigDataSPSoldierInfo.NormalSoliderId <-> ID only; no arithmetic inference.',
    spAbility:'Use TrainingTechLevelInfo.SpSoidlierDescription from the Normal Soldier unique SoldierSkillLevelup 1..10 TrainingTech path.',
    stage1:'FisrtStageMissionList is authoritative for stage 1; MissionType 73 joins MissionInfo.Param1 -> MissionSumitItemInfo.ID.',
    stage2:'SecondStageUnlock is authoritative. Only true records expose second-stage mission/material/expanded-Hero semantics.',
    expandHeroes:'SecondStageExpandHeroList is validated as source structure only here; canonical Hero-Soldier membership remains owned by the shared Relation Layer after A-9.',
  },
  errors,
  completion:errors.length ? 'Stage 4-4 SP regression failed.' : 'All 56 SP Soldier structures reproduce the pre-4-1 semantics from current direct JSON with intact SP descriptions, missions, awaken materials, 45/11 stage branching and expanded-Hero source lists.',
};
fs.writeFileSync(OUT, JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
if (errors.length) process.exit(1);
