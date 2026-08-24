const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const contractPath = path.join(dataDir, 'hero-skill-acquisition-stage4-4.v1.json');
const upstreamPath = path.join(generatedDir, 'hero-job-trees.v1.json');
const outputPath = path.join(generatedDir, 'hero-skill-acquisition.v1.json');
const summaryPath = path.join(validationDir, 'hero-skill-stage4-4-summary.v1.json');

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

function firstDisplayValue(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 0 && Number.isSafeInteger(entry.value)) return entry.value;
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

function uniqueIntegers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
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

function skillSnapshot(skill) {
  return {
    skillId: skill.id,
    nameCn: skill.nameCn,
    desc: skill.desc,
    iconPath: skill.iconPath,
    displayType: skill.displayType,
    cooldown: skill.cooldown,
    range: skill.range,
    areaOrTarget: skill.areaOrTarget,
  };
}

function writeBlocked(status, upstream, sourceStates, blockers, contract) {
  writeJson(outputPath, {
    version: 1,
    stage: '4-4',
    status,
    recordCount: 0,
    records: [],
  });
  writeJson(summaryPath, {
    version: 1,
    stage: '4-4',
    status,
    pipelineStatus: 'READY_FOR_SOURCE_REPLACEMENT',
    upstreamStatus: upstream?.status || 'missing',
    generatedHeroCount: 0,
    sourceHealth: sourceStates.map(({ filename, ok, issues }) => ({
      filename,
      status: ok ? 'usable' : 'broken',
      issues,
    })),
    blockers,
    relationContract: contract.relationContract,
    note: 'No skill-acquisition records are emitted until Stage 4-3 is usable and all Stage 4-4 sources pass structural preflight.',
  });
}

