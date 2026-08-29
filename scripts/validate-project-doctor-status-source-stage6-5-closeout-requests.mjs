import fs from 'node:fs';
import { renderCloseoutRequest } from './render-project-doctor-status-source-closeout-request.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-status-source-stage6-5-closeout-requests.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const contract = readJson(CONTRACT_PATH);
const stage6_4 = readJson(contract.stage6_4Contract);
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

add('CONTRACT_FROZEN', contract.status === 'DESIGN_FROZEN');
add('PIPELINES_EXACT_HERO_SOLDIER', (contract.pipelines ?? []).map(item => item.pipelineId).sort().join(',') === 'hero,soldier');
add('STAGE6_4_FROZEN', stage6_4.status === 'DESIGN_FROZEN');
add('EXPLICIT_REQUEST_FIELDS_REQUIRED', contract.policy?.predecessorIdMustBeExplicit === true && contract.policy?.entryIdMustBeExplicit === true && contract.policy?.sourcePathMustBeExplicit === true && contract.policy?.declarationPathMustBeExplicit === true);
add('EXPLICIT_WRITE_REQUIRED', contract.policy?.explicitWriteFlagRequired === true);
add('NO_REAL_SUCCESSOR_IN_STAGE6_5', contract.policy?.realSuccessorPromotionInThisStage === false);
add('NO_AUTHORITY_INFERENCE', contract.policy?.filenameAuthorityInference === false && contract.policy?.stageNumberAuthorityInference === false && contract.policy?.chronologyAuthorityInference === false);

for (const pipeline of contract.pipelines ?? []) {
  const upper = pipeline.pipelineId.toUpperCase();
  const request = readJson(pipeline.requestPath);
  const active = registry?.domains?.[pipeline.domain];
  add(`REQUEST_APPROVED_${upper}`, request.state === contract.policy.requestState);
  add(`REQUEST_BINDING_${upper}`, request.pipelineId === pipeline.pipelineId && request.domain === pipeline.domain && request.producerId === pipeline.producerId && request.requestedByWorkflow === pipeline.completionWorkflow && request.declarationPath === pipeline.declarationPath);
  add(`REQUEST_EXPLICIT_AUTHORITY_${upper}`, request.authorityDecision === 'EXPLICIT_CLOSEOUT_REQUEST');
  add(`BASELINE_PREDECESSOR_MATCH_${upper}`, request.predecessorId === active?.selectedId);
  add(`BASELINE_ENTRY_IDEMPOTENT_${upper}`, request.entryId === active?.selectedId && request.sourcePath === active?.sourcePath);
  try {
    const result = renderCloseoutRequest({ pipelineId: pipeline.pipelineId, check: true });
    add(`REAL_PROJECTION_CHECK_${upper}`, result.status === 'PASS_STATUS_SOURCE_STAGE6_5_CLOSEOUT_REQUEST_CHECK' && result.idempotentBaseline === true && result.projectionCurrent === true && result.writePerformed === false, result);
  } catch (error) {
    add(`REAL_PROJECTION_CHECK_${upper}`, false, error instanceof Error ? error.message : String(error));
  }

  const workflow = fs.readFileSync(pipeline.completionWorkflow, 'utf8');
  add(`WORKFLOW_WRITES_FROM_REQUEST_${upper}`, workflow.includes(`render-project-doctor-status-source-closeout-request.mjs --pipeline ${pipeline.pipelineId} --write`));
  add(`WORKFLOW_CHECKS_REQUEST_ON_PR_MAIN_${upper}`, workflow.includes(`render-project-doctor-status-source-closeout-request.mjs --pipeline ${pipeline.pipelineId} --check`));
  add(`WORKFLOW_STILL_RESOLVES_STAGE6_4_${upper}`, workflow.includes(`resolve-project-doctor-status-source-declaration.mjs --pipeline ${pipeline.pipelineId} --github-output`));
  add(`WORKFLOW_DIRECT_APPLY_ABSENT_${upper}`, !workflow.includes('--apply'));
}

const heroPipeline = contract.pipelines.find(item => item.pipelineId === 'hero');
const heroRequest = readJson(heroPipeline.requestPath);
const passVerify = sourcePath => ({ pass: true, sourcePath });
const currentDeclarationText = fs.readFileSync(heroPipeline.declarationPath, 'utf8');
const baseRuntime = { contract, stage6_4, registry, verifyCommittedSource: passVerify, readDeclaration: () => currentDeclarationText };

