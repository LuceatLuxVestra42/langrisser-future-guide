import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSkinStage32RolloutAuthority, runSkinStage32Rollout } from './run-skin-stage3-2-v1.mjs';

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};

const { rollout, readiness, contract, authorityState } = await loadSkinStage32RolloutAuthority();
check('current authority state is explicitly admitted', Boolean(authorityState));
check('current authority evidence state matches admitted state', readiness.evidence?.present === authorityState.evidencePresent);
check('current authority completion matches admitted state', (readiness.completion ?? null) === (authorityState.completion ?? null));
if (readiness.status === 'PASS') {
  check('completed current authority is SKIN_STAGE3_2_COMPLETE', readiness.completion === 'SKIN_STAGE3_2_COMPLETE');
  check('completed current authority has final evidence', readiness.evidence?.present === true);
  check('completed current authority has no evidence blocker', readiness.evidence?.blocker == null);
  check('completed current authority has no evidence issues', (readiness.evidence?.issues ?? []).length === 0);
} else {
  check('pre-evidence current authority remains READY_FOR_ASSET_EVIDENCE', readiness.status === 'READY_FOR_ASSET_EVIDENCE');
  check('pre-evidence current authority has no final evidence', readiness.evidence?.present === false);
}
check('rollout does not promote Project Status', rollout.resultPolicy.runnerSuccessDoesNotPromoteProjectStatus === true);
check('unknown authority state fails closed', rollout.resultPolicy.unknownAuthorityStateFailsClosed === true);
check('completed authority may remain readable', rollout.resultPolicy.completedAuthorityMayRemainReadable === true);
check('rollout contract override is forbidden', rollout.runner.contractOverrideAllowed === false);
check('three frozen representative records retained', contract.records.length === 3);
check('thirteen frozen locators retained', contract.records.reduce((sum, record) => sum + record.expectedLocators.length, 0) === 13);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-intake-skin-stage3-2-rollout-'));
try {
  const root = path.join(tmp, 'root');
  const outputPending = path.join(tmp, 'pending.json');
  const diagnosticsPending = path.join(tmp, 'pending-diagnostics.json');
  const outputResolved = path.join(tmp, 'resolved.json');
  const diagnosticsResolved = path.join(tmp, 'resolved-diagnostics.json');
  const resourceMapPath = path.join(tmp, 'resource-map.json');

  const modelPaths = new Map([
    [102, 'Spine/General/Mathew_ABS/Mathew_Skin01/Mathew_Skin01_Prefab.prefab'],
    [1021, 'Spine/General/Mathew_ABS/Mathew_Skin01_1/Mathew_Skin01_1_Prefab.prefab'],
    [1022, 'Spine/General/Mathew_ABS/Mathew_Skin01_2/Mathew_Skin01_2_Prefab.prefab'],
    [1023, 'Spine/General/Mathew_ABS/Mathew_Skin01_3/Mathew_Skin01_3_Prefab.prefab'],
    [1024, 'Spine/General/Mathew_ABS/Mathew_Skin01_4/Mathew_Skin01_4_Prefab.prefab'],
    [1901, 'Spine/General/Lista_ABS/Lista_Skin01/Lista_Skin01_Prefab.prefab'],
    [3701, 'Spine/General/Zigodlla_ABS/Zigodlla_Skin01/Zigodlla_Skin01_Prefab.prefab'],
  ]);

  for (const record of contract.records) {
    for (const locator of record.expectedLocators) {
      if (!['STATIC_PATH', 'SPINE_PATH'].includes(locator.locatorKind)) continue;
      const target = path.join(root, ...String(locator.value).split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, locator.locatorKind === 'STATIC_PATH' ? PNG_1X1 : Buffer.from(`fixture:${locator.value}`));
    }
  }
  for (const modelPath of modelPaths.values()) {
    const target = path.join(root, ...modelPath.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(`fixture:${modelPath}`));
  }

  await fs.writeFile(resourceMapPath, `${JSON.stringify([...modelPaths].map(([skinResourceId, prefabPath]) => ({
    skinResourceId,
    prefabPath,
    assetEntryStatus: 'CONFIRMED',
  })), null, 2)}\n`);

  const pending = await runSkinStage32Rollout([
    '--root', root,
    '--out', outputPending,
    '--diagnostics', diagnosticsPending,
  ]);
  check('missing resource map keeps all records pending', pending.recordCounts?.pending === 3 && pending.recordCounts?.resolved === 0);
  check('pending result emits no partial evidence', pending.evidenceCount === 0);
  check('pending state is explicit', pending.resolutionState === 'PENDING_AUTHORITATIVE_EVIDENCE');
  check('pending execution does not promote Project Status', pending.projectStatusPromoted === false);
  check('pending execution reports current authority status', pending.currentAuthorityStatus === readiness.status);

  const resolved = await runSkinStage32Rollout([
    '--root', root,
    '--resource-map', resourceMapPath,
    '--out', outputResolved,
    '--diagnostics', diagnosticsResolved,
  ]);
  check('explicit resource map resolves all representative records', resolved.recordCounts?.resolved === 3 && resolved.recordCounts?.pending === 0);
  check('resolved fixture covers all thirteen locators', resolved.locatorCounts?.resolved === 13);
  check('resolved fixture emits thirteen evidence records', resolved.evidenceCount === 13);
  check('resolved output still does not promote Project Status', resolved.projectStatusPromoted === false);
  check('resolved state remains rollout-only', resolved.resolutionState === 'RESOLVED_ASSET_INTAKE_OUTPUT_NOT_PROJECT_STATUS_PROMOTED');
  check('resolved execution reports current authority completion', (resolved.currentAuthorityCompletion ?? null) === (readiness.completion ?? null));

  let contractOverrideRejected = false;
  try {
    await runSkinStage32Rollout(['--root', root, '--contract', 'other.json']);
  } catch {
    contractOverrideRejected = true;
  }
  check('contract override is rejected at runtime', contractOverrideRejected);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: 'PASS_ASSET_INTAKE_SKIN_STAGE3_2_ROLLOUT_V1',
  completion: 'ASSET_INTAKE_SKIN_STAGE3_2_EXECUTION_PATH_ADOPTED',
  checks: checks.length,
  passed: checks.length,
  failed: 0,
  hardErrors: 0,
  currentDomainStatus: readiness.status,
  currentDomainCompletion: readiness.completion ?? null,
  currentDomainEvidencePresent: readiness.evidence?.present,
  projectStatusPromoted: false,
  semanticRecomputation: false,
}, null, 2));
