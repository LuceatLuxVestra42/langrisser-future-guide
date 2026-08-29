import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-1-owner-resolution.v1.json';
const BRIDGE_PATH = 'data/contracts/project-doctor-status-source-artifact-bridge.v1.json';

function readText(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error(`missing file: ${rel}`);
  return fs.readFileSync(full, 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const failures = [];
const contract = readJson(CONTRACT_PATH);
const bridge = readJson(BRIDGE_PATH);

assert(contract.status === 'DESIGN_FROZEN', `contract status=${contract.status}`, failures);
assert(contract.policy?.automaticPromotionEnabledInThisStage === false, 'Stage 6-1 must not enable automatic promotion', failures);
assert(contract.policy?.unmergedOwnerDefinitionsAreNonAuthoritative === true, 'unmerged owner definitions must remain non-authoritative', failures);
assert(Array.isArray(contract.pipelines) && contract.pipelines.length === 2, `pipeline count=${contract.pipelines?.length}`, failures);

const bridgeById = new Map((bridge.pipelines || []).map((p) => [p.id, p]));

for (const pipeline of contract.pipelines || []) {
  const label = pipeline.pipelineId;
  const workflowText = readText(pipeline.completionWorkflow.path);
  const source = readJson(pipeline.activeSourcePath);
  const bridgeEntry = bridgeById.get(label);

  assert(Boolean(bridgeEntry), `${label}: missing Stage 5 bridge pipeline`, failures);
  assert(bridgeEntry?.producerId === pipeline.producerId, `${label}: producer mismatch ${bridgeEntry?.producerId} != ${pipeline.producerId}`, failures);
  assert(bridgeEntry?.baselineEntryId === pipeline.activeEntryId, `${label}: baseline entry mismatch ${bridgeEntry?.baselineEntryId} != ${pipeline.activeEntryId}`, failures);
  assert(bridgeEntry?.baselineSourcePath === pipeline.activeSourcePath, `${label}: baseline source mismatch ${bridgeEntry?.baselineSourcePath} != ${pipeline.activeSourcePath}`, failures);

  assert(workflowText.includes(`name: ${pipeline.completionWorkflow.name}`), `${label}: workflow name not found`, failures);
  assert(workflowText.includes(`${pipeline.completionWorkflow.jobId}:`), `${label}: workflow jobId not found`, failures);
  assert(workflowText.includes(`run: ${pipeline.completionWorkflow.completionCommand}`), `${label}: completion command not found`, failures);
  assert(workflowText.includes(`- name: ${pipeline.completionWorkflow.frozenVerificationStep}`), `${label}: frozen verification step not found`, failures);

  for (const [key, expected] of Object.entries(pipeline.expectedSourceState || {})) {
    assert(source[key] === expected, `${label}: ${key}=${source[key]} expected=${expected}`, failures);
  }

  assert(pipeline.completionWorkflow.automationHookPoint === 'AFTER_FROZEN_OUTPUT_VERIFICATION_SUCCESS', `${label}: unsafe hook point`, failures);
  assert(pipeline.stage5Bridge?.defaultMode === 'CHECK_ONLY', `${label}: Stage 5 baseline mode must remain CHECK_ONLY`, failures);
  assert(pipeline.nonAuthoritativeEvidence?.admittedForStage6Automation === false, `${label}: draft owner evidence must not be admitted`, failures);
}

const hero = contract.pipelines.find((p) => p.pipelineId === 'hero');
const soldier = contract.pipelines.find((p) => p.pipelineId === 'soldier');
assert(hero?.completionWorkflow.commandRole === 'MATERIALIZING_FINAL_VALIDATOR', `hero commandRole=${hero?.completionWorkflow.commandRole}`, failures);
assert(soldier?.completionWorkflow.commandRole === 'MATERIALIZING_FINALIZER', `soldier commandRole=${soldier?.completionWorkflow.commandRole}`, failures);

if (failures.length) {
  console.error('PROJECT STATUS STAGE 6-1 OWNER RESOLUTION: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PROJECT STATUS STAGE 6-1 OWNER RESOLUTION: PASS');
console.log('pipelines=2 hero=Hero Stage 6-4 Soldier=Soldier Stage 6-7 autoPromotion=false');
