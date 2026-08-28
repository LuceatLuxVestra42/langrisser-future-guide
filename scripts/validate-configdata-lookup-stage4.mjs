import fs from 'node:fs/promises';
import {
  buildStage4Artifacts,
  loadStage4Contract,
  loadStage4Inputs,
  projectionPairSet,
  renderDomain,
  renderJson,
} from './lib/configdata-lookup-stage4.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inverseSet(pairSet) {
  return new Set([...pairSet].map((pair) => {
    const split = pair.indexOf(':');
    return `${pair.slice(split + 1)}:${pair.slice(0, split)}`;
  }));
}

function assertSameSet(actual, expected, label) {
  assert(actual.size === expected.size, `${label}: size ${actual.size} != ${expected.size}`);
  for (const item of actual) assert(expected.has(item), `${label}: missing reciprocal ${item}`);
}

async function main() {
  const contract = await loadStage4Contract();
  assert(contract.status === 'CANONICAL_OVERLAY_CONTRACT_FROZEN', 'Stage 4 contract is not frozen');

  const inputs = await loadStage4Inputs(contract);
  assert(inputs.predecessorContract.value.status === 'REVERSE_REFERENCE_CONTRACT_FROZEN', 'Stage 3 predecessor contract is not frozen');
  assert(inputs.predecessorSummary.value.status === contract.predecessor.requiredStatus, `Stage 3 predecessor status=${inputs.predecessorSummary.value.status}`);

  for (const [name, artifact] of Object.entries(inputs.canonical)) {
    const { spec, value, path } = artifact;
    assert(!path.startsWith('data/configdata/'), `${name}: raw ConfigData input is forbidden`);
    assert(!path.startsWith('data/index/forward/'), `${name}: Stage 2 forward index input is forbidden`);
    assert(!path.startsWith('data/index/reverse/'), `${name}: Stage 3 reverse index input is forbidden`);
    assert(value.schemaId === spec.schemaId, `${name}: schemaId=${value.schemaId}`);
    assert(value.summary?.keyCount === spec.requiredKeyCount, `${name}: keyCount=${value.summary?.keyCount}`);
    assert(value.summary?.relationCount === spec.requiredRelationCount, `${name}: relationCount=${value.summary?.relationCount}`);
    assert(value.relationSet?.path === spec.relationSetPath, `${name}: relationSet path changed`);
    assert(value.relationSet?.gitBlobSha === spec.relationSetGitBlobSha, `${name}: relationSet blob identity changed`);
  }

  const { domains, manifest, summary, normalized } = buildStage4Artifacts(contract, inputs);

  const hsForward = projectionPairSet(normalized.hsByHero, 'heroSoldierByHero');
  const hsReverse = projectionPairSet(normalized.hsBySoldier, 'heroSoldierBySoldier');
  assert(hsForward.size === 5977, `Hero-Soldier forward pair count=${hsForward.size}`);
  assert(hsReverse.size === 5977, `Hero-Soldier reverse pair count=${hsReverse.size}`);
  assertSameSet(hsForward, inverseSet(hsReverse), 'Hero-Soldier reciprocal parity');

  const exForward = projectionPairSet(normalized.exByHero, 'exclusiveEquipmentByHero');
  const exReverse = projectionPairSet(normalized.exByEquipment, 'exclusiveEquipmentByEquipment');
  assert(exForward.size === 167, `Hero-ExclusiveEquipment forward pair count=${exForward.size}`);
  assert(exReverse.size === 167, `Hero-ExclusiveEquipment reverse pair count=${exReverse.size}`);
  assertSameSet(exForward, inverseSet(exReverse), 'Hero-ExclusiveEquipment reciprocal parity');

  assert(domains.Hero.keyCount === 267, `Hero overlay keyCount=${domains.Hero.keyCount}`);
  assert(domains.Soldier.keyCount === 224, `Soldier overlay keyCount=${domains.Soldier.keyCount}`);
  assert(domains.Equipment.keyCount === 167, `Equipment overlay keyCount=${domains.Equipment.keyCount}`);
  assert(domains.Hero.referenceCount === 6144, `Hero overlay refs=${domains.Hero.referenceCount}`);
  assert(domains.Soldier.referenceCount === 5977, `Soldier overlay refs=${domains.Soldier.referenceCount}`);
  assert(domains.Equipment.referenceCount === 167, `Equipment overlay refs=${domains.Equipment.referenceCount}`);
  assert(summary.canonicalEdgeCount === 6144, `canonical edge count=${summary.canonicalEdgeCount}`);
  assert(summary.directionalReferenceCount === 12288, `directional ref count=${summary.directionalReferenceCount}`);

  for (const [domain, expected] of Object.entries(domains)) {
    const actualText = await fs.readFile(contract.outputs.domains[domain], 'utf8');
    assert(actualText === renderDomain(expected), `${domain}: overlay is stale or non-deterministic`);
    console.log(`${domain}: PASS (${expected.keyCount} keys / ${expected.referenceCount} refs)`);
  }

  const actualManifest = await fs.readFile(contract.outputs.manifest, 'utf8');
  assert(actualManifest === renderJson(manifest), 'Stage 4 manifest is stale or non-deterministic');
  const actualSummary = await fs.readFile(contract.outputs.summary, 'utf8');
  assert(actualSummary === renderJson(summary), 'Stage 4 summary is stale or non-deterministic');

  const boundary = summary.semanticBoundary;
  assert(boundary.frozenCanonicalProjectionsOnly === true, 'frozen projection boundary missing');
  assert(boundary.rawConfigDataScanned === false, 'raw ConfigData boundary violated');
  assert(boundary.stage2ForwardIndexesScanned === false, 'Stage 2 forward boundary violated');
  assert(boundary.stage3ReverseIndexesScanned === false, 'Stage 3 reverse boundary violated');
  assert(boundary.newRelationsDiscovered === false, 'new relation discovery boundary violated');
  assert(boundary.transitiveRelationsGenerated === false, 'transitive relation boundary violated');
  assert(boundary.canonicalRelationsRecomputed === false, 'canonical recomputation boundary violated');
  assert(boundary.nameJoinUsed === false, 'name JOIN boundary violated');
  assert(boundary.idArithmeticUsed === false, 'ID arithmetic boundary violated');
  assert(boundary.rawLookupIndexesMutated === false, 'raw lookup mutation boundary violated');

  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
