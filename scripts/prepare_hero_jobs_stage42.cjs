const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const masterPath = path.join(dataDir, 'hero-name-master.v1.json');
const contractPath = path.join(dataDir, 'hero-job-stage4-2.v1.json');
const outputPath = path.join(generatedDir, 'hero-job-links.v1.json');
const summaryPath = path.join(validationDir, 'hero-job-stage4-2-summary.v1.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function inspectTextAsset(asset, expectedName) {
  const issues = [];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return { ok: false, issues: ['JSON root is not an object'] };
  }
  if (asset.m_Name !== expectedName) issues.push(`m_Name=${JSON.stringify(asset.m_Name)} expected=${expectedName}`);
  if (!Number.isInteger(asset.m_size) || asset.m_size < 0) issues.push(`invalid m_size=${String(asset.m_size)}`);
  if (!Array.isArray(asset.m_bytes) || asset.m_bytes.length === 0) {
    issues.push('m_bytes is missing, null, or empty');
  } else {
    const invalidIndex = asset.m_bytes.findIndex((value) => !Number.isInteger(value) || value < 0 || value > 255);
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
    if (offset + 4 > buffer.length) throw new Error(`truncated 4-byte frame header at offset ${offset}`);
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + length > buffer.length) throw new Error(`invalid frame length=${length} at offset ${offset - 4}`);
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
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function parseProtoFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const tagNumber = bigintToSafeNumber(tag.value);
    if (!tagNumber || tagNumber <= 0) throw new Error(`invalid protobuf tag near offset ${offset}`);
    const fieldNumber = tagNumber >>> 3;
    const wireType = tagNumber & 7;
    let entry;

    if (wireType === 0) {
      const decoded = readVarint(buffer, offset);
      offset = decoded.offset;
      entry = { wireType, value: bigintToSafeNumber(decoded.value) };
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

function parseSourceRecords(asset) {
  return splitLengthPrefixedMessages(asset.m_bytes).map(parseProtoFields);
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
  while (offset < buffer.length) {
    const decoded = readVarint(buffer, offset);
    offset = decoded.offset;
    const value = bigintToSafeNumber(decoded.value);
    if (value === null) return null;
    values.push(value);
  }
  return values;
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

function uniqueIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))];
}

function indexById(records) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    if (!Number.isInteger(record.id)) continue;
    if (map.has(record.id)) duplicates.push(record.id);
    else map.set(record.id, record);
  }
  return { map, duplicates: uniqueIntegers(duplicates).sort((a, b) => a - b) };
}

