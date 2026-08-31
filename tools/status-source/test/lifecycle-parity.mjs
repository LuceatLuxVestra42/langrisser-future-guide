import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectActiveSources } from '../lib/select-active-sources.mjs';
import {
  handoffStatusSource,
  lifecycleSummary,
  loadLifecycleContract,
  renderCloseoutRequest,
  resolveProducerDeclaration,
} from '../lib/lifecycle-status-source.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = loadLifecycleContract({ repoRoot });
const summary = lifecycleSummary(contract);
assert.equal(summary.pipelineCount, 2);
assert.deepEqual(summary.domains, {
  hero: 'hero-final',
  soldier: 'soldier-final',
});
assert.equal(summary.productionWriterActivation, 'CUTOVER_DEFERRED');

const selection = selectActiveSources({ repoRoot });
assert.equal(selection.status, 'PASS');

const expectedCurrent = {
  hero: {
    id: 'hero-stage6-4-final',
    source: 'data/validation/hero-stage6-4-final.v1.json',
  },
  soldier: {
    id: 'soldier-stage6-7-site-admission',
    source: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  },
};

for (const pipeline of contract.pipelines) {
  const expected = expectedCurrent[pipeline.pipelineId];
  const active = selection.domains[pipeline.domain];
  assert.equal(active.selectedId, expected.id);
  assert.equal(active.sourcePath, expected.source);

  const declaration = resolveProducerDeclaration({ pipelineId: pipeline.pipelineId }, { repoRoot, selection });
  assert.equal(declaration.status, 'PASS_STATUS_SOURCE_PRODUCER_DECLARATION');
  assert.equal(declaration.expectedPredecessorId, expected.id);
  assert.equal(declaration.entryId, expected.id);
  assert.equal(declaration.sourcePath, expected.source);
  assert.equal(declaration.idempotentBaseline, true);
  assert.equal(declaration.writePerformed, false);

  const closeout = renderCloseoutRequest({ pipelineId: pipeline.pipelineId }, { repoRoot, selection });
  assert.equal(closeout.status, 'PASS_STATUS_SOURCE_CLOSEOUT_CHECK');
  assert.equal(closeout.mode, 'CHECK');
  assert.equal(closeout.idempotentBaseline, true);
  assert.equal(closeout.projectionCurrentBefore, true);
  assert.equal(closeout.writePerformed, false);
  assert.equal(closeout.declarationRevalidation?.status, 'PASS_STATUS_SOURCE_PRODUCER_DECLARATION');

  const handoff = handoffStatusSource({
    pipelineId: pipeline.pipelineId,
    expectedPredecessorId: expected.id,
    entryId: expected.id,
    sourcePath: expected.source,
  }, { repoRoot });
  assert.equal(handoff.status, 'PASS_STATUS_SOURCE_HANDOFF_CHECK');
  assert.equal(handoff.mode, 'CHECK');
  assert.equal(handoff.writePerformed, false);
  assert.equal(handoff.boundaries.statusSourceDeclarationWriteCount, 0);
}

let staleCasBlocked = false;
try {
  handoffStatusSource({
    pipelineId: 'hero',
    expectedPredecessorId: 'hero-stale-predecessor',
    entryId: expectedCurrent.hero.id,
    sourcePath: expectedCurrent.hero.source,
  }, { repoRoot });
} catch (error) {
  staleCasBlocked = String(error).includes('CAS predecessor mismatch at PREVIEW');
}
assert.equal(staleCasBlocked, true);

const heroPipeline = contract.pipelines.find(item => item.pipelineId === 'hero');
const heroDeclaration = JSON.parse(fs.readFileSync(path.join(repoRoot, heroPipeline.declarationPath), 'utf8'));
let unapprovedDeclarationBlocked = false;
try {
  resolveProducerDeclaration({ pipelineId: 'hero' }, {
    repoRoot,
    selection,
    declaration: { ...heroDeclaration, state: 'REJECTED' },
    verifyCommittedPath: () => ({ pass: true }),
  });
} catch (error) {
  unapprovedDeclarationBlocked = String(error).includes('state');
}
assert.equal(unapprovedDeclarationBlocked, true);

const heroRequest = JSON.parse(fs.readFileSync(path.join(repoRoot, heroPipeline.closeoutRequestPath), 'utf8'));
let unapprovedRequestBlocked = false;
try {
  renderCloseoutRequest({ pipelineId: 'hero' }, {
    repoRoot,
    selection,
    request: { ...heroRequest, state: 'REJECTED' },
    verifyCommittedPath: () => ({ pass: true }),
  });
} catch (error) {
  unapprovedRequestBlocked = String(error).includes('state');
}
assert.equal(unapprovedRequestBlocked, true);

let writtenPath = null;
let writtenText = null;
const rendered = renderCloseoutRequest({ pipelineId: 'hero', write: true }, {
  repoRoot,
  selection,
  request: heroRequest,
  verifyCommittedPath: () => ({ pass: true }),
  readDeclaration: () => '{"stale":true}\n',
  writeDeclaration: (targetPath, content) => {
    writtenPath = targetPath;
    writtenText = content;
  },
});
assert.equal(rendered.status, 'PASS_STATUS_SOURCE_CLOSEOUT_RENDER');
assert.equal(rendered.writePerformed, true);
assert.equal(rendered.boundaries.producerDeclarationWriteCount, 1);
assert.equal(rendered.boundaries.statusSourceDeclarationWriteCount, 0);
assert.equal(writtenPath, heroPipeline.declarationPath);
assert.equal(typeof writtenText, 'string');
assert.equal(JSON.parse(writtenText).authorityDecision, 'EXPLICIT_PRODUCER_DECLARATION');

