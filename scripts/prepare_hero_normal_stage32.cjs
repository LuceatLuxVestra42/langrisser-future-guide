const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const masterPath = path.join(dataDir, 'hero-name-master.v1.json');
const stagePath = path.join(dataDir, 'hero-normal-stage3-2.v1.json');

const REQUIRED_SOURCES = [
  'ConfigDataHeroInfo.json',
  'ConfigDataJobInfo.json',
  'ConfigDataJobConnectionInfo.json',
  'ConfigDataJobLevelInfo.json',
  'ConfigDataSkillInfo.json',
];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function inspectTextAsset(asset, expectedName) {
  const issues = [];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return { ok: false, issues: ['JSON root is not an object'] };
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
    const invalidIndex = asset.m_bytes.findIndex(
      (value) => !Number.isInteger(value) || value < 0 || value > 255,
    );
    if (invalidIndex !== -1) issues.push(`invalid byte at index ${invalidIndex}`);
    if (Number.isInteger(asset.m_size) && asset.m_bytes.length !== asset.m_size) {
      issues.push(`m_size=${asset.m_size} but m_bytes.length=${asset.m_bytes.length}`);
    }
  }
  return { ok: issues.length === 0, issues };
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

function bigintToSafeNumber(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function parseProtoFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const tagNumber = bigintToSafeNumber(tag.value);
    if (!tagNumber || tagNumber <= 0) throw new Error(`invalid tag at offset ${offset}`);
    const fieldNumber = tagNumber >>> 3;
    const wireType = tagNumber & 7;
    let entry;

    if (wireType === 0) {
      const decoded = readVarint(buffer, offset);
      offset = decoded.offset;
      entry = { wireType, value: bigintToSafeNumber(decoded.value), raw: decoded.value };
    } else if (wireType === 1) {
      if (offset + 8 > buffer.length) throw new Error(`truncated fixed64 field ${fieldNumber}`);
      entry = { wireType, value: buffer.subarray(offset, offset + 8) };
      offset += 8;
    } else if (wireType === 2) {
      const decodedLength = readVarint(buffer, offset);
      offset = decodedLength.offset;
      const length = bigintToSafeNumber(decodedLength.value);
      if (length === null || length < 0 || offset + length > buffer.length) {
        throw new Error(`invalid length-delimited field ${fieldNumber}`);
      }
      entry = { wireType, value: buffer.subarray(offset, offset + length) };
      offset += length;
    } else if (wireType === 5) {
      if (offset + 4 > buffer.length) throw new Error(`truncated fixed32 field ${fieldNumber}`);
      entry = { wireType, value: buffer.subarray(offset, offset + 4) };
      offset += 4;
    } else {
      throw new Error(`unsupported wire type ${wireType} at field ${fieldNumber}`);
    }

    const list = fields.get(fieldNumber) || [];
    list.push(entry);
    fields.set(fieldNumber, list);
  }
  return fields;
}

function firstVarint(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 0 && Number.isSafeInteger(entry.value)) return entry.value;
  }
  return null;
}

function firstString(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 2) return entry.value.toString('utf8');
  }
  return null;
}

