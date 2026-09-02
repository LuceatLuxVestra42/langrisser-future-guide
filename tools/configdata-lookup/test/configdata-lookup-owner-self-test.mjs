await import('./configdata-lookup-self-test.mjs');
const { runShadowParity } = await import('./configdata-lookup-shadow-parity.mjs');
const shadow = await runShadowParity({ emit: true });
const cutover = (await import('./configdata-lookup-clr7-cutover.mjs')).default;
const finalFreeze = (await import('./configdata-lookup-clr8-final-freeze.mjs')).default;
const { runB3SourceRootCutover } = await import('./configdata-source-root-cutover-b3.mjs');
const sourceRootCutover = await runB3SourceRootCutover({ emit: true });

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'CONFIGDATA_LOOKUP_B3_OWNER_SELF_TEST',
  components: [
    'CONFIGDATA_LOOKUP_CLR3_READ_ONLY_SELF_TEST',
    'CONFIGDATA_LOOKUP_CLR5_WRITER_SEPARATION_FROZEN',
    shadow.completion,
    cutover.completion,
    finalFreeze.completion,
    sourceRootCutover.completion,
  ],
  shadow: {
    contractParity: shadow.contractParity,
    checkedExportCount: shadow.adapterIdentity.checkedExportCount,
    materializedInputFileCount: shadow.materializedInputInventory.fileCount,
    materializedInputBytes: shadow.materializedInputInventory.totalBytes,
    lookupPopulationCount: shadow.shadow.lookup.populationCount,
    refsPopulationCount: shadow.shadow.refs.populationCount,
    findLabelPopulationCount: shadow.shadow.find.labelPopulationCount,
    lookupExecutedCaseCount: shadow.shadow.lookup.executedCaseCount,
    refsExecutedCaseCount: shadow.shadow.refs.executedCaseCount,
    findExecutedCaseCount: shadow.shadow.find.executedCaseCount,
    staleCount: shadow.freshness.staleCount,
  },
  cutover: {
    packageCliAuthority: cutover.packageCliAuthority,
    legacyAuthority: cutover.legacyAuthority,
  },
  finalFreeze: {
    predecessorCount: finalFreeze.predecessorCount,
    inventory: finalFreeze.inventory,
  },
  sourceRootCutover: {
    logicalRoot: sourceRootCutover.logicalRoot,
    physicalRootSelector: sourceRootCutover.physicalRootSelector,
    activeRawSourceCount: sourceRootCutover.activeRawSourceCount,
    stage1EntityCount: sourceRootCutover.stage1EntityCount,
    stage2DomainCount: sourceRootCutover.stage2DomainCount,
    stage6StaleCount: sourceRootCutover.stage6StaleCount,
    logicalPathMetadataChangedCount: sourceRootCutover.logicalPathMetadataChangedCount,
    materializedByteDriftCount: sourceRootCutover.materializedByteDriftCount,
  },
  boundaries: {
    ...shadow.boundaries,
    trackedMutationCount: finalFreeze.boundaries.trackedMutationCount,
    semanticMutationCount: finalFreeze.boundaries.semanticMutationCount,
    rawConfigDataReadCount: finalFreeze.boundaries.rawConfigDataReadCount,
    materializationRebuildCount: finalFreeze.boundaries.materializationRebuildCount,
    writerExecutionCount: finalFreeze.boundaries.writerExecutionCount,
    stage7ActiveAuthorityCount: finalFreeze.boundaries.stage7ActiveAuthorityCount,
    stage8ActiveAuthorityCount: finalFreeze.boundaries.stage8ActiveAuthorityCount,
    sourceRootTrackedRawMutationCount: sourceRootCutover.trackedRawMutationCount,
    sourceRootSemanticMutationCount: sourceRootCutover.semanticMutationCount,
  },
}, null, 2));
