await import('./configdata-lookup-self-test.mjs');
const { runShadowParity } = await import('./configdata-lookup-shadow-parity.mjs');
const shadow = await runShadowParity({ emit: true });
const cutover = (await import('./configdata-lookup-clr7-cutover.mjs')).default;

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'CONFIGDATA_LOOKUP_CLR7_OWNER_SELF_TEST',
  components: [
    'CONFIGDATA_LOOKUP_CLR3_READ_ONLY_SELF_TEST',
    'CONFIGDATA_LOOKUP_CLR5_WRITER_SEPARATION_FROZEN',
    shadow.completion,
    cutover.completion,
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
  boundaries: {
    ...shadow.boundaries,
    trackedMutationCount: cutover.boundaries.trackedMutationCount,
  },
}, null, 2));
