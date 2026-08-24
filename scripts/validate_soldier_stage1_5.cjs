const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

let failed = false;
function check(label, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failed = true;
  console.log(`[${status}] ${label}${details ? ` -> ${details}` : ''}`);
}

function inspectAsset(filename) {
  const asset = loadJson(`data/configdata/${filename}`);
  const expectedName = path.basename(filename, '.json');
  const issues = [];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) issues.push('invalid JSON root');
  if (asset?.m_Enabled !== 1) issues.push(`m_Enabled=${String(asset?.m_Enabled)}`);
  if (asset?.m_Name !== expectedName) issues.push(`m_Name=${JSON.stringify(asset?.m_Name)}`);
  if (!Number.isInteger(asset?.m_size) || asset.m_size <= 0) issues.push(`m_size=${String(asset?.m_size)}`);
  if (!Array.isArray(asset?.m_bytes) || asset.m_bytes.length === 0) issues.push('m_bytes missing/empty');
  if (Array.isArray(asset?.m_bytes) && Number.isInteger(asset?.m_size) && asset.m_bytes.length !== asset.m_size) {
    issues.push(`m_size=${asset.m_size} bytes=${asset.m_bytes.length}`);
  }
  return { asset, ok: issues.length === 0, issues };
}

function splitFrames(bytes) {
  const b = Buffer.from(bytes);
  const out = [];
  let offset = 0;
  while (offset < b.length) {
    if (offset + 4 > b.length) throw new Error(`truncated frame header at ${offset}`);
    const len = b.readUInt32BE(offset);
    offset += 4;
    if (len <= 0 || offset + len > b.length) throw new Error(`invalid frame length=${len} at ${offset - 4}`);
    out.push(b.subarray(offset, offset + len));
    offset += len;
  }
  return out;
}

function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length && shift <= 63n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error(`invalid varint at ${start}`);
}

function safeNumber(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function parseFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tagResult = readVarint(buffer, offset);
    const tag = safeNumber(tagResult.value);
    if (!tag) throw new Error(`invalid tag at ${offset}`);
    offset = tagResult.offset;
    const field = tag >>> 3;
    const wire = tag & 7;
    let entry;
    if (wire === 0) {
      const r = readVarint(buffer, offset);
      offset = r.offset;
      entry = { wire, value: safeNumber(r.value) };
    } else if (wire === 1) {
      if (offset + 8 > buffer.length) throw new Error(`truncated fixed64 field ${field}`);
      entry = { wire, value: buffer.subarray(offset, offset + 8) };
      offset += 8;
    } else if (wire === 2) {
      const r = readVarint(buffer, offset);
      const len = safeNumber(r.value);
      offset = r.offset;
      if (len == null || offset + len > buffer.length) throw new Error(`invalid len field ${field}`);
      entry = { wire, value: buffer.subarray(offset, offset + len) };
      offset += len;
    } else if (wire === 5) {
      if (offset + 4 > buffer.length) throw new Error(`truncated fixed32 field ${field}`);
      entry = { wire, value: buffer.subarray(offset, offset + 4) };
      offset += 4;
    } else {
      throw new Error(`unsupported wire=${wire} field=${field}`);
    }
    const list = fields.get(field) || [];
    list.push(entry);
    fields.set(field, list);
  }
  return fields;
}

function firstVarint(fields, field, defaultValue = null) {
  const e = (fields.get(field) || []).find((x) => x.wire === 0);
  return e && Number.isSafeInteger(e.value) ? e.value : defaultValue;
}

function duplicates(values) {
  const seen = new Set();
  const dup = new Set();
  for (const value of values) {
    if (seen.has(value)) dup.add(value);
    else seen.add(value);
  }
  return [...dup].sort((a, b) => a - b);
}

function parseAsset(filename) {
  const inspected = inspectAsset(filename);
  check(`${filename} structural health`, inspected.ok, inspected.issues.join(' | '));
  if (!inspected.ok) throw new Error(`${filename} structural failure`);
  const frames = splitFrames(inspected.asset.m_bytes);
  const records = frames.map(parseFields);
  check(`${filename} framed protobuf parse`, records.length > 0, `records=${records.length}, bytes=${inspected.asset.m_size}`);
  return { asset: inspected.asset, records };
}

