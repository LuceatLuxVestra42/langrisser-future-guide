const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const contractPath = path.join(dataDir, 'hero-job-tree-stage4-3.v1.json');
const upstreamPath = path.join(generatedDir, 'hero-job-links.v1.json');
const outputPath = path.join(generatedDir, 'hero-job-trees.v1.json');
const summaryPath = path.join(validationDir, 'hero-job-tree-stage4-3-summary.v1.json');

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

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function writeBlocked(status, upstream, sourceStates, blockers, contract) {
  writeJson(outputPath, {
    version: 1,
    stage: '4-3',
    status,
    recordCount: 0,
    records: [],
  });
  writeJson(summaryPath, {
    version: 1,
    stage: '4-3',
    status,
    pipelineStatus: 'READY_FOR_SOURCE_REPLACEMENT',
    upstreamStatus: upstream?.status || 'missing',
    sourceHealth: sourceStates.map(({ filename, ok, issues }) => ({
      filename,
      status: ok ? 'usable' : 'broken',
      issues,
    })),
    blockers,
    relationContract: contract.relationContract,
    note: 'No job-tree records are emitted until Stage 4-2 is usable and all Stage 4-3 source inputs pass structural preflight.',
  });
}

function topologicalOrder(nodesById) {
  const indegree = new Map();
  const children = new Map();
  for (const node of nodesById.values()) {
    indegree.set(node.jobConnectionId, node.localPredecessorIds.length);
    children.set(node.jobConnectionId, []);
  }
  for (const node of nodesById.values()) {
    for (const parentId of node.localPredecessorIds) {
      children.get(parentId)?.push(node.jobConnectionId);
    }
  }

  const ready = [...nodesById.values()]
    .filter((node) => indegree.get(node.jobConnectionId) === 0)
    .sort((a, b) => (a.uiSort ?? Number.MAX_SAFE_INTEGER) - (b.uiSort ?? Number.MAX_SAFE_INTEGER) || a.jobConnectionId - b.jobConnectionId)
    .map((node) => node.jobConnectionId);

  const order = [];
  while (ready.length) {
    const current = ready.shift();
    order.push(current);
    for (const childId of children.get(current) || []) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
        ready.sort((leftId, rightId) => {
          const left = nodesById.get(leftId);
          const right = nodesById.get(rightId);
          return (left.uiSort ?? Number.MAX_SAFE_INTEGER) - (right.uiSort ?? Number.MAX_SAFE_INTEGER) || leftId - rightId;
        });
      }
    }
  }
  return { order, hasCycle: order.length !== nodesById.size };
}

function assignDepths(nodesById, order) {
  const depths = new Map();
  for (const id of order) {
    const node = nodesById.get(id);
    if (node.externalPredecessorIds.length > 0 && node.localPredecessorIds.length === 0) {
      depths.set(id, null);
      continue;
    }
    if (node.localPredecessorIds.length === 0) {
      depths.set(id, 0);
      continue;
    }
    const parentDepths = node.localPredecessorIds.map((parentId) => depths.get(parentId));
    if (parentDepths.some((depth) => depth == null)) depths.set(id, null);
    else depths.set(id, Math.max(...parentDepths) + 1);
  }
  return depths;
}

