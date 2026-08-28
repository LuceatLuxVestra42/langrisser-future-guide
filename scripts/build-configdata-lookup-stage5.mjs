import {
  buildStage5Summary,
  loadStage5Contract,
  loadStage5Predecessor,
  renderJson,
  writeText,
} from './lib/configdata-lookup-stage5.mjs';

async function main() {
  const contract = await loadStage5Contract();
  const predecessor = await loadStage5Predecessor(contract);
  const summary = buildStage5Summary(contract, predecessor.summary);
  await writeText(contract.outputs.summary, renderJson(summary));
  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