function main() {
  console.log('Soldier stage 1-5 final automatic validation');
  console.log('============================================');
  console.log('Field contract: SoldierInfo ID=2 Army_ID=16 Rank=53 IsEnemy=54 Useable=59; SPSoldierInfo ID=2 NormalSoliderId=3; ArmyInfo ID=2');

  const soldier = parseAsset('ConfigDataSoldierInfo.json');
  const sp = parseAsset('ConfigDataSPSoldierInfo.json');
  const army = parseAsset('ConfigDataArmyInfo.json');

  const soldierRows = soldier.records.map((r) => ({
    id: firstVarint(r, 2),
    armyId: firstVarint(r, 16, 0),
    rank: firstVarint(r, 53, 0),
    isEnemy: firstVarint(r, 54, 0),
    useable: firstVarint(r, 59, 0),
  }));
  const spRows = sp.records.map((r) => ({
    id: firstVarint(r, 2),
    normalId: firstVarint(r, 3),
  }));
  const armyIds = new Set(army.records.map((r) => firstVarint(r, 2)).filter(Number.isInteger));

  const soldierIds = soldierRows.map((r) => r.id).filter(Number.isInteger);
  const duplicateSoldierIds = duplicates(soldierIds);
  check('Soldier ID duplicate = 0', duplicateSoldierIds.length === 0, `records=${soldierRows.length}, ids=${soldierIds.length}, duplicates=${duplicateSoldierIds.join(',')}`);

  const spIds = spRows.map((r) => r.id).filter(Number.isInteger);
  const spNormalIds = spRows.map((r) => r.normalId).filter(Number.isInteger);
  const duplicateSpIds = duplicates(spIds);
  check('SP record count = 56', spRows.length === 56, `records=${spRows.length}`);
  check('SP ID duplicate = 0', duplicateSpIds.length === 0, `duplicates=${duplicateSpIds.join(',')}`);
  check('SP NormalSoliderId present on all records', spNormalIds.length === spRows.length, `present=${spNormalIds.length}/${spRows.length}`);

  const soldierIdSet = new Set(soldierIds);
  const spIdSet = new Set(spIds);
  const orphanSp = spIds.filter((id) => !soldierIdSet.has(id));
  const orphanNormal = spNormalIds.filter((id) => !soldierIdSet.has(id));
  check('every SPSoldierInfo.ID resolves to SoldierInfo', orphanSp.length === 0, `orphan=${orphanSp.join(',')}`);
  check('every SPSoldierInfo.NormalSoliderId resolves to SoldierInfo', orphanNormal.length === 0, `orphan=${orphanNormal.join(',')}`);

  const displayable = soldierRows.filter((r) => r.useable === 1 && r.isEnemy !== 1);
  const displayableIds = new Set(displayable.map((r) => r.id));
  const spOutsideDisplayable = spIds.filter((id) => !displayableIds.has(id));
  check('all SP SoldierInfo records satisfy Useable=true && IsEnemy=false', spOutsideDisplayable.length === 0, `outside=${spOutsideDisplayable.join(',')}`);

  const normal = displayable.filter((r) => !spIdSet.has(r.id));
  const normalIds = new Set(normal.map((r) => r.id));
  const overlap = [...normalIds].filter((id) => spIdSet.has(id));
  const unclassified = displayable.filter((r) => !normalIds.has(r.id) && !spIdSet.has(r.id));
  check('normal/SP overlap after explicit SP exclusion = 0', overlap.length === 0, `overlap=${overlap.join(',')}`);
  check('displayable but unclassified = 0', unclassified.length === 0, `ids=${unclassified.map((r) => r.id).join(',')}`);

  const invalidRanks = normal.filter((r) => ![1, 2, 3].includes(r.rank));
  check('normal displayable Rank in {1,2,3}', invalidRanks.length === 0, `invalid=${invalidRanks.map((r) => `${r.id}:${r.rank}`).join(',')}`);

  const invalidArmy = normal.filter((r) => !armyIds.has(r.armyId));
  check('normal displayable Army_ID resolves to ArmyInfo', invalidArmy.length === 0, `invalid=${invalidArmy.map((r) => `${r.id}:${r.armyId}`).join(',')}`);

  const rankCounts = new Map([1, 2, 3].map((rank) => [rank, normal.filter((r) => r.rank === rank).length]));
  const rank3 = normal.filter((r) => r.rank === 3);
  check('normal displayable Rank 3 count = 129', rank3.length === 129, `rank3=${rank3.length}`);

  const duplicateNormalRefs = duplicates(spNormalIds);
  console.log(`[INFO] duplicate NormalSoliderId refs=${duplicateNormalRefs.length}${duplicateNormalRefs.length ? ` -> ${duplicateNormalRefs.join(',')}` : ''}`);
  console.log(`[INFO] ArmyInfo IDs=${armyIds.size}`);
  console.log(`[INFO] displayable total=${displayable.length}`);
  console.log(`[INFO] normal total=${normal.length}`);
  console.log(`[INFO] SP total=${spRows.length}`);
  console.log(`[INFO] normal Rank1=${rankCounts.get(1)} Rank2=${rankCounts.get(2)} Rank3=${rankCounts.get(3)}`);
  console.log(`[INFO] rank3 IDs=${rank3.map((r) => r.id).sort((a,b)=>a-b).join(',')}`);

  const summary = {
    soldierRecords: soldierRows.length,
    soldierIds: soldierIds.length,
    duplicateSoldierIds,
    spRecords: spRows.length,
    duplicateSpIds,
    orphanSp,
    orphanNormal,
    displayable: displayable.length,
    normal: normal.length,
    spInDisplayable: spRows.length - spOutsideDisplayable.length,
    spOutsideDisplayable,
    overlap,
    unclassified: unclassified.map((r) => r.id),
    invalidRanks: invalidRanks.map((r) => ({ id: r.id, rank: r.rank })),
    invalidArmy: invalidArmy.map((r) => ({ id: r.id, armyId: r.armyId })),
    rankCounts: Object.fromEntries(rankCounts),
    rank3Count: rank3.length,
    rank3Ids: rank3.map((r) => r.id).sort((a,b)=>a-b),
    armyIds: [...armyIds].sort((a,b)=>a-b),
  };
  console.log('SUMMARY_JSON=' + JSON.stringify(summary));

  console.log(`\nSTAGE 1-5 FINAL RESULT: ${failed ? 'FAIL' : 'PASS'}`);
  if (failed) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
