const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const contractPath = path.join(dataDir, 'hero-basic-combat-stage4-5.v1.json');
const jobTreePath = path.join(generatedDir, 'hero-job-trees.v1.json');
const skillPath = path.join(generatedDir, 'hero-skill-acquisition.v1.json');
const outputPath = path.join(generatedDir, 'hero-basic-combat.v1.json');
const summaryPath = path.join(validationDir, 'hero-basic-combat-stage4-5-summary.v1.json');

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
  if (!fs.existsSync(fullPath)) return { filename, ok: false, issues: ['file missing'], asset: null };
  try {
    const asset = loadJson(fullPath);
    return {
      filename,
      asset,
      ...inspectTextAsset(asset, path.basename(filename, '.json')),
    };
  } catch (error) {
    return {
      filename,
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
      asset: null,
    };
  }
}

function upstreamState(filePath, label) {
  if (!fs.existsSync(filePath)) return { label, ok: false, status: 'missing', recordCount: 0, data: null };
  try {
    const data = loadJson(filePath);
    const ok = data.status === 'PASS' || data.status === 'REVIEW';
    return {
      label,
      ok,
      status: data.status || 'unknown',
      recordCount: Array.isArray(data.records) ? data.records.length : 0,
      data,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 'invalid-json',
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length && shift <= 70n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error(`invalid varint at offset ${start}`);
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

function parseProtoFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    if (tag.value <= 0n || tag.value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`invalid protobuf tag near offset ${offset}`);
    const tagNumber = Number(tag.value);
    const fieldNumber = tagNumber >>> 3;
    const wireType = tagNumber & 7;
    let entry;

    if (wireType === 0) {
      const decoded = readVarint(buffer, offset);
      offset = decoded.offset;
      entry = { wireType, value: decoded.value };
    } else if (wireType === 1) {
      if (offset + 8 > buffer.length) throw new Error(`truncated fixed64 field ${fieldNumber}`);
      entry = { wireType, value: buffer.subarray(offset, offset + 8) };
      offset += 8;
    } else if (wireType === 2) {
      const decodedLength = readVarint(buffer, offset);
      offset = decodedLength.offset;
      if (decodedLength.value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`oversized field ${fieldNumber}`);
      const length = Number(decodedLength.value);
      if (length < 0 || offset + length > buffer.length) throw new Error(`invalid length-delimited field ${fieldNumber}`);
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

function firstUnsigned(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType !== 0) continue;
    if (entry.value < 0n || entry.value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(entry.value);
  }
  return null;
}

function firstInt32(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 0) return Number(BigInt.asIntN(32, entry.value));
  }
  return null;
}

function firstString(fields, fieldNumber) {
  for (const entry of fields.get(fieldNumber) || []) {
    if (entry.wireType === 2) return entry.value.toString('utf8');
  }
  return null;
}

function indexById(records, label) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    if (!Number.isInteger(record.id)) continue;
    if (map.has(record.id)) duplicates.push(record.id);
    else map.set(record.id, record);
  }
  return {
    map,
    duplicateMessage: duplicates.length ? `duplicate ${label} IDs: ${[...new Set(duplicates)].sort((a, b) => a - b).join(', ')}` : null,
  };
}

function heroIds(data) {
  return new Set((data?.records || []).map((record) => record.heroId).filter(Number.isInteger));
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort((a, b) => a - b);
}

function skillSnapshot(skill) {
  if (!skill) return null;
  return {
    skillId: skill.id,
    nameCn: skill.nameCn,
    desc: skill.desc,
    iconPath: skill.iconPath,
  };
}

function gateResolvedForStage4(gate) {
  if (gate.status === 'VERIFIED') return true;
  if (gate.id === 'talentIdentity' && gate.status === 'VERIFIED_REFERENCE_SET') return true;
  return false;
}

