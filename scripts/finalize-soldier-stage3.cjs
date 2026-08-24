const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = name => path.join(ROOT, 'data/configdata', `${name}.json`);
const SOLDIER_PATH = P('ConfigDataSoldierInfo');
const SP_SOLDIER_PATH = P('ConfigDataSPSoldierInfo');
const TRAINING_PATH = P('ConfigDataTrainingTechInfo');
const TRAINING_LEVEL_PATH = P('ConfigDataTrainingTechLevelInfo');
const MISSION_PATH = P('ConfigDataMissionInfo');
const MISSION_SUBMIT_PATH = P('ConfigDataMissionSumitItemInfo');
const SP_HERO_PATH = P('ConfigDataSPHeroInfo');
const SOLDIER_MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const HERO_MASTER_PATH = path.join(ROOT, 'data/hero-name-master.v1.json');
const OUT_DATA = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const OUT_VALIDATION = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function rel(p) { return p.replace(ROOT + path.sep, '').replaceAll('\\', '/'); }
function requirePayload(p, expectedName) {
  const o = readJson(p);
  if (o.m_Name !== expectedName) throw new Error(`${expectedName}: m_Name mismatch (${o.m_Name})`);
  if (!Array.isArray(o.m_bytes) || o.m_bytes.length === 0) throw new Error(`${expectedName}: missing m_bytes`);
  if (o.m_size !== o.m_bytes.length) throw new Error(`${expectedName}: m_size ${o.m_size} != bytes ${o.m_bytes.length}`);
  return Buffer.from(o.m_bytes);
}
function splitFrames(buf) {
  const out = []; let off = 0;
  while (off < buf.length) {
    if (off + 4 > buf.length) throw new Error(`truncated frame header at ${off}`);
    const n = buf.readUInt32BE(off); off += 4;
    if (off + n > buf.length) throw new Error(`bad frame length ${n} at ${off - 4}`);
    out.push(buf.subarray(off, off + n)); off += n;
  }
  return out;
}
function readVarint(buf, pos) {
  let val = 0n, shift = 0n, i = pos;
  while (i < buf.length) {
    const b = BigInt(buf[i++]); val |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) return [Number(val), i];
    shift += 7n; if (shift > 70n) throw new Error('varint too long');
  }
  throw new Error('truncated varint');
}
function parseMessage(buf) {
  const fields = new Map(); let pos = 0;
  const add = (n, v) => { if (!fields.has(n)) fields.set(n, []); fields.get(n).push(v); };
  while (pos < buf.length) {
    let key; [key, pos] = readVarint(buf, pos);
    const field = key >>> 3, wire = key & 7;
    if (wire === 0) { let v; [v, pos] = readVarint(buf, pos); add(field, { wire, v }); }
    else if (wire === 1) { if (pos + 8 > buf.length) throw new Error('truncated fixed64'); add(field, {wire, v:buf.subarray(pos,pos+8)}); pos += 8; }
    else if (wire === 2) { let n; [n, pos] = readVarint(buf, pos); if (pos + n > buf.length) throw new Error('truncated bytes'); add(field, {wire, v:buf.subarray(pos,pos+n)}); pos += n; }
    else if (wire === 5) { if (pos + 4 > buf.length) throw new Error('truncated fixed32'); add(field, {wire, v:buf.subarray(pos,pos+4)}); pos += 4; }
    else throw new Error(`unsupported wire ${wire}`);
  }
  return fields;
}
function firstVarint(f, n, d=0) { return f.get(n)?.find(x => x.wire === 0)?.v ?? d; }
function firstString(f, n, d='') { const x=f.get(n)?.find(x=>x.wire===2); return x ? x.v.toString('utf8') : d; }
function repeatedVarints(f, n) {
  const out = [];
  for (const x of f.get(n) ?? []) {
    if (x.wire === 0) out.push(x.v);
    else if (x.wire === 2) {
      let p = 0;
      while (p < x.v.length) { let v; [v, p] = readVarint(x.v, p); out.push(v); }
    }
  }
  return out;
}
function repeatedMessages(f, n) { return (f.get(n) ?? []).filter(x=>x.wire===2).map(x=>parseMessage(x.v)); }
function uniqueSorted(xs) { return [...new Set(xs)].sort((a,b)=>a-b); }
function duplicates(xs) { const s=new Set(), d=new Set(); for (const x of xs) s.has(x)?d.add(x):s.add(x); return [...d]; }
function decodeGoodsMessage(f) {
  // Goods protobuf is observed as field1=GoodsType, field2=ItemID, field3=Count.
  return { goodsType:firstVarint(f,1), itemId:firstVarint(f,2), count:firstVarint(f,3) };
}
function decodeGoodsList(f, n) { return repeatedMessages(f,n).map(decodeGoodsMessage); }
function sumGoods(levels, limit) {
  const picked = levels.slice(0, limit);
  const byKey = new Map(); let gold = 0;
  for (const l of picked) {
    gold += l.gold;
    for (const g of l.materials) {
      const k = `${g.goodsType}:${g.itemId}`;
      const prev = byKey.get(k) ?? {goodsType:g.goodsType,itemId:g.itemId,count:0};
      prev.count += g.count; byKey.set(k, prev);
    }
  }
  return {levelsIncluded:picked.length,gold,materials:[...byKey.values()].sort((a,b)=>a.goodsType-b.goodsType||a.itemId-b.itemId)};
}
function missionTypeName(t) {
  if (t === 73) return 'SUBMIT_ITEMS';
  if (t === 123) return 'USABLE_HERO_LEVEL';
  if (t === 124) return 'EXPANDED_HERO_BOND';
  return 'OTHER';
}

