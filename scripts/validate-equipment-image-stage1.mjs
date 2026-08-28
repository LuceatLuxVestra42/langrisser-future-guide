import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, 'data/contracts/equipment-image-stage1-representative-proof.v1.json');
const STAGE0_SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage0-summary.v1.json');
const EVIDENCE_PATH = path.join(ROOT, 'data/evidence/equipment-image-stage1-source-evidence.v1.json');
const SUMMARY_PATH = path.join(ROOT, 'data/validation/equipment-image-stage1-summary.v1.json');
const CHECKPOINT_PATH = path.join(ROOT, 'data/checkpoints/equipment-image-stage1.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inspectPng(file) {
  const data = fs.readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngSignatureValid = data.length >= 24 && data.subarray(0, 8).equals(signature);
  const ihdrValid = pngSignatureValid && data.subarray(12, 16).toString('ascii') === 'IHDR';
  return {
    bytes: data.length,
    pngSignatureValid,
    ihdrValid,
    width: ihdrValid ? data.readUInt32BE(16) : null,
    height: ihdrValid ? data.readUInt32BE(20) : null,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

const contract = readJson(CONTRACT_PATH);
const stage0 = readJson(STAGE0_SUMMARY_PATH);
const evidence = readJson(EVIDENCE_PATH);
const hardErrors = [];
const reviews = [];

if (stage0.status !== contract.stage0Input.requiredStatus) {
  hardErrors.push(`Stage 0 status ${stage0.status} != ${contract.stage0Input.requiredStatus}`);
}
if (stage0.freezeState !== contract.stage0Input.requiredFreezeState) {
  hardErrors.push(`Stage 0 freeze ${stage0.freezeState} != ${contract.stage0Input.requiredFreezeState}`);
}
if (!Array.isArray(stage0.representativeFixtures) || stage0.representativeFixtures.length !== 5) {
  hardErrors.push(`Stage 0 representative count ${stage0.representativeFixtures?.length ?? 'missing'} != 5`);
}
if (!Array.isArray(contract.representatives) || contract.representatives.length !== 5) {
  hardErrors.push(`Stage 1 contract representative count ${contract.representatives?.length ?? 'missing'} != 5`);
}
if (!Array.isArray(evidence.records) || evidence.records.length !== 5) {
  hardErrors.push(`Stage 1 evidence record count ${evidence.records?.length ?? 'missing'} != 5`);
}

const stage0ByLabel = new Map((stage0.representativeFixtures ?? []).map((record) => [record.label, record]));
const evidenceById = new Map();
for (const record of evidence.records ?? []) {
  const id = Number(record.equipmentId);
  if (evidenceById.has(id)) hardErrors.push(`duplicate evidence equipmentId ${id}`);
  evidenceById.set(id, record);
}

const representativeResults = [];
for (const fixture of contract.representatives ?? []) {
  const stage0Fixture = stage0ByLabel.get(fixture.label);
  if (!stage0Fixture) {
    hardErrors.push(`missing Stage 0 representative label ${fixture.label}`);
    continue;
  }

  for (const field of ['equipmentId', 'sourceIconPath', 'targetRepositoryPath', 'targetUrlPath']) {
    if (stage0Fixture[field] !== fixture[field]) {
      hardErrors.push(`Stage 0 parity mismatch ${fixture.label}.${field}: ${stage0Fixture[field]} != ${fixture[field]}`);
    }
  }

  const evidenceRecord = evidenceById.get(Number(fixture.equipmentId));
  if (!evidenceRecord) {
    hardErrors.push(`missing evidence record for equipmentId ${fixture.equipmentId}`);
    continue;
  }
  if (evidenceRecord.label !== fixture.label) {
    hardErrors.push(`evidence label mismatch for ${fixture.equipmentId}: ${evidenceRecord.label} != ${fixture.label}`);
  }
  if (evidenceRecord.sourceLocator !== fixture.sourceIconPath) {
    hardErrors.push(`evidence source locator mismatch for ${fixture.equipmentId}`);
  }

  const targetFile = path.join(ROOT, fixture.targetRepositoryPath);
  const repositoryAssetExists = fs.existsSync(targetFile);
  const repositoryAsset = repositoryAssetExists ? inspectPng(targetFile) : {
    bytes: null,
    pngSignatureValid: null,
    ihdrValid: null,
    width: null,
    height: null,
    sha256: null,
  };

  if (repositoryAssetExists) {
    if (!repositoryAsset.pngSignatureValid) hardErrors.push(`invalid PNG signature for ${fixture.equipmentId}`);
    if (!repositoryAsset.ihdrValid) hardErrors.push(`missing/invalid IHDR for ${fixture.equipmentId}`);
    if (!(repositoryAsset.width > 0 && repositoryAsset.height > 0)) hardErrors.push(`invalid dimensions for ${fixture.equipmentId}`);
  }

  const sourceEvidenceVerified = evidenceRecord.sourceEvidenceStatus === contract.requiredEvidence.sourceEvidenceStatus;
  const sourceSha256 = evidenceRecord.sourceSha256;
  const sourceShaValid = typeof sourceSha256 === 'string' && /^[0-9a-f]{64}$/i.test(sourceSha256);
  const sourceArtifactValid = typeof evidenceRecord.sourceArtifact === 'string' && evidenceRecord.sourceArtifact.trim().length > 0;

  if (sourceEvidenceVerified && !sourceShaValid) {
    hardErrors.push(`verified source evidence missing valid SHA-256 for ${fixture.equipmentId}`);
  }
  if (sourceEvidenceVerified && !sourceArtifactValid) {
    hardErrors.push(`verified source evidence missing source artifact for ${fixture.equipmentId}`);
  }
  if (sourceEvidenceVerified && !repositoryAssetExists) {
    hardErrors.push(`verified source evidence exists but repository asset is missing for ${fixture.equipmentId}`);
  }

  const shaParity = sourceEvidenceVerified && repositoryAssetExists && sourceShaValid
    ? sourceSha256.toLowerCase() === repositoryAsset.sha256.toLowerCase()
    : null;
  if (sourceEvidenceVerified && repositoryAssetExists && shaParity === false) {
    hardErrors.push(`source/repository SHA-256 mismatch for ${fixture.equipmentId}`);
  }

  const passed = Boolean(
    repositoryAssetExists &&
    repositoryAsset.pngSignatureValid &&
    repositoryAsset.ihdrValid &&
    repositoryAsset.width > 0 &&
    repositoryAsset.height > 0 &&
    sourceEvidenceVerified &&
    sourceShaValid &&
    sourceArtifactValid &&
    shaParity === true
  );

  if (!repositoryAssetExists) reviews.push(`representative ${fixture.label} (${fixture.equipmentId}) awaits authoritative PNG bytes`);
  else if (!sourceEvidenceVerified) reviews.push(`representative ${fixture.label} (${fixture.equipmentId}) has repository bytes but lacks verified exact-source evidence`);

  representativeResults.push({
    label: fixture.label,
    equipmentId: fixture.equipmentId,
    sourceIconPath: fixture.sourceIconPath,
    targetRepositoryPath: fixture.targetRepositoryPath,
    targetUrlPath: fixture.targetUrlPath,
    sourceEvidenceStatus: evidenceRecord.sourceEvidenceStatus,
    sourceArtifact: evidenceRecord.sourceArtifact,
    sourceSha256: evidenceRecord.sourceSha256,
    repositoryAssetExists,
    repositoryAsset,
    sourceRepositorySha256Parity: shaParity,
    passed,
  });
}

const passedCount = representativeResults.filter((record) => record.passed).length;
const existingAssetCount = representativeResults.filter((record) => record.repositoryAssetExists).length;
const verifiedSourceEvidenceCount = representativeResults.filter((record) => record.sourceEvidenceStatus === contract.requiredEvidence.sourceEvidenceStatus).length;

let status;
let completion;
let freezeState;
let nextStage;
if (hardErrors.length > 0) {
  status = 'FAIL_EQUIPMENT_IMAGE_STAGE1';
  completion = 'BLOCKED_BY_HARD_ERROR';
  freezeState = 'NOT_FROZEN';
  nextStage = 'BLOCKED';
} else if (passedCount === contract.admission.representativePassCountRequired) {
  status = 'PASS_EQUIPMENT_IMAGE_STAGE1';
  completion = 'COMPLETE';
  freezeState = 'EQUIPMENT_IMAGE_STAGE1_FROZEN';
  nextStage = contract.admission.nextStageAfterPass;
} else {
  status = 'READY_FOR_ASSET_EVIDENCE';
  completion = 'PARTIAL_EVIDENCE_PENDING';
  freezeState = 'EQUIPMENT_IMAGE_STAGE1_PROOF_READY';
  nextStage = 'WAIT_FOR_AUTHORITATIVE_REPRESENTATIVE_BYTES';
}

const summary = {
  stage: 'Equipment Image Stage 1',
  status,
  completion,
  freezeState,
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: 'equipmentId',
  bulkImportAllowed: status === 'PASS_EQUIPMENT_IMAGE_STAGE1',
  counts: {
    requiredRepresentatives: contract.admission.representativePassCountRequired,
    evaluatedRepresentatives: representativeResults.length,
    passedRepresentatives: passedCount,
    repositoryAssetsPresent: existingAssetCount,
    verifiedSourceEvidence: verifiedSourceEvidenceCount,
    hardErrors: hardErrors.length,
    reviews: reviews.length,
  },
  discovery: evidence.discovery ?? null,
  representativeResults,
  hardErrors,
  reviews,
  nextStage,
};

const checkpoint = {
  checkpoint: 'EQUIPMENT-IMAGE-STAGE1-REPRESENTATIVE-PROOF',
  status,
  completion,
  freezeState,
  stage0InputStatus: stage0.status,
  stage0InputFreezeState: stage0.freezeState,
  representativePass: `${passedCount}/${contract.admission.representativePassCountRequired}`,
  repositoryAssetsPresent: `${existingAssetCount}/${contract.admission.representativePassCountRequired}`,
  verifiedSourceEvidence: `${verifiedSourceEvidenceCount}/${contract.admission.representativePassCountRequired}`,
  bulkImportAllowed: status === 'PASS_EQUIPMENT_IMAGE_STAGE1',
  productionJoinKey: 'equipmentId',
  sourceLocatorAuthority: 'ConfigDataEquipmentInfo.Icon full path',
  nextStartPoint: status === 'PASS_EQUIPMENT_IMAGE_STAGE1'
    ? 'Expand the proven asset intake rule to the 373 public Equipment records.'
    : 'Provide authoritative PNG bytes for the five frozen source locators; populate exact-source evidence and rerun this validator.',
  blocker: status === 'READY_FOR_ASSET_EVIDENCE'
    ? 'AUTHORITATIVE_REPRESENTATIVE_ASSET_BYTES_NOT_AVAILABLE_IN_CONNECTED_SOURCES'
    : null,
  reopenStage0: false,
};

writeJson(SUMMARY_PATH, summary);
writeJson(CHECKPOINT_PATH, checkpoint);
console.log(JSON.stringify(summary, null, 2));

if (hardErrors.length > 0) process.exit(1);
