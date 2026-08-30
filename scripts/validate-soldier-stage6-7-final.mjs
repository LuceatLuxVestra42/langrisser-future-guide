import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameSemanticDigest } from './lib/frozen-semantic-digest.mjs';
import {
  STAGE67_FRESHNESS_MODE,
  buildStage67DirectSourceDigest,
  buildStage67KeyArtifactDigest,
  buildStage67OutputDigest,
  buildStage67ValidationDigest,
  verifyStage66EmbeddedFreshness,
} from './lib/soldier-stage6-7-semantic-projections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const exists = (relativePath) => fs.existsSync(path.join(ROOT, relativePath));
const errors = [];
const provenanceDrift = [];
const fail = (code, detail = null) => errors.push({ code, detail });

const paths = {
  generated: 'data/generated/soldier-stage6-7-site-admission.v1.json',
  validation: 'data/validation/soldier-stage6-7-site-admission.v1.json',
};

function headBlob(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function verifyFrozenDependencyV2(kind, label, ref) {
  if (
    !ref
      || typeof ref.path !== 'string'
      || typeof ref.gitBlobSha !== 'string'
      || ref.freshnessMode !== STAGE67_FRESHNESS_MODE
      || !ref.semanticDigest
  ) {
    fail('invalid-frozen-ref-v2', { kind, label, ref: ref ?? null });
    return;
  }
  if (!exists(ref.path)) {
    fail('frozen-ref-missing', { kind, label, path: ref.path });
    return;
  }

  let value;
  let currentDigest;
  try {
    value = readJson(ref.path);
    currentDigest = kind === 'source'
      ? buildStage67DirectSourceDigest(label, value)
      : buildStage67KeyArtifactDigest(label, value);
  } catch (error) {
    fail('frozen-ref-semantic-digest-error', { kind, label, path: ref.path, detail: error.message });
    return;
  }

  if (!sameSemanticDigest(ref.semanticDigest, currentDigest)) {
    fail('frozen-ref-semantic-mismatch', {
      kind,
      label,
      path: ref.path,
      expected: ref.semanticDigest,
      actual: currentDigest,
    });
    return;
  }

  if (label === 'stage6_6Manifest' || label === 'stage6_6' || label === 'expansionBasis') {
    const stage66Label = label === 'stage6_6' ? 'stage6_6' : 'stage6_6Manifest';
    if (!verifyStage66EmbeddedFreshness(stage66Label, value)) {
      fail('stage6-6-embedded-semantic-digest-invalid', { kind, label, path: ref.path });
      return;
    }
  }

  const actualBlob = headBlob(ref.path);
  if (actualBlob == null) {
    fail('frozen-ref-head-blob-missing', { kind, label, path: ref.path });
    return;
  }
  if (actualBlob !== ref.gitBlobSha) {
    provenanceDrift.push({ kind, label, path: ref.path, frozen: ref.gitBlobSha, current: actualBlob });
  }
}

const generated = readJson(paths.generated);
const validation = readJson(paths.validation);

if (generated?.schemaId !== 'soldier-stage6-7-site-admission/v1' || generated?.stage !== '6-7') {
  fail('generated-schema', { schemaId: generated?.schemaId ?? null, stage: generated?.stage ?? null });
}
if (validation?.schemaId !== 'soldier-stage6-7-site-admission-validation/v1' || validation?.stage !== '6-7') {
  fail('validation-schema', { schemaId: validation?.schemaId ?? null, stage: validation?.stage ?? null });
}
if (generated?.status !== 'PASS' || validation?.status !== 'PASS') {
  fail('stage6-7-status', { generated: generated?.status ?? null, validation: validation?.status ?? null });
}
if (!['READY', 'READY_WITH_REVIEW'].includes(generated?.admissionStatus) || generated?.admissionStatus !== validation?.admissionStatus) {
  fail('admission-status', { generated: generated?.admissionStatus ?? null, validation: validation?.admissionStatus ?? null });
}
if (generated?.scope !== 'SOLDIER_PAGE_DATA_ADMISSION') fail('scope', generated?.scope ?? null);

const expectedGeneratedDigest = buildStage67OutputDigest(generated);
const expectedValidationDigest = buildStage67ValidationDigest(validation);
if (
  generated?.freshness?.freshnessMode !== STAGE67_FRESHNESS_MODE
    || !sameSemanticDigest(generated?.freshness?.semanticDigest, expectedGeneratedDigest)
) {
  fail('generated-semantic-digest', { expected: expectedGeneratedDigest, actual: generated?.freshness ?? null });
}
if (
  validation?.freshness?.freshnessMode !== STAGE67_FRESHNESS_MODE
    || !sameSemanticDigest(validation?.freshness?.semanticDigest, expectedValidationDigest)
) {
  fail('validation-semantic-digest', { expected: expectedValidationDigest, actual: validation?.freshness ?? null });
}

const expectedCoverage = {
  canonicalSoldiers: 224,
  normalSoldiers: 168,
  spSoldiers: 56,
  normalTier3: 129,
  failRecords: 0,
  representativeFixtures: 6,
  representativeFixturesPassed: 6,
  filterTests: 15,
  filterTestsPassed: 15,
  heroKeys: 267,
  soldierKeys: 224,
  heroSoldierRelations: 5977,
  reciprocalMismatchCount: 0,
};
for (const [key, expected] of Object.entries(expectedCoverage)) {
  const generatedValue = generated?.summary?.[key];
  const validationValue = validation?.coverage?.[key];
  if (generatedValue !== expected) fail(`generated-coverage-${key}`, { expected, actual: generatedValue ?? null });
  if (validationValue !== expected) fail(`validation-coverage-${key}`, { expected, actual: validationValue ?? null });
}

const expectedAdmissionGates = [
  'generationComplete',
  'validationClassified',
  'representativeQa',
  'listAndRelease',
  'filterQa',
  'reciprocalHeroLinks',
  'expansionFoundation',
  'sourceSnapshotsFrozen',
  'derivationDocumented',
];
for (const gate of expectedAdmissionGates) {
  if (generated?.admissionGates?.[gate] !== 'PASS') fail(`generated-gate-${gate}`, generated?.admissionGates?.[gate] ?? null);
  if (validation?.admissionGates?.[gate] !== 'PASS') fail(`validation-gate-${gate}`, validation?.admissionGates?.[gate] ?? null);
}

for (const [key, value] of Object.entries(validation?.checks || {})) {
  if (typeof value === 'number' && value !== 0) fail(`validation-check-${key}`, value);
}
if (!validation?.checks || Object.keys(validation.checks).length === 0) fail('validation-checks-missing', null);
if (!Array.isArray(validation?.errors) || validation.errors.length !== 0) fail('validation-errors', validation?.errors ?? null);
if (!Array.isArray(validation?.sourceSnapshotMismatches) || validation.sourceSnapshotMismatches.length !== 0) fail('source-snapshot-mismatches', validation?.sourceSnapshotMismatches ?? null);
if (!Array.isArray(validation?.sourceSemanticDependencyFailures) || validation.sourceSemanticDependencyFailures.length !== 0) fail('source-semantic-dependency-failures', validation?.sourceSemanticDependencyFailures ?? null);
if (!Array.isArray(validation?.coverageMismatches) || validation.coverageMismatches.length !== 0) fail('coverage-mismatches', validation?.coverageMismatches ?? null);
if (!Array.isArray(validation?.documentationMissing) || validation.documentationMissing.length !== 0) fail('documentation-missing', validation?.documentationMissing ?? null);
if (!Array.isArray(validation?.admissionGateFailures) || validation.admissionGateFailures.length !== 0) fail('admission-gate-failures', validation?.admissionGateFailures ?? null);

for (const [label, ref] of Object.entries(generated?.sources || {})) verifyFrozenDependencyV2('source', label, ref);
for (const [label, ref] of Object.entries(generated?.keyArtifacts || {})) verifyFrozenDependencyV2('keyArtifact', label, ref);
if (Object.keys(generated?.sources || {}).length !== 12) fail('source-ref-count', Object.keys(generated?.sources || {}).length);
if (Object.keys(generated?.keyArtifacts || {}).length !== 6) fail('key-artifact-count', Object.keys(generated?.keyArtifacts || {}).length);

const generatedReviews = Array.isArray(generated?.reviews) ? generated.reviews : [];
const validationReviews = Array.isArray(validation?.reviews) ? validation.reviews : [];
if (!generatedReviews.every((item) => item?.classification === 'REVIEW' && typeof item?.code === 'string')) fail('generated-review-classification', generatedReviews);
if (!validationReviews.every((item) => item?.classification === 'REVIEW' && typeof item?.code === 'string')) fail('validation-review-classification', validationReviews);
const generatedReviewCodes = generatedReviews.map((item) => item.code).sort();
const validationReviewCodes = validationReviews.map((item) => item.code).sort();
if (JSON.stringify(generatedReviewCodes) !== JSON.stringify(validationReviewCodes)) fail('review-code-parity', { generated: generatedReviewCodes, validation: validationReviewCodes });
if (generated?.admissionStatus === 'READY_WITH_REVIEW' && generatedReviews.length === 0) fail('ready-with-review-without-reviews', null);

if (generated?.capabilities?.listData !== 'READY' || generated?.capabilities?.detailData !== 'READY' || generated?.capabilities?.filterSemantics !== 'READY' || generated?.capabilities?.reciprocalHeroLinks !== 'READY' || generated?.capabilities?.representativeCoverage !== 'READY' || generated?.capabilities?.simulatorDataFoundation !== 'FOUNDATION_READY') {
  fail('capability-readiness', generated?.capabilities ?? null);
}

if (errors.length) {
  console.error(`SOLDIER STAGE 6-7 FINAL VALIDATION: FAIL (${errors.length})`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

console.log('SOLDIER STAGE 6-7 FINAL VALIDATION: PASS');
console.log(JSON.stringify({
  canonicalSoldiers: 224,
  normalSoldiers: 168,
  spSoldiers: 56,
  admissionStatus: generated.admissionStatus,
  hardFailures: 0,
  reviewCodeCount: generatedReviewCodes.length,
  frozenSourceRefs: 12,
  frozenKeyArtifacts: 6,
  provenanceOnlyChanged: provenanceDrift.length,
}, null, 2));
if (provenanceDrift.length) {
  console.log('PROVENANCE_ONLY_CHANGED');
  for (const item of provenanceDrift) console.log(JSON.stringify(item));
}