const errors = [], reviews = [];
const payloads = {
  soldier: requirePayload(SOLDIER_PATH, 'ConfigDataSoldierInfo'),
  spSoldier: requirePayload(SP_SOLDIER_PATH, 'ConfigDataSPSoldierInfo'),
  training: requirePayload(TRAINING_PATH, 'ConfigDataTrainingTechInfo'),
  trainingLevel: requirePayload(TRAINING_LEVEL_PATH, 'ConfigDataTrainingTechLevelInfo'),
  mission: requirePayload(MISSION_PATH, 'ConfigDataMissionInfo'),
  missionSubmit: requirePayload(MISSION_SUBMIT_PATH, 'ConfigDataMissionSumitItemInfo'),
  spHero: requirePayload(SP_HERO_PATH, 'ConfigDataSPHeroInfo')
};

const soldierMaster = readJson(SOLDIER_MASTER_PATH).records;
const heroMaster = readJson(HERO_MASTER_PATH).records;
const heroIds = new Set(heroMaster.map(x=>x.heroId));
const masterById = new Map(soldierMaster.map(x=>[x.soldierId,x]));
const displayIds = new Set(masterById.keys());
const normalMaster = soldierMaster.filter(x=>!x.isSp);
const spMaster = soldierMaster.filter(x=>x.isSp);

const soldiers = splitFrames(payloads.soldier).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex,
  soldierId:firstVarint(f,2), nameCn:firstString(f,3), skills:repeatedVarints(f,14), armyId:firstVarint(f,16),
  isMelee:Boolean(firstVarint(f,17)), moveType:firstVarint(f,18), attackRange:firstVarint(f,19),
  attackSpeedIni:firstVarint(f,22), moveSpeedIni:firstVarint(f,23), hpIni:firstVarint(f,24), atkIni:firstVarint(f,25), defIni:firstVarint(f,26), mdefIni:firstVarint(f,27),
  hpUp:firstVarint(f,28), atkUp:firstVarint(f,29), defUp:firstVarint(f,30), mdefUp:firstVarint(f,31), criticalDamage:firstVarint(f,32), criticalRate:firstVarint(f,33), movePoint:firstVarint(f,34),
  tier:firstVarint(f,53), isEnemy:Boolean(firstVarint(f,54)), baseHeroIds:repeatedVarints(f,56), getSoldierTechId:firstVarint(f,57), useable:Boolean(firstVarint(f,59))
};});
const soldierById = new Map(soldiers.map(x=>[x.soldierId,x]));

