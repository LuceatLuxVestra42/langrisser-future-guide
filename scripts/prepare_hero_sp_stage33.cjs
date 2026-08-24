const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const masterPath = path.join(dataDir, 'hero-name-master.v1.json');
const stagePath = path.join(dataDir, 'hero-sp-stage3-3.v1.json');
const outputDir = path.join(dataDir, 'generated');
const outputPath = path.join(outputDir, 'hero-sp-normalized.v1.json');

const CORE_SOURCES = [
  'ConfigDataSPHeroInfo.json',
  'ConfigDataMissionExtSPHeroInfo.json',
  'ConfigDataMissionInfo.json',
];

const DETAIL_SOURCES = [
  'ConfigDataSkillInfo.json',
  'ConfigDataItemInfo.json',
  'ConfigDataStaticBoxInfo.json',
  'ConfigDataMissionSumitItemInfo.json',
];

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) throw new Error('empty file');
  return JSON.parse(raw);
}

function inspectTextAssetFile(filename) {
  const expectedName = path.basename(filename, '.json');
  const filePath = path.join(configDir, filename);
  const issues = [];
  let asset;

  try {
    asset = loadJson(filePath);
  } catch (error) {
    return {
      filename,
      expectedName,
      ok: false,
      asset: null,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    issues.push('JSON root is not an object');
    return { filename, expectedName, ok: false, asset, issues };
  }

  if (asset.m_Name !== expectedName) {
    issues.push(`m_Name=${JSON.stringify(asset.m_Name)} expected=${expectedName}`);
  }
  if (!Number.isInteger(asset.m_size) || asset.m_size < 0) {
    issues.push(`invalid m_size=${String(asset.m_size)}`);
  }
  if (!Array.isArray(asset.m_bytes) || asset.m_bytes.length === 0) {
    issues.push('m_bytes is missing, null, or empty');
  } else {
    const bad = asset.m_bytes.findIndex((value) => !Number.isInteger(value) || value < 0 || value > 255);
    if (bad !== -1) issues.push(`invalid byte at index ${bad}`);
    if (Number.isInteger(asset.m_size) && asset.m_size !== asset.m_bytes.length) {
      issues.push(`m_size=${asset.m_size} but m_bytes.length=${asset.m_bytes.length}`);
    }
  }

  return { filename, expectedName, ok: issues.length === 0, asset, issues };
}

function splitLengthPrefixedMessages(bytes) {
  const buffer = Buffer.from(bytes);
  const messages = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) {
      throw new Error(`truncated 4-byte frame header at offset ${offset}`);
    }
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (length < 0 || offset + length > buffer.length) {
      throw new Error(`invalid frame length=${length} at offset ${offset - 4}`);
    }
    messages.push(buffer.subarray(offset, offset + length));
    offset += length;
  }

  return messages;
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
  throw new Error(`invalid varint at offset ${start}`);
}

