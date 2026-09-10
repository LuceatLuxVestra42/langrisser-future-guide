import fs from 'node:fs';

const contractPath = 'data/contracts/hero-fetter-skill-relation-contract.v1.json';
const checkpointPath = 'data/validation/hero-fetter-skill-relation-final.v1.json';
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const errors = [];

const expected = {
  stage: 'HERO_FETTER_SKILL_RELATION_PROOF',
  sourceField: 'GotSkills_ID',
  sourceElementType: 'int',
  targetType: 'ConfigDataSkillInfo',
  targetKey: 'ID',
  fieldOffset: '0x48',
  typedAccessorRva: '0x1C6F0B0',
  methodInfoPointer: '0x186370ed8',
  sharedLookupHelper: '0x18018d820',
};

if (contract.stage !== expected.stage || checkpoint.stage !== expected.stage) errors.push('STAGE_MISMATCH');
if (contract.status !== 'PASS_TYPED_RELATION' || contract.typedRelation?.status !== 'PASS_TYPED_RELATION') errors.push('CONTRACT_STATUS_MISMATCH');
if (checkpoint.status !== 'PASS_TYPED_RELATION' || checkpoint.completion !== 'COMPLETE' || checkpoint.freezeState !== 'FINAL_FROZEN') errors.push('CHECKPOINT_NOT_COMPLETE_FROZEN');
if (checkpoint.contract !== contractPath) errors.push('CHECKPOINT_CONTRACT_POINTER_MISMATCH');

if (contract.typedRelation?.sourceField !== expected.sourceField) errors.push('SOURCE_FIELD_MISMATCH');
if (contract.typedRelation?.sourceElementType !== expected.sourceElementType) errors.push('SOURCE_ELEMENT_TYPE_MISMATCH');
if (contract.typedRelation?.targetType !== expected.targetType) errors.push('TARGET_TYPE_MISMATCH');
if (contract.typedRelation?.targetKey !== expected.targetKey) errors.push('TARGET_KEY_MISMATCH');
if (contract.runtimeAuthority?.fieldGetter?.fieldOffset !== expected.fieldOffset) errors.push('GOTSKILLS_OFFSET_MISMATCH');
if (contract.runtimeAuthority?.fieldGetter?.returnType !== 'Google.Protobuf.Collections.RepeatedField<int>') errors.push('GOTSKILLS_RETURN_TYPE_MISMATCH');
if (!String(contract.runtimeAuthority?.fieldGetter?.nativeContract || '').includes('[this+0x48]')) errors.push('GOTSKILLS_NATIVE_CONTRACT_MISMATCH');

if (contract.runtimeAuthority?.consumer?.method !== 'BlackJack.ProjectL.Common.BattleUtility.GetHeroFetterSkillInfos') errors.push('CONSUMER_METHOD_MISMATCH');
if (!String(contract.runtimeAuthority?.consumer?.signature || '').startsWith('List<ConfigDataSkillInfo>')) errors.push('CONSUMER_RETURN_TYPE_MISMATCH');
if (!String(contract.runtimeAuthority?.consumer?.nativeValueFlow || '').includes('lookup key')) errors.push('VALUE_FLOW_NOT_FROZEN');

if (contract.runtimeAuthority?.skillLookup?.typedAccessor !== 'BlackJack.ConfigData.ClientConfigDataLoader.GetConfigDataSkillInfo(int key)') errors.push('SKILL_LOOKUP_ACCESSOR_MISMATCH');
if (contract.runtimeAuthority?.skillLookup?.typedAccessorRva !== expected.typedAccessorRva) errors.push('SKILL_LOOKUP_RVA_MISMATCH');
if (contract.runtimeAuthority?.skillLookup?.returnType !== expected.targetType) errors.push('SKILL_LOOKUP_RETURN_TYPE_MISMATCH');
if (contract.runtimeAuthority?.skillLookup?.methodInfoPointer !== expected.methodInfoPointer) errors.push('SKILLINFO_METHODINFO_POINTER_MISMATCH');
if (contract.runtimeAuthority?.skillLookup?.sharedLookupHelper !== expected.sharedLookupHelper) errors.push('SKILLINFO_SHARED_HELPER_MISMATCH');
if (contract.runtimeAuthority?.skillLookup?.keyType !== expected.sourceElementType) errors.push('SKILL_LOOKUP_KEY_TYPE_MISMATCH');

const requiredProofChecks = [
  'gotSkillsGetterReturnsOffset48',
  'consumerLoadsOffset48',
  'consumerSelectsIntElement',
  'selectedIntUsedAsLookupKey',
  'skillInfoMethodInfoPointerConfirmed',
  'skillInfoSharedLookupHelperConfirmed',
  'consumerReturnsSkillInfoList',
];
for (const key of requiredProofChecks) {
  if (checkpoint.proofChecks?.[key] !== true) errors.push(`PROOF_CHECK_FALSE:${key}`);
}

for (const key of ['nameJoinCount','idArithmeticSemanticMappingCount','arrayOrderSemanticMappingCount','numericCoincidenceProofCount','producerImplementationCount']) {
  if (checkpoint.boundaryChecks?.[key] !== 0) errors.push(`BOUNDARY_COUNT_NONZERO:${key}`);
}
if (checkpoint.boundaryChecks?.runtimeBinaryCommitted !== false) errors.push('RUNTIME_BINARY_COMMITTED');
if (contract.boundary?.nameJoinAllowed !== false || contract.boundary?.idArithmeticAllowed !== false || contract.boundary?.arrayOrderSemanticMappingAllowed !== false || contract.boundary?.numericCoincidenceAsProofAllowed !== false) errors.push('FORBIDDEN_MAPPING_ALLOWED');
if (contract.completionCriteria?.producerImplementationStarted !== false) errors.push('PRODUCER_STARTED_IN_RELATION_PROOF');
if (checkpoint.blockers?.length !== 0 || checkpoint.hardErrorCount !== 0) errors.push('CHECKPOINT_HAS_BLOCKER_OR_ERROR');
if (checkpoint.nextOwner !== 'HERO_SOLDIER_BOND_CMD_CONTRIBUTION_MATERIALIZATION') errors.push('NEXT_OWNER_MISMATCH');

const result = {
  status: errors.length ? 'FAIL' : 'PASS',
  stage: expected.stage,
  relation: `${contract.typedRelation?.sourceType}.${contract.typedRelation?.sourceField} element -> ${contract.typedRelation?.targetType}.${contract.typedRelation?.targetKey}`,
  checkpoint: checkpointPath,
  errorCount: errors.length,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
