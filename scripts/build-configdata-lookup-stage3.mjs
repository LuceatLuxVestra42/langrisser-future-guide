import {
  buildStage3Artifacts,
  loadStage2Artifacts,
  loadStage3Contract,
  renderJson,
  writeText,
} from './lib/configdata-lookup-stage3.mjs';

async function main() {
  const contract = await loadStage3Contract();
  const stage2 = await loadStage2Artifacts(contract);
  const { targetIndexes, manifest, summary } = buildStage3Artifacts(contract, stage2);

  for (const targetType of contract.targetTypeOrder) {
    const index = targetIndexes[targetType];
    const outputPath = contract.outputs.targets[targetType];
    await writeText(outputPath, renderJson(index));
    console.log(`${targetType}: ${index.targetCount} targets / ${index.referenceCount} refs -> ${outputPath}`);
  }

  await writeText(contract.outputs.manifest, renderJson(manifest));
  await writeText(contract.outputs.summary, renderJson(summary));
  console.log(`${summary.totalReferenceCount} reverse refs across ${summary.targetTypeCount} target types`);
  console.log(summary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