const spSoldiers = splitFrames(payloads.spSoldier).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex, spSoldierId:firstVarint(f,2), normalSoldierId:firstVarint(f,3),
  firstStageMissionIds:repeatedVarints(f,4), firstStageAwakenMaterials:decodeGoodsList(f,5), firstStageAwakenLevelId:firstVarint(f,6),
  secondStageUnlock:Boolean(firstVarint(f,7)), secondStageMissionIds:repeatedVarints(f,8), secondStageAwakenMaterials:decodeGoodsList(f,9), secondStageAwakenLevelId:firstVarint(f,10),
  secondStageExpandHeroIds:repeatedVarints(f,11), useable:Boolean(firstVarint(f,12,1))
};});
const spByNormal = new Map(spSoldiers.map(x=>[x.normalSoldierId,x]));
const spById = new Map(spSoldiers.map(x=>[x.spSoldierId,x]));

const trainings = splitFrames(payloads.training).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex, techId:firstVarint(f,2), name:firstString(f,3), preTechIds:repeatedVarints(f,5), preTechLevels:repeatedVarints(f,6), roomLevelRequired:firstVarint(f,7),
  soldierIds:repeatedVarints(f,8), armyIds:repeatedVarints(f,9), isSummon:Boolean(firstVarint(f,10)), techType:firstVarint(f,11), levelInfoIds:repeatedVarints(f,12), isLocked:Boolean(firstVarint(f,13))
};});
const trainingLevels = splitFrames(payloads.trainingLevel).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex, levelInfoId:firstVarint(f,2), description:firstString(f,4), spDescription:firstString(f,5), preTechId:firstVarint(f,6), gold:firstVarint(f,7), materials:decodeGoodsList(f,8),
  roomExp:firstVarint(f,9), soldierIdUnlocked:firstVarint(f,10), soldierSkillLevel:firstVarint(f,11), soldierSkillId:firstVarint(f,12)
};});
const trainingLevelById = new Map(trainingLevels.map(x=>[x.levelInfoId,x]));
const trainingBySoldier = new Map();
for (const t of trainings) for (const sid of t.soldierIds) { if(!trainingBySoldier.has(sid)) trainingBySoldier.set(sid,[]); trainingBySoldier.get(sid).push(t); }

const missions = splitFrames(payloads.mission).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex, missionId:firstVarint(f,2), title:firstString(f,3), desc:firstString(f,4), missionType:firstVarint(f,7),
  param1:firstVarint(f,8), param2:firstVarint(f,9), param3:firstVarint(f,10), param4:firstVarint(f,11), param5:repeatedVarints(f,12), param6:repeatedVarints(f,13)
};});
const missionById = new Map(missions.map(x=>[x.missionId,x]));
const submitBundles = splitFrames(payloads.missionSubmit).map((b,sourceIndex)=>{const f=parseMessage(b);return {sourceIndex,bundleId:firstVarint(f,2),items:decodeGoodsList(f,3)};});
const submitById = new Map(submitBundles.map(x=>[x.bundleId,x]));

const spHeroes = splitFrames(payloads.spHero).map((b,sourceIndex)=>{const f=parseMessage(b);return {
  sourceIndex, spHeroInfoId:firstVarint(f,2), nameCn:firstString(f,3), heroId:firstVarint(f,6), rewardSoldierIds:repeatedVarints(f,25)
};});
const spHeroAddedBySoldier = new Map();
for (const h of spHeroes) for (const sid of h.rewardSoldierIds) { if(!spHeroAddedBySoldier.has(sid)) spHeroAddedBySoldier.set(sid,[]); spHeroAddedBySoldier.get(sid).push(h.heroId); }

function decodeMission(id) {
  const m = missionById.get(id);
  if (!m) return {missionId:id,missing:true};
  const out = {...m, typeName:missionTypeName(m.missionType)};
  if (m.missionType === 73) {
    out.submitBundleId = m.param1;
    out.submitItems = submitById.get(m.param1)?.items ?? null;
  }
  return out;
}

