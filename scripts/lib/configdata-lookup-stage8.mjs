import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  changedPathsFromGit,
  changedPathsFromWorkingTree,
  loadStage7Inputs,
  runSelectedPipelines as runStage7Pipelines,
  selectSmartRegression as selectStage7,
} from './configdata-lookup-stage7.mjs';

export const STAGE8_CONTRACT_PATH = 'data/contracts/configdata-lookup-stage8-project-doctor-expansion-contract.v1.json';

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadStage8Inputs() {
  const contract = readJson(STAGE8_CONTRACT_PATH);
  const stage7Inputs = loadStage7Inputs();
  const bannerSpec = contract.pipelineExtensions.Banner;
  const hostedSpec = contract.hostedQaTargets.EquipmentHostedQA;
  return {
    contract,
    stage7Inputs,
    stage7Summary: readJson(contract.predecessor.summary),
    bannerManifest: readJson(bannerSpec.manifest),
    bannerFinalSummary: readJson(bannerSpec.finalSummary),
    hostedSummary: readJson(hostedSpec.supportingSummary),
  };
}

function addReason(reasons, pathValue, code, domain = null, detail = null) {
  reasons.push({ path: pathValue, code, ...(domain ? { domain } : {}), ...(detail ? { detail } : {}) });
}

function pathMatchesPrefix(pathValue, prefixes = []) {
  return prefixes.some((prefix) => pathValue.startsWith(normalizePath(prefix)));
}

export function collectBannerOwnedPaths(inputs) {
  const { contract, bannerManifest } = inputs;
  const spec = contract.pipelineExtensions.Banner;
  const out = new Set([normalizePath(spec.manifest), normalizePath(spec.finalSummary)]);
  for (const item of bannerManifest.stageCheckpoints || []) {
    if (item?.path) out.add(normalizePath(item.path));
  }
  for (const item of bannerManifest.productionArtifacts || []) {
    if (item?.path) out.add(normalizePath(item.path));
  }
  for (const value of spec.extraOwnedPaths || []) out.add(normalizePath(value));
  return out;
}

function hostedTargetMatches(pathValue, spec) {
  const exact = new Set((spec.ownedPaths || []).map(normalizePath));
  return exact.has(pathValue) || pathMatchesPrefix(pathValue, spec.ownedPrefixes || []);
}

export function selectProjectDoctorExpansion(changedPaths, inputs = loadStage8Inputs()) {
  const paths = [...new Set((changedPaths || []).map(normalizePath).filter(Boolean))].sort();
  const basePlan = selectStage7(paths, inputs.stage7Inputs);
  const { contract } = inputs;
  const bannerSpec = contract.pipelineExtensions.Banner;
  const bannerOwned = collectBannerOwnedPaths(inputs);
  const affectedDomains = new Set(basePlan.affectedDomains);
  const selected = new Set(basePlan.selectedPipelines);
  const selectedTargets = new Set();
  const reasons = [...basePlan.reasons];

  for (const changedPath of paths) {
    if (bannerOwned.has(changedPath) || pathMatchesPrefix(changedPath, bannerSpec.ownedPrefixes || [])) {
      affectedDomains.add('Banner');
      selected.add('Banner');
      addReason(reasons, changedPath, 'EXPLICIT_BANNER_STAGE3_OWNERSHIP', 'Banner');
    }

    for (const [targetName, targetSpec] of Object.entries(contract.hostedQaTargets || {})) {
      if (hostedTargetMatches(changedPath, targetSpec)) {
        selectedTargets.add(targetName);
        addReason(reasons, changedPath, 'EXPLICIT_HOSTED_QA_OWNERSHIP', targetSpec.domain, targetName);
      }
    }
  }

  const pipelineOrder = contract.selectionPolicy.pipelineOrder;
  const domainOrder = pipelineOrder.filter((name) => name !== 'ConfigDataLookup');
  const targetOrder = contract.selectionPolicy.targetOrder;
  const selectedPipelines = pipelineOrder.filter((name) => selected.has(name));
  const orderedTargets = targetOrder.filter((name) => selectedTargets.has(name));
  const pipelineDetails = selectedPipelines.map((name) => ({
    name,
    ...(inputs.stage7Inputs.contract.pipelines[name] || contract.pipelineExtensions[name]),
  }));
  const targetDetails = orderedTargets.map((name) => ({ name, ...contract.hostedQaTargets[name] }));
  const needsBun = pipelineDetails.some((pipeline) => pipeline.requiresBunDependencies === true);

  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_8',
    status: basePlan.failClosed
      ? 'FAIL_CLOSED_ALL_KNOWN_CONFIGDATA_DOMAINS'
      : selectedPipelines.length || orderedTargets.length
        ? 'IMPACT_DETECTED'
        : 'NO_PROJECT_DOCTOR_IMPACT',
    changedPaths: paths,
    affectedDomains: domainOrder.filter((domain) => affectedDomains.has(domain)),
    selectedPipelines,
    selectedTargets: orderedTargets,
    pipelineDetails,
    targetDetails,
    needsBun,
    failClosed: basePlan.failClosed,
    basePlan,
    reasons: reasons.sort((a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      String(a.domain || '').localeCompare(String(b.domain || '')) ||
      String(a.detail || '').localeCompare(String(b.detail || ''))),
  };
}