function sourceState(filename) {
  const fullPath = path.join(configDir, filename);
  if (!fs.existsSync(fullPath)) return { filename, ok: false, issues: ['file missing'] };
  try {
    const asset = loadJson(fullPath);
    const expectedName = path.basename(filename, '.json');
    return { filename, asset, ...inspectTextAsset(asset, expectedName) };
  } catch (error) {
    return { filename, ok: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

function main() {
  const contract = loadJson(contractPath);
  const master = loadJson(masterPath);
  const canonical = Array.isArray(master.records) ? master.records : [];
  const canonicalIds = new Set(canonical.map((hero) => hero.heroId));

  const sourceStates = contract.requiredSources.map(sourceState);
  const broken = sourceStates.filter((state) => !state.ok);

  if (broken.length) {
    writeJson(outputPath, {
      version: 1,
      stage: '4-2',
      status: 'SOURCE_BLOCKED',
      recordCount: 0,
      records: [],
    });
    writeJson(summaryPath, {
      version: 1,
      stage: '4-2',
      status: 'SOURCE_BLOCKED',
      canonicalHeroCount: canonical.length,
      generatedHeroCount: 0,
      sourceHealth: sourceStates.map(({ filename, ok, issues }) => ({
        filename,
        status: ok ? 'usable' : 'broken',
        issues,
      })),
      blockers: broken.map((state) => `${state.filename}: ${state.issues.join(' | ')}`),
      relationContract: contract.relationContract,
      note: 'No Hero↔JobConnection output is emitted until all 4-2 sources pass structural preflight.',
    });
    console.log('STAGE 4-2 RESULT: SOURCE_BLOCKED');
    for (const state of broken) console.log(`- ${state.filename}: ${state.issues.join(' | ')}`);
    process.exitCode = 2;
    return;
  }

  const byFilename = new Map(sourceStates.map((state) => [state.filename, state.asset]));
  const heroFields = contract.relationContract.heroInfo;
  const connectionFields = contract.relationContract.jobConnectionInfo;
  const jobFields = contract.relationContract.jobInfo;

  const heroSource = parseSourceRecords(byFilename.get('ConfigDataHeroInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, heroFields.id),
      useable: firstVarint(fields, heroFields.useable) === 1,
      primaryJobConnectionId: firstVarint(fields, heroFields.jobConnectionId),
      useableJobConnectionIds: integerValues(fields, heroFields.useableJobConnectionIds),
    }))
    .filter((hero) => Number.isInteger(hero.id) && hero.useable);

  const connectionSource = parseSourceRecords(byFilename.get('ConfigDataJobConnectionInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, connectionFields.id),
      jobId: firstVarint(fields, connectionFields.jobId),
      jobLevelIds: integerValues(fields, connectionFields.jobLevelIds),
      uiSort: firstVarint(fields, connectionFields.uiSort),
      isRecommend: firstVarint(fields, connectionFields.isRecommend) === 1,
    }))
    .filter((record) => Number.isInteger(record.id));

  const jobSource = parseSourceRecords(byFilename.get('ConfigDataJobInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, jobFields.id),
      nameCn: firstString(fields, jobFields.name),
      nameEn: firstString(fields, jobFields.nameEn),
      rank: firstVarint(fields, jobFields.rank),
    }))
    .filter((record) => Number.isInteger(record.id));

  const heroIndex = indexById(heroSource);
  const connectionIndex = indexById(connectionSource);
  const jobIndex = indexById(jobSource);
  const hardErrors = [];
  const review = [];

  if (heroIndex.duplicates.length) hardErrors.push(`duplicate HeroInfo IDs: ${heroIndex.duplicates.join(', ')}`);
  if (connectionIndex.duplicates.length) hardErrors.push(`duplicate JobConnection IDs: ${connectionIndex.duplicates.join(', ')}`);
  if (jobIndex.duplicates.length) hardErrors.push(`duplicate Job IDs: ${jobIndex.duplicates.join(', ')}`);

  const sourceOnlyHeroIds = [...heroIndex.map.keys()].filter((id) => !canonicalIds.has(id)).sort((a, b) => a - b);
  const masterOnlyHeroIds = [...canonicalIds].filter((id) => !heroIndex.map.has(id)).sort((a, b) => a - b);
  if (sourceOnlyHeroIds.length) hardErrors.push(`Useable HeroInfo IDs missing from canonical master: ${sourceOnlyHeroIds.join(', ')}`);
  if (masterOnlyHeroIds.length) hardErrors.push(`canonical hero IDs missing from Useable HeroInfo: ${masterOnlyHeroIds.join(', ')}`);

  const records = [];
  for (const hero of canonical) {
    const sourceHero = heroIndex.map.get(hero.heroId);
    if (!sourceHero) continue;

    const primary = Number.isInteger(sourceHero.primaryJobConnectionId) && sourceHero.primaryJobConnectionId > 0
      ? sourceHero.primaryJobConnectionId
      : null;
    const useable = uniqueIntegers(sourceHero.useableJobConnectionIds.filter((id) => id > 0));
    const combined = uniqueIntegers([...(primary === null ? [] : [primary]), ...useable]);

    if (combined.length === 0) review.push({ heroId: hero.heroId, reason: 'no JobConnection references present' });

    const connections = [];
    for (const connectionId of combined) {
      const connection = connectionIndex.map.get(connectionId);
      if (!connection) {
        hardErrors.push(`heroId ${hero.heroId} references missing JobConnection ${connectionId}`);
        continue;
      }
      const job = jobIndex.map.get(connection.jobId);
      if (!job) hardErrors.push(`JobConnection ${connectionId} references missing Job ${connection.jobId}`);
      connections.push({
        jobConnectionId: connection.id,
        role: connection.id === primary ? 'primary' : 'useable',
        jobId: connection.jobId,
        job: job || null,
        jobLevelIds: connection.jobLevelIds,
        uiSort: connection.uiSort,
        isRecommend: connection.isRecommend,
      });
    }

    records.push({
      heroId: hero.heroId,
      nameKr: hero.nameKr,
      nameCn: hero.nameCn,
      nameEn: hero.nameEn,
      primaryJobConnectionId: primary,
      useableJobConnectionIds: useable,
      connections,
    });
  }

  const status = hardErrors.length ? 'FAIL' : review.length ? 'REVIEW' : 'PASS';
  writeJson(outputPath, {
    version: 1,
    stage: '4-2',
    status,
    recordCount: records.length,
    records: hardErrors.length ? [] : records,
  });
  writeJson(summaryPath, {
    version: 1,
    stage: '4-2',
    status,
    canonicalHeroCount: canonical.length,
    generatedHeroCount: hardErrors.length ? 0 : records.length,
    sourceRecordCounts: {
      playableHeroInfo: heroSource.length,
      jobConnectionInfo: connectionSource.length,
      jobInfo: jobSource.length,
    },
    hardErrors,
    review,
    verifiedFieldContract: contract.relationContract,
    nextStage: status === 'PASS' || status === 'REVIEW'
      ? '4-3 job-tree reconstruction'
      : 'repair relation errors before 4-3',
  });

  console.log(`STAGE 4-2 RESULT: ${status}`);
  console.log(`Hero↔Job records: ${hardErrors.length ? 0 : records.length}/${canonical.length}`);
  if (hardErrors.length) {
    for (const error of hardErrors) console.log(`- FAIL: ${error}`);
    process.exitCode = 1;
  } else if (review.length) {
    for (const item of review.slice(0, 20)) console.log(`- REVIEW heroId ${item.heroId}: ${item.reason}`);
  }
}

main();