// Structural source/master validation.
const duplicateSoldierIds = duplicates(soldiers.map(x=>x.soldierId));
if (duplicateSoldierIds.length) errors.push(`duplicate SoldierInfo IDs: ${duplicateSoldierIds.join(',')}`);
for (const m of soldierMaster) if (!soldierById.has(m.soldierId)) errors.push(`soldier master ID ${m.soldierId} missing SoldierInfo`);
for (const s of soldiers.filter(x=>x.useable&&!x.isEnemy)) if (!displayIds.has(s.soldierId)) errors.push(`displayable SoldierInfo ${s.soldierId} missing stage2 master`);

// 3-1 + 3-5 + 3-6 per-soldier data.
const records = soldierMaster.map(m=>{
  const s = soldierById.get(m.soldierId);
  const rel = m.isSp ? spById.get(m.soldierId) : spByNormal.get(m.soldierId);
  const baseSourceId = m.isSp && rel ? rel.normalSoldierId : m.soldierId;
  const baseSource = soldierById.get(baseSourceId);
  const rawBase = s?.baseHeroIds ?? [];
  const inheritedBase = baseSource?.baseHeroIds ?? [];
  const spHeroAdded = uniqueSorted(spHeroAddedBySoldier.get(m.soldierId) ?? []);
  return {
    soldierId:m.soldierId,
    stats:{hp:s.hpIni,atk:s.atkIni,def:s.defIni,mdef:s.mdefIni,move:s.movePoint,range:s.attackRange},
    combat:{armyId:s.armyId,tier:s.tier,isMelee:s.isMelee,moveType:s.moveType},
    raw:{attackSpeedIni:s.attackSpeedIni,moveSpeedIni:s.moveSpeedIni,hpUp:s.hpUp,atkUp:s.atkUp,defUp:s.defUp,mdefUp:s.mdefUp,criticalRate:s.criticalRate,criticalDamage:s.criticalDamage,skills:s.skills,getSoldierTechId:s.getSoldierTechId},
    heroes:{rawGetSoldierHeroIds:uniqueSorted(rawBase),baseHeroSourceSoldierId:baseSourceId,baseHeroIds:uniqueSorted(inheritedBase),spHeroAddedHeroIds:spHeroAdded},
    spRelation:rel?{normalSoldierId:rel.normalSoldierId,spSoldierId:rel.spSoldierId}:null
  };
});

// 3-2 + 3-3 + 3-4 + 3-8 training profiles for normal soldiers.
const trainingProfiles = normalMaster.map(m=>{
  const s = soldierById.get(m.soldierId);
  const linked = (trainingBySoldier.get(m.soldierId) ?? []).map(t=>{
    const levels = t.levelInfoIds.map((id,index)=>{
      const x=trainingLevelById.get(id);
      if(!x) return {sequenceLevel:index+1,levelInfoId:id,missing:true};
      return {sequenceLevel:index+1,levelInfoId:id,description:x.description,spDescription:x.spDescription,gold:x.gold,materials:x.materials,roomExp:x.roomExp,soldierIdUnlocked:x.soldierIdUnlocked,soldierSkillLevel:x.soldierSkillLevel,soldierSkillId:x.soldierSkillId};
    });
    return {techId:t.techId,name:t.name,techType:t.techType,armyIds:t.armyIds,roomLevelRequired:t.roomLevelRequired,preTechIds:t.preTechIds,preTechLevels:t.preTechLevels,isSummon:t.isSummon,isLocked:t.isLocked,getSoldierTechIdMatch:s.getSoldierTechId===t.techId,levelInfoIds:t.levelInfoIds,levels,costToLevel5:sumGoods(levels.filter(x=>!x.missing),5),costToLevel10:sumGoods(levels.filter(x=>!x.missing),10)};
  });
  const tenLevel = linked.filter(x=>x.levelInfoIds.length===10 && x.levels.every(y=>!y.missing));
  return {soldierId:m.soldierId,getSoldierTechId:s.getSoldierTechId,linkedTechs:linked,primaryTenLevelTechId:tenLevel.length===1?tenLevel[0].techId:null,tenLevelTechIds:tenLevel.map(x=>x.techId)};
});

