import {
  buildEntityIndex,
  buildSummary,
  loadStage1Contract,
  writeJson,
} from './lib/configdata-lookup-stage1.mjs';

const SUMMARY_PATH = 'data/validation/configdata-lookup-stage1-summary.v1.json';

async function main() {
  const contract = await loadStage1Contract();
  const built = {};

  for (const [entity, spec] of Object.entries(contract.entities)) {
    const index = await buildEntityIndex(entity, spec, contract);
    await writeJson(spec.output, index);
    built[entity] = index;
    console.log(`${entity}: ${index.index.entryCount} IDs -> ${spec.output}`);
  }

  const summary = await buildSummary(contract, built);
  await writeJson(SUMMARY_PATH, summary);
  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
