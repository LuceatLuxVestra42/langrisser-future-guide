import fs from 'node:fs/promises';
import {
  buildEntityIndex,
  buildSummary,
  loadStage0Contract,
  loadStage1Contract,
  readJson,
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
  assert(Array.isArray(actual.index?.ids), `${entity}: index.ids must be an array`);
  assert(actual.index?.byId && typeof actual.index.byId === 'object', `${entity}: index.byId missing`);
  assert(actual.index.entryCount === actual.index.ids.length, `${entity}: entry count mismatch`);
  assert(Object.keys(actual.index.byId).length === actual.index.ids.length, `${entity}: byId count mismatch`);

  const allowedLabels = new Set(spec.searchLabelFields ?? []);
  for (const id of actual.index.ids) {
    const entry = actual.index.byId[id];
    assert(entry && typeof entry === 'object' && !Array.isArray(entry), `${entity} ${id}: invalid index entry`);
    const entryKeys = Object.keys(entry);
    assert(entryKeys.every((key) => key === 'recordIndex' || key === 'labels'), `${entity} ${id}: unexpected entry field`);
    assert(Number.isInteger(entry.recordIndex) && entry.recordIndex >= 0, `${entity} ${id}: invalid recordIndex`);
    assert(!Object.hasOwn(entry, 'record'), `${entity} ${id}: full source record copy is forbidden`);

    if (entry.labels !== undefined) {
      assert(entry.labels && typeof entry.labels === 'object' && !Array.isArray(entry.labels), `${entity} ${id}: invalid labels`);
      for (const [field, value] of Object.entries(entry.labels)) {
        assert(allowedLabels.has(field), `${entity} ${id}: unapproved label field ${field}`);
        assert(typeof value === 'string' && value.length > 0, `${entity} ${id}: invalid label value`);
      }
    }
  }
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
    assert(actualText === renderJson(expected), `${entity}: generated index is stale or non-deterministic`);

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
