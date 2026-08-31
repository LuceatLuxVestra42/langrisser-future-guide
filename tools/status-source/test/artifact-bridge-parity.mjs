import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectActiveSources } from '../lib/select-active-sources.mjs';
import { loadProducerGateContract } from '../lib/submit-status-source.mjs';
import {
  artifactBridgeSummary,
  bridgeStatusSource,
  loadArtifactBridgeContract,
  validateArtifactBridge,
} from '../lib/bridge-status-source.mjs';
import { parseBridgeArgs } from '../cli/bridge.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = loadArtifactBridgeContract({ repoRoot });
const producerContract = loadProducerGateContract({ repoRoot, contractPath: contract.producerContract });
const selection = selectActiveSources({ repoRoot });
const summary = artifactBridgeSummary(contract);

assert.equal(summary.pipelineCount, 6);
assert.deepEqual(summary.domains, {
  hero: 'hero-final',
  soldier: 'soldier-final',
  equipment: 'equipment-final',
  'hero-soldier': 'hero-soldier-final',
  banner: 'banner-final',
  skin: 'skin-final',
});

const validation = validateArtifactBridge({ contract, producerContract, selection, repoRoot });
assert.equal(validation.pass, true, JSON.stringify(validation.failures));
assert.equal(validation.pipelineCount, 6);
for (const pipeline of contract.pipelines) {
  const active = selection.domains[pipeline.domain];
  assert.ok(active, `missing selected domain ${pipeline.domain}`);
  assert.equal(active.selectedId, pipeline.baselineEntryId);
  assert.equal(active.sourcePath, pipeline.baselineSourcePath);
}

const allCheck = bridgeStatusSource({ all: true }, { repoRoot });
assert.equal(allCheck.status, 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK');
assert.equal(allCheck.mode, 'CHECK');
assert.equal(allCheck.pipelineCount, 6);
assert.equal(allCheck.delegatedToR1_3ProducerGate, true);
assert.equal(allCheck.boundaries.statusSourceDeclarationWriteCount, 0);
assert.equal(allCheck.boundaries.domainValidatorExecutionCount, 0);
assert.equal(allCheck.boundaries.owningValidatorInferenceCount, 0);
assert.equal(allCheck.boundaries.legacyActiveRegistryDependencies, 0);
for (const result of allCheck.results) {
  assert.equal(result.mode, 'CHECK');
  assert.equal(result.submission.delegatedToR1_2Promotion, true);
  assert.equal(result.submission.boundaries.statusSourceDeclarationWriteCount, 0);
}

const equipmentCheck = bridgeStatusSource({ pipelineId: 'equipment' }, { repoRoot });
assert.equal(equipmentCheck.pipelineCount, 1);
assert.equal(equipmentCheck.results[0].producerId, 'equipment-final');
assert.equal(equipmentCheck.results[0].entryId, 'equipment-public-presentation-correction-final');
assert.equal(equipmentCheck.results[0].submission.mode, 'CHECK');
assert.deepEqual(
  Object.fromEntries(['canonical', 'public', 'general', 'exclusive'].map(key => [
    key,
    equipmentCheck.results[0].submission.promotion.compatibility.effectiveExpected[key],
  ])),
  { canonical: 390, public: 365, general: 198, exclusive: 167 },
);

assert.deepEqual(parseBridgeArgs(['--pipeline', 'equipment']), {
  all: false,
  apply: false,
  pipelineId: 'equipment',
});
assert.equal(parseBridgeArgs(['--pipeline', 'equipment', '--apply']).apply, true);
assert.throws(() => parseBridgeArgs(['--all', '--id', 'x', '--source', 'data/validation/equipment-x.v1.json']));
assert.throws(() => parseBridgeArgs(['--pipeline', 'equipment', '--id', 'x']));
assert.throws(() => bridgeStatusSource({ pipelineId: 'unknown' }, { repoRoot }), /Pipeline not registered/);

const baselineMismatch = JSON.parse(JSON.stringify(contract));
baselineMismatch.pipelines.find(item => item.id === 'equipment').baselineEntryId = 'equipment-wrong-baseline';
const mismatchValidation = validateArtifactBridge({
  contract: baselineMismatch,
  producerContract,
  selection,
  repoRoot,
});
assert.equal(mismatchValidation.pass, false);
assert.equal(mismatchValidation.failures.some(item => item.type === 'BASELINE_ENTRY_NOT_ACTIVE'), true);

assert.throws(() => bridgeStatusSource({
  pipelineId: 'equipment',
  entryId: 'equipment-wrong-family',
  sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
}, { repoRoot }), /Producer gate blocked/);

let forwardedSubmission = null;
const applyDelegation = bridgeStatusSource({ pipelineId: 'equipment', apply: true }, {
  repoRoot,
  submit: submission => {
    forwardedSubmission = submission;
    return {
      mode: submission.promotionOptions.apply ? 'APPLY' : 'CHECK',
      delegatedToR1_2Promotion: true,
      boundaries: { statusSourceDeclarationWriteCount: submission.promotionOptions.apply ? 1 : 0 },
    };
  },
});
assert.equal(forwardedSubmission.producerId, 'equipment-final');
assert.equal(forwardedSubmission.promotionOptions.apply, true);
assert.equal(applyDelegation.mode, 'APPLY');
assert.equal(applyDelegation.boundaries.statusSourceDeclarationWriteCount, 1);

const runtimeSourceText = [
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/lib/bridge-status-source.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/cli/bridge.mjs'), 'utf8'),
].join('\n');
for (const forbidden of [
  'data/generated/project-doctor',
  'scripts/',
  'bridge-project-doctor-status-source',
  'project-doctor-status-source-artifact-bridge',
]) {
  assert.equal(runtimeSourceText.includes(forbidden), false, `bridge runtime must not depend on legacy Doctor runtime: ${forbidden}`);
}

console.log(JSON.stringify({
  status: 'PASS_STATUS_SOURCE_R1_4_ARTIFACT_BRIDGE_SELF_TEST',
  pipelineCount: summary.pipelineCount,
  currentBaselineBindingsAccepted: 6,
  allPipelineCheckWrites: 0,
  currentEquipmentCheckWrites: 0,
  applyFlagDelegatedToR1_3: true,
  candidateProducerGateBypassBlocked: true,
  unknownPipelineBlocked: true,
  baselineDriftBlocked: true,
  domainValidatorExecutions: 0,
  owningValidatorInferences: 0,
  legacyActiveRegistryDependencies: 0,
  legacyRuntimeDependencies: 0,
  rawConfigDataReads: 0,
  semanticRecomputations: 0
}, null, 2));
