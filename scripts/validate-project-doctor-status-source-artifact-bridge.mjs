import fs from 'node:fs';
import {
  DEFAULT_BRIDGE_CONTRACT,
  bridgeStatusSource,
  validateBridgeContract,
  validatePipelineBinding,
} from './bridge-project-doctor-status-source.mjs';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

const contract = readJson(DEFAULT_BRIDGE_CONTRACT);
const producerContract = readJson(contract.producerContract);
const registry = readJson(contract.activeRegistry);
const checks = [];
const fail = (id, detail) => checks.push({ id, pass: false, detail });
const pass = (id, detail = null) => checks.push({ id, pass: true, ...(detail === null ? {} : { detail }) });

const contractValidation = validateBridgeContract({ contract, producerContract, registry });
if (contractValidation.pass) pass('CONTRACT');
else fail('CONTRACT', contractValidation.failures);

for (const pipeline of contract.pipelines ?? []) {
  const binding = validatePipelineBinding({ pipeline, producerContract, registry });
  if (binding.pass) pass(`BASELINE_${pipeline.id.toUpperCase().replaceAll('-', '_')}`);
  else fail(`BASELINE_${pipeline.id.toUpperCase().replaceAll('-', '_')}`, binding.failures);
}

try {
  const replay = bridgeStatusSource({ all: true, check: true });
  const delegated = replay.pipelineCount === 6
    && replay.results.every(item => item.submission?.delegatedToStage3 === true)
    && replay.results.every(item => String(item.submission?.status ?? '').startsWith('PASS_STATUS_SOURCE_PRODUCER_'));
  if (delegated) pass('ALL_BASELINES_DELEGATE_THROUGH_STAGE4_AND_STAGE3');
  else fail('ALL_BASELINES_DELEGATE_THROUGH_STAGE4_AND_STAGE3', replay);
} catch (error) {
  fail('ALL_BASELINES_DELEGATE_THROUGH_STAGE4_AND_STAGE3', error instanceof Error ? error.message : String(error));
}

{
  const fixture = clone(contract);
  fixture.pipelines[0].domain = 'soldier';
  const result = validateBridgeContract({ contract: fixture, producerContract, registry });
  if (!result.pass && result.failures.some(item => item.type === 'PIPELINE_DOMAIN_PRODUCER_MISMATCH')) pass('CROSS_DOMAIN_BINDING_BLOCKED');
  else fail('CROSS_DOMAIN_BINDING_BLOCKED', result);
}

{
  const fixture = clone(contract.pipelines[0]);
  fixture.baselineSourcePath = 'data/validation/soldier-stage6-7-site-admission.v1.json';
  const result = validatePipelineBinding({ pipeline: fixture, producerContract, registry });
  if (!result.pass && result.failures.some(item => item.type === 'BASELINE_SOURCE_OUTSIDE_PRODUCER_FAMILY')) pass('WRONG_SOURCE_FAMILY_BLOCKED');
  else fail('WRONG_SOURCE_FAMILY_BLOCKED', result);
}

{
  const skin = clone((contract.pipelines ?? []).find(item => item.id === 'skin'));
  skin.expectedSourceStatus = 'FINAL_FROZEN';
  const result = validatePipelineBinding({ pipeline: skin, producerContract, registry });
  if (!result.pass && result.failures.some(item => item.type === 'BASELINE_SOURCE_STATUS_MISMATCH')) pass('SKIN_READINESS_SEMANTICS_PRESERVED');
  else fail('SKIN_READINESS_SEMANTICS_PRESERVED', result);
}

{
  let captured = null;
  try {
    const result = bridgeStatusSource(
      {
        pipelineId: 'hero',
        entryId: 'stage5-forwarding-fixture',
        sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
        check: true,
      },
      {
        contract,
        producerContract,
        registry,
        submit: submission => {
          captured = clone(submission);
          return {
            status: 'PASS_STATUS_SOURCE_PRODUCER_CHECK',
            delegatedToStage3: true,
            promotion: { status: 'PASS_STATUS_SOURCE_PROMOTION_CHECK' },
          };
        },
      },
    );
    if (
      result.pipelineCount === 1
      && captured?.producerId === 'hero-final'
      && captured?.promotionOptions?.id === 'stage5-forwarding-fixture'
      && captured?.promotionOptions?.sourcePath === 'data/validation/hero-stage6-4-final.v1.json'
      && captured?.promotionOptions?.check === true
    ) pass('CANDIDATE_FORWARDING_IS_EXPLICIT_AND_CHECK_ONLY');
    else fail('CANDIDATE_FORWARDING_IS_EXPLICIT_AND_CHECK_ONLY', { result, captured });
  } catch (error) {
    fail('CANDIDATE_FORWARDING_IS_EXPLICIT_AND_CHECK_ONLY', error instanceof Error ? error.message : String(error));
  }
}

const failed = checks.filter(item => !item.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-artifact-bridge-validation/v1',
  stage: 'PROJECT-STATUS-STAGE5',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_ARTIFACT_BRIDGE' : 'FAIL_STATUS_SOURCE_ARTIFACT_BRIDGE',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  boundaries: {
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    owningValidatorExecution: false,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