// 3-7 + 3-9 + 3-10 + 3-11 SP soldier data.
const spRelations = spSoldiers.map(r=>{
  const normal = soldierById.get(r.normalSoldierId);
  const sp = soldierById.get(r.spSoldierId);
  return {
    normalSoldierId:r.normalSoldierId,spSoldierId:r.spSoldierId,
    statDelta:(normal&&sp)?{hp:sp.hpIni-normal.hpIni,atk:sp.atkIni-normal.atkIni,def:sp.defIni-normal.defIni,mdef:sp.mdefIni-normal.mdefIni,move:sp.movePoint-normal.movePoint,range:sp.attackRange-normal.attackRange}:null,
    firstStage:{awakenLevelId:r.firstStageAwakenLevelId,awakenMaterials:r.firstStageAwakenMaterials,missions:r.firstStageMissionIds.map(decodeMission)},
    secondStageUnlock:r.secondStageUnlock,
    secondStage:r.secondStageUnlock?{awakenLevelId:r.secondStageAwakenLevelId,awakenMaterials:r.secondStageAwakenMaterials,missions:r.secondStageMissionIds.map(decodeMission),expandHeroIds:uniqueSorted(r.secondStageExpandHeroIds)}:null,
    rawSecondStage:{missionIds:r.secondStageMissionIds,expandHeroIds:r.secondStageExpandHeroIds}
  };
});

// Validation for 3-2/3-3/3-4/3-8.
let missingTrainingLevelRefs=0, tier3WithoutTraining=0, tier3WithoutTenLevel=0, tier3MultipleTenLevel=0, spNormalWithoutSpText=0;
for (const p of trainingProfiles) {
  for (const t of p.linkedTechs) for (const l of t.levels) if (l.missing) missingTrainingLevelRefs++;
  const m=masterById.get(p.soldierId);
  if (m?.tier===3) {
    if (!p.linkedTechs.length) { tier3WithoutTraining++; errors.push(`tier3 soldier ${p.soldierId} has no TrainingTech SoldierIDRelated link`); }
    if (!p.tenLevelTechIds.length) { tier3WithoutTenLevel++; reviews.push(`tier3 soldier ${p.soldierId} has no unique 10-level TrainingTech path`); }
    if (p.tenLevelTechIds.length>1) { tier3MultipleTenLevel++; reviews.push(`tier3 soldier ${p.soldierId} has multiple 10-level TrainingTech paths: ${p.tenLevelTechIds.join(',')}`); }
  }
  if (spByNormal.has(p.soldierId) && p.primaryTenLevelTechId) {
    const t=p.linkedTechs.find(x=>x.techId===p.primaryTenLevelTechId);
    if (t && !t.levels.some(x=>x.spDescription)) { spNormalWithoutSpText++; reviews.push(`SP normal soldier ${p.soldierId} has no SP description on primary 10-level path`); }
  }
}
if (missingTrainingLevelRefs) errors.push(`${missingTrainingLevelRefs} TrainingTech level references are missing`);

// Validate hero/soldier edges for 3-5/3-6/3-11.
let missingBaseHeroIds=0, missingSpHeroIds=0, missingRewardSoldiers=0, missingExpandHeroIds=0;
for (const r of records) for (const hid of r.heroes.baseHeroIds) if(!heroIds.has(hid)){missingBaseHeroIds++; reviews.push(`soldier ${r.soldierId} base hero ${hid} missing hero master`);}
for (const h of spHeroes) {
  if (h.rewardSoldierIds.length && !heroIds.has(h.heroId)) { missingSpHeroIds++; reviews.push(`SPHeroInfo ${h.spHeroInfoId} hero ${h.heroId} missing hero master`); }
  for (const sid of h.rewardSoldierIds) if(!displayIds.has(sid)){missingRewardSoldiers++; reviews.push(`SP hero ${h.heroId} reward soldier ${sid} missing displayable soldier master`);}
}
for (const r of spSoldiers) for(const hid of r.secondStageExpandHeroIds) if(!heroIds.has(hid)){missingExpandHeroIds++; reviews.push(`SP soldier ${r.spSoldierId} expanded hero ${hid} missing hero master`);}

