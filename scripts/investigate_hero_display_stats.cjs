'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'configdata');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');
const JOB_LINKS = path.join(ROOT, 'data', 'generated', 'hero-job-links.v1.json');

const HERO_INFO = path.join(CONFIG, 'ConfigDataHeroInfo.json');
const JOB_INFO = path.join(CONFIG, 'ConfigDataJobInfo.json');
const PROPERTY_MODIFY_INFO = path.join(CONFIG, 'ConfigDataPropertyModifyInfo.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function preflightTextAsset(file, expectedName) {
  const result = { file: path.relative(ROOT, file).replaceAll('\\\\', '/'), status: 'usable', issues: [] };
  if (!fs.existsSync(file)) {
    result.status = 'missing';
    result.issues.push('file missing');
    return result;
  }
  let asset;
  try {
    asset = readJson(file);
  } catch (err) {
    result.status = 'invalid-json';
    result.issues.push(err.message);
    return result;
  }
  if (expectedName && asset.m_Name !== expectedName) result.issues.push(`m_Name=${JSON.stringify(asset.m_Name)} expected ${expectedName}`);
  if (!Number.isInteger(asset.m_size) || asset.m_size < 0) result.issues.push(`invalid m_size=${asset.m_size}`);
  if (!Array.isArray(asset.m_bytes) || asset.m_bytes.length === 0) result.issues.push('m_bytes missing/empty');
  if (Array.isArray(asset.m_bytes) && Number.isInteger(asset.m_size) && asset.m_size >= 0 && asset.m_bytes.length !== asset.m_size) {
    result.issues.push(`m_size ${asset.m_size} != m_bytes.length ${asset.m_bytes.length}`);
  }
  if (Array.isArray(asset.m_bytes) && asset.m_bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) result.issues.push('m_bytes contains invalid byte');
  if (result.issues.length) result.status = 'broken';
  result.asset = asset;
  return result;
}

function readVarint(buf, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < buf.length && shift <= 49) {
    const b = buf[offset++];
    value += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error(`invalid varint at ${start}`);
}

function parseMessage(buf) {
  const fields = new Map();
  let offset = 0;
  while (offset < buf.length) {
    const key = readVarint(buf, offset);
    offset = key.offset;
    const fieldNo = Math.floor(key.value / 8);
    const wire = key.value & 7;
    let value;
    if (wire === 0) {
      const v = readVarint(buf, offset);
      value = v.value;
      offset = v.offset;
    } else if (wire === 1) {
      if (offset + 8 > buf.length) throw new Error('truncated fixed64');
      value = buf.subarray(offset, offset + 8);
      offset += 8;
    } else if (wire === 2) {
      const len = readVarint(buf, offset);
      offset = len.offset;
      if (offset + len.value > buf.length) throw new Error('truncated length-delimited field');
      value = buf.subarray(offset, offset + len.value);
      offset += len.value;
    } else if (wire === 5) {
      if (offset + 4 > buf.length) throw new Error('truncated fixed32');
      value = buf.subarray(offset, offset + 4);
      offset += 4;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
    if (!fields.has(fieldNo)) fields.set(fieldNo, []);
    fields.get(fieldNo).push({ wire, value });
  }
  return fields;
}

function parseLengthPrefixedRecords(bytes) {
  const buf = Buffer.from(bytes);
  const records = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) throw new Error(`truncated record length at ${offset}`);
    const len = buf.readUInt32BE(offset);
    offset += 4;
    if (len <= 0 || offset + len > buf.length) throw new Error(`invalid record length ${len} at ${offset - 4}`);
    records.push(parseMessage(buf.subarray(offset, offset + len)));
    offset += len;
  }
  return records;
}

function scalarInt(fields, no, fallback = 0) {
  const entries = fields.get(no) || [];
  const entry = entries.find((x) => x.wire === 0);
  return entry ? entry.value : fallback;
}

function stringValue(fields, no) {
  const entries = fields.get(no) || [];
  const entry = entries.find((x) => x.wire === 2);
  return entry ? Buffer.from(entry.value).toString('utf8') : null;
}

function packedVarints(bytes) {
  const out = [];
  let offset = 0;
  while (offset < bytes.length) {
    const v = readVarint(bytes, offset);
    out.push(v.value);
    offset = v.offset;
  }
  return out;
}

function repeatedInts(fields, no) {
  const out = [];
  for (const entry of fields.get(no) || []) {
    if (entry.wire === 0) out.push(entry.value);
    if (entry.wire === 2) out.push(...packedVarints(entry.value));
  }
  return out;
}

function decodeHeroInfo(fields) {
  return {
    id: scalarInt(fields, 2),
    useable: scalarInt(fields, 10) !== 0,
    starCorrections: {
      hp: repeatedInts(fields, 26),
      at: repeatedInts(fields, 27),
      magic: repeatedInts(fields, 28),
      df: repeatedInts(fields, 29),
      magicDf: repeatedInts(fields, 30),
      dex: repeatedInts(fields, 31),
    },
  };
}

