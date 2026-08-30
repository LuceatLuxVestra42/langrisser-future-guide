import fs from 'node:fs';
import { resolveStatusSourceDeclaration } from './resolve-project-doctor-status-source-declaration.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-4-producer-declarations.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const contract = readJson(CONTRACT_PATH);
const stage6_3 = readJson(contract.stage6_3Contract);
const registry = readJson(contract.activeRegistry);
const checks = [];
const add = (id, pass, detail = null) => checks.push({ id, pass: Boolean(pass), ...(detail === null ? {} : { detail }) });
const expectThrow = (id, fn, needle) => {
  try {
    fn();
    add(id, false, 'unexpected pass');
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    add(id, text.includes(needle), text);
  }
};

const allowedTransportModes = new Set(contract.policy?.allowedAutomaticHandoffTransportModes ?? []);
const transportMatchesWorkflow = (pipeline, workflow) => {
  const transport = pipeline.handoffTransport ?? {};
  if (!allowedTransportModes.has(transport.mode)) return false;
  if (transport.mainAllowed !== false || transport.pullRequestAllowed !== false) return false;

  if (transport.mode === 'WORK_BRANCH_PUSH') {
    return workflow.includes("github.event_name == 'push'")
      && workflow.includes("startsWith(github.ref, 'refs/heads/work/')");
  }
  if (transport.mode === 'EXPLICIT_NON_MAIN_DISPATCH') {
    return workflow.includes('workflow_dispatch:')
      && workflow.includes("github.event_name == 'workflow_dispatch'")
      && workflow.includes("github.ref != 'refs/heads/main'")
      && !workflow.includes("startsWith(github.ref, 'refs/heads/work/')");
  }
  return false;
};

add('CONTRACT_FROZEN', contract.status === 'DESIGN_FROZEN');
add('PIPELINES_EXACT_HERO_SOLDIER', (contract.pipelines ?? []).map(item => item.pipelineId).sort().join(',') === 'hero,soldier');
add('STAGE6_3_FROZEN', stage6_3.status === 'DESIGN_FROZEN');
add('NO_REAL_SUCCESSOR_IN_STAGE6_4_POLICY', contract.policy?.realSuccessorPromotionInThisStage === false);
add('EXPLICIT_DECLARATION_REQUIRED', contract.policy?.predecessorIdMustBeExplicit === true && contract.policy?.entryIdMustBeExplicit === true && contract.policy?.sourcePathMustBeExplicit === true);
add('DECLARED_NON_MAIN_AUTOMATION_ONLY', contract.policy?.automaticDispatchWorkBranchOnly === false && contract.policy?.automaticDispatchRequiresDeclaredNonMainTransport === true && contract.policy?.pullRequestAndMainRemainCheckOnlyAtOwningWorkflow === true && allowedTransportModes.has('WORK_BRANCH_PUSH') && allowedTransportModes.has('EXPLICIT_NON_MAIN_DISPATCH'));
add('OWNER_SERIALIZATION_REQUIRED', contract.policy?.owningCompletionWorkflowsSerializedPerBranch === true);

for (const pipeline of contract.pipelines ?? []) {
  const upper = pipeline.pipelineId.toUpperCase();
  const declaration = readJson(pipeline.declarationPath);
  const active = registry?.domains?.[pipeline.domain];
  add(`DECLARATION_APPROVED_${upper}`, declaration.state === contract.policy.declarationState);
  add(`DECLARATION_BINDING_${upper}`, declaration.pipelineId === pipeline.pipelineId && declaration.domain === pipeline.domain && declaration.producerId === pipeline.producerId && declaration.requestedByWorkflow === pipeline.completionWorkflow);
  add(`DECLARATION_EXPLICIT_AUTHORITY_${upper}`, declaration.authorityDecision === 'EXPLICIT_PRODUCER_DECLARATION');
  add(`BASELINE_PREDECESSOR_MATCH_${upper}`, declaration.predecessorId === active?.selectedId);
  add(`BASELINE_ENTRY_IDEMPOTENT_${upper}`, declaration.entryId === active?.selectedId && declaration.sourcePath === active?.sourcePath);
  try {
    const result = resolveStatusSourceDeclaration({ pipelineId: pipeline.pipelineId });
    add(`REAL_RESOLUTION_PASS_${upper}`, result.status === 'PASS_STATUS_SOURCE_STAGE6_4_DECLARATION' && result.idempotentBaseline === true && result.writePerformed === false, result);
  } catch (error) {
    add(`REAL_RESOLUTION_PASS_${upper}`, false, error instanceof Error ? error.message : String(error));
  }

  const workflow = fs.readFileSync(pipeline.completionWorkflow, 'utf8');
  add(`WORKFLOW_RESOLVES_DECLARATION_${upper}`, workflow.includes(`resolve-project-doctor-status-source-declaration.mjs --pipeline ${pipeline.pipelineId} --github-output`));
  add(`WORKFLOW_CALLS_REUSABLE_HANDOFF_${upper}`, workflow.includes('uses: ./.github/workflows/project-doctor-status-source-stage6-3-apply-handoff.yml'));
  add(`WORKFLOW_DIRECT_APPLY_ABSENT_${upper}`, !workflow.includes('--apply'));
  add(`WORKFLOW_DECLARED_NON_MAIN_HANDOFF_${upper}`, transportMatchesWorkflow(pipeline, workflow), pipeline.handoffTransport ?? null);
  add(`WORKFLOW_PR_MAIN_CHECK_ONLY_PRESERVED_${upper}`, workflow.includes(`bridge-project-doctor-status-source.mjs --pipeline ${pipeline.pipelineId} --check`));
  add(`OWNER_WORKFLOW_SHARED_CONCURRENCY_${upper}`, workflow.includes('group: project-status-owner-${{ github.ref_name }}') && workflow.includes('cancel-in-progress: false'));
}

