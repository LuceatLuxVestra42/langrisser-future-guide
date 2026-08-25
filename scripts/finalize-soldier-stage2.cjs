const fs = require('fs');
const path = require('path');
const {
  ROOT,
  configPath,
  readJson,
  loadSoldiers,
  loadSpSoldiers,
  loadArmies,
} = require('./lib/configdata-direct.cjs');

const SOLDIER_PATH = configPath('ConfigDataSoldierInfo');
const SP_PATH = configPath('ConfigDataSPSoldierInfo');
const ARMY_PATH = configPath('ConfigDataArmyInfo');
const KR_PATH = path.join(ROOT, 'data/metadata/soldier-name-kr-tier3.v1.json');
const STAGE21_PATH = path.join(ROOT, 'data/soldier-master-stage2-1.v1.json');
const OUT_MASTER = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const OUT_SUMMARY = path.join(ROOT, 'data/validation/soldier-stage2-final.v1.json');

function rel(p) { return p.replace(ROOT + path.sep, '').replaceAll('\\', '/'); }
function duplicates(values) { const s=new Set(), d=new Set(); for (const v of values) s.has(v)?d.add(v):s.add(v); return [...d]; }

const errors = [], reviews = [];
const soldiers = loadSoldiers();
const spRows = loadSpSoldiers();
const armies = loadArmies();
const kr = readJson(KR_PATH);
const stage21 = readJson(STAGE21_PATH);

const byId = new Map(soldiers.map(x=>[x.soldierId,x]));
const armyById = new Map(armies.map(x=>[x.armyId,x]));
const displayable = soldiers.filter(x=>x.useable && !x.isEnemy);
const displayIds = new Set(displayable.map(x=>x.soldierId));
const spIdSet = new Set(spRows.map(x=>x.spSoldierId));
const normalDisplayable = displayable.filter(x=>!spIdSet.has(x.soldierId));
const tier3Normal = normalDisplayable.filter(x=>x.tier===3);

if (soldiers.length !== stage21.scope.sourceRecordCount) errors.push(`Soldier count ${soldiers.length} != stage2-1 ${stage21.scope.sourceRecordCount}`);
if (displayable.length !== stage21.scope.displayableRecordCount) errors.push(`Displayable count ${displayable.length} != stage2-1 ${stage21.scope.displayableRecordCount}`);
const dupIds = duplicates(soldiers.map(x=>x.soldierId)); if (dupIds.length) errors.push(`Duplicate Soldier IDs: ${dupIds.join(',')}`);
for (const s of displayable) {
  if (!s.soldierId) errors.push(`displayable record missing ID at ${s.sourceIndex}`);
  if (!s.nameCn) errors.push(`soldier ${s.soldierId} missing Chinese name`);
  if (![1,2,3].includes(s.tier)) errors.push(`soldier ${s.soldierId} invalid tier ${s.tier}`);
  if (!armyById.has(s.armyId)) errors.push(`soldier ${s.soldierId} armyId ${s.armyId} missing ArmyInfo`);
}

const dupSpIds = duplicates(spRows.map(x=>x.spSoldierId)); if (dupSpIds.length) errors.push(`duplicate SP IDs: ${dupSpIds.join(',')}`);
const dupNormals = duplicates(spRows.map(x=>x.normalSoldierId)); if (dupNormals.length) errors.push(`normal soldiers with multiple SP rows: ${dupNormals.join(',')}`);
for (const r of spRows) {
  if (!byId.has(r.spSoldierId)) errors.push(`SP SoldierInfo missing ${r.spSoldierId}`);
  if (!byId.has(r.normalSoldierId)) errors.push(`Normal SoldierInfo missing ${r.normalSoldierId}`);
  if (!displayIds.has(r.spSoldierId)) errors.push(`SP soldier ${r.spSoldierId} not displayable`);
  if (!displayIds.has(r.normalSoldierId)) errors.push(`normal soldier ${r.normalSoldierId} not displayable`);
}

const mappingByCn = new Map(kr.records.map(x=>[x.nameCn,x]));
const dupMapNames = duplicates(kr.records.map(x=>x.nameCn)); if (dupMapNames.length) errors.push(`duplicate tier3 CN mapping names: ${dupMapNames.join(',')}`);
const tier3ByCn = new Map(tier3Normal.map(x=>[x.nameCn,x]));
const missingMapped = kr.records.filter(x=>!tier3ByCn.has(x.nameCn)).map(x=>x.nameCn);
const unmappedTier3 = tier3Normal.filter(x=>!mappingByCn.has(x.nameCn)).map(x=>x.nameCn);
if (missingMapped.length) errors.push(`KR map names absent from rank3 normal SoldierInfo: ${missingMapped.join(',')}`);
if (unmappedTier3.length) errors.push(`rank3 normal soldiers absent from KR map: ${unmappedTier3.join(',')}`);
if (tier3Normal.length !== kr.counts.total) errors.push(`rank3 normal count ${tier3Normal.length} != KR map ${kr.counts.total}`);

const tagTypes = new Map();
for (const m of kr.records) {
  const s = tier3ByCn.get(m.nameCn); if (!s) continue;
  const a = armyById.get(s.armyId); if (!a) continue;
  if (!tagTypes.has(a.armyTag)) tagTypes.set(a.armyTag,new Set());
  tagTypes.get(a.armyTag).add(m.armyType);
}
const armyTypeByTag = new Map();
for (const [tag, types] of tagTypes) {
  if (types.size !== 1) errors.push(`ArmyTag ${tag} maps ambiguously to ${[...types].join('/')}`);
  else armyTypeByTag.set(tag,[...types][0]);
}
for (const s of displayable) {
  const a=armyById.get(s.armyId); if (a && !armyTypeByTag.has(a.armyTag)) errors.push(`soldier ${s.soldierId} unresolved ArmyTag ${a.armyTag}`);
}

