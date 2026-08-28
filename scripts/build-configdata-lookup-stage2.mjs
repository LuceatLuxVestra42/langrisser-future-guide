import {
  buildDomainIndex,
  buildSummary,
  loadSourceTypes,
  loadStage2Contract,
  renderForwardIndex,
  renderJson,
  writeText,
} from './lib/configdata-lookup-stage2.mjs';

async function main() {
  const contract = await loadStage2Contract();
  const loaded = await loadSourceTypes(contract);
  const domainIndexes = {};

  for (const domain of ['Hero', 'Soldier', 'Equipment']) {
    const index = buildDomainIndex(domain, contract, loaded);
    domainIndexes[domain] = index;
    await writeText(contract.outputs[domain], renderForwardIndex(index));
    console.log(`${domain}: ${index.relationCount} relations / ${index.totalEdgeCount} edges -> ${contract.outputs[domain]}`);
  }

  const summary = buildSummary(contract, domainIndexes);
  await writeText(contract.outputs.summary, renderJson(summary));
  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
