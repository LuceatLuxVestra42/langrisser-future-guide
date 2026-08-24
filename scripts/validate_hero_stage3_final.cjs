const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');

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
    if (offset + len > b.length) throw new Error(`invalid frame length=${len} at ${offset - 4}`);
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

function decodePacked(buffer) {
  const out = [];
  let offset = 0;
  try {
    while (offset < buffer.length) {
      const r = readVarint(buffer, offset);
      const n = safeNumber(r.value);
      if (n == null) return [];
      out.push(n);
      offset = r.offset;
    }
  } catch {
    return [];
  }
  return out;
}

function firstVarint(fields, field) {
  const e = (fields.get(field) || []).find((x) => x.wire === 0);
  return e && Number.isSafeInteger(e.value) ? e.value : null;
}

function ints(fields, field) {
  const out = [];
  for (const e of fields.get(field) || []) {
    if (e.wire === 0 && Number.isSafeInteger(e.value)) out.push(e.value);
    if (e.wire === 2) out.push(...decodePacked(e.value));
  }
  return out;
}

function idSet(records, field = 2) {
  return new Set(records.map((r) => firstVarint(r, field)).filter(Number.isInteger));
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function applyCorrections(records, correctionFile) {
  const byId = new Map((correctionFile.corrections || []).map((c) => [c.heroId, c]));
  return records.map((record) => {
    const correction = byId.get(record.heroId);
    return correction ? { ...record, nameKr: correction.nameKr } : record;
  });
}

function main() {
  console.log('Hero stage 3 final automatic validation');
  console.log('=======================================');

  const master = loadJson('data/hero-name-master.v1.json');
  const corrections = loadJson('data/hero-name-corrections.v1.json');
  const stage31 = loadJson('data/hero-master-stage3-1.v1.json');
  const stage32 = loadJson('data/hero-normal-stage3-2.v1.json');
  const stage33 = loadJson('data/hero-sp-stage3-3.v1.json');
  const stage34 = loadJson('data/hero-page-stage3-4.v1.json');
  const summary34 = loadJson('data/validation/hero-pages-summary.v1.json');

  const canonical = applyCorrections(master.records || [], corrections);
  const heroIds = canonical.map((h) => h.heroId);
  const cnNames = canonical.map((h) => h.nameCn);
  const byHeroId = new Map(canonical.map((h) => [h.heroId, h]));

  check('3-1 stage status complete', stage31.status === 'complete');
  check('3-2 stage status complete', stage32.status === 'complete');
  check('3-3 stage status complete', stage33.status === 'complete');
  check('3-4 stage status complete', stage34.status === 'complete');
  check('3-4 summary ready for stage 4', summary34.pipelineStatus === 'complete' && summary34.dataStatus === 'READY_FOR_STAGE_4' && Array.isArray(summary34.blockers) && summary34.blockers.length === 0);

  check('canonical hero count = 267', master.recordCount === 267 && canonical.length === 267, `records=${canonical.length}`);
  check('heroId duplicate = 0', new Set(heroIds).size === canonical.length);
  check('Chinese-name duplicate = 0', new Set(cnNames).size === canonical.length);
  check('identity fields verified', canonical.every((h) => Number.isInteger(h.heroId) && h.nameCn && h.nameKr && typeof h.nameEn === 'string' && Array.isArray(h.aliasesKr) && h.status === 'verified'));
  check('hero 123 remains 베르너', byHeroId.get(123)?.nameKr === '베르너', String(byHeroId.get(123)?.nameKr));
  check('hero 99164 corrected to 베르너 폰 에길', byHeroId.get(99164)?.nameKr === '베르너 폰 에길', String(byHeroId.get(99164)?.nameKr));

  const required = [
    'ConfigDataHeroInfo.json',
    'ConfigDataJobInfo.json',
    'ConfigDataJobConnectionInfo.json',
    'ConfigDataJobLevelInfo.json',
    'ConfigDataSkillInfo.json',
    'ConfigDataSPHeroInfo.json',
    'ConfigDataMissionExtSPHeroInfo.json',
    'ConfigDataMissionInfo.json',
  ];

  const assets = new Map();
  const parsed = new Map();
  for (const filename of required) {
    let inspected;
    try {
      inspected = inspectAsset(filename);
      check(`${filename} structural health`, inspected.ok, inspected.issues.join(' | '));
      if (!inspected.ok) continue;
      const frames = splitFrames(inspected.asset.m_bytes);
      const records = frames.map(parseFields);
      assets.set(filename, inspected.asset);
      parsed.set(filename, records);
      check(`${filename} framed protobuf parse`, records.length > 0, `records=${records.length}, bytes=${inspected.asset.m_size}`);
    } catch (error) {
      check(`${filename} framed protobuf parse`, false, error instanceof Error ? error.message : String(error));
    }
  }

  if (required.some((f) => !parsed.has(f))) {
    console.log('\nSTAGE 3 FINAL RESULT: FAIL');
    process.exit(1);
  }

  const heroRecords = parsed.get('ConfigDataHeroInfo.json');
  const playableHeroIds = new Set(
    heroRecords
      .filter((r) => firstVarint(r, stage32.joinContract.heroInfo.useable) === 1)
      .map((r) => firstVarint(r, stage32.joinContract.heroInfo.id))
      .filter(Number.isInteger),
  );
  check('HeroInfo Useable=true set matches 267 canonical heroes', sameSet(playableHeroIds, new Set(heroIds)), `source=${playableHeroIds.size}, canonical=${heroIds.length}`);

  const jobRecords = parsed.get('ConfigDataJobInfo.json');
  const connectionRecords = parsed.get('ConfigDataJobConnectionInfo.json');
  const jobLevelRecords = parsed.get('ConfigDataJobLevelInfo.json');
  const skillRecords = parsed.get('ConfigDataSkillInfo.json');
  const jobIds = idSet(jobRecords, stage32.joinContract.jobInfo.id);
  const connectionIds = idSet(connectionRecords, stage32.joinContract.jobConnectionInfo.id);
  const jobLevelIds = idSet(jobLevelRecords, 2);
  const skillIds = idSet(skillRecords, stage32.joinContract.skillInfo.id);
  const connectionById = new Map(connectionRecords.map((r) => [firstVarint(r, stage32.joinContract.jobConnectionInfo.id), r]));

  const playableHeroRecords = heroRecords.filter((r) => firstVarint(r, stage32.joinContract.heroInfo.useable) === 1);
  const referencedConnections = new Set();
  const directHeroSkills = new Set();
  for (const hero of playableHeroRecords) {
    const first = firstVarint(hero, stage32.joinContract.heroInfo.jobConnectionId);
    if (Number.isInteger(first) && first > 0) referencedConnections.add(first);
    for (const id of ints(hero, stage32.joinContract.heroInfo.useableJobConnectionIds)) if (id > 0) referencedConnections.add(id);
    for (const id of ints(hero, stage32.joinContract.heroInfo.skillIds)) if (id > 0) directHeroSkills.add(id);
    for (const id of ints(hero, stage32.joinContract.heroInfo.hiddenSkillIds)) if (id > 0) directHeroSkills.add(id);
  }
  const missingConnections = [...referencedConnections].filter((id) => !connectionIds.has(id));
  check('playable HeroInfo -> JobConnection refs resolve', missingConnections.length === 0, `refs=${referencedConnections.size}, missing=${missingConnections.slice(0, 20).join(',')}`);

  const missingJobs = [];
  const missingJobLevels = [];
  for (const connectionId of referencedConnections) {
    const r = connectionById.get(connectionId);
    if (!r) continue;
    const jobId = firstVarint(r, stage32.joinContract.jobConnectionInfo.jobId);
    if (Number.isInteger(jobId) && jobId > 0 && !jobIds.has(jobId)) missingJobs.push(jobId);
    for (const levelId of ints(r, stage32.joinContract.jobConnectionInfo.jobLevelIds)) {
      if (levelId > 0 && !jobLevelIds.has(levelId)) missingJobLevels.push(levelId);
    }
  }
  check('referenced JobConnection -> Job refs resolve', missingJobs.length === 0, `missing=${[...new Set(missingJobs)].slice(0, 20).join(',')}`);
  check('referenced JobConnection -> JobLevel refs resolve', missingJobLevels.length === 0, `missing=${[...new Set(missingJobLevels)].slice(0, 20).join(',')}`);
  const missingDirectSkills = [...directHeroSkills].filter((id) => !skillIds.has(id));
  check('HeroInfo direct Skill refs resolve', missingDirectSkills.length === 0, `refs=${directHeroSkills.size}, missing=${missingDirectSkills.slice(0, 20).join(',')}`);

  const spRecords = parsed.get('ConfigDataSPHeroInfo.json');
  const missionRecords = parsed.get('ConfigDataMissionInfo.json');
  const sp = stage33.joinContract.spHeroInfo;
  const missionIds = idSet(missionRecords, stage33.joinContract.missionInfo.id);
  const spHeroIds = spRecords.map((r) => firstVarint(r, sp.idHeroId)).filter(Number.isInteger);
  check('SPHero owners all resolve to canonical heroes', spHeroIds.every((id) => byHeroId.has(id)), `records=${spHeroIds.length}`);
  check('SPHero owner duplicate = 0', new Set(spHeroIds).size === spHeroIds.length);

  const missingSpConnections = [];
  const missingSpMissions = [];
  const missingSpSkills = [];
  for (const r of spRecords) {
    const connectionId = firstVarint(r, sp.jobConnectionId);
    if (Number.isInteger(connectionId) && connectionId > 0 && !connectionIds.has(connectionId)) missingSpConnections.push(connectionId);
    for (const id of [...ints(r, sp.firstStageMissions), ...ints(r, sp.secondStageMissions)]) {
      if (id > 0 && !missionIds.has(id)) missingSpMissions.push(id);
    }
    for (const id of ints(r, sp.secondStageRewardSkills)) {
      if (id > 0 && !skillIds.has(id)) missingSpSkills.push(id);
    }
  }
  check('SPHero -> JobConnection refs resolve', missingSpConnections.length === 0, `missing=${[...new Set(missingSpConnections)].slice(0, 20).join(',')}`);
  check('SPHero -> MissionInfo refs resolve', missingSpMissions.length === 0, `missing=${[...new Set(missingSpMissions)].slice(0, 20).join(',')}`);
  check('SPHero reward Skill refs resolve', missingSpSkills.length === 0, `missing=${[...new Set(missingSpSkills)].slice(0, 20).join(',')}`);

  const fixture = stage33.representativeFixture;
  const leon = spRecords.find((r) => firstVarint(r, sp.idHeroId) === fixture.heroId);
  check('Leon SP fixture exists', Boolean(leon));
  if (leon) {
    const first = ints(leon, sp.firstStageMissions);
    const second = ints(leon, sp.secondStageMissions);
    const rewards = ints(leon, sp.secondStageRewardSkills);
    check('Leon first-stage mission fixture matches', JSON.stringify(first) === JSON.stringify(fixture.expectedFirstStageMissionIds), JSON.stringify(first));
    check('Leon second-stage mission fixture matches', JSON.stringify(second) === JSON.stringify(fixture.expectedSecondStageMissionIds), JSON.stringify(second));
    check('Leon SP reward-skill fixture matches', JSON.stringify(rewards) === JSON.stringify(fixture.expectedSecondStageRewardSkillIds), JSON.stringify(rewards));
  }

  console.log('\n=======================================');
  console.log(`STAGE 3 FINAL RESULT: ${failed ? 'FAIL' : 'PASS'}`);
  console.log(`- canonical heroes: ${canonical.length}`);
  console.log(`- playable HeroInfo IDs: ${playableHeroIds.size}`);
  console.log(`- SP heroes: ${spHeroIds.length}`);
  console.log(`- validated ConfigData sources: ${required.length}`);
  console.log('- next gate: stage 4');
  console.log('=======================================');

  if (failed) process.exit(1);
}

main();
