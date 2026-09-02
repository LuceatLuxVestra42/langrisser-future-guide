import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIGDATA_SOURCE_ROOT_ENV,
  LOGICAL_CONFIGDATA_ROOT,
  getConfiguredConfigDataSourceRoot,
  getDefaultConfigDataSourceRoot,
  installConfigDataSourceRootReadRedirect,
  resolveConfigDataSourcePath,
} from '../lib/configdata-source-root.mjs';

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runB4ExternalCleanRoom({ emit = true } = {}) {
  const repoRoot = getDefaultConfigDataSourceRoot();
  const configuredRoot = getConfiguredConfigDataSourceRoot();
  const repoRawRoot = path.join(repoRoot, ...LOGICAL_CONFIGDATA_ROOT.split('/'));
  const externalRawRoot = path.join(configuredRoot, ...LOGICAL_CONFIGDATA_ROOT.split('/'));

  assert.ok(process.env[CONFIGDATA_SOURCE_ROOT_ENV], `${CONFIGDATA_SOURCE_ROOT_ENV} must be set for B4`);
  assert.equal(path.isAbsolute(configuredRoot), true, 'B4 physical source root must be absolute');
  assert.notEqual(configuredRoot, repoRoot, 'B4 must not use repository root as physical ConfigData source');
  assert.equal(await pathExists(repoRawRoot), false, 'B4 requires tracked repository data/configdata to be unavailable during proof');
  assert.equal(await pathExists(externalRawRoot), true, 'B4 hydrated external data/configdata root is missing');

  const hydratedEntries = await fs.readdir(externalRawRoot, { withFileTypes: true });
  assert.equal(hydratedEntries.length, 753, 'B4 hydrated source pack must contain exactly 753 direct entries');
  assert.equal(
    hydratedEntries.every((entry) => entry.isFile() && entry.name.endsWith('.json')),
    true,
    'B4 hydrated source pack must contain only regular JSON files',
  );

  const [stage1Contract, stage2Contract] = await Promise.all([
    fs.readFile('data/contracts/configdata-lookup-stage1-id-index-contract.v1.json', 'utf8').then(JSON.parse),
    fs.readFile('data/contracts/configdata-lookup-stage2-forward-join-contract.v1.json', 'utf8').then(JSON.parse),
  ]);
  const logicalSources = [...new Set([
    ...Object.values(stage1Contract.entities).map((spec) => spec.source),
    ...Object.values(stage2Contract.sourceTypes),
  ])].sort();

  assert.equal(logicalSources.length, 8, 'B4 active raw-source set must remain the frozen 8-file Stage1/2 union');
  for (const logicalPath of logicalSources) {
    assert.equal(logicalPath.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`), true, `logical source escaped namespace: ${logicalPath}`);
    assert.equal(path.isAbsolute(logicalPath), false, `logical source became physical: ${logicalPath}`);
    const physicalPath = resolveConfigDataSourcePath(logicalPath, configuredRoot);
    assert.equal(physicalPath.startsWith(`${configuredRoot}${path.sep}`), true, `${logicalPath}: resolver escaped external root`);
    assert.equal(await pathExists(physicalPath), true, `${logicalPath}: hydrated external source missing`);
  }

  const redirect = installConfigDataSourceRootReadRedirect({ sourceRoot: configuredRoot });
  try {
    const [stage1, stage2, stage6] = await Promise.all([
      import('../../../scripts/lib/configdata-lookup-stage1.mjs'),
      import('../../../scripts/lib/configdata-lookup-stage2.mjs'),
      import('../../../scripts/lib/configdata-lookup-stage6.mjs'),
    ]);

    const stage1Built = {};
    for (const [entity, spec] of Object.entries(stage1Contract.entities)) {
      const built = await stage1.buildEntityIndex(entity, spec, stage1Contract);
      const committed = await fs.readFile(spec.output, 'utf8');
      assert.equal(stage1.renderIndexJson(built), committed, `${entity}: B4 external-only Stage1 bytes differ from committed materialization`);
      assert.equal(built.source.path, spec.source, `${entity}: logical source.path changed under B4 external root`);
      assert.equal(path.isAbsolute(built.source.path), false, `${entity}: physical source path leaked into materialized metadata`);
      stage1Built[entity] = built;
    }

    const expectedStage1Summary = await stage1.buildSummary(stage1Contract, stage1Built);
    const committedStage1Summary = await fs.readFile(stage1Contract.generation.summary, 'utf8');
    assert.equal(stage1.renderJson(expectedStage1Summary), committedStage1Summary, 'B4 external-only Stage1 summary differs from committed bytes');

    const loaded = await stage2.loadSourceTypes(stage2Contract);
    const domainIndexes = {};
    for (const domain of ['Hero', 'Soldier', 'Equipment']) {
      const built = stage2.buildDomainIndex(domain, stage2Contract, loaded);
      const committed = await fs.readFile(stage2Contract.outputs[domain], 'utf8');
      assert.equal(stage2.renderForwardIndex(built), committed, `${domain}: B4 external-only Stage2 bytes differ from committed materialization`);
      for (const source of Object.values(built.sources)) {
        assert.equal(source.path.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`), true, `${domain}: logical source path drift`);
        assert.equal(path.isAbsolute(source.path), false, `${domain}: physical source path leaked into materialized metadata`);
      }
      domainIndexes[domain] = built;
    }

    const expectedStage2Summary = stage2.buildSummary(stage2Contract, domainIndexes);
    const committedStage2Summary = await fs.readFile(stage2Contract.outputs.summary, 'utf8');
    assert.equal(stage2.renderJson(expectedStage2Summary), committedStage2Summary, 'B4 external-only Stage2 summary differs from committed bytes');

    const contracts = await stage6.loadContracts();
    const stalePlan = await stage6.detectStalePlan(contracts);
    assert.equal(stalePlan.status, 'CLEAN_CONFIGDATA_LOOKUP_STAGE6');
    assert.equal(stalePlan.staleCount, 0, `B4 external-only Stage6 freshness drift: ${JSON.stringify(stalePlan)}`);

    const manifest = await stage6.buildDependencyManifest(contracts);
    assert.deepEqual(Object.keys(manifest.rawSources).sort(), logicalSources, 'B4 Stage6 raw source manifest keys must remain logical paths');
    const committedManifest = await fs.readFile(contracts.stage6.outputs.manifest, 'utf8');
    assert.equal(renderJson(manifest), committedManifest, 'B4 external-only Stage6 dependency manifest differs from committed bytes');

    const result = {
      status: 'PASS',
      completion: 'CONFIGDATA_LOOKUP_B4_EXTERNAL_ONLY_CLEAN_ROOM',
      logicalRoot: LOGICAL_CONFIGDATA_ROOT,
      physicalRootSelector: CONFIGDATA_SOURCE_ROOT_ENV,
      repositoryRawRootAvailableDuringProof: false,
      hydratedExternalFileCount: hydratedEntries.length,
      activeRawSourceCount: logicalSources.length,
      stage1EntityCount: Object.keys(stage1Built).length,
      stage2DomainCount: Object.keys(domainIndexes).length,
      stage6StaleCount: stalePlan.staleCount,
      logicalPathMetadataChangedCount: 0,
      materializedByteDriftCount: 0,
      semanticMutationCount: 0,
    };

    if (emit) console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    redirect.restore();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runB4ExternalCleanRoom().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
