import fs from 'node:fs/promises';
import {
  buildStage3Artifacts,
  loadStage2Artifacts,
  loadStage3Contract,
  renderJson,
  renderReverseIndex,
} from './lib/configdata-lookup-stage3.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const contract = await loadStage3Contract();
  assert(contract.status === 'REVERSE_REFERENCE_CONTRACT_FROZEN', 'Stage 3 contract is not frozen');
  assert(Array.isArray(contract.targetTypeOrder) && contract.targetTypeOrder.length > 0, 'Stage 3 targetTypeOrder is empty');
  assert(new Set(contract.targetTypeOrder).size === contract.targetTypeOrder.length, 'Stage 3 targetTypeOrder contains duplicates');

  for (const targetType of contract.targetTypeOrder) {
    assert(contract.outputs.targets[targetType], `${targetType}: missing Stage 3 output path`);
  }

  const stage2 = await loadStage2Artifacts(contract);
  const stage2Contract = stage2.stage2Contract.value;
  const stage2Summary = stage2.stage2Summary.value;

  assert(stage2Contract.status === 'FORWARD_JOIN_CONTRACT_FROZEN', 'Stage 2 predecessor contract is not frozen');
  assert(stage2Summary.status === contract.predecessor.requiredStatus, `Stage 2 predecessor status=${stage2Summary.status}`);
  assert(stage2Summary.relationCount === contract.predecessor.requiredRelationCount, `Stage 2 predecessor relationCount=${stage2Summary.relationCount}`);
  assert(Array.isArray(stage2Contract.relations), 'Stage 2 predecessor relations must be an array');
  assert(stage2Contract.relations.length === contract.predecessor.requiredRelationCount, 'Stage 2 contract relation count differs from Stage 3 predecessor contract');

  let forwardEdgeCount = 0;
  const materializedRelationNames = [];
  for (const [domain, artifact] of Object.entries(stage2.forwardIndexes)) {
    const index = artifact.value;
    assert(index.stage === 'CONFIGDATA_LOOKUP_STAGE_2', `${domain}: wrong predecessor stage`);
    assert(index.status === 'FORWARD_JOIN_INDEX_MATERIALIZED', `${domain}: predecessor forward index is not materialized`);
    assert(index.domain === domain, `${domain}: predecessor domain mismatch`);
    assert(index.contract === contract.predecessor.contract, `${domain}: predecessor contract path mismatch`);
    assert(Array.isArray(index.relations), `${domain}: predecessor relations must be an array`);
    assert(index.relationCount === index.relations.length, `${domain}: predecessor relationCount mismatch`);
    assert(index.totalEdgeCount === index.relations.reduce((sum, relation) => sum + relation.edgeCount, 0), `${domain}: predecessor edge count mismatch`);
    forwardEdgeCount += index.totalEdgeCount;
    materializedRelationNames.push(...index.relations.map((relation) => relation.name));
  }

  const contractRelationNames = stage2Contract.relations.map((relation) => relation.name);
  assert(JSON.stringify(materializedRelationNames) === JSON.stringify(contractRelationNames), 'Stage 2 materialized relation set/order differs from its frozen contract');
  assert(forwardEdgeCount === stage2Summary.totalEdgeCount, `Stage 2 forward edge total ${forwardEdgeCount} != summary ${stage2Summary.totalEdgeCount}`);

  const { targetIndexes, manifest, summary } = buildStage3Artifacts(contract, stage2);
  let generatedReferenceCount = 0;

  for (const targetType of contract.targetTypeOrder) {
    const expected = targetIndexes[targetType];
    const outputPath = contract.outputs.targets[targetType];
    const actualText = await fs.readFile(outputPath, 'utf8');
    assert(actualText === renderReverseIndex(expected), `${targetType}: generated reverse index is stale or non-deterministic`);
    generatedReferenceCount += expected.referenceCount;
    console.log(`${targetType}: PASS (${expected.targetCount} targets / ${expected.referenceCount} refs)`);
  }

  assert(generatedReferenceCount === stage2Summary.totalEdgeCount, `reverse ref total ${generatedReferenceCount} != Stage 2 edge total ${stage2Summary.totalEdgeCount}`);
  assert(manifest.totalReferenceCount === stage2Summary.totalEdgeCount, 'manifest reverse ref total differs from Stage 2 edge total');
  assert(summary.totalReferenceCount === stage2Summary.totalEdgeCount, 'summary reverse ref total differs from Stage 2 edge total');
  assert(summary.relationCount === stage2Summary.relationCount, 'summary relation count differs from Stage 2 relation count');

  const actualManifestText = await fs.readFile(contract.outputs.manifest, 'utf8');
  assert(actualManifestText === renderJson(manifest), 'Stage 3 manifest is stale or non-deterministic');
  const actualSummaryText = await fs.readFile(contract.outputs.summary, 'utf8');
  assert(actualSummaryText === renderJson(summary), 'Stage 3 summary is stale or non-deterministic');

  const boundary = summary.semanticBoundary;
  assert(boundary.stage2ApprovedEdgesOnly === true, 'Stage 2 approved-edge boundary missing');
  assert(boundary.rawConfigDataScanned === false, 'raw ConfigData scan boundary violated');
  assert(boundary.arbitraryNumericFieldsScanned === false, 'arbitrary numeric-field scan boundary violated');
  assert(boundary.newRelationsDiscovered === false, 'new relation discovery boundary violated');
  assert(boundary.transitiveRelationsGenerated === false, 'transitive relation boundary violated');
  assert(boundary.canonicalRelationsRecomputed === false, 'canonical recomputation boundary violated');
  assert(boundary.nameJoinUsed === false, 'name JOIN boundary violated');
  assert(boundary.idArithmeticUsed === false, 'ID arithmetic boundary violated');

  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