function decodeJobInfo(fields) {
  const rewards = [];
  for (const [typeField, valueField] of [[24, 25], [26, 27], [28, 29]]) {
    const propertyType = scalarInt(fields, typeField, 0);
    const value = scalarInt(fields, valueField, 0);
    if (propertyType !== 0 || value !== 0) rewards.push({ propertyType, value, typeField, valueField });
  }
  return {
    id: scalarInt(fields, 2),
    nameCn: stringValue(fields, 3),
    rank: scalarInt(fields, 8),
    masteryRewards: rewards,
  };
}

function indexById(records, decode) {
  const map = new Map();
  const duplicates = [];
  for (const fields of records) {
    const obj = decode(fields);
    if (!obj.id) continue;
    if (map.has(obj.id)) duplicates.push(obj.id);
    map.set(obj.id, obj);
  }
  return { map, duplicates: [...new Set(duplicates)].sort((a, b) => a - b) };
}

function main() {
  const heroHealth = preflightTextAsset(HERO_INFO, 'ConfigDataHeroInfo');
  const jobHealth = preflightTextAsset(JOB_INFO, 'ConfigDataJobInfo');
  const propertyHealth = preflightTextAsset(PROPERTY_MODIFY_INFO, 'ConfigDataPropertyModifyInfo');
  const sourceHealth = [heroHealth, jobHealth, propertyHealth].map(({ asset, ...rest }) => rest);

  if (heroHealth.status !== 'usable' || jobHealth.status !== 'usable') {
    const blocked = {
      version: 1,
      status: 'SOURCE_BLOCKED',
      purpose: 'Inspect HeroInfo star correction arrays and JobInfo job-mastery flat rewards used by the final hero display-stat calculation.',
      sourceHealth,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(blocked, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  const heroRecords = parseLengthPrefixedRecords(heroHealth.asset.m_bytes);
  const jobRecords = parseLengthPrefixedRecords(jobHealth.asset.m_bytes);
  const heroIndex = indexById(heroRecords, decodeHeroInfo);
  const jobIndex = indexById(jobRecords, decodeJobInfo);
  const links = readJson(JOB_LINKS);

  const heroRows = [];
  const relationErrors = [];
  for (const link of links.records || []) {
    const hero = heroIndex.map.get(link.heroId);
    if (!hero) {
      relationErrors.push({ heroId: link.heroId, issue: 'HeroInfo missing' });
      continue;
    }
    const uniqueJobIds = [...new Set((link.connections || []).map((x) => x.jobId).filter(Boolean))];
    const jobs = [];
    const totalsByPropertyType = {};
    for (const jobId of uniqueJobIds) {
      const job = jobIndex.map.get(jobId);
      if (!job) {
        relationErrors.push({ heroId: link.heroId, jobId, issue: 'JobInfo missing' });
        continue;
      }
      jobs.push(job);
      for (const reward of job.masteryRewards) {
        const key = String(reward.propertyType);
        totalsByPropertyType[key] = (totalsByPropertyType[key] || 0) + reward.value;
      }
    }
    heroRows.push({
      heroId: link.heroId,
      nameKr: link.nameKr,
      nameCn: link.nameCn,
      starCorrections: hero.starCorrections,
      jobCount: jobs.length,
      masteryTotalsByPropertyType: totalsByPropertyType,
      jobs,
    });
  }

  const leon = heroRows.find((x) => x.heroId === 6) || null;
  const result = {
    version: 1,
    status: relationErrors.length ? 'REVIEW' : 'PASS',
    purpose: 'Inspect evidence-backed inputs for the final hero display-stat formula without assigning unverified runtime arithmetic.',
    fieldContract: {
      heroInfoStarCorrections: { hp: 26, at: 27, magic: 28, df: 29, magicDf: 30, dex: 31 },
      jobInfoMasteryRewards: [
        { propertyType: 24, value: 25 },
        { propertyType: 26, value: 27 },
        { propertyType: 28, value: 29 },
      ],
    },
    sourceHealth,
    sourceRecordCounts: { heroInfo: heroRecords.length, jobInfo: jobRecords.length },
    duplicateIds: { heroInfo: heroIndex.duplicates, jobInfo: jobIndex.duplicates },
    relationErrors,
    propertyModifyTypeLookup: propertyHealth.status === 'usable'
      ? 'ConfigDataPropertyModifyInfo is usable; a later revision may attach enum labels.'
      : 'ConfigDataPropertyModifyInfo is not structurally usable, so numeric PropertyModifyType IDs are preserved without guessed labels.',
    leonFixture: leon,
    heroCount: heroRows.length,
    heroes: heroRows,
    evidenceNote: 'dump.cs shows JobInfo.Property1-3 and the job-mastery UI method SetMasterRewardProperty(PropertyModifyType,int). This file only extracts those stored rewards and HeroInfo star-correction arrays; it does not claim the exact runtime rounding/order.',
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
}

main();