function toSafeNumber(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function parseProtoFields(buffer) {
  const fields = new Map();
  let offset = 0;

  while (offset < buffer.length) {
    const tagResult = readVarint(buffer, offset);
    const tag = toSafeNumber(tagResult.value);
    if (tag === null || tag === 0) throw new Error(`invalid protobuf tag at offset ${offset}`);
    offset = tagResult.offset;

    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;
    let entry;

    if (wireType === 0) {
      const result = readVarint(buffer, offset);
      offset = result.offset;
      entry = { wireType, value: toSafeNumber(result.value) };
    } else if (wireType === 1) {
      if (offset + 8 > buffer.length) throw new Error(`truncated fixed64 at ${offset}`);
      entry = { wireType, value: buffer.subarray(offset, offset + 8) };
      offset += 8;
    } else if (wireType === 2) {
      const lengthResult = readVarint(buffer, offset);
      const length = toSafeNumber(lengthResult.value);
      if (length === null) throw new Error(`oversized length at ${offset}`);
      offset = lengthResult.offset;
      if (offset + length > buffer.length) throw new Error(`truncated length-delimited field at ${offset}`);
      entry = { wireType, value: buffer.subarray(offset, offset + length) };
      offset += length;
    } else if (wireType === 5) {
      if (offset + 4 > buffer.length) throw new Error(`truncated fixed32 at ${offset}`);
      entry = { wireType, value: buffer.subarray(offset, offset + 4) };
      offset += 4;
    } else {
      throw new Error(`unsupported wireType=${wireType} field=${fieldNumber}`);
    }

    const list = fields.get(fieldNumber) || [];
    list.push(entry);
    fields.set(fieldNumber, list);
  }

  return fields;
}

function decodePackedVarints(buffer) {
  const values = [];
  let offset = 0;
  try {
    while (offset < buffer.length) {
      const result = readVarint(buffer, offset);
      const value = toSafeNumber(result.value);
      if (value === null) return null;
      values.push(value);
      offset = result.offset;
    }
    return values;
  } catch {
    return null;
  }
}

function firstVarint(fields, fieldNumber) {
  const entry = (fields.get(fieldNumber) || []).find((item) => item.wireType === 0);
  return entry && Number.isSafeInteger(entry.value) ? entry.value : null;
}

function firstString(fields, fieldNumber) {
  const entry = (fields.get(fieldNumber) || []).find((item) => item.wireType === 2);
  if (!entry) return null;
  const text = entry.value.toString('utf8');
  return Buffer.from(text, 'utf8').equals(entry.value) ? text : null;
}

function integerValues(fields, fieldNumber) {
  const values = [];
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 0 && Number.isSafeInteger(entry.value)) values.push(entry.value);
    if (entry.wireType === 2) {
      const packed = decodePackedVarints(entry.value);
      if (packed) values.push(...packed);
    }
  }
  return values;
}

function parseRecords(asset) {
  return splitLengthPrefixedMessages(asset.m_bytes).map(parseProtoFields);
}

function effectiveName(hero, stage) {
  const override = (stage.temporaryNameOverrides || []).find((item) => item.heroId === hero.heroId);
  return override?.effectiveNameKr || hero.nameKr;
}