// Validate SP relations/missions and current snapshot structure.
const duplicateSpIds=duplicates(spSoldiers.map(x=>x.spSoldierId));
const duplicateSpNormals=duplicates(spSoldiers.map(x=>x.normalSoldierId));
if(duplicateSpIds.length) errors.push(`duplicate SPSoldierInfo IDs: ${duplicateSpIds.join(',')}`);
if(duplicateSpNormals.length) errors.push(`normal soldiers with multiple SPSoldierInfo rows: ${duplicateSpNormals.join(',')}`);
let missingNormalSoldier=0, missingSpSoldier=0, missingMissionRefs=0, missingSubmitBundles=0, stage1MissionCountMismatch=0, stage2MissionCountMismatch=0, falseWithStage2Data=0;
const spMissionTypes=new Map();
for(const r of spSoldiers){
  if(!soldierById.has(r.normalSoldierId)){missingNormalSoldier++; errors.push(`SP relation normal soldier missing ${r.normalSoldierId}`);}
  if(!soldierById.has(r.spSoldierId)){missingSpSoldier++; errors.push(`SP relation SP soldier missing ${r.spSoldierId}`);}
  if(r.firstStageMissionIds.length!==2){stage1MissionCountMismatch++; reviews.push(`SP soldier ${r.spSoldierId} stage1 mission count ${r.firstStageMissionIds.length}`);}
  if(r.secondStageUnlock && r.secondStageMissionIds.length!==1){stage2MissionCountMismatch++; reviews.push(`SP soldier ${r.spSoldierId} stage2 mission count ${r.secondStageMissionIds.length}`);}
  if(!r.secondStageUnlock && (r.secondStageMissionIds.length||r.secondStageExpandHeroIds.length||r.secondStageAwakenMaterials.length)){falseWithStage2Data++; reviews.push(`SP soldier ${r.spSoldierId} has stage2 data while SecondStageUnlock=false`);}
  for(const mid of [...r.firstStageMissionIds,...r.secondStageMissionIds]){
    const m=missionById.get(mid); if(!m){missingMissionRefs++; errors.push(`SP soldier ${r.spSoldierId} mission ${mid} missing MissionInfo`);continue;}
    spMissionTypes.set(m.missionType,(spMissionTypes.get(m.missionType)||0)+1);
    if(m.missionType===73 && !submitById.has(m.param1)){missingSubmitBundles++; errors.push(`mission ${mid} submit bundle ${m.param1} missing MissionSumitItemInfo`);}
  }
}

const secondStageTrue=spSoldiers.filter(x=>x.secondStageUnlock).length;
const secondStageFalse=spSoldiers.length-secondStageTrue;
if(spSoldiers.length!==56) reviews.push(`SPSoldierInfo count changed from validated snapshot 56 to ${spSoldiers.length}`);
if(secondStageTrue!==45||secondStageFalse!==11) reviews.push(`SP stage split changed from validated snapshot 45/11 to ${secondStageTrue}/${secondStageFalse}`);

const output={
  version:1,stage:'3-1~3-11',status:'PENDING_VALIDATION',generatedAt:new Date().toISOString(),
  sources:{soldier:rel(SOLDIER_PATH),spSoldier:rel(SP_SOLDIER_PATH),training:rel(TRAINING_PATH),trainingLevel:rel(TRAINING_LEVEL_PATH),mission:rel(MISSION_PATH),missionSubmit:rel(MISSION_SUBMIT_PATH),spHero:rel(SP_HERO_PATH),soldierMaster:rel(SOLDIER_MASTER_PATH),heroMaster:rel(HERO_MASTER_PATH)},
  records,trainingProfiles,spRelations,spHeroRewards:spHeroes.filter(x=>x.rewardSoldierIds.length).map(x=>({spHeroInfoId:x.spHeroInfoId,heroId:x.heroId,nameCn:x.nameCn,rewardSoldierIds:uniqueSorted(x.rewardSoldierIds)}))
};

