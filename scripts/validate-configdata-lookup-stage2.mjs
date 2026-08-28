import fs from 'node:fs/promises';
import {
  STAGE1_SUMMARY_PATH,
  buildDomainIndex,
  buildSummary,
  loadSourceTypes,
  loadStage2Contract,
  readJson,
  renderForwardIndex,
  renderJson,
} from './lib/configdata-lookup-stage2.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const stage1 = (await readJson(STAGE1_SUMMARY_PATH)).value;
  const contract = await loadStage2Contract();

  assert(stage1.status === contract.predecessor.requiredStatus, `Stage 1 predecessor status=${stage1.status}`);
  assert(contract.status === 'FORWARD_JOIN_CONTRACT_FROZEN', 'Stage 2 contract is not frozen');
  assert(Array.isArray(contract.relations) && contract.relations.length > 0, 'Stage 2 relation allowlist is empty');

  const relationNames = contract.relations.map((relation) => relation.name);
  assert(new Set(relationNames).size === relationNames.length, 'Stage 2 relation names must be unique');
  for (const relation of contract.relations) {
    assert(['Hero', 'Soldier', 'Equipment'].includes(relation.domain), `${relation.name}: unsupported domain`);
    assert(['ONE', 'MANY'].includes(relation.cardinality), `${relation.name}: unsupported cardinality`);
    assert(contract.sourceTypes[relation.sourceType], `${relation.name}: missing sourceType declaration`);
    assert(contract.sourceTypes[relation.targetType], `${relation.name}: missing targetType declaration`);
  }

  const loaded = await loadSourceTypes(contract);
  const domainIndexes = {};
  const emittedRelationNames = [];

  for (const domain of ['Hero', 'Soldier', 'Equipment']) {
    const expected = buildDomainIndex(domain, contract, loaded);
    const actualText = await fs.readFile(contract.outputs[domain], 'utf8');
    assert(actualText === renderForwardIndex(expected), `${domain}: generated forward index is stale or non-deterministic`);
    domainIndexes[domain] = expected;
    emittedRelationNames.push(...expected.relations.map((relation) => relation.name));
    console.log(`${domain}: PASS (${expected.relationCount} relations / ${expected.totalEdgeCount} edges)`);
  }

  assert(JSON.stringify(emittedRelationNames) === JSON.stringify(relationNames), 'Emitted relation set/order differs from Stage 2 allowlist');

  const expectedSummary = buildSummary(contract, domainIndexes);
  const actualSummaryText = await fs.readFile(contract.outputs.summary, 'utf8');
  assert(actualSummaryText === renderJson(expectedSummary), 'Stage 2 summary is stale or non-deterministic');

  const boundary = expectedSummary.semanticBoundary;
  assert(boundary.directAllowlistedReferencesOnly === true, 'direct-only boundary missing');
  assert(boundary.inverseRelationsGenerated === false, 'inverse relation boundary violated');
  assert(boundary.transitiveRelationsGenerated === false, 'transitive relation boundary violated');
  assert(boundary.canonicalRelationsRecomputed === false, 'canonical recomputation boundary violated');
  assert(boundary.nameJoinUsed === false, 'name JOIN boundary violated');
  assert(boundary.idArithmeticUsed === false, 'ID arithmetic boundary violated');
  assert(boundary.soldierGrowthPathSelected === false, 'Soldier growth-path selection boundary violated');
  assert(boundary.equipmentMaxSkillSelected === false, 'Equipment max-skill selection boundary violated');

  console.log(expectedSummary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
