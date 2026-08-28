import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const STAGE4_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage4-canonical-overlay-contract.v1.json';

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { text, value: JSON.parse(text) };
}

export function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function normalizeId(value, context = 'ID') {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${context}: invalid numeric ID ${String(value)}`);
    return String(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) > 0n) return value;
  throw new Error(`${context}: expected positive integer ID, got ${String(value)}`);
}

export function compareIds(a, b) {
  const aa = BigInt(a);
  const bb = BigInt(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

export function normalizeProjectionMap(value, mapField, label) {
  const raw = value?.[mapField];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label}.${mapField}: expected object`);
  const out = new Map();
  for (const [rawKey, rawValues] of Object.entries(raw)) {
    const key = normalizeId(rawKey, `${label}.${mapField}.key`);
    if (!Array.isArray(rawValues)) throw new Error(`${label}.${mapField}.${key}: expected array`);
    const ids = rawValues.map((item, index) => normalizeId(item, `${label}.${mapField}.${key}[${index}]`));
    const unique = [...new Set(ids)].sort(compareIds);
    if (unique.length !== ids.length) throw new Error(`${label}.${mapField}.${key}: duplicate target ID`);
    out.set(key, unique);
  }
  return new Map([...out.entries()].sort(([a], [b]) => compareIds(a, b)));
}

export function projectionPairSet(map, label) {
  const pairs = new Set();
  for (const [sourceId, targetIds] of map.entries()) {
    for (const targetId of targetIds) {
      const key = `${sourceId}:${targetId}`;
      if (pairs.has(key)) throw new Error(`${label}: duplicate pair ${key}`);
      pairs.add(key);
    }
  }
  return pairs;
}

export async function loadStage4Contract() {
  return (await readJson(STAGE4_CONTRACT_PATH)).value;
}

export async function loadStage4Inputs(contract) {
  const predecessorContract = await readJson(contract.predecessor.contract);
  const predecessorSummary = await readJson(contract.predecessor.summary);
  const canonical = {};
  for (const [name, spec] of Object.entries(contract.canonicalInputs)) {
    const artifact = await readJson(spec.path);
    canonical[name] = {
      name,
      spec,
      path: spec.path,
      text: artifact.text,
      sha256: sha256Utf8(artifact.text),
      value: artifact.value,
    };
  }
  return {
    predecessorContract: {
      path: contract.predecessor.contract,
      text: predecessorContract.text,
      sha256: sha256Utf8(predecessorContract.text),
      value: predecessorContract.value,
    },
    predecessorSummary: {
      path: contract.predecessor.summary,
      text: predecessorSummary.text,
      sha256: sha256Utf8(predecessorSummary.text),
      value: predecessorSummary.value,
    },
    canonical,
  };
}

function provenance(artifact) {
  return {
    path: artifact.path,
    sha256: artifact.sha256,
    schemaId: artifact.value.schemaId,
    relationSet: {
      path: artifact.value.relationSet?.path ?? null,
      gitBlobSha: artifact.value.relationSet?.gitBlobSha ?? null,
      edgeCount: artifact.value.relationSet?.edgeCount ?? artifact.value.summary?.relationCount ?? null,
    },
    keyCount: artifact.value.summary?.keyCount ?? null,
    relationCount: artifact.value.summary?.relationCount ?? null,
  };
}

function materializeDomain(domain, catalog, keyIds, groupsForId) {
  const byId = {};
  let referenceCount = 0;
  for (const id of [...keyIds].sort(compareIds)) {
    const groups = groupsForId(id)
      .filter(([, ids]) => ids.length > 0)
      .map(([slot, ids]) => [slot, [...ids].sort(compareIds)]);
    for (const [, ids] of groups) referenceCount += ids.length;
    byId[id] = groups;
  }
  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_4',
    status: 'CANONICAL_OVERLAY_MATERIALIZED',
    domain,
    contract: STAGE4_CONTRACT_PATH,
    tupleFormat: '[sourceSlot,targetIds]',
    sourceCatalog: catalog,
    keyCount: Object.keys(byId).length,
    referenceCount,
    byId,
  };
}

