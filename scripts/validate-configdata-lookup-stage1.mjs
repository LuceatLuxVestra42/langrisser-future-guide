import fs from 'node:fs/promises';
import {
  buildEntityIndex,
  buildSummary,
  loadStage0Contract,
  loadStage1Contract,
  readJson,
  renderIndexJson,
  renderJson,
} from './lib/configdata-lookup-stage1.mjs';

const SUMMARY_PATH = 'data/validation/configdata-lookup-stage1-summary.v1.json';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateIndexShape(entity, spec, actual) {
  assert(actual.schemaVersion === 1, `${entity}: schemaVersion mismatch`);
  assert(actual.stage === 'CONFIGDATA_LOOKUP_STAGE_1', `${entity}: stage mismatch`);
  assert(actual.status === 'ID_INDEX_MATERIALIZED', `${entity}: status mismatch`);
  assert(actual.entity === entity, `${entity}: entity mismatch`);
  assert(actual.source?.path === spec.source, `${entity}: source path mismatch`);
  assert(actual.source?.primaryKey === spec.primaryKey, `${entity}: primary key mismatch`);
  assert(Array.isArray(actual.index?.entries), `${entity}: index.entries must be an array`);
  assert(actual.index.entryCount === actual.index.entries.length, `${entity}: entry count mismatch`);
  assert(actual.index.labelField === (spec.searchLabelField ?? null), `${entity}: label field mismatch`);

  const seen = new Set();
  for (const tuple of actual.index.entries) {
    assert(Array.isArray(tuple) && (tuple.length === 2 || tuple.length === 3), `${entity}: invalid entry tuple`);
    const [id, recordIndex, label] = tuple;
    assert(typeof id === 'string' && id.length > 0, `${entity}: invalid tuple ID`);
    assert(!seen.has(id), `${entity}: duplicate tuple ID ${id}`);
    seen.add(id);
    assert(Number.isInteger(recordIndex) && recordIndex >= 0, `${entity} ${id}: invalid recordIndex`);
    if (tuple.length === 3) {
      assert(typeof label === 'string' && label.length > 0, `${entity} ${id}: invalid discovery label`);
    }
  }

  const serialized = JSON.stringify(actual);
  assert(!serialized.includes('"record":'), `${entity}: full source record copy is forbidden`);
}

async function main() {
  const stage0 = await loadStage0Contract();
  const contract = await loadStage1Contract();

  assert(stage0.status === 'CONTRACT_FROZEN', 'Stage 0 predecessor contract is not frozen');
  assert(contract.status === 'ID_INDEX_CONTRACT_FROZEN', 'Stage 1 contract is not frozen');
  assert(contract.predecessor?.contract === 'data/contracts/configdata-lookup-stage0-contract.v1.json', 'Stage 1 predecessor path mismatch');
  assert(Object.keys(contract.entities ?? {}).length === 4, 'Stage 1 must contain exactly four MVP entities');

  const built = {};

  for (const [entity, spec] of Object.entries(contract.entities)) {
    const expected = await buildEntityIndex(entity, spec, contract);
    const { text: actualText, value: actual } = await readJson(spec.output);

    validateIndexShape(entity, spec, actual);
    assert(actualText === renderIndexJson(expected), `${entity}: generated index is stale or non-deterministic`);

    built[entity] = expected;
    console.log(`${entity}: PASS (${expected.index.entryCount} IDs, ${expected.source.sha256.slice(0, 12)}...)`);
  }

  const expectedSummary = await buildSummary(contract, built);
  const actualSummaryText = await fs.readFile(SUMMARY_PATH, 'utf8');
  assert(actualSummaryText === renderJson(expectedSummary), 'Stage 1 summary is stale or non-deterministic');

  assert(expectedSummary.semanticBoundary.fullSourceRecordsDuplicated === false, 'full record duplication boundary violated');
  assert(expectedSummary.semanticBoundary.forwardRelationsGenerated === false, 'forward relation boundary violated');
  assert(expectedSummary.semanticBoundary.reverseRelationsGenerated === false, 'reverse relation boundary violated');
  assert(expectedSummary.semanticBoundary.canonicalRelationsRecomputed === false, 'canonical relation boundary violated');
  assert(expectedSummary.semanticBoundary.nameJoinUsed === false, 'name JOIN boundary violated');
  assert(expectedSummary.semanticBoundary.idArithmeticUsed === false, 'ID arithmetic boundary violated');

  console.log(expectedSummary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
