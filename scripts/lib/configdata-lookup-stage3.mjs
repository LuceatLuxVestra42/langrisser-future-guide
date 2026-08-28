import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const STAGE3_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage3-reverse-reference-contract.v1.json';

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { text, value: JSON.parse(text) };
}

export function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertPositiveId(value, context) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error(`${context}: expected a positive integer ID string, got ${String(value)}`);
  }
  return value;
}

function compareIds(a, b) {
  const aa = BigInt(a);
  const bb = BigInt(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

export async function loadStage3Contract() {
  return (await readJson(STAGE3_CONTRACT_PATH)).value;
}

export async function loadStage2Artifacts(contract) {
  const stage2ContractArtifact = await readJson(contract.predecessor.contract);
  const stage2SummaryArtifact = await readJson(contract.predecessor.summary);
  const forwardIndexes = {};

  for (const [domain, filePath] of Object.entries(contract.inputs)) {
    const artifact = await readJson(filePath);
    forwardIndexes[domain] = {
      domain,
      path: filePath,
      text: artifact.text,
      sha256: sha256Utf8(artifact.text),
      value: artifact.value,
    };
  }

  return {
    stage2Contract: {
      path: contract.predecessor.contract,
      text: stage2ContractArtifact.text,
      sha256: sha256Utf8(stage2ContractArtifact.text),
      value: stage2ContractArtifact.value,
    },
    stage2Summary: {
      path: contract.predecessor.summary,
      text: stage2SummaryArtifact.text,
      sha256: sha256Utf8(stage2SummaryArtifact.text),
      value: stage2SummaryArtifact.value,
    },
    forwardIndexes,
  };
}

function collectStage2Relations(stage2Contract, forwardIndexes) {
  const relationOrder = new Map(stage2Contract.relations.map((relation, index) => [relation.name, index]));
  const materializedByName = new Map();

  for (const [domain, artifact] of Object.entries(forwardIndexes)) {
    const index = artifact.value;
    if (!index || typeof index !== 'object' || Array.isArray(index)) {
      throw new Error(`${domain}: Stage 2 forward index must be an object`);
    }
    if (!Array.isArray(index.relations)) {
      throw new Error(`${domain}: Stage 2 forward index relations must be an array`);
    }
    for (const relation of index.relations) {
      if (materializedByName.has(relation.name)) {
        throw new Error(`duplicate Stage 2 materialized relation ${relation.name}`);
      }
      materializedByName.set(relation.name, { domain, relation });
    }
  }

  const ordered = [];
  for (const spec of stage2Contract.relations) {
    const materialized = materializedByName.get(spec.name);
    if (!materialized) throw new Error(`missing Stage 2 materialized relation ${spec.name}`);
    if (materialized.domain !== spec.domain) {
      throw new Error(`${spec.name}: domain mismatch ${materialized.domain} != ${spec.domain}`);
    }
    const relation = materialized.relation;
    for (const field of ['sourceType', 'sourceField', 'cardinality', 'targetType', 'semanticStatus']) {
      if (relation[field] !== spec[field]) {
        throw new Error(`${spec.name}: ${field} mismatch ${String(relation[field])} != ${String(spec[field])}`);
      }
    }
    if (!Array.isArray(relation.edges)) throw new Error(`${spec.name}: edges must be an array`);
    if (relation.edgeCount !== relation.edges.length) {
      throw new Error(`${spec.name}: edgeCount ${relation.edgeCount} != edges.length ${relation.edges.length}`);
    }
    ordered.push({ spec, relation, relationOrder: relationOrder.get(spec.name) });
  }

  if (materializedByName.size !== ordered.length) {
    const extras = [...materializedByName.keys()].filter((name) => !relationOrder.has(name));
    throw new Error(`Stage 2 materialized relation set differs from contract: ${extras.join(', ')}`);
  }

  return ordered;
}

function buildInputProvenance(artifacts) {
  return Object.fromEntries(Object.entries(artifacts.forwardIndexes).map(([domain, artifact]) => [domain, {
    path: artifact.path,
    sha256: artifact.sha256,
    relationCount: artifact.value.relationCount,
    edgeCount: artifact.value.totalEdgeCount,
  }]));
}

export function buildStage3Artifacts(contract, artifacts) {
  const orderedRelations = collectStage2Relations(artifacts.stage2Contract.value, artifacts.forwardIndexes);
  const targetTypeSet = new Set(contract.targetTypeOrder);
  const reverseMaps = Object.fromEntries(contract.targetTypeOrder.map((targetType) => [targetType, new Map()]));
  let totalReferenceCount = 0;

  for (const { spec, relation, relationOrder } of orderedRelations) {
    if (!targetTypeSet.has(spec.targetType)) {
      throw new Error(`${spec.name}: targetType ${spec.targetType} is not declared in Stage 3 targetTypeOrder`);
    }

    const targetMap = reverseMaps[spec.targetType];
    for (let edgeIndex = 0; edgeIndex < relation.edges.length; edgeIndex += 1) {
      const edge = relation.edges[edgeIndex];
      if (!Array.isArray(edge) || edge.length !== 2) {
        throw new Error(`${spec.name}[${edgeIndex}]: expected [sourceId,targetId]`);
      }
      const sourceId = assertPositiveId(edge[0], `${spec.name}[${edgeIndex}].sourceId`);
      const targetId = assertPositiveId(edge[1], `${spec.name}[${edgeIndex}].targetId`);

      let relationMap = targetMap.get(targetId);
      if (!relationMap) {
        relationMap = new Map();
        targetMap.set(targetId, relationMap);
      }

      let group = relationMap.get(spec.name);
      if (!group) {
        group = {
          relation: spec.name,
          relationOrder,
          sourceType: spec.sourceType,
          semanticStatus: spec.semanticStatus,
          sourceIds: new Set(),
        };
        relationMap.set(spec.name, group);
      }

      if (group.sourceIds.has(sourceId)) {
        throw new Error(`${spec.name}: duplicate Stage 2 edge ${sourceId} -> ${targetId}`);
      }
      group.sourceIds.add(sourceId);
      totalReferenceCount += 1;
    }
  }

  const inputProvenance = buildInputProvenance(artifacts);
  const targetIndexes = {};

  for (const targetType of contract.targetTypeOrder) {
    const targetMap = reverseMaps[targetType];
    const relationEntries = orderedRelations.filter(({ spec }) => spec.targetType === targetType);
    const relationCatalog = relationEntries.map(({ spec }, slot) => ({
      slot,
      relation: spec.name,
      sourceType: spec.sourceType,
      semanticStatus: spec.semanticStatus,
    }));
    const relationSlotByName = new Map(relationCatalog.map((entry) => [entry.relation, entry.slot]));
    const relationNames = relationCatalog.map((entry) => entry.relation);
    const byTargetId = {};
    let referenceCount = 0;

    for (const targetId of [...targetMap.keys()].sort(compareIds)) {
      const groups = [...targetMap.get(targetId).values()]
        .sort((a, b) => a.relationOrder - b.relationOrder)
        .map((group) => {
          const sourceIds = [...group.sourceIds].sort(compareIds);
          referenceCount += sourceIds.length;
          return [relationSlotByName.get(group.relation), sourceIds];
        });
      byTargetId[targetId] = groups;
    }

    targetIndexes[targetType] = {
      schemaVersion: 1,
      stage: 'CONFIGDATA_LOOKUP_STAGE_3',
      status: 'REVERSE_REFERENCE_INDEX_MATERIALIZED',
      targetType,
      contract: STAGE3_CONTRACT_PATH,
      predecessor: {
        stage2ContractSha256: artifacts.stage2Contract.sha256,
        stage2SummarySha256: artifacts.stage2Summary.sha256,
      },
      tupleFormat: '[relationSlot, sourceIds]',
      relationCount: relationCatalog.length,
      relationCatalog,
      targetCount: Object.keys(byTargetId).length,
      referenceCount,
      byTargetId,
    };
  }

  const manifestTargets = {};
  let totalTargetCount = 0;
  for (const targetType of contract.targetTypeOrder) {
    const index = targetIndexes[targetType];
    manifestTargets[targetType] = {
      path: contract.outputs.targets[targetType],
      relationCount: index.relationCount,
      relationNames: index.relationCatalog.map((entry) => entry.relation),
      targetCount: index.targetCount,
      referenceCount: index.referenceCount,
    };
    totalTargetCount += index.targetCount;
  }

  const manifest = {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_3',
    status: 'REVERSE_REFERENCE_MANIFEST_MATERIALIZED',
    contract: STAGE3_CONTRACT_PATH,
    predecessor: {
      stage2Contract: artifacts.stage2Contract.path,
      stage2ContractSha256: artifacts.stage2Contract.sha256,
      stage2Summary: artifacts.stage2Summary.path,
      stage2SummarySha256: artifacts.stage2Summary.sha256,
    },
    inputs: inputProvenance,
    targetTypeOrder: contract.targetTypeOrder,
    relationCount: orderedRelations.length,
    totalTargetCount,
    totalReferenceCount,
    targets: manifestTargets,
  };

  const summary = {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_3',
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE3_REVERSE_REFS',
    contract: STAGE3_CONTRACT_PATH,
    predecessorStatus: artifacts.stage2Summary.value.status,
    predecessorRelationCount: artifacts.stage2Summary.value.relationCount,
    predecessorEdgeCount: artifacts.stage2Summary.value.totalEdgeCount,
    targetTypeCount: contract.targetTypeOrder.length,
    relationCount: orderedRelations.length,
    totalTargetCount,
    totalReferenceCount,
    targets: manifestTargets,
    semanticBoundary: {
      stage2ApprovedEdgesOnly: true,
      rawConfigDataScanned: false,
      arbitraryNumericFieldsScanned: false,
      newRelationsDiscovered: false,
      transitiveRelationsGenerated: false,
      canonicalRelationsRecomputed: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
    },
  };

  if (totalReferenceCount !== summary.totalReferenceCount) {
    throw new Error(`internal reverse reference total mismatch ${totalReferenceCount} != ${summary.totalReferenceCount}`);
  }

  return { targetIndexes, manifest, summary };
}

export function renderReverseIndex(value) {
  return `${JSON.stringify(value)}\n`;
}

export function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}
