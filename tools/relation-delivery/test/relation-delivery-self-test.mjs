import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  RELATION_DELIVERY_CONTRACT_SCHEMA,
  assertOpaqueTarget,
  createLookupEnvelope,
} from '../lib/contract.mjs';

const root = process.cwd();
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();

const owners = readJson('tools/project-check/contracts/owners.v1.json');
const validators = readJson('tools/project-check/contracts/validators.v1.json');
const contractPath = 'data/contracts/relation-delivery-v1.json';
const validationPath = 'data/validation/relation-delivery-a5.v1.json';
const contract = readJson(contractPath);
const validation = readJson(validationPath);

const owner = owners.owners.find(item => item.id === 'relation-delivery');
assert.ok(owner, 'relation-delivery owner must exist');
assert.deepEqual(owner.validators, ['relation-delivery-self-test']);

const rule = owners.pathRules.find(item => item.id === 'relation-delivery');
assert.ok(rule, 'relation-delivery path rule must exist');
assert.deepEqual(rule.owners, ['relation-delivery']);
assert.deepEqual(rule.patterns, [
  'tools/relation-delivery/**',
  'data/contracts/relation-delivery-*',
  'data/validation/relation-delivery-*',
  '.github/workflows/relation-delivery-*',
]);

const validator = validators.validators.find(item => item.id === 'relation-delivery-self-test');
assert.ok(validator, 'relation-delivery validator must exist');
assert.equal(validator.executable, 'node');
assert.deepEqual(validator.args, ['tools/relation-delivery/test/relation-delivery-self-test.mjs']);
assert.equal(validator.owner, 'relation-delivery');

assert.equal(contract.schemaId, RELATION_DELIVERY_CONTRACT_SCHEMA);
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.authorityBoundary.semanticAuthorityRemainsDomainOwned, true);
assert.equal(contract.authorityBoundary.relationDeliveryIsSemanticAuthority, false);
assert.equal(contract.authorityBoundary.relationDeliveryMayCreateEdges, false);
assert.equal(contract.authorityBoundary.relationDeliveryMayRepairMissingEdges, false);
assert.equal(contract.authorityBoundary.relationDeliveryMayInterpretNames, false);
assert.equal(contract.authorityBoundary.relationDeliveryMayUseIdArithmetic, false);
assert.equal(contract.authorityBoundary.genericGeneratedRelationArtifactAllowed, false);
assert.equal(contract.projectionPolicy.genericSorting, 'FORBIDDEN_UNLESS_OWNING_CONTRACT_REQUIRES_IT');
assert.equal(contract.metadataPolicy.domainMetadata, 'OPAQUE_EXACT_PRESERVATION');
assert.equal(contract.provenProfiles.length, 4);

const profiles = new Map(contract.provenProfiles.map(profile => [profile.relationKey, profile]));
assert.equal(profiles.get('hero-exclusive-equipment')?.keyPresence, 'MISSING_KEY_ALLOWED');
assert.equal(profiles.get('hero-exclusive-equipment')?.observed?.missingHeroKeyCount, 100);
assert.equal(profiles.get('hero-skin')?.keyPresence, 'ALL_KEYS_PRESENT_EXPLICIT_EMPTY_ALLOWED');
assert.equal(profiles.get('hero-skin')?.observed?.explicitEmptyHeroKeyCount, 32);
assert.equal(profiles.get('hero-soldier')?.keyPresence, 'FULL_CANONICAL_KEYSPACE_PRESENT');
assert.equal(profiles.get('hero-soldier')?.observed?.provenanceCount, 5978);
assert.equal(profiles.get('banner-hero')?.keyPresence, 'ALL_DEFINITION_KEYS_PRESENT_EXPLICIT_EMPTY_ALLOWED');
assert.equal(profiles.get('banner-hero')?.fromIdType, 'string');
assert.equal(profiles.get('banner-hero')?.toIdType, 'number');
assert.equal(profiles.get('banner-hero')?.observed?.explicitEmptyDefinitionCount, 8);