export { changedPathsFromGit, changedPathsFromWorkingTree };

export function renderPlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function renderDoctor(plan) {
  const lines = [
    'PROJECT_DOCTOR_CONFIGDATA_STAGE8',
    `status=${plan.status}`,
    `changed=${plan.changedPaths.length}`,
    `domains=${plan.affectedDomains.length ? plan.affectedDomains.join(',') : '-'}`,
    `pipelines=${plan.selectedPipelines.length ? plan.selectedPipelines.join(',') : '-'}`,
    `hostedTargets=${plan.selectedTargets.length ? plan.selectedTargets.join(',') : '-'}`,
    `needsBun=${plan.needsBun}`,
    `failClosed=${plan.failClosed}`,
  ];
  for (const reason of plan.reasons) {
    lines.push(`- ${reason.path} :: ${reason.code}${reason.domain ? ` -> ${reason.domain}` : ''}${reason.detail ? ` (${reason.detail})` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeGitHubOutputs(filePath, plan) {
  const values = {
    status: plan.status,
    pipeline_count: String(plan.selectedPipelines.length),
    target_count: String(plan.selectedTargets.length),
    banner: String(plan.selectedPipelines.includes('Banner')),
    equipment_hosted_qa: String(plan.selectedTargets.includes('EquipmentHostedQA')),
    needs_bun: String(plan.needsBun),
    fail_closed: String(plan.failClosed),
  };
  fs.appendFileSync(filePath, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function runArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 2 || argv.some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`Invalid allowlisted command argv: ${JSON.stringify(argv)}`);
  }
  const result = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runSelectedExpansion(plan, inputs = loadStage8Inputs()) {
  const baseResult = runStage7Pipelines(plan.basePlan, inputs.stage7Inputs);
  const executed = [...(baseResult.executed || [])];
  const deferredPipelines = [...(baseResult.deferred || [])];

  if (plan.selectedPipelines.includes('Banner')) {
    const pipeline = inputs.contract.pipelineExtensions.Banner;
    const status = runArgv(pipeline.command);
    if (status !== 0) throw new Error(`Banner validation pipeline failed with exit code ${status}`);
    executed.push('Banner');
  }

  const deferredTargets = plan.selectedTargets.map((name) => ({
    name,
    reason: inputs.contract.hostedQaTargets[name].deferReason,
  }));

  return {
    status: deferredPipelines.length
      ? 'PASS_EXTENSION_WITH_STAGE7_DEFERRED'
      : executed.length || deferredTargets.length
        ? 'PASS_SELECTED_PROJECT_DOCTOR_EXPANSION'
        : 'NO_PROJECT_DOCTOR_IMPACT',
    executed,
    deferredPipelines,
    deferredTargets,
  };
}

export function buildStage8Summary(inputs = loadStage8Inputs()) {
  const { contract, stage7Summary, bannerManifest, bannerFinalSummary, hostedSummary } = inputs;
  const pipelineOrder = contract.selectionPolicy.pipelineOrder;
  const domainPipelines = pipelineOrder.filter((name) => name !== 'ConfigDataLookup');
  const bannerOwned = collectBannerOwnedPaths(inputs);
  const hostedTargets = Object.keys(contract.hostedQaTargets || {});
  return {
    schemaVersion: 1,
    stage: 'CONFIGDATA_LOOKUP_STAGE_8',
    status: contract.validation.passStatus,
    contract: STAGE8_CONTRACT_PATH,
    predecessorStatus: stage7Summary.status,
    executablePipelineCount: pipelineOrder.length,
    domainPipelineCount: domainPipelines.length,
    domainPipelines,
    hostedQaTargetCount: hostedTargets.length,
    hostedQaTargets: hostedTargets,
    deferredDomains: Object.keys(contract.deferredDomains || {}),
    banner: {
      manifestStatus: bannerManifest.status,
      freezeState: bannerManifest.freezeState,
      finalStatus: bannerFinalSummary.status,
      canonicalDefinitions: bannerManifest.canonicalPopulation?.definitions,
      canonicalOccurrences: bannerManifest.canonicalPopulation?.occurrences,
      ownedExactPathCount: bannerOwned.size,
      ownedPrefixCount: contract.pipelineExtensions.Banner.ownedPrefixes.length,
    },
    hostedQa: {
      equipmentStatus: hostedSummary.status,
      equipmentFreezeState: hostedSummary.freezeState,
      explicitPathCount: contract.hostedQaTargets.EquipmentHostedQA.ownedPaths.length,
      explicitPrefixCount: contract.hostedQaTargets.EquipmentHostedQA.ownedPrefixes.length,
      projectDoctorExecutes: false,
    },
    executionMode: 'VALIDATION_ONLY_WITH_DEFERRED_HOSTED_TARGETS',
    semanticBoundary: {
      stage7ReusedWithoutSemanticChange: true,
      explicitOwnershipOnly: true,
      hostedQaTransitiveInference: false,
      hostedQaWorkflowDispatch: false,
      skinAdmitted: false,
      semanticRebuild: false,
      newRelationDiscovery: false,
      canonicalRelationRecomputation: false,
      rawConfigDataMutation: false,
      nameJoinUsed: false,
      idArithmeticUsed: false,
      wallClockMetadataUsed: false
    }
  };
}