function branchPaths(nodesById, rootIds) {
  const branches = [];
  function visit(id, path, seen) {
    if (seen.has(id)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const node = nodesById.get(id);
    const nextPath = [...path, id];
    if (!node || node.childConnectionIds.length === 0) {
      branches.push(nextPath);
      return;
    }
    for (const childId of node.childConnectionIds) visit(childId, nextPath, nextSeen);
  }
  for (const rootId of rootIds) visit(rootId, [], new Set());
  return branches;
}

function main() {
  const contract = loadJson(contractPath);
  const upstream = fs.existsSync(upstreamPath) ? loadJson(upstreamPath) : null;
  const sourceStates = contract.requiredSources.map(sourceState);
  const brokenSources = sourceStates.filter((state) => !state.ok);
  const upstreamReady = upstream && (upstream.status === 'PASS' || upstream.status === 'REVIEW');

  if (!upstreamReady || brokenSources.length) {
    const blockers = [];
    if (!upstreamReady) blockers.push(`Stage 4-2 hero-job-links status=${upstream?.status || 'missing'}`);
    for (const state of brokenSources) blockers.push(`${state.filename}: ${state.issues.join(' | ')}`);
    const status = !upstreamReady ? 'UPSTREAM_BLOCKED' : 'SOURCE_BLOCKED';
    writeBlocked(status, upstream, sourceStates, blockers, contract);
    console.log(`STAGE 4-3 RESULT: ${status}`);
    for (const blocker of blockers) console.log(`- ${blocker}`);
    process.exitCode = 2;
    return;
  }

  const byFilename = new Map(sourceStates.map((state) => [state.filename, state.asset]));
  const connectionFields = contract.relationContract.jobConnectionInfo;
  const levelFields = contract.relationContract.jobLevelInfo;

  const connectionSource = parseSourceRecords(byFilename.get('ConfigDataJobConnectionInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, connectionFields.id),
      jobLevelIds: integerValues(fields, connectionFields.jobLevelIds),
      uiSort: firstVarint(fields, connectionFields.uiSort),
      preJobConnectionIds: uniqueIntegers(integerValues(fields, connectionFields.preJobConnectionIds).filter((id) => id > 0)),
    }))
    .filter((record) => Number.isInteger(record.id));

  const levelSource = parseSourceRecords(byFilename.get('ConfigDataJobLevelInfo.json'))
    .map((fields) => ({
      id: firstVarint(fields, levelFields.id),
      desc: firstString(fields, levelFields.desc),
      rankCode: firstVarint(fields, levelFields.rankCode),
      jobLevelUpHeroLevel: firstVarint(fields, levelFields.jobLevelUpHeroLevel),
      gotSkillId: firstVarint(fields, levelFields.gotSkillId),
      gotSoldierId: firstVarint(fields, levelFields.gotSoldierId),
    }))
    .filter((record) => Number.isInteger(record.id));

  const connectionIndex = indexById(connectionSource);
  const levelIndex = indexById(levelSource);
  const hardErrors = [];
  const review = [];

  if (connectionIndex.duplicates.length) hardErrors.push(`duplicate JobConnection IDs: ${connectionIndex.duplicates.join(', ')}`);
  if (levelIndex.duplicates.length) hardErrors.push(`duplicate JobLevel IDs: ${levelIndex.duplicates.join(', ')}`);

  const heroTrees = [];
  for (const hero of upstream.records || []) {
    const localIds = new Set((hero.connections || []).map((connection) => connection.jobConnectionId).filter(Number.isInteger));
    const nodesById = new Map();
    const heroHardErrors = [];
    const heroReview = [];

    for (const upstreamConnection of hero.connections || []) {
      const connectionId = upstreamConnection.jobConnectionId;
      const sourceConnection = connectionIndex.map.get(connectionId);
      if (!sourceConnection) {
        heroHardErrors.push(`missing JobConnection ${connectionId}`);
        continue;
      }
      if (!arraysEqual(upstreamConnection.jobLevelIds || [], sourceConnection.jobLevelIds || [])) {
        heroHardErrors.push(`JobConnection ${connectionId} jobLevelIds disagree with Stage 4-2 output`);
      }

      const missingGlobalPredecessors = sourceConnection.preJobConnectionIds.filter((id) => !connectionIndex.map.has(id));
      if (missingGlobalPredecessors.length) {
        heroHardErrors.push(`JobConnection ${connectionId} references missing predecessor(s): ${missingGlobalPredecessors.join(', ')}`);
      }

      const localPredecessorIds = sourceConnection.preJobConnectionIds.filter((id) => localIds.has(id));
      const externalPredecessorIds = sourceConnection.preJobConnectionIds.filter((id) => connectionIndex.map.has(id) && !localIds.has(id));
      if (externalPredecessorIds.length) {
        heroReview.push(`JobConnection ${connectionId} has external predecessor(s): ${externalPredecessorIds.join(', ')}`);
      }

      const levels = [];
      for (let index = 0; index < sourceConnection.jobLevelIds.length; index += 1) {
        const levelId = sourceConnection.jobLevelIds[index];
        const level = levelIndex.map.get(levelId);
        if (!level) {
          heroHardErrors.push(`JobConnection ${connectionId} references missing JobLevel ${levelId}`);
          continue;
        }
        levels.push({
          sequence: index + 1,
          jobLevelId: level.id,
          desc: level.desc,
          rankCode: level.rankCode,
          jobLevelUpHeroLevel: level.jobLevelUpHeroLevel,
          gotSkillId: level.gotSkillId && level.gotSkillId > 0 ? level.gotSkillId : null,
          gotSoldierId: level.gotSoldierId && level.gotSoldierId > 0 ? level.gotSoldierId : null,
        });
      }

      nodesById.set(connectionId, {
        jobConnectionId: connectionId,
        role: upstreamConnection.role,
        jobId: upstreamConnection.jobId,
        job: upstreamConnection.job,
        uiSort: sourceConnection.uiSort,
        predecessorConnectionIds: sourceConnection.preJobConnectionIds,
        localPredecessorIds,
        externalPredecessorIds,
        childConnectionIds: [],
        jobLevelIds: sourceConnection.jobLevelIds,
        levels,
      });
    }

    for (const node of nodesById.values()) {
      for (const parentId of node.localPredecessorIds) {
        const parent = nodesById.get(parentId);
        if (parent) parent.childConnectionIds.push(node.jobConnectionId);
      }
    }
    for (const node of nodesById.values()) {
      node.childConnectionIds.sort((leftId, rightId) => {
        const left = nodesById.get(leftId);
        const right = nodesById.get(rightId);
        return (left?.uiSort ?? Number.MAX_SAFE_INTEGER) - (right?.uiSort ?? Number.MAX_SAFE_INTEGER) || leftId - rightId;
      });
    }

    const topology = topologicalOrder(nodesById);
    if (topology.hasCycle) heroHardErrors.push('local JobConnection predecessor graph contains a cycle');
    const depths = topology.hasCycle ? new Map() : assignDepths(nodesById, topology.order);

    const rootConnectionIds = [...nodesById.values()]
      .filter((node) => node.localPredecessorIds.length === 0 && node.externalPredecessorIds.length === 0)
      .sort((a, b) => (a.uiSort ?? Number.MAX_SAFE_INTEGER) - (b.uiSort ?? Number.MAX_SAFE_INTEGER) || a.jobConnectionId - b.jobConnectionId)
      .map((node) => node.jobConnectionId);

    if (nodesById.size > 0 && rootConnectionIds.length === 0) {
      heroReview.push('no fully local root connection; tree depends on external predecessor(s) or unresolved topology');
    }

    const reachable = new Set();
    const queue = [...rootConnectionIds];
    while (queue.length) {
      const id = queue.shift();
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const childId of nodesById.get(id)?.childConnectionIds || []) queue.push(childId);
    }
    const disconnectedConnectionIds = [...nodesById.keys()].filter((id) => !reachable.has(id)).sort((a, b) => a - b);
    if (disconnectedConnectionIds.length && rootConnectionIds.length) {
      heroReview.push(`disconnected or external-root component(s): ${disconnectedConnectionIds.join(', ')}`);
    }

    const orderedConnections = topology.order.map((id) => {
      const node = nodesById.get(id);
      return {
        ...node,
        depth: depths.get(id) ?? null,
      };
    });

    const branches = topology.hasCycle ? [] : branchPaths(nodesById, rootConnectionIds);

    if (heroHardErrors.length) {
      hardErrors.push(...heroHardErrors.map((error) => `heroId ${hero.heroId}: ${error}`));
    }
    if (heroReview.length) {
      review.push({ heroId: hero.heroId, reasons: [...new Set(heroReview)] });
    }

    heroTrees.push({
      heroId: hero.heroId,
      nameKr: hero.nameKr,
      nameCn: hero.nameCn,
      nameEn: hero.nameEn,
      primaryJobConnectionId: hero.primaryJobConnectionId,
      rootConnectionIds,
      disconnectedConnectionIds,
      orderedConnectionIds: topology.order,
      branches,
      connections: orderedConnections,
    });
  }

  const status = hardErrors.length ? 'FAIL' : review.length ? 'REVIEW' : 'PASS';
  writeJson(outputPath, {
    version: 1,
    stage: '4-3',
    status,
    recordCount: hardErrors.length ? 0 : heroTrees.length,
    records: hardErrors.length ? [] : heroTrees,
  });
  writeJson(summaryPath, {
    version: 1,
    stage: '4-3',
    status,
    upstreamStatus: upstream.status,
    heroCount: heroTrees.length,
    generatedHeroCount: hardErrors.length ? 0 : heroTrees.length,
    sourceRecordCounts: {
      jobConnectionInfo: connectionSource.length,
      jobLevelInfo: levelSource.length,
    },
    hardErrors,
    review,
    verifiedFieldContract: contract.relationContract,
    nextStage: status === 'PASS' || status === 'REVIEW'
      ? '4-4 skill acquisition attachment'
      : 'repair job-tree relation errors before 4-4',
  });

  console.log(`STAGE 4-3 RESULT: ${status}`);
  console.log(`Hero job trees: ${hardErrors.length ? 0 : heroTrees.length}`);
  if (hardErrors.length) {
    for (const error of hardErrors.slice(0, 50)) console.log(`- FAIL: ${error}`);
    process.exitCode = 1;
  } else if (review.length) {
    for (const item of review.slice(0, 20)) console.log(`- REVIEW heroId ${item.heroId}: ${item.reasons.join(' | ')}`);
  }
}

main();
