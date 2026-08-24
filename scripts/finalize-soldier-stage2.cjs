const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOLDIER_PATH = path.join(ROOT, 'data/configdata/ConfigDataSoldierInfo.json');
const SP_PATH = path.join(ROOT, 'data/configdata/ConfigDataSPSoldierInfo.json');
const ARMY_PATH = path.join(ROOT, 'data/configdata/ConfigDataArmyInfo.json');
const KR_PATH = path.join(ROOT, 'data/metadata/soldier-name-kr-tier3.v1.json');
const STAGE21_PATH = path.join(ROOT, 'data/soldier-master-stage2-1.v1.json');
const OUT_MASTER = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const OUT_SUMMARY = path.join(ROOT, 'data/validation/soldier-stage2-final.v1.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
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
    if (wire === 0) { let v; [v, pos] = readVarint(buf, pos); add(field, {wire, v}); }
    else if (wire === 1) { if (pos + 8 > buf.length) throw new Error('truncated fixed64'); add(field,{wire,v:buf.subarray(pos,pos+8)}); pos += 8; }
    else if (wire === 2) { let n; [n,pos] = readVarint(buf,pos); if (pos+n>buf.length) throw new Error('truncated bytes'); add(field,{wire,v:buf.subarray(pos,pos+n)}); pos += n; }
    else if (wire === 5) { if (pos + 4 > buf.length) throw new Error('truncated fixed32'); add(field,{wire,v:buf.subarray(pos,pos+4)}); pos += 4; }
    else throw new Error(`unsupported wire ${wire}`);
  }
  return fields;
}
function firstVarint(f, n, d=0) { const a=f.get(n); return a?.find(x=>x.wire===0)?.v ?? d; }
function firstString(f, n, d='') { const a=f.get(n); const x=a?.find(x=>x.wire===2); return x ? x.v.toString('utf8') : d; }
function duplicates(values) { const s=new Set(), d=new Set(); for (const v of values) s.has(v)?d.add(v):s.add(v); return [...d]; }

const errors = [], reviews = [];
const soldierFrames = splitFrames(requirePayload(SOLDIER_PATH, 'ConfigDataSoldierInfo'));
const soldiers = soldierFrames.map((b, idx) => { const f=parseMessage(b); return {
  sourceIndex: idx, soldierId:firstVarint(f,2), nameCn:firstString(f,3), armyId:firstVarint(f,16),
  tier:firstVarint(f,53), isEnemy:Boolean(firstVarint(f,54)), useable:Boolean(firstVarint(f,59))
};});
const spFrames = splitFrames(requirePayload(SP_PATH, 'ConfigDataSPSoldierInfo'));
const spRows = spFrames.map((b, idx)=>{const f=parseMessage(b); return {sourceIndex:idx, spSoldierId:firstVarint(f,2), normalSoldierId:firstVarint(f,3), useable:Boolean(firstVarint(f,12,1))};});
const armyFrames = splitFrames(requirePayload(ARMY_PATH, 'ConfigDataArmyInfo'));
const armies = armyFrames.map((b,idx)=>{const f=parseMessage(b);return {sourceIndex:idx,armyId:firstVarint(f,2),name:firstString(f,3),armyTag:firstVarint(f,7)};});
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
  const isSp=spIdSet.has(s.soldierId); const rel=isSp?spById.get(s.soldierId):spByNormal.get(s.soldierId);
  const normal = isSp ? byId.get(rel.normalSoldierId) : s;
  const nameMap = mappingByCn.get(normal?.nameCn);
  let nameKr=null, nameKrStatus='pending';
  if (nameMap) { nameKr=nameMap.nameKr; nameKrStatus=nameMap.nameKrStatus; }
  const a=armyById.get(s.armyId); const armyType=a?armyTypeByTag.get(a.armyTag)??null:null;
  const uiGroup = armyType ? ({INFANTRY:'INFANTRY',LANCER:'LANCER',CAVALRY:'CAVALRY',FLYING:'FLYING_WATER',WATER:'FLYING_WATER',ARCHER:'ARCHER_ASSASSIN',ASSASSIN:'ARCHER_ASSASSIN',MAGE:'MAGE_HOLY_DEMON',HOLY:'MAGE_HOLY_DEMON',DEMON:'MAGE_HOLY_DEMON'})[armyType] : null;
  const validationStatus = nameKrStatus==='confirmed' ? 'PASS' : 'REVIEW';
  return {soldierId:s.soldierId,siteId:`soldier-${s.soldierId}`,nameCn:s.nameCn,nameKr,nameKrStatus,tier:s.tier,armyId:s.armyId,armyTag:a?.armyTag??null,armyType,uiGroup,isSp,normalSoldierId:isSp?rel.normalSoldierId:null,spSoldierId:!isSp&&rel?rel.spSoldierId:null,validationStatus};
}).sort((a,b)=>a.soldierId-b.soldierId);
const dupSite=duplicates(master.map(x=>x.siteId)); if(dupSite.length) errors.push(`duplicate siteIds: ${dupSite.join(',')}`);
const pending = master.filter(x=>x.nameKrStatus==='pending');
const unreleased = master.filter(x=>x.nameKrStatus==='unreleased');
if (pending.length) reviews.push(`${pending.length} displayable records have no validated Korean display-name source yet (expected mainly tier 1/2).`);
if (unreleased.length) reviews.push(`${unreleased.length} records inherit intentionally unreleased Korean-name status.`);

