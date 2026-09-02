import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';

installConfigDataSourceRootReadRedirect();
const {
  buildDependencyManifest,
  buildStage6Summary,
  detectStalePlan,
  loadContracts,
  renderJson,
} = await import('../../../scripts/lib/configdata-lookup-stage6.mjs');
const stage5 = await import('../../../scripts/lib/configdata-lookup-stage5.mjs');

async function main() {
  execFileSync(process.execPath, ['tools/configdata-lookup/test/configdata-lookup-stage5-current-validator.mjs'], { stdio: 'inherit' });

  const contracts = await loadContracts();
  if (contracts.stage6.status !== 'INCREMENTAL_REBUILD_CONTRACT_FROZEN') throw new Error(`unexpected Stage 6 contract status ${contracts.stage6.status}`);
  if (contracts.stage6.predecessor.requiredStatus !== 'PASS_CONFIGDATA_LOOKUP_STAGE5_CLI') throw new Error('Stage 6 predecessor status contract mismatch');

  const heroDomainTypes = new Set(contracts.stage2.relations.filter((r) => r.domain === 'Hero').flatMap((r) => [r.sourceType, r.targetType]));
  const selectedContract = {
    ...contracts.stage2,
    sourceTypes: Object.fromEntries([...heroDomainTypes].map((type) => [type, contracts.stage2.sourceTypes[type]])),
  };
  const selected = await (await import('../../../scripts/lib/configdata-lookup-stage2.mjs')).loadSourceTypes(selectedContract);
  if (Object.keys(selected).length !== heroDomainTypes.size) throw new Error('bounded Stage 2 source loading did not preserve the selected source set');
  for (const type of Object.keys(selected)) if (!heroDomainTypes.has(type)) throw new Error(`unexpected Stage 2 source loaded: ${type}`);

  const plan = await detectStalePlan(contracts);
  if (plan.staleCount !== 0) throw new Error(`Stage 6 stale plan is not clean: ${JSON.stringify(plan)}`);

  const manifest = await buildDependencyManifest(contracts);
  const committedManifest = await fs.readFile(contracts.stage6.outputs.manifest, 'utf8');
  if (committedManifest !== renderJson(manifest)) throw new Error('Stage 6 dependency manifest is not byte-identical after regeneration');

  const predecessorSummary = (await stage5.readJson(contracts.stage5.outputs.summary)).value;
  const summary = buildStage6Summary(contracts.stage6, predecessorSummary, manifest);
  const committedSummary = await fs.readFile(contracts.stage6.outputs.summary, 'utf8');
  if (committedSummary !== renderJson(summary)) throw new Error('Stage 6 summary is not byte-identical after regeneration');

  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
  for (const key of ['check:configdata-lookup-stage6', 'rebuild:configdata-lookup-stage6', 'validate:configdata-lookup-stage6']) {
    if (!packageJson.scripts?.[key]) throw new Error(`missing package script ${key}`);
  }

  for (const filePath of ['scripts/lib/configdata-lookup-stage6.mjs', 'scripts/configdata-lookup-stage6.mjs', 'scripts/validate-configdata-lookup-stage6.mjs']) {
    const source = await fs.readFile(filePath, 'utf8');
    if (/new\s+Date\s*\(|Date\.now\s*\(/.test(source)) throw new Error(`${filePath}: wall-clock dependency is forbidden`);
  }

  console.log(JSON.stringify({
    status: 'PASS_CONFIGDATA_LOOKUP_STAGE6_CURRENT_VALIDATOR',
    historicalContract: contracts.stage6.stage,
    predecessorStatus: contracts.stage6.predecessor.requiredStatus,
    staleCount: plan.staleCount,
    rawConfigDataSemanticReopenCount: 0,
    physicalSourceRootResolver: 'CONFIGDATA_SOURCE_ROOT',
    logicalSourcePathNamespace: 'data/configdata',
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