const summary={
  version:1,stage:'3-1~3-11',status:errors.length?'FAIL':(reviews.length?'PASS_WITH_REVIEW':'PASS'),generatedAt:new Date().toISOString(),sources:output.sources,
  counts:{
    sourceSoldiers:soldiers.length,displayableSoldiers:soldierMaster.length,normalDisplayable:normalMaster.length,spDisplayable:spMaster.length,
    trainingTechRecords:trainings.length,trainingLevelRecords:trainingLevels.length,missionRecords:missions.length,missionSubmitBundles:submitBundles.length,spSoldierRecords:spSoldiers.length,spHeroRecords:spHeroes.length,
    tier3Normal:normalMaster.filter(x=>x.tier===3).length,tier3WithoutTraining,tier3WithoutTenLevel,tier3MultipleTenLevel,spNormalsWithoutSpDescription:spNormalWithoutSpText,
    baseHeroEdges:records.reduce((n,x)=>n+x.heroes.baseHeroIds.length,0),spHeroRewardEdges:spHeroes.reduce((n,x)=>n+x.rewardSoldierIds.length,0),spExpandHeroEdges:spSoldiers.reduce((n,x)=>n+x.secondStageExpandHeroIds.length,0),
    secondStageTrue,secondStageFalse,spMissionTypes:Object.fromEntries([...spMissionTypes.entries()].sort((a,b)=>a[0]-b[0]))
  },
  checks:{duplicateSoldierIds:duplicateSoldierIds.length,missingTrainingLevelRefs,missingBaseHeroIds,missingSpHeroIds,missingRewardSoldiers,missingExpandHeroIds,duplicateSpIds:duplicateSpIds.length,duplicateSpNormalIds:duplicateSpNormals.length,missingNormalSoldier,missingSpSoldier,missingMissionRefs,missingSubmitBundles,stage1MissionCountMismatch,stage2MissionCountMismatch,falseWithStage2Data},
  corrections:[
    '3-2 level numbering: ConfigDataTrainingTechLevelInfo has no dedicated tech-level-number field; sequence follows TrainingTechInfo.TechLevelupInfoList order. SoldierSkillLevelup is preserved as an independent skill-level field for validation.',
    '3-3 cardinality: SoldierIDRelated is repeated. All direct links are preserved; a primary 10-level path is selected only when exactly one linked tech has exactly 10 valid level references.',
    '3-5/3-6/3-11 remain separate directed edge sources; stage 3 does not synthesize the final Hero<->Soldier union reserved for 3-12.'
  ],
  policy:{
    stats:'3-1 uses SoldierInfo *_INI, BF_MovePoint and BF_AttackDistance; *_UP and IsMelee are preserved but not substituted.',
    normalAbility:'3-2 uses TrainingTechLevelInfo.Description in TechLevelupInfoList sequence.',
    trainingJoin:'3-3 reverse-joins TrainingTechInfo.SoldierIDRelated; GetSoldierTechId is validation metadata only.',
    costs:'3-4 preserves per-level LevelupGoldCost/LevelupMaterialsCost and derives Lv5/Lv10 sums per linked tech.',
    baseHeroes:'3-5 uses Normal SoldierInfo.GetSoldierHeros_ID; SP Soldier inherits its Normal base list.',
    spHeroSoldiers:'3-6 uses SPHeroInfo.SecondStageRewardSoldiers and reverse-indexes it by Soldier ID.',
    spRelation:'3-7 uses SPSoldierInfo.NormalSoliderId <-> ID; no +5000 arithmetic inference.',
    spAbility:'3-8 uses TrainingTechLevelInfo.SpSoidlierDescription directly.',
    spStage1:'3-9 uses SPSoldierInfo.FisrtStageMissionList -> MissionInfo; type 73 joins Param1 -> MissionSumitItemInfo.ID.',
    spStage2:'3-10 uses SecondStageUnlock as authoritative branch.',
    spExpandHeroes:'3-11 uses SecondStageExpandHeroList only as newly expanded heroes, not the full hero list.'
  },
  errors,reviews
};
output.status=summary.status;
fs.mkdirSync(path.dirname(OUT_DATA),{recursive:true}); fs.mkdirSync(path.dirname(OUT_VALIDATION),{recursive:true});
fs.writeFileSync(OUT_DATA,JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(OUT_VALIDATION,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(errors.length) process.exit(1);