expectThrow('STALE_PREDECESSOR_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, { ...baseRuntime, request: { ...heroRequest, predecessorId: 'hero-stale-predecessor' } }), 'stale predecessor');
expectThrow('UNAPPROVED_REQUEST_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, { ...baseRuntime, request: { ...heroRequest, state: 'DRAFT' } }), 'closeout request blocked');
expectThrow('CROSS_DOMAIN_REQUEST_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, { ...baseRuntime, request: { ...heroRequest, domain: 'soldier' } }), 'closeout request blocked');
expectThrow('DECLARATION_PATH_MISMATCH_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, { ...baseRuntime, request: { ...heroRequest, declarationPath: 'data/contracts/project-doctor-status-source-stage6-4-soldier-declaration.v1.json' } }), 'closeout request blocked');
expectThrow('UNCOMMITTED_REQUEST_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, {
  ...baseRuntime,
  verifyCommittedSource: sourcePath => sourcePath === heroPipeline.requestPath ? { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath } : { pass: true, sourcePath },
}), 'request file blocked');
expectThrow('UNCOMMITTED_SOURCE_BLOCKS', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, {
  ...baseRuntime,
  verifyCommittedSource: sourcePath => sourcePath === heroRequest.sourcePath ? { pass: false, reason: 'SOURCE_NOT_COMMITTED_AT_HEAD', sourcePath } : { pass: true, sourcePath },
}), 'candidate source blocked');
expectThrow('STALE_DECLARATION_BLOCKS_CHECK_MODE', () => renderCloseoutRequest({ pipelineId: 'hero', check: true }, {
  ...baseRuntime,
  readDeclaration: () => '{}\n',
}), 'declaration projection stale');

let captured = null;
try {
  const result = renderCloseoutRequest({ pipelineId: 'hero', check: false }, {
    ...baseRuntime,
    request: {
      ...heroRequest,
      predecessorId: registry.domains.hero.selectedId,
      entryId: 'hero-explicit-next',
      sourcePath: 'data/validation/hero-explicit-next.v1.json',
      declarationNote: 'Synthetic explicit successor fixture.',
    },
    readDeclaration: () => '{}\n',
    writeDeclaration: (filePath, content) => { captured = { filePath, content }; },
  });
  const projected = JSON.parse(captured?.content ?? '{}');
  add('EXPLICIT_SUCCESSOR_REQUEST_CAN_RENDER_WITHOUT_PROMOTION', result.entryId === 'hero-explicit-next' && result.writePerformed === true && result.boundaries.promotionPerformed === false && captured?.filePath === heroPipeline.declarationPath && projected.entryId === 'hero-explicit-next' && projected.authorityDecision === 'EXPLICIT_PRODUCER_DECLARATION', { result, capturedPath: captured?.filePath });
} catch (error) {
  add('EXPLICIT_SUCCESSOR_REQUEST_CAN_RENDER_WITHOUT_PROMOTION', false, error instanceof Error ? error.message : String(error));
}

const statusWorkflow = fs.readFileSync('.github/workflows/project-status-sync.yml', 'utf8');
add('PROJECT_STATUS_SYNC_RUNS_STAGE6_5_SELF_TEST', statusWorkflow.includes('validate-project-doctor-status-source-stage6-5-closeout-requests.mjs'));
add('REGISTRY_ENTRY_COUNT_UNCHANGED', registry.entryCount === 6 && registry.selectedCount === 6);
add('HERO_AUTHORITY_UNCHANGED', registry.domains.hero.selectedId === 'hero-stage6-4-final');
add('SOLDIER_AUTHORITY_UNCHANGED', registry.domains.soldier.selectedId === 'soldier-stage6-7-site-admission');

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-stage6-5-closeout-requests-validation/v1',
  stage: 'PROJECT-STATUS-STAGE6-5',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_STAGE6_5_CLOSEOUT_REQUESTS' : 'FAIL_STATUS_SOURCE_STAGE6_5_CLOSEOUT_REQUESTS',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    realSuccessorPromotion: false,
    authorityInference: false,
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    fixtureRepositoryMutation: false
  }
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