function assertArrayEqual(label, actual, expected) {
  const same = actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  console.log(`[${same ? 'PASS' : 'FAIL'}] ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  return same;
}

function printHealth(result, category) {
  if (result.ok) console.log(`[PASS] ${category} ${result.filename}`);
  else console.log(`[BROKEN] ${category} ${result.filename}: ${result.issues.join(' | ')}`);
}

function main() {
  const master = loadJson(masterPath);
  const stage = loadJson(stagePath);
  const heroMaster = master.records || [];
  const byHeroId = new Map(heroMaster.map((hero) => [hero.heroId, hero]));

  console.log('Hero SP stage 3-3 preflight');
  console.log(`Canonical heroes: ${heroMaster.length}`);
  console.log(`Temporary 99164 name: ${effectiveName(byHeroId.get(99164), stage)}`);
  console.log('');

  const health = new Map();
  for (const filename of [...CORE_SOURCES, ...DETAIL_SOURCES]) {
    const result = inspectTextAssetFile(filename);
    health.set(filename, result);
    printHealth(result, CORE_SOURCES.includes(filename) ? 'CORE' : 'DETAIL');
  }

  const brokenCore = CORE_SOURCES.filter((filename) => !health.get(filename).ok);
  const brokenDetail = DETAIL_SOURCES.filter((filename) => !health.get(filename).ok);

  if (brokenCore.length > 0) {
    console.log('');
    console.log('STAGE 3-3 RESULT: SOURCE_BLOCKED_CORE');
    console.log(`Broken core sources: ${brokenCore.join(', ')}`);
    console.log(`Broken detail sources: ${brokenDetail.join(', ') || '(none)'}`);
    console.log('Replace the broken core files with individually exported TextAsset JSON and run this command again.');
    process.exitCode = 2;
    return;
  }

  const spRecordsRaw = parseRecords(health.get('ConfigDataSPHeroInfo.json').asset);
  const extRecordsRaw = parseRecords(health.get('ConfigDataMissionExtSPHeroInfo.json').asset);
  const missionRecordsRaw = parseRecords(health.get('ConfigDataMissionInfo.json').asset);

  const spRecords = spRecordsRaw.map((fields) => ({
    heroId: firstVarint(fields, stage.joinContract.spHeroInfo.heroId),
    nameCn: firstString(fields, stage.joinContract.spHeroInfo.name),
    spIntro: firstString(fields, stage.joinContract.spHeroInfo.spIntro),
    chapter1MissionIds: integerValues(fields, stage.joinContract.spHeroInfo.chapter1MissionIds),
    chapter2MissionIds: integerValues(fields, stage.joinContract.spHeroInfo.chapter2MissionIds),
    additionalSkillIds: integerValues(fields, stage.joinContract.spHeroInfo.additionalSkillIds),
  }));

  const invalidHeroRefs = spRecords.filter((record) => !Number.isInteger(record.heroId) || !byHeroId.has(record.heroId));
  const duplicateHeroIds = spRecords
    .map((record) => record.heroId)
    .filter((id, index, array) => id !== null && array.indexOf(id) !== index);

  console.log('');
  console.log(`[${spRecords.length === stage.historicalExpectedCounts.ConfigDataSPHeroInfo ? 'PASS' : 'REVIEW'}] SPHero record count: ${spRecords.length}`);
  console.log(`[${invalidHeroRefs.length === 0 ? 'PASS' : 'FAIL'}] SPHero -> canonical hero refs: invalid=${invalidHeroRefs.length}`);
  console.log(`[${duplicateHeroIds.length === 0 ? 'PASS' : 'FAIL'}] duplicate SP hero IDs: ${[...new Set(duplicateHeroIds)].join(', ') || '(none)'}`);

  const leonFixture = stage.representativeFixture;
  const leon = spRecords.find((record) => record.heroId === leonFixture.heroId);
  let fixtureOk = Boolean(leon);
  console.log(`[${leon ? 'PASS' : 'FAIL'}] Leon SPHero fixture exists`);
  if (leon) {
    fixtureOk = assertArrayEqual('Leon chapter 1 missions', leon.chapter1MissionIds, leonFixture.expectedChapter1MissionIds) && fixtureOk;
    fixtureOk = assertArrayEqual('Leon chapter 2 missions', leon.chapter2MissionIds, leonFixture.expectedChapter2MissionIds) && fixtureOk;
    fixtureOk = assertArrayEqual('Leon SP additional skills', leon.additionalSkillIds, leonFixture.expectedAdditionalSkillIds) && fixtureOk;
  }

  const extRecords = extRecordsRaw.map((fields) => ({
    id: firstVarint(fields, stage.joinContract.missionExtSPHeroInfo.id),
    missionId: firstVarint(fields, stage.joinContract.missionExtSPHeroInfo.missionId),
    storyText: firstString(fields, stage.joinContract.missionExtSPHeroInfo.storyText),
  }));

  const missionRecords = missionRecordsRaw.map((fields) => ({
    id: firstVarint(fields, stage.joinContract.missionInfo.id),
    name: firstString(fields, stage.joinContract.missionInfo.name),
    conditionText: firstString(fields, stage.joinContract.missionInfo.conditionText),
    missionType: firstVarint(fields, stage.joinContract.missionInfo.missionType),
    param1: firstVarint(fields, stage.joinContract.missionInfo.param1),
    param2: firstVarint(fields, stage.joinContract.missionInfo.param2),
    heroIds: integerValues(fields, stage.joinContract.missionInfo.heroIds),
    levelIds: integerValues(fields, stage.joinContract.missionInfo.levelIds),
  }));

  const missionById = new Map(missionRecords.filter((record) => Number.isInteger(record.id)).map((record) => [record.id, record]));
  const extByMissionId = new Map(extRecords.filter((record) => Number.isInteger(record.missionId)).map((record) => [record.missionId, record]));
  const allReferencedMissionIds = [...new Set(spRecords.flatMap((record) => [...record.chapter1MissionIds, ...record.chapter2MissionIds]))];
  const missingMissionIds = allReferencedMissionIds.filter((id) => !missionById.has(id));

  console.log(`[${missingMissionIds.length === 0 ? 'PASS' : 'FAIL'}] SPHero mission IDs -> MissionInfo: missing=${missingMissionIds.length}`);
  console.log(`[INFO] MissionExt records parsed: ${extRecords.length}; SP mission IDs with extra text: ${allReferencedMissionIds.filter((id) => extByMissionId.has(id)).length}/${allReferencedMissionIds.length}`);

  let skillStatus = 'blocked';
  let skillById = new Map();
  if (health.get('ConfigDataSkillInfo.json').ok) {
    const skillRecords = parseRecords(health.get('ConfigDataSkillInfo.json').asset).map((fields) => ({
      id: firstVarint(fields, stage.joinContract.skillInfo.id),
      name: firstString(fields, stage.joinContract.skillInfo.name),
      desc: firstString(fields, stage.joinContract.skillInfo.desc),
      iconPath: firstString(fields, stage.joinContract.skillInfo.iconPath),
      displayType: firstVarint(fields, stage.joinContract.skillInfo.displayType),
      cooldown: firstVarint(fields, stage.joinContract.skillInfo.cooldown),
      range: firstVarint(fields, stage.joinContract.skillInfo.range),
      areaOrTarget: firstVarint(fields, stage.joinContract.skillInfo.areaOrTarget),
    }));
    skillById = new Map(skillRecords.filter((record) => Number.isInteger(record.id)).map((record) => [record.id, record]));
    const allSkillIds = [...new Set(spRecords.flatMap((record) => record.additionalSkillIds))];
    const missingSkills = allSkillIds.filter((id) => !skillById.has(id));
    skillStatus = missingSkills.length === 0 ? 'verified' : 'review';
    console.log(`[${missingSkills.length === 0 ? 'PASS' : 'REVIEW'}] SP additional skill IDs -> SkillInfo: missing=${missingSkills.length}`);
  }

  const normalized = spRecords
    .filter((record) => Number.isInteger(record.heroId) && byHeroId.has(record.heroId))
    .sort((a, b) => a.heroId - b.heroId)
    .map((record) => {
      const identity = byHeroId.get(record.heroId);
      const normalizeMission = (id, chapter) => {
        const mission = missionById.get(id);
        const ext = extByMissionId.get(id);
        return {
          id,
          chapter,
          nameCn: mission?.name || null,
          conditionTextCn: mission?.conditionText || null,
          missionType: mission?.missionType ?? null,
          param1: mission?.param1 ?? null,
          param2: mission?.param2 ?? null,
          heroIds: mission?.heroIds || [],
          levelIds: mission?.levelIds || [],
          storyTextCn: ext?.storyText || null,
          materialConditionStatus: mission?.missionType === 73 ? 'unverified-direct-target' : 'not-applicable',
        };
      };

      return {
        heroId: record.heroId,
        nameKr: effectiveName(identity, stage),
        nameCn: identity.nameCn,
        nameEn: identity.nameEn,
        spIntroCn: record.spIntro,
        chapter1Missions: record.chapter1MissionIds.map((id) => normalizeMission(id, 1)),
        chapter2Missions: record.chapter2MissionIds.map((id) => normalizeMission(id, 2)),
        additionalSkills: record.additionalSkillIds.map((id) => ({
          id,
          ...(skillById.get(id) || {}),
          detailStatus: skillById.has(id) ? 'verified-source-link' : 'source-blocked',
        })),
      };
    });

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        version: 1,
        stage: '3-3',
        generatedFrom: CORE_SOURCES,
        recordCount: normalized.length,
        skillDetailStatus: skillStatus,
        missionType73Policy: 'Do not auto-resolve material bundles until the direct target is verified.',
        records: normalized,
      },
      null,
      2,
    ) + '\n',
  );

  const hardFailure = invalidHeroRefs.length > 0 || duplicateHeroIds.length > 0 || missingMissionIds.length > 0 || !fixtureOk;
  console.log('');
  if (hardFailure) {
    console.log('STAGE 3-3 RESULT: RELATION_REVIEW_REQUIRED');
    process.exitCode = 1;
    return;
  }

  console.log(`Normalized output: ${path.relative(rootDir, outputPath)}`);
  if (brokenDetail.length > 0) {
    console.log('STAGE 3-3 RESULT: CORE_READY_DETAIL_BLOCKED');
    console.log(`Broken detail sources: ${brokenDetail.join(', ')}`);
  } else {
    console.log('STAGE 3-3 RESULT: READY_FOR_MANUAL_SAMPLE_REVIEW');
  }
}

main();