const heroPipeline = contract.pipelines.find(item => item.pipelineId === 'hero');
const heroDeclaration = readJson(heroPipeline.declarationPath);
const passVerify = sourcePath => ({ pass: true, sourcePath });
expectThrow('STALE_PREDECESSOR_BLOCKS', () => resolveStatusSourceDeclaration({ pipelineId: 'hero' }, {
  contract,
  stage6_3,
  registry,
  declaration: { ...heroDeclaration, predecessorId: 'hero-stale-predecessor' },
  verifyCommittedSource: passVerify,
}), 'stale predecessor');
expectThrow('UNAPPROVED_DECLARATION_BLOCKS', () => resolveStatusSourceDeclaration({ pipelineId: 'hero' }, {
  contract,
  stage6_3,
  registry,
  declaration: { ...heroDeclaration, state: 'DRAFT' },
  verifyCommittedSource: passVerify,
}), 'declaration blocked');
expectThrow('UNCOMMITTED_SOURCE_BLOCKS', () => resolveStatusSourceDeclaration({ pipelineId: 'hero' }, {
  contract,
  stage6_3,
  registry,
  declaration: heroDeclaration,
  verifyCommittedSource: sourcePath => sourcePath === heroPipeline.declarationPath ? { pass: true, sourcePath } : { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath },
}), 'candidate source blocked');

try {
  const synthetic = resolveStatusSourceDeclaration({ pipelineId: 'hero' }, {
    contract,
    stage6_3,
    registry,
    declaration: {
      ...heroDeclaration,
      predecessorId: registry.domains.hero.selectedId,
      entryId: 'hero-explicit-next',
      sourcePath: 'data/validation/hero-explicit-next.v1.json',
    },
    verifyCommittedSource: passVerify,
  });
  add('EXPLICIT_SUCCESSOR_DECLARATION_CAN_RESOLVE', synthetic.entryId === 'hero-explicit-next' && synthetic.expectedPredecessorId === registry.domains.hero.selectedId && synthetic.idempotentBaseline === false, synthetic);
} catch (error) {
  add('EXPLICIT_SUCCESSOR_DECLARATION_CAN_RESOLVE', false, error instanceof Error ? error.message : String(error));
}

const handoffWorkflow = fs.readFileSync(contract.reusableHandoffWorkflow, 'utf8');
add('STAGE6_3_SUPPORTS_WORKFLOW_CALL', handoffWorkflow.includes('workflow_call:'));
add('STAGE6_3_CHECKOUTS_LATEST_BRANCH_REF', handoffWorkflow.includes('ref: ${{ github.ref_name }}'));
add('STAGE6_3_SHARED_WRITER_CONCURRENCY', handoffWorkflow.includes('group: project-status-write-${{ github.ref_name }}'));
const statusWorkflow = fs.readFileSync('.github/workflows/project-status-sync.yml', 'utf8');
add('PROJECT_STATUS_SYNC_SHARED_WRITER_CONCURRENCY', statusWorkflow.includes('group: project-status-write-${{ github.event.pull_request.head.ref || github.ref_name }}'));
add('PROJECT_STATUS_SYNC_RUNS_STAGE6_4_SELF_TEST', statusWorkflow.includes('validate-project-doctor-status-source-stage6-4-producer-declarations.mjs'));

add('REGISTRY_ENTRY_COUNT_UNCHANGED', registry.entryCount >= registry.selectedCount && registry.selectedCount === 6, { entryCount: registry.entryCount, selectedCount: registry.selectedCount });
add('HERO_AUTHORITY_UNCHANGED', registry.domains.hero.selectedId === 'hero-stage6-4-final');
add('SOLDIER_AUTHORITY_UNCHANGED', registry.domains.soldier.selectedId === 'soldier-stage6-7-site-admission');

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-4-producer-declarations-validation/v1',
  stage: 'PROJECT-STATUS-STAGE6-4',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_STAGE6_4_PRODUCER_DECLARATIONS' : 'FAIL_STATUS_SOURCE_STAGE6_4_PRODUCER_DECLARATIONS',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    realSuccessorPromotion: false,
    directApplyInOwningWorkflow: false,
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    fixtureRepositoryMutation: false
  }
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