export function buildStage4Artifacts(contract, inputs) {
  const hsHeroArtifact = inputs.canonical.heroSoldierByHero;
  const hsSoldierArtifact = inputs.canonical.heroSoldierBySoldier;
  const exHeroArtifact = inputs.canonical.exclusiveEquipmentByHero;
  const exEquipmentArtifact = inputs.canonical.exclusiveEquipmentByEquipment;

  const hsByHero = normalizeProjectionMap(hsHeroArtifact.value, hsHeroArtifact.spec.mapField, hsHeroArtifact.name);
  const hsBySoldier = normalizeProjectionMap(hsSoldierArtifact.value, hsSoldierArtifact.spec.mapField, hsSoldierArtifact.name);
  const exByHero = normalizeProjectionMap(exHeroArtifact.value, exHeroArtifact.spec.mapField, exHeroArtifact.name);
  const exByEquipment = normalizeProjectionMap(exEquipmentArtifact.value, exEquipmentArtifact.spec.mapField, exEquipmentArtifact.name);

  const heroCatalog = [
    { slot: 0, projection: 'canonical.heroSoldiers', ...provenance(hsHeroArtifact) },
    { slot: 1, projection: 'canonical.heroExclusiveEquipment', ...provenance(exHeroArtifact) },
  ];
  const soldierCatalog = [
    { slot: 0, projection: 'canonical.soldierHeroes', ...provenance(hsSoldierArtifact) },
  ];
  const equipmentCatalog = [
    { slot: 0, projection: 'canonical.exclusiveEquipmentHero', ...provenance(exEquipmentArtifact) },
  ];

  const domains = {
    Hero: materializeDomain('Hero', heroCatalog, hsByHero.keys(), (id) => [
      [0, hsByHero.get(id) ?? []],
      [1, exByHero.get(id) ?? []],
    ]),
    Soldier: materializeDomain('Soldier', soldierCatalog, hsBySoldier.keys(), (id) => [
      [0, hsBySoldier.get(id) ?? []],
    ]),
    Equipment: materializeDomain('Equipment', equipmentCatalog, exByEquipment.keys(), (id) => [
      [0, exByEquipment.get(id) ?? []],
    ]),
  };

  const canonicalEdgeCount = hsHeroArtifact.spec.requiredRelationCount + exHeroArtifact.spec.requiredRelationCount;
  const directionalReferenceCount = Object.values(domains).reduce((sum, domain) => sum + domain.referenceCount, 0);
  const inputProvenance = Object.fromEntries(Object.entries(inputs.canonical).map(([name, artifact]) => [name, provenance(artifact)]));
  const domainSummary = Object.fromEntries(Object.entries(domains).map(([domain, index]) => [domain, {
    path: contract.outputs.domains[domain],
    sourceCount: index.sourceCatalog.length,
    keyCount: index.keyCount,
    referenceCount: index.referenceCount,
  }]));

  const predecessor = {
    stage3Contract: inputs.predecessorContract.path,
    stage3ContractSha256: inputs.predecessorContract.sha256,
    stage3Summary: inputs.predecessorSummary.path,
    stage3SummarySha256: inputs.predecessorSummary.sha256,
  };

  const manifest = {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_4',
    status: 'CANONICAL_OVERLAY_MANIFEST_MATERIALIZED',
    contract: STAGE4_CONTRACT_PATH,
    predecessor,
    canonicalInputs: inputProvenance,
    canonicalRelationCount: 2,
    canonicalEdgeCount,
    directionalProjectionCount: 4,
    directionalReferenceCount,
    domains: domainSummary,
  };

  const summary = {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_4',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE4_CANONICAL_OVERLAY',
    contract: STAGE4_CONTRACT_PATH,
    predecessorStatus: inputs.predecessorSummary.value.status,
    canonicalRelationCount: 2,
    canonicalEdgeCount,
    directionalProjectionCount: 4,
    directionalReferenceCount,
    domains: domainSummary,
    semanticBoundary: {
      frozenCanonicalProjectionsOnly: true,
      rawConfigDataScanned: false,
      stage2ForwardIndexesScanned: false,
      stage3ReverseIndexesScanned: false,
      newRelationsDiscovered: false,
      transitiveRelationsGenerated: false,
      canonicalRelationsRecomputed: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
      rawLookupIndexesMutated: false,
    },
  };

  return { domains, manifest, summary, normalized: { hsByHero, hsBySoldier, exByHero, exByEquipment } };
}

export function renderDomain(value) {
  return `${JSON.stringify(value)}\n`;
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}
