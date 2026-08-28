import fs from 'node:fs/promises';
import path from 'node:path';

export const STAGE5_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage5-cli-contract.v1.json';

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { text, value: JSON.parse(text) };
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

export function normalizeId(value, context = 'ID') {
  const raw = String(value ?? '');
  if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
    throw new Error(`${context}: expected a positive integer ID, got ${raw || '(empty)'}`);
  }
  return BigInt(raw).toString();
}

export function compareIds(a, b) {
  const aa = BigInt(a);
  const bb = BigInt(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function canonicalizeEntity(raw, allowed, command) {
  const text = String(raw ?? '');
  const match = allowed.find((entity) => entity.toLowerCase() === text.toLowerCase());
  if (!match) {
    throw new Error(`${command}: unsupported entity ${text || '(empty)'}; allowed: ${allowed.join(', ')}`);
  }
  return match;
}

function binarySearchEntry(entries, id) {
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const entry = entries[mid];
    const cmp = compareIds(entry[0], id);
    if (cmp === 0) return entry;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return null;
}

function lowerBoundEdge(edges, id) {
  let low = 0;
  let high = edges.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compareIds(edges[mid][0], id) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

function targetsForSource(edges, id) {
  const out = [];
  for (let index = lowerBoundEdge(edges, id); index < edges.length; index += 1) {
    const edge = edges[index];
    const cmp = compareIds(edge[0], id);
    if (cmp !== 0) break;
    out.push(edge[1]);
  }
  return out;
}

export async function loadStage5Contract() {
  return (await readJson(STAGE5_CONTRACT_PATH)).value;
}

export async function loadStage5Predecessor(contract) {
  const predecessorContract = await readJson(contract.predecessor.contract);
  const predecessorSummary = await readJson(contract.predecessor.summary);
  return {
    contract: predecessorContract.value,
    summary: predecessorSummary.value,
  };
}

async function lookupLocator(entity, id, contract) {
  const filePath = contract.inputs.idLocator[entity];
  if (!filePath) return null;
  const index = (await readJson(filePath)).value;
  const entry = binarySearchEntry(index.index.entries, id);
  if (!entry) return null;
  return {
    source: index.source.path,
    sourceSha256: index.source.sha256,
    containerPath: index.source.containerPath,
    recordIndex: entry[1],
    ...(entry.length >= 3 ? { label: entry[2], labelField: index.index.labelField } : {}),
  };
}

async function lookupForward(entity, id, contract) {
  const domain = contract.inputs.forwardSourceDomain[entity];
  if (!domain) return [];
  const filePath = contract.inputs.forward[domain];
  const index = (await readJson(filePath)).value;
  const groups = [];
  for (const relation of index.relations) {
    if (relation.sourceType !== entity) continue;
    const targetIds = targetsForSource(relation.edges, id);
    if (targetIds.length === 0) continue;
    groups.push({
      relation: relation.name,
      sourceType: relation.sourceType,
      targetType: relation.targetType,
      semanticStatus: relation.semanticStatus,
      targetIds,
      ...(relation.note ? { note: relation.note } : {}),
    });
  }
  return groups;
}

async function lookupReverse(entity, id, contract) {
  const filePath = contract.inputs.reverse[entity];
  if (!filePath) return [];
  const index = (await readJson(filePath)).value;
  const rawGroups = index.byTargetId[id] ?? [];
  return rawGroups.map(([slot, sourceIds]) => {
    const catalog = index.relationCatalog[slot];
    if (!catalog || catalog.slot !== slot) throw new Error(`${entity} ${id}: invalid reverse relation slot ${slot}`);
    return {
      relation: catalog.relation,
      sourceType: catalog.sourceType,
      targetType: entity,
      semanticStatus: catalog.semanticStatus,
      sourceIds,
    };
  });
}

async function lookupCanonical(entity, id, contract) {
  const filePath = contract.inputs.canonicalOverlay[entity];
  if (!filePath) return [];
  const index = (await readJson(filePath)).value;
  const rawGroups = index.byId[id] ?? [];
  return rawGroups.map(([slot, targetIds]) => {
    const catalog = index.sourceCatalog[slot];
    if (!catalog || catalog.slot !== slot) throw new Error(`${entity} ${id}: invalid canonical source slot ${slot}`);
    const targetType = contract.canonicalProjectionTargetType[catalog.projection];
    if (!targetType) throw new Error(`${catalog.projection}: missing canonical target type contract`);
    return {
      projection: catalog.projection,
      targetType,
      targetIds,
      provenance: {
        path: catalog.path,
        sha256: catalog.sha256,
        schemaId: catalog.schemaId,
        relationSet: catalog.relationSet,
      },
    };
  });
}

export async function lookupEntity(rawEntity, rawId, suppliedContract = null) {
  const contract = suppliedContract ?? await loadStage5Contract();
  const entity = canonicalizeEntity(rawEntity, contract.commands.lookup.supportedEntityTypes, 'lookup');
  const id = normalizeId(rawId, `${entity} ID`);
  const [locator, forward, canonical] = await Promise.all([
    lookupLocator(entity, id, contract),
    lookupForward(entity, id, contract),
    lookupCanonical(entity, id, contract),
  ]);
  return {
    command: 'lookup',
    entity,
    id,
    found: Boolean(locator || forward.length || canonical.length),
    locator,
    forward,
    canonical,
  };
}

export async function refsEntity(rawEntity, rawId, suppliedContract = null) {
  const contract = suppliedContract ?? await loadStage5Contract();
  const entity = canonicalizeEntity(rawEntity, contract.commands.refs.supportedEntityTypes, 'refs');
  const id = normalizeId(rawId, `${entity} ID`);
  const [reverse, canonical] = await Promise.all([
    lookupReverse(entity, id, contract),
    lookupCanonical(entity, id, contract),
  ]);
  return {
    command: 'refs',
    entity,
    id,
    found: Boolean(reverse.length || canonical.length),
    reverse,
    canonical,
  };
}

export async function findEntity(rawEntity, literal, rawLimit = null, suppliedContract = null) {
  const contract = suppliedContract ?? await loadStage5Contract();
  const spec = contract.commands.find;
  const entity = canonicalizeEntity(rawEntity, spec.supportedEntityTypes, 'find');
  const query = String(literal ?? '');
  if (query.length === 0) throw new Error('find: literal query must not be empty');
  const limit = rawLimit === null ? spec.defaultLimit : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > spec.maxLimit) {
    throw new Error(`find: limit must be an integer from 1 to ${spec.maxLimit}`);
  }

  const index = (await readJson(contract.inputs.idLocator[entity])).value;
  if (!index.index.labelField) throw new Error(`find: ${entity} has no Stage 1 discovery label`);
  let totalMatchCount = 0;
  const results = [];
  for (const entry of index.index.entries) {
    const label = entry.length >= 3 ? entry[2] : null;
    if (typeof label !== 'string' || !label.includes(query)) continue;
    totalMatchCount += 1;
    if (results.length < limit) results.push({ id: entry[0], label, recordIndex: entry[1] });
  }
  return {
    command: 'find',
    entity,
    literal: query,
    matching: spec.matching,
    limit,
    totalMatchCount,
    returnedCount: results.length,
    results,
  };
}

export function buildStage5Summary(contract, predecessorSummary) {
  const commands = Object.fromEntries(Object.entries(contract.commands).map(([name, spec]) => [name, {
    npm: spec.npm,
    entityTypeCount: spec.supportedEntityTypes.length,
    supportedEntityTypes: spec.supportedEntityTypes,
  }]));
  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_5',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE5_CLI',
    contract: STAGE5_CONTRACT_PATH,
    predecessorStatus: predecessorSummary.status,
    commandCount: Object.keys(commands).length,
    commands,
    inputLayers: {
      idLocatorEntityCount: Object.keys(contract.inputs.idLocator).length,
      forwardDomainCount: Object.keys(contract.inputs.forward).length,
      reverseTargetTypeCount: Object.keys(contract.inputs.reverse).length,
      canonicalOverlayDomainCount: Object.keys(contract.inputs.canonicalOverlay).length,
    },
    semanticBoundary: {
      readOnly: true,
      rawConfigDataRead: false,
      rawConfigDataMutation: false,
      locatorOnlySourceAccess: true,
      stage2DirectEdgesOnly: true,
      stage3MaterializedReverseOnly: true,
      stage4FrozenCanonicalOnly: true,
      transitiveExpansion: false,
      newRelationsDiscovered: false,
      canonicalRelationsRecomputed: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
    },
  };
}

function formatIdList(ids, max) {
  if (ids.length <= max) return ids.join(', ');
  return `${ids.slice(0, max).join(', ')} … +${ids.length - max}`;
}

function renderCanonical(groups, max) {
  if (groups.length === 0) return ['  (none)'];
  return groups.map((group) => `  ${group.projection} -> ${group.targetType} [${formatIdList(group.targetIds, max)}]`);
}

export function renderLookupHuman(result, contract) {
  const max = contract.cliPolicy.humanDisplayMaxIdsPerRelation;
  const lines = [`${result.entity} ${result.id}`];
  lines.push('ID locator:');
  if (result.locator) {
    lines.push(`  source: ${result.locator.source}`);
    lines.push(`  recordIndex: ${result.locator.recordIndex}`);
    if (result.locator.label !== undefined) lines.push(`  ${result.locator.labelField}: ${result.locator.label}`);
  } else {
    lines.push('  (none)');
  }
  lines.push('Direct forward refs:');
  if (result.forward.length === 0) lines.push('  (none)');
  else for (const group of result.forward) {
    lines.push(`  ${group.relation} -> ${group.targetType} [${formatIdList(group.targetIds, max)}] (${group.semanticStatus})`);
  }
  lines.push('Canonical overlay:');
  lines.push(...renderCanonical(result.canonical, max));
  if (!result.found) lines.push('No indexed data found for this ID.');
  return `${lines.join('\n')}\n`;
}

export function renderRefsHuman(result, contract) {
  const max = contract.cliPolicy.humanDisplayMaxIdsPerRelation;
  const lines = [`${result.entity} ${result.id}`, 'Incoming raw refs:'];
  if (result.reverse.length === 0) lines.push('  (none)');
  else for (const group of result.reverse) {
    lines.push(`  ${group.relation} <- ${group.sourceType} [${formatIdList(group.sourceIds, max)}] (${group.semanticStatus})`);
  }
  lines.push('Canonical overlay:');
  lines.push(...renderCanonical(result.canonical, max));
  if (!result.found) lines.push('No indexed references found for this ID.');
  return `${lines.join('\n')}\n`;
}

export function renderFindHuman(result) {
  const lines = [
    `${result.entity} label search: ${result.literal}`,
    `matches: ${result.totalMatchCount} (showing ${result.returnedCount})`,
  ];
  for (const item of result.results) lines.push(`  ${item.id}\t${item.label}\t(recordIndex ${item.recordIndex})`);
  if (result.results.length === 0) lines.push('  (none)');
  return `${lines.join('\n')}\n`;
}