function main() {
  const contract = loadJson(contractPath);
  const upstream = fs.existsSync(upstreamPath) ? loadJson(upstreamPath) : null;
  const sourceStates = contract.requiredSources.map(sourceState);
  const brokenSources = sourceStates.filter((state) => !state.ok);
  const upstreamReady = upstream && (upstream.status === 'PASS' || upstream.status === 'REVIEW');

  if (!upstreamReady || brokenSources.length) {
    const blockers = [];
    if (!upstreamReady) blockers.push(`Stage 4-3 hero-job-trees status=${upstream?.status || 'missing'}`);
    for (const state of brokenSources) blockers.push(`${state.filename}: ${state.issues.join(' | ')}`);
    const status = !upstreamReady ? 'UPSTREAM_BLOCKED' : 'SOURCE_BLOCKED';
    writeBlocked(status, upstream, sourceStates, blockers, contract);
    console.log(`STAGE 4-4 RESULT: ${status}`);
    for (const blocker of blockers) console.log(`- ${blocker}`);
    process.exitCode = 2;
    return;
  }

  const byFilename = new Map(sourceStates.map((state) => [state.filename, state.asset]));
  const heroFields = contract.relationContract.heroInfo;
  const connectionFields = contract.relationContract.jobConnectionInfo;
  const skillFields = contract.relationContract.skillInfo;

  const heroSource = parseSourceRecords(byFilename.get('ConfigDataHeroInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, heroFields.id),
      useable: firstVarint(fields, heroFields.useable) === 1,
      skillIds: uniqueIntegers(integerValues(fields, heroFields.skillIds)),
      hiddenSkillIds: uniqueIntegers(integerValues(fields, heroFields.hiddenSkillIds)),
    }))
    .filter((record) => Number.isInteger(record.id) && record.useable);

  const connectionSource = parseSourceRecords(byFilename.get('ConfigDataJobConnectionInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, connectionFields.id),
      talentSkillIds: uniqueIntegers(integerValues(fields, connectionFields.talentSkillIds)),
    }))
    .filter((record) => Number.isInteger(record.id));

  const skillSource = parseSourceRecords(byFilename.get('ConfigDataSkillInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, skillFields.id),
      nameCn: firstString(fields, skillFields.name),
      desc: firstString(fields, skillFields.desc),
      iconPath: firstString(fields, skillFields.iconPath),
      displayType: firstDisplayValue(fields, skillFields.displayType),
      cooldown: firstDisplayValue(fields, skillFields.cooldown),
      range: firstDisplayValue(fields, skillFields.range),
      areaOrTarget: firstDisplayValue(fields, skillFields.areaOrTarget),
    }))
    .filter((record) => Number.isInteger(record.id));

  const heroIndex = indexById(heroSource);
  const connectionIndex = indexById(connectionSource);
  const skillIndex = indexById(skillSource);
  const hardErrors = [];
  const review = [];

  if (heroIndex.duplicates.length) hardErrors.push(`duplicate HeroInfo IDs: ${heroIndex.duplicates.join(', ')}`);
  if (connectionIndex.duplicates.length) hardErrors.push(`duplicate JobConnection IDs: ${connectionIndex.duplicates.join(', ')}`);
  if (skillIndex.duplicates.length) hardErrors.push(`duplicate SkillInfo IDs: ${skillIndex.duplicates.join(', ')}`);

  function resolveSkill(skillId, context, heroErrors) {
    const skill = skillIndex.map.get(skillId);
    if (!skill) {
      heroErrors.push(`${context} references missing SkillInfo ${skillId}`);
      return null;
    }
    return skillSnapshot(skill);
  }

  const records = [];
  for (const hero of upstream.records || []) {
    const sourceHero = heroIndex.map.get(hero.heroId);
    const heroErrors = [];
    const heroReview = [];

    if (!sourceHero) {
      heroErrors.push('missing usable HeroInfo record');
      hardErrors.push(`heroId ${hero.heroId}: missing usable HeroInfo record`);
      continue;
    }

    const jobLevelAcquisitions = [];
    const connectionTalentSkills = [];
    const catalogSources = new Map();

    function addCatalogSource(skillId, source) {
      if (!catalogSources.has(skillId)) catalogSources.set(skillId, []);
      catalogSources.get(skillId).push(source);
    }

    for (let connectionOrder = 0; connectionOrder < (hero.connections || []).length; connectionOrder += 1) {
      const connection = hero.connections[connectionOrder];
      const sourceConnection = connectionIndex.map.get(connection.jobConnectionId);
      if (!sourceConnection) {
        heroErrors.push(`missing JobConnectionInfo ${connection.jobConnectionId}`);
        continue;
      }

      const talentSkills = [];
      for (const skillId of sourceConnection.talentSkillIds) {
        const skill = resolveSkill(skillId, `JobConnection ${connection.jobConnectionId} TalentSkill_IDs`, heroErrors);
        if (!skill) continue;
        talentSkills.push(skill);
        addCatalogSource(skillId, {
          type: 'job-connection-talent',
          jobConnectionId: connection.jobConnectionId,
        });
      }
      connectionTalentSkills.push({
        jobConnectionId: connection.jobConnectionId,
        jobId: connection.jobId,
        skillIds: sourceConnection.talentSkillIds,
        skills: talentSkills,
      });

      for (const level of connection.levels || []) {
        const skillId = level.gotSkillId;
        if (!Number.isInteger(skillId) || skillId <= 0) continue;
        const skill = resolveSkill(skillId, `JobLevel ${level.jobLevelId} GotSkill_ID`, heroErrors);
        if (!skill) continue;
        const event = {
          acquisitionOrder: jobLevelAcquisitions.length + 1,
          skillId,
          skill,
          jobConnectionId: connection.jobConnectionId,
          jobId: connection.jobId,
          jobNameCn: connection.job?.nameCn ?? null,
          jobNameEn: connection.job?.nameEn ?? null,
          connectionDepth: connection.depth ?? null,
          connectionOrder: connectionOrder + 1,
          jobLevelId: level.jobLevelId,
          jobLevelSequence: level.sequence,
          rankCode: level.rankCode,
          jobLevelUpHeroLevel: level.jobLevelUpHeroLevel,
        };
        jobLevelAcquisitions.push(event);
        addCatalogSource(skillId, {
          type: 'job-level-acquisition',
          jobConnectionId: connection.jobConnectionId,
          jobLevelId: level.jobLevelId,
          jobLevelSequence: level.sequence,
        });
      }
    }

    const heroDirectSkills = [];
    for (const skillId of sourceHero.skillIds) {
      const skill = resolveSkill(skillId, 'HeroInfo Skill_IDs', heroErrors);
      if (!skill) continue;
      heroDirectSkills.push(skill);
      addCatalogSource(skillId, { type: 'hero-direct' });
    }

    const hiddenSkills = [];
    for (const skillId of sourceHero.hiddenSkillIds) {
      const skill = resolveSkill(skillId, 'HeroInfo HiddenSkill_IDs', heroErrors);
      if (!skill) continue;
      hiddenSkills.push(skill);
      addCatalogSource(skillId, { type: 'hero-hidden' });
    }

    const jobLevelSkillIds = new Set(jobLevelAcquisitions.map((event) => event.skillId));
    const allAuxiliaryIds = uniqueIntegers([
      ...sourceHero.skillIds,
      ...sourceHero.hiddenSkillIds,
      ...connectionTalentSkills.flatMap((entry) => entry.skillIds),
    ]);
    const auxiliaryOnlySkillIds = allAuxiliaryIds.filter((id) => !jobLevelSkillIds.has(id));

    if (jobLevelAcquisitions.length === 0 && allAuxiliaryIds.length === 0) {
      heroReview.push('no skill references found in Stage 4-4 sources');
    }
    if (auxiliaryOnlySkillIds.length) {
      heroReview.push(`auxiliary skill reference(s) without JobLevel acquisition point: ${auxiliaryOnlySkillIds.join(', ')}`);
    }

    const skillCatalog = [...catalogSources.keys()]
      .sort((a, b) => a - b)
      .map((skillId) => ({
        ...skillSnapshot(skillIndex.map.get(skillId)),
        sources: catalogSources.get(skillId),
      }));

    if (heroErrors.length) hardErrors.push(...heroErrors.map((error) => `heroId ${hero.heroId}: ${error}`));
    if (heroReview.length) review.push({ heroId: hero.heroId, reasons: [...new Set(heroReview)] });

    records.push({
      heroId: hero.heroId,
      nameKr: hero.nameKr,
      nameCn: hero.nameCn,
      nameEn: hero.nameEn,
      jobLevelAcquisitions,
      heroDirectSkillIds: sourceHero.skillIds,
      heroDirectSkills,
      hiddenSkillIds: sourceHero.hiddenSkillIds,
      hiddenSkills,
      connectionTalentSkills,
      auxiliaryOnlySkillIds,
      skillCatalog,
      presentation: {
        awakeningClassification: 'deferred-to-stage-4-5',
        spSkills: 'out-of-scope-stage-5',
      },
    });
  }

  const status = hardErrors.length ? 'FAIL' : review.length ? 'REVIEW' : 'PASS';
  writeJson(outputPath, {
    version: 1,
    stage: '4-4',
    status,
    recordCount: hardErrors.length ? 0 : records.length,
    records: hardErrors.length ? [] : records,
  });
  writeJson(summaryPath, {
    version: 1,
    stage: '4-4',
    status,
    upstreamStatus: upstream.status,
    generatedHeroCount: hardErrors.length ? 0 : records.length,
    sourceRecordCounts: {
      playableHeroInfo: heroSource.length,
      jobConnectionInfo: connectionSource.length,
      skillInfo: skillSource.length,
    },
    hardErrors,
    review,
    verifiedFieldContract: contract.relationContract,
    nextStage: status === 'PASS' || status === 'REVIEW'
      ? '4-5 basic combat data completion'
      : 'repair skill relation errors before 4-5',
  });

  console.log(`STAGE 4-4 RESULT: ${status}`);
  console.log(`Hero skill-acquisition records: ${hardErrors.length ? 0 : records.length}/${(upstream.records || []).length}`);
  if (hardErrors.length) {
    for (const error of hardErrors.slice(0, 100)) console.log(`- FAIL: ${error}`);
    process.exitCode = 1;
  } else if (review.length) {
    for (const item of review.slice(0, 30)) console.log(`- REVIEW heroId ${item.heroId}: ${item.reasons.join(' | ')}`);
  }
}

main();