const missing = createLookupEnvelope({ present: false, targets: [] });
const explicitEmpty = createLookupEnvelope({ present: true, targets: [] });
assert.equal(missing.present, false);
assert.equal(explicitEmpty.present, true);
assert.deepEqual(missing.targets, []);
assert.deepEqual(explicitEmpty.targets, []);
assert.throws(() => createLookupEnvelope({ present: false, targets: [{ targetId: 1 }] }));
assert.throws(() => createLookupEnvelope({ present: 'yes', targets: [] }));
assert.throws(() => createLookupEnvelope({ present: true, targets: null }));
assert.deepEqual(assertOpaqueTarget({ targetId: 7, relationType: 'opaque-domain-value' }), { targetId: 7, relationType: 'opaque-domain-value' });
assert.throws(() => assertOpaqueTarget({ relationType: 'missing-id' }));

const evidenceByPath = new Map();
for (const profile of contract.provenProfiles) {
  const evidence = readJson(profile.evidence.path);
  evidenceByPath.set(profile.evidence.path, evidence);
  assert.equal(blob(profile.evidence.path), profile.evidence.gitBlobSha, 'profile evidence blob pin must match');
  assert.equal(evidence.status, 'PASS', 'profile evidence must remain PASS');
  assert.equal(evidence.completion, 'COMPLETE', 'profile evidence must remain COMPLETE');
  assert.equal(evidence.summary?.failedCheckCount, 0, 'profile evidence must have zero failed checks');
  assert.equal(evidence.boundaryEvidence?.rawConfigDataLiteralCount, 0);
  assert.equal(evidence.boundaryEvidence?.nameJoinTokenCount, 0);
  assert.equal(evidence.boundaryEvidence?.semanticIdArithmeticCount, 0);
  assert.equal(evidence.boundaryEvidence?.manualPairLiteralCount, 0);
}

assert.equal(validation.schemaId, 'relation-delivery-a5-validation/v1');
assert.equal(validation.status, 'PASS');
assert.equal(validation.completion, 'COMPLETE');
assert.equal(validation.contract.path, contractPath);
assert.equal(validation.contract.gitBlobSha, blob(contractPath));
assert.equal(validation.summary.profileCount, 4);
assert.equal(validation.summary.passedProfileCount, 4);
assert.equal(validation.summary.profileEvidenceMismatchCount, 0);
assert.equal(validation.summary.boundaryViolationCount, 0);
assert.equal(validation.summary.failedProfileCount, 0);
assert.equal(validation.summary.failedCheckCount, 0);
assert.equal(validation.extractedDifferences.missingKeyVsExplicitEmptyDistinct, true);
assert.equal(validation.extractedDifferences.equipmentMissingHeroKeys, 100);
assert.equal(validation.extractedDifferences.skinExplicitEmptyHeroKeys, 32);
assert.equal(validation.extractedDifferences.soldierProvenanceCount, 5978);
assert.equal(validation.extractedDifferences.bannerZeroEdgeDefinitionKeys, 8);
assert.equal(validation.boundaries.semanticRecomputationCount, 0);
assert.equal(validation.boundaries.canonicalMutationCount, 0);
assert.equal(validation.boundaries.genericGeneratedRelationArtifactCount, 0);
assert.equal(validation.boundaries.frontendConsumerChangeCount, 0);

for (const evidencePin of validation.evidence) {
  assert.equal(blob(evidencePin.path), evidencePin.gitBlobSha, 'A5 validation evidence blob pin must match');
  const evidence = evidenceByPath.get(evidencePin.path) ?? readJson(evidencePin.path);
  assert.equal(evidencePin.status, evidence.status);
  assert.equal(evidencePin.completion, evidence.completion);
  assert.equal(evidencePin.failedCheckCount, evidence.summary?.failedCheckCount);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'RELATION_DELIVERY_A5_SHARED_CONTRACT',
  owner: owner.id,
  validator: validator.id,
  pathRule: rule.id,
  profileCount: contract.provenProfiles.length,
  missingKeyVsExplicitEmptyDistinct: true,
  semanticRecomputationCount: 0,
}, null, 2));