const summary={version:1,stage:'2-7',status:errors.length?'FAIL':(reviews.length?'PASS_WITH_REVIEW':'PASS'),generatedAt:new Date().toISOString(),sources:{soldier:SOLDIER_PATH.replace(ROOT+path.sep,''),spSoldier:SP_PATH.replace(ROOT+path.sep,''),army:ARMY_PATH.replace(ROOT+path.sep,''),tier3KoreanMap:KR_PATH.replace(ROOT+path.sep,'')},counts:{sourceSoldiers:soldiers.length,displayable:displayable.length,normalDisplayable:normalDisplayable.length,spRelations:spRows.length,tier3Normal:tier3Normal.length,koreanConfirmedMasterRecords:master.filter(x=>x.nameKrStatus==='confirmed').length,koreanPendingMasterRecords:pending.length,koreanUnreleasedMasterRecords:unreleased.length,passRecords:master.filter(x=>x.validationStatus==='PASS').length,reviewRecords:master.filter(x=>x.validationStatus==='REVIEW').length},checks:{duplicateSoldierIds:dupIds.length,displayableArmyJoinFailures:displayable.filter(s=>!armyById.has(s.armyId)).length,invalidDisplayableTiers:displayable.filter(s=>![1,2,3].includes(s.tier)).length,missingChineseNames:displayable.filter(s=>!s.nameCn).length,duplicateSpIds:dupSpIds.length,duplicateSpNormalIds:dupNormals.length,missingSpSoldierInfo:spRows.filter(r=>!byId.has(r.spSoldierId)).length,missingNormalSoldierInfo:spRows.filter(r=>!byId.has(r.normalSoldierId)).length,tier3MappingMissingInConfig:missingMapped.length,tier3ConfigMissingInMapping:unmappedTier3.length,duplicateSiteIds:dupSite.length},errors,reviews,policy:{canonicalKey:'soldierId',siteId:'soldier-{soldierId}',spRelation:'ConfigDataSPSoldierInfo.NormalSoliderId <-> ID; no arithmetic inference',koreanName:'tier3 mapping is validated; SP inherits its normal soldier display name; unsupported names remain explicit pending',classification:'tier from SoldierInfo.Rank; army semantic type derived from validated tier3 map + ArmyInfo.ArmyTag; UI group is a separate presentation field'}};

fs.mkdirSync(path.dirname(OUT_MASTER),{recursive:true}); fs.mkdirSync(path.dirname(OUT_SUMMARY),{recursive:true});
fs.writeFileSync(OUT_MASTER,JSON.stringify({version:1,status:summary.status,records:master},null,2)+'\n');
fs.writeFileSync(OUT_SUMMARY,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if (errors.length) process.exit(1);