function decodePackedVarints(buffer) {
  const values = [];
  let offset = 0;
  try {
    while (offset < buffer.length) {
      const decoded = readVarint(buffer, offset);
      offset = decoded.offset;
      const value = bigintToSafeNumber(decoded.value);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  } catch {
    return null;
  }
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

function parseSourceRecords(asset) {
  return splitLengthPrefixedMessages(asset.m_bytes).map(parseProtoFields);
}

function compareIdSets(left, right) {
  const onlyLeft = [...left].filter((id) => !right.has(id)).sort((a, b) => a - b);
  const onlyRight = [...right].filter((id) => !left.has(id)).sort((a, b) => a - b);
  return { equal: onlyLeft.length === 0 && onlyRight.length === 0, onlyLeft, onlyRight };
}

function effectiveHeroName(hero, stage) {
  const override = (stage.temporaryNameOverrides || []).find((item) => item.heroId === hero.heroId);
  return override?.effectiveNameKr || hero.nameKr;
}

function printSourceHealth(name, result) {
  if (result.ok) {
    console.log(`[PASS] ${name}`);
  } else {
    console.log(`[BROKEN] ${name}: ${result.issues.join(' | ')}`);
  }
}

function main() {
  const master = loadJson(masterPath);
  const stage = loadJson(stagePath);
  const heroRecords = master.records || [];
  const heroIds = heroRecords.map((hero) => hero.heroId);

  if (new Set(heroIds).size !== heroIds.length) {
    throw new Error('hero master contains duplicate heroId values');
  }

  const verner = heroRecords.find((hero) => hero.heroId === 99164);
  if (!verner || effectiveHeroName(verner, stage) !== '베르너 폰 에길') {
    throw new Error('temporary heroId 99164 name override is missing or incorrect');
  }

  console.log('Hero normal-data stage 3-2 preflight');
  console.log(`Canonical heroes: ${heroRecords.length}`);
  console.log(`Temporary 99164 name: ${effectiveHeroName(verner, stage)}`);
  console.log('');

  const loaded = new Map();
  const health = new Map();
  for (const filename of REQUIRED_SOURCES) {
    const expectedName = path.basename(filename, '.json');
    const fullPath = path.join(configDir, filename);
    const asset = loadJson(fullPath);
    const result = inspectTextAsset(asset, expectedName);
    loaded.set(filename, asset);
    health.set(filename, result);
    printSourceHealth(filename, result);
  }

  const heroAsset = loaded.get('ConfigDataHeroInfo.json');
  const heroHealth = health.get('ConfigDataHeroInfo.json');
  if (heroHealth.ok) {
    const heroSource = parseSourceRecords(heroAsset);
    const playable = [];
    for (const fields of heroSource) {
      const id = firstVarint(fields, stage.joinContract.heroInfo.id);
      const useable = firstVarint(fields, stage.joinContract.heroInfo.useable);
      if (id !== null && useable === 1) {
        playable.push({
          id,
          nameCn: firstString(fields, stage.joinContract.heroInfo.name),
          nameEn: firstString(fields, stage.joinContract.heroInfo.nameEn),
          rank: firstVarint(fields, stage.joinContract.heroInfo.rank),
          skillIds: integerValues(fields, stage.joinContract.heroInfo.skillIds),
          hiddenSkillIds: integerValues(fields, stage.joinContract.heroInfo.hiddenSkillIds),
        });
      }
    }

    const sourceIds = new Set(playable.map((hero) => hero.id));
    const masterIds = new Set(heroIds);
    const comparison = compareIdSets(sourceIds, masterIds);
    console.log('');
    console.log(`[${comparison.equal ? 'PASS' : 'REVIEW'}] HeroInfo Useable=true vs canonical heroId set`);
    console.log(`- HeroInfo framed records: ${heroSource.length}`);
    console.log(`- HeroInfo Useable=true: ${playable.length}`);
    console.log(`- canonical master: ${heroRecords.length}`);
    if (!comparison.equal) {
      console.log(`- only in HeroInfo: ${comparison.onlyLeft.slice(0, 30).join(', ') || '(none)'}`);
      console.log(`- only in master: ${comparison.onlyRight.slice(0, 30).join(', ') || '(none)'}`);
    }
  }

  const broken = REQUIRED_SOURCES.filter((name) => !health.get(name).ok);
  console.log('');
  if (broken.length > 0) {
    console.log('STAGE 3-2 RESULT: SOURCE_BLOCKED');
    console.log(`Broken required sources: ${broken.join(', ')}`);
    console.log('Replace the broken files with individually exported TextAsset JSON, then run this command again.');
    process.exitCode = 2;
    return;
  }

  console.log('STAGE 3-2 RESULT: SOURCES_READY_FOR_JOIN_VERIFICATION');
  console.log('All required sources passed structural preflight. Exact relation-field verification is the next gate before normalized output.');
}

main();