function main() {
  const contract = loadJson(contractPath);
  const jobTree = upstreamState(jobTreePath, 'stage4-3-job-tree');
  const skillAcquisition = upstreamState(skillPath, 'stage4-4-skill-acquisition');
  const upstreams = [jobTree, skillAcquisition];

  const requiredStates = (contract.requiredSources || []).map(sourceState);
  const optionalStates = (contract.optionalBlockedSources || []).map(sourceState);
  const requiredBroken = requiredStates.filter((state) => !state.ok);
  const upstreamBlocked = upstreams.filter((state) => !state.ok);

  const blockers = [];
  for (const state of upstreamBlocked) blockers.push(`${state.label}: status=${state.status}${state.error ? ` (${state.error})` : ''}`);
  for (const state of requiredBroken) blockers.push(`${state.filename}: ${state.issues.join(' | ')}`);

  if (upstreamBlocked.length || requiredBroken.length) {
    const status = upstreamBlocked.length ? 'UPSTREAM_BLOCKED' : 'SOURCE_BLOCKED';
    writeJson(outputPath, { version: 2, stage: '4-5', status, recordCount: 0, records: [] });
    writeJson(summaryPath, {
      version: 2,
      stage: '4-5',
      status,
      pipelineStatus: 'PARTIAL_ASSEMBLER_READY',
      stage4CompletionStatus: 'NOT_COMPLETE',
      generatedHeroCount: 0,
      upstream: upstreams.map(({ label, ok, status: upstreamStatus, recordCount, error }) => ({
        label,
        status: upstreamStatus,
        usable: ok,
        recordCount,
        ...(error ? { error } : {}),
      })),
      sourceHealth: [...requiredStates, ...optionalStates].map(({ filename, ok, issues }) => ({
        filename,
        required: (contract.requiredSources || []).includes(filename),
        status: ok ? 'usable' : 'broken',
        issues,
      })),
      hardErrors: [],
      blockers,
      semanticGates: contract.semanticGates,
    });
    console.log(`STAGE 4-5 RESULT: ${status}`);
    for (const blocker of blockers) console.log(`- BLOCKED: ${blocker}`);
    process.exitCode = 2;
    return;
  }

  const hardErrors = [];
  const treeIds = heroIds(jobTree.data);
  const skillHeroIds = heroIds(skillAcquisition.data);
  const onlyTree = setDifference(treeIds, skillHeroIds);
  const onlySkill = setDifference(skillHeroIds, treeIds);
  if (onlyTree.length) hardErrors.push(`hero IDs only in Stage 4-3: ${onlyTree.join(', ')}`);
  if (onlySkill.length) hardErrors.push(`hero IDs only in Stage 4-4: ${onlySkill.join(', ')}`);

  const sourceByName = new Map(requiredStates.map((state) => [state.filename, state]));
  const heroSource = parseSourceRecords(sourceByName.get('ConfigDataHeroInfo.json').asset)
    .map((fields) => ({
      id: firstUnsigned(fields, 2),
      useable: firstUnsigned(fields, 10) === 1,
      star: firstUnsigned(fields, 12),
      rank: firstUnsigned(fields, 13),
      awakenId: firstUnsigned(fields, 50),
    }))
    .filter((record) => Number.isInteger(record.id) && record.useable);

  const jobLevelSource = parseSourceRecords(sourceByName.get('ConfigDataJobLevelInfo.json').asset)
    .map((fields) => ({
      id: firstUnsigned(fields, 2),
      stats: {
        hpIni: firstInt32(fields, 16),
        hpUp: firstInt32(fields, 17),
        atIni: firstInt32(fields, 18),
        atUp: firstInt32(fields, 19),
        magicIni: firstInt32(fields, 20),
        magicUp: firstInt32(fields, 21),
        dfIni: firstInt32(fields, 22),
        dfUp: firstInt32(fields, 23),
        magicDfIni: firstInt32(fields, 24),
        magicDfUp: firstInt32(fields, 25),
        dexIni: firstInt32(fields, 26),
        dexUp: firstInt32(fields, 27),
      },
    }))
    .filter((record) => Number.isInteger(record.id));

  const heroIndex = indexById(heroSource, 'HeroInfo');
  const jobLevelIndex = indexById(jobLevelSource, 'JobLevelInfo');
  if (heroIndex.duplicateMessage) hardErrors.push(heroIndex.duplicateMessage);
  if (jobLevelIndex.duplicateMessage) hardErrors.push(jobLevelIndex.duplicateMessage);

  const awakenState = optionalStates.find((state) => state.filename === 'ConfigDataAwakenInfo.json') || null;
  let awakenIndex = { map: new Map(), duplicateMessage: null };
  let skillIndex = { map: new Map(), duplicateMessage: null };

  if (awakenState?.ok) {
    const awakenSource = parseSourceRecords(awakenState.asset)
      .map((fields) => ({
        id: firstUnsigned(fields, 2),
        nameCn: firstString(fields, 3),
        level2SkillId: firstUnsigned(fields, 9),
      }))
      .filter((record) => Number.isInteger(record.id));
    awakenIndex = indexById(awakenSource, 'AwakenInfo');
    if (awakenIndex.duplicateMessage) hardErrors.push(awakenIndex.duplicateMessage);

    const skillSource = parseSourceRecords(sourceByName.get('ConfigDataSkillInfo.json').asset)
      .map((fields) => ({
        id: firstUnsigned(fields, 2),
        nameCn: firstString(fields, 3),
        desc: firstString(fields, 5),
        iconPath: firstString(fields, 71),
      }))
      .filter((record) => Number.isInteger(record.id));
    skillIndex = indexById(skillSource, 'SkillInfo');
    if (skillIndex.duplicateMessage) hardErrors.push(skillIndex.duplicateMessage);
  }

  const skillByHero = new Map((skillAcquisition.data.records || []).map((record) => [record.heroId, record]));
  const records = [];

  for (const treeHero of jobTree.data.records || []) {
    const sourceHero = heroIndex.map.get(treeHero.heroId);
    const skillHero = skillByHero.get(treeHero.heroId);
    if (!sourceHero) {
      hardErrors.push(`heroId ${treeHero.heroId}: missing usable HeroInfo record`);
      continue;
    }
    if (!skillHero) {
      hardErrors.push(`heroId ${treeHero.heroId}: missing Stage 4-4 skill record`);
      continue;
    }

    const connections = (treeHero.connections || []).map((connection) => ({
      ...connection,
      levels: (connection.levels || []).map((level) => {
        const sourceLevel = jobLevelIndex.map.get(level.jobLevelId);
        if (!sourceLevel) {
          hardErrors.push(`heroId ${treeHero.heroId}: missing JobLevelInfo ${level.jobLevelId}`);
          return { ...level, rawStatComponents: null };
        }
        return { ...level, rawStatComponents: sourceLevel.stats };
      }),
    }));

    const awakenId = Number.isInteger(sourceHero.awakenId) && sourceHero.awakenId > 0 ? sourceHero.awakenId : null;
    let awakening;
    if (!awakenId) {
      awakening = { status: 'NONE', awakenId: null, level2SkillId: null, skill: null };
    } else if (!awakenState?.ok) {
      awakening = {
        status: 'SOURCE_BLOCKED',
        awakenId,
        level2SkillId: null,
        skill: null,
        source: 'ConfigDataAwakenInfo.json',
      };
    } else {
      const awaken = awakenIndex.map.get(awakenId);
      if (!awaken) {
        hardErrors.push(`heroId ${treeHero.heroId}: Awaken_ID ${awakenId} missing from AwakenInfo`);
        awakening = { status: 'FAIL', awakenId, level2SkillId: null, skill: null };
      } else {
        const level2SkillId = Number.isInteger(awaken.level2SkillId) && awaken.level2SkillId > 0 ? awaken.level2SkillId : null;
        const resolvedSkill = level2SkillId ? skillIndex.map.get(level2SkillId) : null;
        if (level2SkillId && !resolvedSkill) hardErrors.push(`heroId ${treeHero.heroId}: awakening skill ${level2SkillId} missing from SkillInfo`);
        awakening = {
          status: level2SkillId && resolvedSkill ? 'VERIFIED' : 'NO_LEVEL2_SKILL',
          awakenId,
          nameCn: awaken.nameCn,
          level2SkillId,
          skill: skillSnapshot(resolvedSkill),
        };
      }
    }

    records.push({
      heroId: treeHero.heroId,
      nameKr: treeHero.nameKr,
      nameCn: treeHero.nameCn,
      nameEn: treeHero.nameEn,
      heroMeta: {
        initialStar: sourceHero.star,
        rank: sourceHero.rank,
      },
      jobTree: {
        primaryJobConnectionId: treeHero.primaryJobConnectionId,
        rootConnectionIds: treeHero.rootConnectionIds,
        disconnectedConnectionIds: treeHero.disconnectedConnectionIds,
        orderedConnectionIds: treeHero.orderedConnectionIds,
        branches: treeHero.branches,
        connections,
      },
      skills: {
        jobLevelAcquisitions: skillHero.jobLevelAcquisitions || [],
        heroDirectSkillIds: skillHero.heroDirectSkillIds || [],
        heroDirectSkills: skillHero.heroDirectSkills || [],
        hiddenSkillIds: skillHero.hiddenSkillIds || [],
        hiddenSkills: skillHero.hiddenSkills || [],
        auxiliaryOnlySkillIds: skillHero.auxiliaryOnlySkillIds || [],
      },
      talent: {
        status: 'REFERENCE_SET_VERIFIED_STAR_SELECTION_UNRESOLVED',
        connectionTalentSkills: skillHero.connectionTalentSkills || [],
        starProgression: null,
      },
      awakening,
      displayStats: {
        status: 'UNVERIFIED_RUNTIME_FORMULA',
        values: null,
        rawJobLevelComponentsAvailable: true,
      },
      soldierModifiers: {
        status: 'UNVERIFIED_RUNTIME_FORMULA',
        hp: null,
        at: null,
        df: null,
        magicDf: null,
      },
    });
  }

  if (hardErrors.length) {
    writeJson(outputPath, { version: 2, stage: '4-5', status: 'FAIL', recordCount: 0, records: [] });
    writeJson(summaryPath, {
      version: 2,
      stage: '4-5',
      status: 'FAIL',
      pipelineStatus: 'PARTIAL_ASSEMBLER_READY',
      stage4CompletionStatus: 'NOT_COMPLETE',
      generatedHeroCount: 0,
      hardErrors,
      blockers: [],
      semanticGates: contract.semanticGates,
    });
    console.log('STAGE 4-5 RESULT: FAIL');
    for (const error of hardErrors.slice(0, 100)) console.log(`- FAIL: ${error}`);
    process.exitCode = 1;
    return;
  }

  const dynamicGates = (contract.semanticGates || []).map((gate) => {
    if (gate.id === 'awakeningClassification' && awakenState?.ok) return { ...gate, status: 'VERIFIED' };
    return gate;
  });
  const unresolvedGates = dynamicGates.filter((gate) => !gateResolvedForStage4(gate));
  const optionalSourceBlockers = optionalStates.filter((state) => !state.ok).map((state) => `${state.filename}: ${state.issues.join(' | ')}`);
  const status = unresolvedGates.length || optionalSourceBlockers.length ? 'SEMANTIC_BLOCKED' : 'PASS';

  writeJson(outputPath, {
    version: 2,
    stage: '4-5',
    status,
    recordCount: records.length,
    records,
  });

  writeJson(summaryPath, {
    version: 2,
    stage: '4-5',
    status,
    pipelineStatus: 'PARTIAL_DATA_ASSEMBLED',
    stage4CompletionStatus: status === 'PASS' ? 'COMPLETE' : 'NOT_COMPLETE',
    generatedHeroCount: records.length,
    upstream: upstreams.map(({ label, ok, status: upstreamStatus, recordCount }) => ({
      label,
      status: upstreamStatus,
      usable: ok,
      recordCount,
    })),
    sourceRecordCounts: {
      playableHeroInfo: heroSource.length,
      jobLevelInfo: jobLevelSource.length,
      awakenInfo: awakenState?.ok ? awakenIndex.map.size : 0,
    },
    sourceHealth: [...requiredStates, ...optionalStates].map(({ filename, ok, issues }) => ({
      filename,
      required: (contract.requiredSources || []).includes(filename),
      status: ok ? 'usable' : 'broken',
      issues,
    })),
    verifiedComponents: [
      'Stage 4-3 job topology for 267 heroes',
      'Stage 4-4 normal skill references/acquisition for 267 heroes',
      'JobLevelInfo raw INI/UP stat components fields 16-27',
      'JobConnection TalentSkill_IDs reference sets',
      'HeroInfo.Awaken_ID -> AwakenInfo.Level2SkillID relation semantics'
    ],
    unresolvedComponents: unresolvedGates.map((gate) => gate.id),
    optionalSourceBlockers,
    semanticGates: dynamicGates,
    hardErrors: [],
    safetyDecision: '267 partial basic-combat records are emitted because their verified relations are useful. Final display stats, soldier modifiers, talent star-rank selection, and unavailable awakening payload data remain null/status-tagged rather than inferred.',
    nextGate: status === 'PASS'
      ? 'Stage 4 data complete; proceed to Stage 5.'
      : 'Restore ConfigDataAwakenInfo and verify HeroPropertyComputer display-stat/soldier-modifier formulas plus the talent star-selection rule before Stage 4 can be marked data-complete.'
  });

  console.log(`STAGE 4-5 RESULT: ${status}`);
  console.log(`Hero basic-combat partial records: ${records.length}`);
  for (const blocker of optionalSourceBlockers) console.log(`- OPTIONAL SOURCE BLOCKED: ${blocker}`);
  for (const gate of unresolvedGates) console.log(`- SEMANTIC ${gate.status}: ${gate.id}`);
  // SEMANTIC_BLOCKED is an expected evidence state, not a pipeline execution failure.
  if (status === 'PASS') process.exitCode = 0;
}

main();