const postSelection = JSON.parse(JSON.stringify(selection));
postSelection.domains.hero.selectedId = 'hero-r1-5-synthetic-successor';
postSelection.domains.hero.sourcePath = expectedCurrent.hero.source;
const selectionSequence = [selection, selection, postSelection];
let selectionIndex = 0;
const bridgeCalls = [];
const syntheticBridge = options => {
  bridgeCalls.push({ ...options });
  const apply = options.apply === true;
  return {
    version: 1,
    schemaId: 'status-source-artifact-bridge-result/v1',
    stage: 'R1-4',
    status: apply ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_APPLY' : 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE_CHECK',
    completion: 'COMPLETE',
    mode: apply ? 'APPLY' : 'CHECK',
    pipelineCount: 1,
    results: [{
      pipelineId: 'hero',
      domain: 'hero',
      producerId: 'hero-final',
      entryId: options.entryId,
      sourcePath: options.sourcePath,
      mode: apply ? 'APPLY' : 'CHECK',
      submission: {
        promotion: {
          writePerformed: apply,
          alreadyActive: false,
        },
      },
    }],
    boundaries: {
      statusSourceDeclarationWriteCount: apply ? 1 : 0,
    },
  };
};
const syntheticApply = handoffStatusSource({
  pipelineId: 'hero',
  expectedPredecessorId: expectedCurrent.hero.id,
  entryId: 'hero-r1-5-synthetic-successor',
  sourcePath: expectedCurrent.hero.source,
  apply: true,
}, {
  repoRoot,
  verifyCommittedPath: () => ({ pass: true }),
  select: () => selectionSequence[Math.min(selectionIndex++, selectionSequence.length - 1)],
  bridge: syntheticBridge,
});
assert.equal(syntheticApply.status, 'PASS_STATUS_SOURCE_HANDOFF_APPLY');
assert.equal(syntheticApply.mode, 'APPLY');
assert.equal(syntheticApply.writePerformed, true);
assert.equal(syntheticApply.boundaries.statusSourceDeclarationWriteCount, 1);
assert.equal(bridgeCalls.length, 2);
assert.equal(bridgeCalls[0].apply, false);
assert.equal(bridgeCalls[1].apply, true);

let applyCallCount = 0;
const changedBeforeApply = JSON.parse(JSON.stringify(selection));
changedBeforeApply.domains.hero.selectedId = 'hero-changed-before-apply';
let casSelectIndex = 0;
let applyCasBlocked = false;
try {
  handoffStatusSource({
    pipelineId: 'hero',
    expectedPredecessorId: expectedCurrent.hero.id,
    entryId: 'hero-r1-5-synthetic-successor',
    sourcePath: expectedCurrent.hero.source,
    apply: true,
  }, {
    repoRoot,
    verifyCommittedPath: () => ({ pass: true }),
    select: () => casSelectIndex++ === 0 ? selection : changedBeforeApply,
    bridge: options => {
      if (options.apply) applyCallCount += 1;
      return syntheticBridge({ ...options, apply: false });
    },
  });
} catch (error) {
  applyCasBlocked = String(error).includes('CAS predecessor mismatch at APPLY');
}
assert.equal(applyCasBlocked, true);
assert.equal(applyCallCount, 0);

const runtimeText = [
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/lib/lifecycle-status-source.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/cli/lifecycle.mjs'), 'utf8'),
].join('\n');
for (const forbidden of [
  'data/generated/project-doctor',
  'run-project-doctor-d5',
  'validate-project-doctor-d5',
  'PROJECT_STATUS.md',
  'scripts/',
]) {
  assert.equal(runtimeText.includes(forbidden), false, `R1-5 runtime must not depend on legacy status runtime: ${forbidden}`);
}

assert.equal(contract.boundaries.legacyProjectDoctorRuntimeImports, 0);
assert.equal(contract.boundaries.legacyActiveRegistryDependencies, 0);
assert.equal(contract.boundaries.d5RuntimeDependencies, 0);
assert.equal(contract.boundaries.rawConfigDataReadCount, 0);
assert.equal(contract.boundaries.semanticRecomputationCount, 0);
assert.equal(contract.boundaries.domainValidatorExecutionCount, 0);
assert.equal(contract.boundaries.productionWriterWorkflowActivated, false);

console.log(JSON.stringify({
  status: 'PASS_STATUS_SOURCE_R1_5_LIFECYCLE_SELF_TEST',
  lifecyclePipelines: summary.pipelineCount,
  currentDeclarationsResolved: 2,
  currentCloseoutRequestsCurrent: 2,
  currentHandoffChecks: 2,
  currentStatusSourceWrites: 0,
  stalePreviewCasBlocked: true,
  staleApplyCasBlocked: true,
  unapprovedDeclarationBlocked: true,
  unapprovedRequestBlocked: true,
  syntheticCloseoutDeclarationWrites: 1,
  syntheticHandoffApplyForwarded: true,
  syntheticHandoffStatusSourceWrites: 1,
  legacyActiveRegistryDependencies: 0,
  d5RuntimeDependencies: 0,
  projectStatusDependencies: 0,
  productionWriterWorkflowActivated: false,
  rawConfigDataReads: 0,
  semanticRecomputations: 0,
}, null, 2));
