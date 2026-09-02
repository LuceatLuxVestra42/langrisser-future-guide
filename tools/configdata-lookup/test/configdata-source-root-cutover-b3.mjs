import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
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

export async function runB3SourceRootCutover({ emit = true } = {}) {
  const repoRoot = getDefaultConfigDataSourceRoot();
  const configuredRoot = getConfiguredConfigDataSourceRoot();
  const sourceRootEnvBefore = process.env[CONFIGDATA_SOURCE_ROOT_ENV] ?? null;
  const seedRoot = sourceRootEnvBefore === null ? repoRoot : configuredRoot;
  const [stage1Contract, stage2Contract] = await Promise.all([
    fs.readFile('data/contracts/configdata-lookup-stage1-id-index-contract.v1.json', 'utf8').then(JSON.parse),
    fs.readFile('data/contracts/configdata-lookup-stage2-forward-join-contract.v1.json', 'utf8').then(JSON.parse),
  ]);

  const logicalSources = [...new Set([
    ...Object.values(stage1Contract.entities).map((spec) => spec.source),
    ...Object.values(stage2Contract.sourceTypes),
  ])].sort();

  assert.equal(logicalSources.length, 8, 'B3 active raw-source set must remain the frozen 8-file Stage1/2 union');
  for (const logicalPath of logicalSources) {
    assert.equal(logicalPath.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`), true, `logical source escaped namespace: ${logicalPath}`);
    assert.equal(path.isAbsolute(logicalPath), false, `logical source became physical: ${logicalPath}`);
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'langrisser-configdata-b3-'));
  let redirect;
  try {
    for (const logicalPath of logicalSources) {
      const sourcePath = path.join(seedRoot, ...logicalPath.split('/'));
      const targetPath = path.join(tempRoot, ...logicalPath.split('/'));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }

    redirect = installConfigDataSourceRootReadRedirect({ sourceRoot: tempRoot });
    assert.equal(redirect.sourceRoot, tempRoot);
    assert.equal(
      process.env[CONFIGDATA_SOURCE_ROOT_ENV] ?? null,
      sourceRootEnvBefore,
      'fixture must prove explicit sourceRoot injection without mutating process env',
    );

    const [stage1, stage2, stage6] = await Promise.all([
      import('../../../scripts/lib/configdata-lookup-stage1.mjs'),
      import('../../../scripts/lib/configdata-lookup-stage2.mjs'),
      import('../../../scripts/lib/configdata-lookup-stage6.mjs'),
    ]);

    const stage1Built = {};
    for (const [entity, spec] of Object.entries(stage1Contract.entities)) {
      const built = await stage1.buildEntityIndex(entity, spec, stage1Contract);
      const committed = await fs.readFile(spec.output, 'utf8');
      assert.equal(stage1.renderIndexJson(built), committed, `${entity}: external-root Stage1 bytes differ from committed materialization`);
      assert.equal(built.source.path, spec.source, `${entity}: logical source.path changed under physical-root override`);
      assert.equal(path.isAbsolute(built.source.path), false, `${entity}: physical source path leaked into materialized metadata`);
      stage1Built[entity] = built;
    }

    const expectedStage1Summary = await stage1.buildSummary(stage1Contract, stage1Built);
    const committedStage1Summary = await fs.readFile(stage1Contract.generation.summary, 'utf8');
    assert.equal(stage1.renderJson(expectedStage1Summary), committedStage1Summary, 'external-root Stage1 summary differs from committed bytes');

    const loaded = await stage2.loadSourceTypes(stage2Contract);
    const domainIndexes = {};
    for (const domain of ['Hero', 'Soldier', 'Equipment']) {
      const built = stage2.buildDomainIndex(domain, stage2Contract, loaded);
      const committed = await fs.readFile(stage2Contract.outputs[domain], 'utf8');
      assert.equal(stage2.renderForwardIndex(built), committed, `${domain}: external-root Stage2 bytes differ from committed materialization`);
      for (const source of Object.values(built.sources)) {
        assert.equal(source.path.startsWith(`${LOGICAL_CONFIGDATA_ROOT}/`), true, `${domain}: logical source path drift`);
        assert.equal(path.isAbsolute(source.path), false, `${domain}: physical source path leaked into materialized metadata`);
      }
      domainIndexes[domain] = built;
    }

    const expectedStage2Summary = stage2.buildSummary(stage2Contract, domainIndexes);
    const committedStage2Summary = await fs.readFile(stage2Contract.outputs.summary, 'utf8');
    assert.equal(stage2.renderJson(expectedStage2Summary), committedStage2Summary, 'external-root Stage2 summary differs from committed bytes');

    const contracts = await stage6.loadContracts();
    const stalePlan = await stage6.detectStalePlan(contracts);
    assert.equal(stalePlan.status, 'CLEAN_CONFIGDATA_LOOKUP_STAGE6');
    assert.equal(stalePlan.staleCount, 0, `external-root Stage6 freshness drift: ${JSON.stringify(stalePlan)}`);

    const manifest = await stage6.buildDependencyManifest(contracts);
    assert.deepEqual(Object.keys(manifest.rawSources).sort(), logicalSources, 'Stage6 raw source manifest keys must remain logical paths');
    const committedManifest = await fs.readFile(contracts.stage6.outputs.manifest, 'utf8');
    assert.equal(renderJson(manifest), committedManifest, 'external-root Stage6 dependency manifest differs from committed bytes');

    for (const logicalPath of logicalSources) {
      const physicalPath = resolveConfigDataSourcePath(logicalPath, tempRoot);
      assert.equal(physicalPath.startsWith(`${tempRoot}${path.sep}`), true, `${logicalPath}: resolver did not select temp root`);
      assert.notEqual(physicalPath, path.join(seedRoot, ...logicalPath.split('/')), `${logicalPath}: fixture accidentally read seed physical source`);
    }

    const result = {
      status: 'PASS',
      completion: 'CONFIGDATA_LOOKUP_B3_SOURCE_ROOT_CUTOVER',
      logicalRoot: LOGICAL_CONFIGDATA_ROOT,
      physicalRootSelector: CONFIGDATA_SOURCE_ROOT_ENV,
      activeRawSourceCount: logicalSources.length,
      stage1EntityCount: Object.keys(stage1Built).length,
      stage2DomainCount: Object.keys(domainIndexes).length,
      stage6StaleCount: stalePlan.staleCount,
      logicalPathMetadataChangedCount: 0,
      materializedByteDriftCount: 0,
      trackedRawMutationCount: 0,
      semanticMutationCount: 0,
    };

    if (emit) console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    redirect?.restore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
