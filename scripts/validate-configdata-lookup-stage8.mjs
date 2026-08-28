#!/usr/bin/env node
import fs from 'node:fs';
import {
  STAGE8_CONTRACT_PATH,
  buildStage8Summary,
  collectBannerOwnedPaths,
  loadStage8Inputs,
  selectProjectDoctorExpansion,
} from './lib/configdata-lookup-stage8.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sameArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function fixture(inputs, label, paths, expected) {
  const plan = selectProjectDoctorExpansion(paths, inputs);
  assert(plan.status === expected.status, `${label}: status ${plan.status} != ${expected.status}`);
  assert(sameArray(plan.affectedDomains, expected.domains), `${label}: domains mismatch ${JSON.stringify(plan.affectedDomains)}`);
  assert(sameArray(plan.selectedPipelines, expected.pipelines), `${label}: pipelines mismatch ${JSON.stringify(plan.selectedPipelines)}`);
  assert(sameArray(plan.selectedTargets, expected.targets || []), `${label}: targets mismatch ${JSON.stringify(plan.selectedTargets)}`);
  assert(plan.failClosed === Boolean(expected.failClosed), `${label}: failClosed mismatch`);
  return plan;
}

try {
  const inputs = loadStage8Inputs();
  const { contract, stage7Summary, bannerManifest, bannerFinalSummary, hostedSummary, stage7Inputs } = inputs;
  assert(contract.stage === 'CONFIGDATA_LOOKUP_STAGE_8', 'Stage 8 contract stage mismatch.');
  assert(contract.status === 'PROJECT_DOCTOR_EXPANSION_CONTRACT_FROZEN', 'Stage 8 contract is not frozen.');
  assert(stage7Summary.status === contract.predecessor.requiredStatus, `Stage 7 predecessor mismatch: ${stage7Summary.status}`);
  assert(bannerManifest.status === contract.pipelineExtensions.Banner.requiredManifestStatus, `Banner manifest status mismatch: ${bannerManifest.status}`);
  assert(bannerFinalSummary.status === contract.pipelineExtensions.Banner.requiredFinalStatus, `Banner final status mismatch: ${bannerFinalSummary.status}`);
  assert(bannerManifest.freezeState === 'BANNER_STAGE3_FROZEN', 'Banner freeze state drifted.');
  assert(hostedSummary.status === contract.hostedQaTargets.EquipmentHostedQA.requiredSupportingStatus, `Equipment Hosted QA status mismatch: ${hostedSummary.status}`);

  const pipelineOrder = contract.selectionPolicy.pipelineOrder;
  assert(sameArray(pipelineOrder, ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment', 'Banner']), `Stage 8 pipeline order drifted: ${JSON.stringify(pipelineOrder)}`);
  assert(sameArray(contract.selectionPolicy.targetOrder, ['EquipmentHostedQA']), 'Stage 8 target order drifted.');
  assert(contract.deferredDomains?.Skin?.status === 'DEFERRED_NOT_ADMITTED', 'Skin must remain explicitly deferred.');
  assert(!pipelineOrder.includes('Skin'), 'Skin must not be admitted as a Stage 8 pipeline.');

  const bannerSpec = contract.pipelineExtensions.Banner;
  assert(fs.existsSync(bannerSpec.command[1]), `Banner validator missing: ${bannerSpec.command[1]}`);
  assert(fs.existsSync(bannerSpec.workflow), `Banner workflow missing: ${bannerSpec.workflow}`);
  assert(fs.existsSync(bannerSpec.manifest), `Banner manifest missing: ${bannerSpec.manifest}`);
  assert(fs.existsSync(bannerSpec.finalSummary), `Banner final summary missing: ${bannerSpec.finalSummary}`);
  assert(collectBannerOwnedPaths(inputs).size >= 20, 'Banner explicit owned path set is unexpectedly small.');

  const hostedSpec = contract.hostedQaTargets.EquipmentHostedQA;
  assert(fs.existsSync(hostedSpec.command[1]), `Hosted QA validator missing: ${hostedSpec.command[1]}`);
  assert(fs.existsSync(hostedSpec.workflow), `Hosted QA workflow missing: ${hostedSpec.workflow}`);
  assert(hostedSpec.projectDoctorExecutes === false, 'Hosted QA must not execute inside Project Doctor.');

  assert(contract.executionPolicy.validationOnly === true, 'Stage 8 must remain validation-only.');
  assert(contract.executionPolicy.workflowDispatch === false, 'Stage 8 must not dispatch workflows.');
  assert(contract.executionPolicy.semanticRebuild === false, 'Stage 8 must not rebuild semantics.');
  assert(contract.executionPolicy.hostedQaExecutedByProjectDoctor === false, 'Stage 8 must defer hosted QA execution.');
  assert(contract.executionPolicy.shellCommandConstructionFromChangedPath === false, 'Changed paths must not construct commands.');
  for (const [key, value] of Object.entries(contract.semanticBoundary || {})) {
    assert(value === false, `Stage 8 semantic boundary ${key} must remain false.`);
  }

  const stage2 = stage7Inputs.stage2Contract;
  const fixtures = [
    fixture(inputs, 'hero-base-reuse', [stage2.sourceTypes.Hero], {
      status: 'IMPACT_DETECTED', domains: ['Hero'], pipelines: ['ConfigDataLookup', 'Hero']
    }),
    fixture(inputs, 'shared-skill-base-reuse', [stage2.sourceTypes.Skill], {
      status: 'IMPACT_DETECTED', domains: ['Hero', 'Soldier', 'Equipment'], pipelines: ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment']
    }),
    fixture(inputs, 'banner-manifest-owned', [bannerSpec.manifest], {
      status: 'IMPACT_DETECTED', domains: ['Banner'], pipelines: ['Banner']
    }),
    fixture(inputs, 'banner-production-artifact', ['data/generated/banner-stage3-3-basic-table-consumer.v1.json'], {
      status: 'IMPACT_DETECTED', domains: ['Banner'], pipelines: ['Banner']
    }),
    fixture(inputs, 'banner-contract-prefix', ['data/contracts/banner-stage3-7-frontend-integration.v1.json'], {
      status: 'IMPACT_DETECTED', domains: ['Banner'], pipelines: ['Banner']
    }),
    fixture(inputs, 'hosted-exact', ['src/lib/equipment-image-assets.ts'], {
      status: 'IMPACT_DETECTED', domains: [], pipelines: [], targets: ['EquipmentHostedQA']
    }),
    fixture(inputs, 'hosted-asset-prefix', ['public/images/equipment/550.png'], {
      status: 'IMPACT_DETECTED', domains: [], pipelines: [], targets: ['EquipmentHostedQA']
    }),
    fixture(inputs, 'combined-equipment-hosted', [stage2.sourceTypes.Equipment, 'public/images/equipment/6.png'], {
      status: 'IMPACT_DETECTED', domains: ['Equipment'], pipelines: ['ConfigDataLookup', 'Equipment'], targets: ['EquipmentHostedQA']
    }),
    fixture(inputs, 'skin-not-prematurely-admitted', ['data/generated/skin-stage3-2-authoritative-assets.v1.json'], {
      status: 'NO_PROJECT_DOCTOR_IMPACT', domains: [], pipelines: []
    }),
    fixture(inputs, 'no-impact', ['README.md'], {
      status: 'NO_PROJECT_DOCTOR_IMPACT', domains: [], pipelines: []
    }),
    fixture(inputs, 'unknown-configdata-preserves-stage7-fail-closed', ['data/configdata/ConfigDataFutureUnknownInfo.json'], {
      status: 'FAIL_CLOSED_ALL_KNOWN_CONFIGDATA_DOMAINS', domains: ['Hero', 'Soldier', 'Equipment'], pipelines: ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment'], failClosed: true
    })
  ];
  assert(fixtures.length === 11, 'Stage 8 fixture count drifted.');

  const summary = buildStage8Summary(inputs);
  const rendered = `${JSON.stringify(summary, null, 2)}\n`;
  assert(fs.existsSync(contract.outputs.summary), `Stage 8 summary missing: ${contract.outputs.summary}`);
  assert(fs.readFileSync(contract.outputs.summary, 'utf8') === rendered, `Stage 8 summary is stale. Expected deterministic output:\n${rendered}`);

  console.log(JSON.stringify({
    status: summary.status,
    predecessorStatus: summary.predecessorStatus,
    executablePipelineCount: summary.executablePipelineCount,
    domainPipelineCount: summary.domainPipelineCount,
    hostedQaTargetCount: summary.hostedQaTargetCount,
    deferredDomains: summary.deferredDomains,
    bannerOwnedExactPathCount: summary.banner.ownedExactPathCount,
    fixtureCount: fixtures.length,
    contract: STAGE8_CONTRACT_PATH
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