const spById = new Map(spRows.map(r=>[r.spSoldierId,r]));
const spByNormal = new Map(spRows.map(r=>[r.normalSoldierId,r]));
const master = displayable.map(s=>{
  const isSp=spIdSet.has(s.soldierId); const relation=isSp?spById.get(s.soldierId):spByNormal.get(s.soldierId);
  const normal = isSp ? byId.get(relation.normalSoldierId) : s;
  const nameMap = mappingByCn.get(normal?.nameCn);
  let nameKr=null, nameKrStatus='pending';
  if (nameMap) { nameKr=nameMap.nameKr; nameKrStatus=nameMap.nameKrStatus; }
  const a=armyById.get(s.armyId); const armyType=a?armyTypeByTag.get(a.armyTag)??null:null;
  const uiGroup = armyType ? ({INFANTRY:'INFANTRY',LANCER:'LANCER',CAVALRY:'CAVALRY',FLYING:'FLYING_WATER',WATER:'FLYING_WATER',ARCHER:'ARCHER_ASSASSIN',ASSASSIN:'ARCHER_ASSASSIN',MAGE:'MAGE_HOLY_DEMON',HOLY:'MAGE_HOLY_DEMON',DEMON:'MAGE_HOLY_DEMON'})[armyType] : null;
  const validationStatus = nameKrStatus==='confirmed' ? 'PASS' : 'REVIEW';
  return {soldierId:s.soldierId,siteId:`soldier-${s.soldierId}`,nameCn:s.nameCn,nameKr,nameKrStatus,tier:s.tier,armyId:s.armyId,armyTag:a?.armyTag??null,armyType,uiGroup,isSp,normalSoldierId:isSp?relation.normalSoldierId:null,spSoldierId:!isSp&&relation?relation.spSoldierId:null,validationStatus};
}).sort((a,b)=>a.soldierId-b.soldierId);
const dupSite=duplicates(master.map(x=>x.siteId)); if(dupSite.length) errors.push(`duplicate siteIds: ${dupSite.join(',')}`);
const pending = master.filter(x=>x.nameKrStatus==='pending');
const unreleased = master.filter(x=>x.nameKrStatus==='unreleased');
if (pending.length) reviews.push(`${pending.length} displayable records have no validated Korean display-name source yet (expected mainly tier 1/2).`);
if (unreleased.length) reviews.push(`${unreleased.length} records inherit intentionally unreleased Korean-name status.`);

const summary={version:1,stage:'2-7',status:errors.length?'FAIL':(reviews.length?'PASS_WITH_REVIEW':'PASS'),generatedAt:new Date().toISOString(),sources:{soldier:rel(SOLDIER_PATH),spSoldier:rel(SP_PATH),army:rel(ARMY_PATH),tier3KoreanMap:rel(KR_PATH)},counts:{sourceSoldiers:soldiers.length,displayable:displayable.length,normalDisplayable:normalDisplayable.length,spRelations:spRows.length,tier3Normal:tier3Normal.length,koreanConfirmedMasterRecords:master.filter(x=>x.nameKrStatus==='confirmed').length,koreanPendingMasterRecords:pending.length,koreanUnreleasedMasterRecords:unreleased.length,passRecords:master.filter(x=>x.validationStatus==='PASS').length,reviewRecords:master.filter(x=>x.validationStatus==='REVIEW').length},checks:{duplicateSoldierIds:dupIds.length,displayableArmyJoinFailures:displayable.filter(s=>!armyById.has(s.armyId)).length,invalidDisplayableTiers:displayable.filter(s=>![1,2,3].includes(s.tier)).length,missingChineseNames:displayable.filter(s=>!s.nameCn).length,duplicateSpIds:dupSpIds.length,duplicateSpNormalIds:dupNormals.length,missingSpSoldierInfo:spRows.filter(r=>!byId.has(r.spSoldierId)).length,missingNormalSoldierInfo:spRows.filter(r=>!byId.has(r.normalSoldierId)).length,tier3MappingMissingInConfig:missingMapped.length,tier3ConfigMissingInMapping:unmappedTier3.length,duplicateSiteIds:dupSite.length},errors,reviews,policy:{inputFormat:'UnityDataTool direct JSON arrays; no TextAsset m_bytes/protobuf parsing',canonicalKey:'soldierId',siteId:'soldier-{soldierId}',spRelation:'ConfigDataSPSoldierInfo.NormalSoliderId <-> ID; no arithmetic inference',koreanName:'tier3 mapping is validated; SP inherits its normal soldier display name; unsupported names remain explicit pending',classification:'tier from SoldierInfo.Rank; army semantic type derived from validated tier3 map + ArmyInfo.ArmyTag; UI group is a separate presentation field'}};

fs.mkdirSync(path.dirname(OUT_MASTER),{recursive:true}); fs.mkdirSync(path.dirname(OUT_SUMMARY),{recursive:true});
fs.writeFileSync(OUT_MASTER,JSON.stringify({version:1,status:summary.status,records:master},null,2)+'\n');
fs.writeFileSync(OUT_SUMMARY,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if (errors.length) process.exit(1);
