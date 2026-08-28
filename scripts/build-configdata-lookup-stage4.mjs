import {
  buildStage4Artifacts,
  loadStage4Contract,
  loadStage4Inputs,
  renderDomain,
  renderJson,
  writeText,
} from './lib/configdata-lookup-stage4.mjs';

async function main() {
  const contract = await loadStage4Contract();
  const inputs = await loadStage4Inputs(contract);
  const { domains, manifest, summary } = buildStage4Artifacts(contract, inputs);

  for (const [domain, index] of Object.entries(domains)) {
    const outputPath = contract.outputs.domains[domain];
    await writeText(outputPath, renderDomain(index));
    console.log(`${domain}: ${index.keyCount} keys / ${index.referenceCount} canonical refs -> ${outputPath}`);
  }

  await writeText(contract.outputs.manifest, renderJson(manifest));
  await writeText(contract.outputs.summary, renderJson(summary));
  console.log(`${summary.canonicalEdgeCount} canonical edges / ${summary.directionalReferenceCount} directional overlay refs`);
  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
