import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = (p) => sha(fs.readFileSync(p));
function assert(c, m) { if (!c) throw new Error(m); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function pngDimensions(bytes) {
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'invalid PNG signature');
  assert(bytes.subarray(12, 16).toString('ascii') === 'IHDR', 'PNG IHDR missing');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value == null) throw new Error(`invalid args near ${key}`);
    out[key.slice(2)] = value;
  }
  return out;
}

const args = parseArgs(process.argv);
const evidencePath = args.evidence ?? 'data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json';
const readinessPath = args.readiness ?? 'data/validation/skin-stage3-2-readiness.v1.json';
const planPath = args.plan;
const resultPath = args.result;
const outputPath = args.write;
assert(planPath && resultPath && outputPath, '--plan --result --write are required');

const evidence = readJson(evidencePath);
const readiness = readJson(readinessPath);
const plan = readJson(planPath);
const result = readJson(resultPath);

assert(readiness.stage === 'skin-page-3' && readiness.substage === '3-2', 'Stage 3-2 readiness identity changed');
assert(readiness.status === 'PASS' && readiness.completion === 'SKIN_STAGE3_2_COMPLETE', 'current Stage 3-2 authority is not complete');
assert(readiness.metrics?.failedCheckCount === 0 && readiness.metrics?.evidenceIssueCount === 0, 'Stage 3-2 authority has validation issues');
assert(readiness.evidence?.present === true && readiness.evidence?.blocker == null, 'Stage 3-2 evidence blocker exists');

assert(evidence.stage === 'skin-page-3' && evidence.substage === '3-2', 'Stage 3-2 evidence identity changed');
assert(evidence.evidenceClass === 'FRESH_OFFICIAL_INSTALLER_REPRESENTATIVE_ASSET_RESOLUTION', 'unexpected Stage 3-2 evidence class');
assert(evidence.source?.kind === 'OFFICIAL_INSTALLER' && evidence.source?.installVersion === '1.1.113', 'official installer authority changed');
assert(evidence.source?.unityParser === 'UnityPy==1.25.3', 'UnityPy authority changed');

const expectedIds = evidence.currentAuthority?.representativeSkinIds;
assert(Array.isArray(expectedIds) && same(expectedIds, [102, 1901, 3701]), `representative Skin IDs changed: ${JSON.stringify(expectedIds)}`);
const evidenceSha = shaFile(evidencePath);

assert(plan.stage === 'skin-page-3' && plan.substage === '3-3-batch' && plan.batchId === 'batch-000', 'invalid Batch 0 plan identity');
assert(plan.status === 'READY_FOR_BOUNDED_STATIC_EXTRACTION', 'Batch 0 plan is not ready');
assert(plan.currentAuthority?.path === evidencePath, 'Batch 0 authority path changed');
assert(plan.currentAuthority?.sha256 === evidenceSha, 'Batch 0 authority hash mismatch');
assert(plan.currentAuthority?.installVersion === '1.1.113' && plan.currentAuthority?.unityParser === 'UnityPy==1.25.3', 'Batch 0 authority metadata changed');
assert(plan.scope?.kind === 'STATIC' && plan.scope?.skinCount === 3, 'Batch 0 scope changed');
assert(plan.scope?.fullPopulationValidationRequired === false, 'Batch 0 accidentally enabled full-population gate');
assert(same(plan.scope?.skinIds, expectedIds), 'Batch 0 Skin IDs differ from current representative authority');
assert(plan.guardrails?.historicalBulkArtifactImported === false, 'historical bulk artifact import is forbidden');
assert(plan.guardrails?.heroSkinSemanticRecomputed === false && plan.guardrails?.sourceOrderRecomputed === false, 'semantic/sourceOrder recomputation is forbidden');
assert(plan.guardrails?.nameJoin === false && plan.guardrails?.idArithmetic === false && plan.guardrails?.filenameSimilarity === false, 'inference guardrail changed');
assert(plan.guardrails?.exactRuntimePathOnly === true, 'exact runtime path guardrail changed');

assert(result.stage === 'skin-page-3' && result.substage === '3-3-batch' && result.batchId === 'batch-000', 'invalid Batch 0 result identity');
assert(result.status === 'PASS_SKIN_STAGE3_3_STATIC_BATCH_EXTRACTION' && result.finalReady === true, `Batch 0 extraction not PASS: ${result.status}`);
assert(result.counts?.requested === 3 && result.counts?.extracted === 3 && result.counts?.errors === 0, 'Batch 0 extraction counts changed');
assert(result.counts?.packagesDownloaded === 2, `Batch 0 should use exactly two frozen packages, got ${result.counts?.packagesDownloaded}`);
assert(result.boundaries?.boundedBatchOnly === true && result.boundaries?.full540GateUsed === false, 'bounded batch boundary changed');
assert(result.boundaries?.currentStage32SerializedEvidenceVerified === true && result.boundaries?.exactRuntimePathOnly === true, 'authority verification boundary changed');
assert(result.boundaries?.historicalBulkArtifactImported === false && result.boundaries?.semanticStageReopened === false, 'forbidden historical/semantic boundary changed');
assert(Array.isArray(result.records) && result.records.length === 3, 'Batch 0 result record count changed');

const fixtureById = new Map(evidence.fixtures.map((row) => [row.skinId, row]));
const planById = new Map(plan.requests.map((row) => [row.skinId, row]));
const seen = new Set();
const validated = [];
for (const record of result.records) {
  const skinId = record.skinId;
  assert(expectedIds.includes(skinId), `unexpected Skin ${skinId}`);
  assert(!seen.has(skinId), `duplicate Skin ${skinId}`);
  seen.add(skinId);
  assert(record.status === 'EXTRACTED', `Skin ${skinId} did not extract`);

  const fixture = fixtureById.get(skinId);
  const request = planById.get(skinId);
  assert(fixture && request, `Skin ${skinId} authority/plan row missing`);
  const staticEvidence = fixture.static;
  assert(staticEvidence.resolved === true && staticEvidence.objectType === 'Sprite', `Skin ${skinId} current STATIC evidence is not resolved Sprite`);
  assert(record.sourceRef === staticEvidence.sourceRef && record.runtimePath === staticEvidence.resolvedSourcePath, `Skin ${skinId} source identity changed`);
  assert(record.actualContainerPath.toLowerCase() === staticEvidence.resolvedSourcePath.toLowerCase(), `Skin ${skinId} actual container path mismatch`);
  assert(['container_value.deref', 'direct_container_object'].includes(record.containerResolution), `Skin ${skinId} unknown container resolution`);
  assert(record.objectType === 'Sprite', `Skin ${skinId} object type changed`);
  assert(record.serializedEvidence?.sizeBytes === staticEvidence.sizeBytes, `Skin ${skinId} serialized size mismatch`);
  assert(record.serializedEvidence?.sha256 === staticEvidence.sha256, `Skin ${skinId} serialized hash mismatch`);
  assert(request.expectedSerializedSizeBytes === staticEvidence.sizeBytes && request.expectedSerializedSha256 === staticEvidence.sha256, `Skin ${skinId} plan serialized evidence mismatch`);

  const repoPath = `public/images/skins/${skinId}.png`;
  const publicPath = `images/skins/${skinId}.png`;
  assert(record.repoPath === repoPath && record.publicPath === publicPath, `Skin ${skinId} output path changed`);
  assert(fs.existsSync(repoPath) && fs.statSync(repoPath).isFile(), `Skin ${skinId} PNG missing`);
  const bytes = fs.readFileSync(repoPath);
  const dims = pngDimensions(bytes);
  assert(bytes.length === record.png?.sizeBytes && sha(bytes) === record.png?.sha256, `Skin ${skinId} PNG hash/size mismatch`);
  assert(dims.width === record.png?.width && dims.height === record.png?.height, `Skin ${skinId} PNG dimensions mismatch`);
  assert(dims.width > 0 && dims.height > 0, `Skin ${skinId} PNG dimensions invalid`);
  validated.push({ skinId, repoPath, publicPath, sha256: sha(bytes), sizeBytes: bytes.length, width: dims.width, height: dims.height });
}
assert(same([...seen], expectedIds), `Batch 0 validated ID order changed: ${JSON.stringify([...seen])}`);

const validation = {
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-3-batch',
  batchId: 'batch-000',
  evidenceClass: 'BOUNDED_STATIC_EXTRACTION_VALIDATION',
  status: 'PASS_SKIN_STAGE3_3_BATCH0_STATIC_PROOF',
  finalReady: true,
  counts: { expectedSkinCount: 3, acceptedSkinCount: 3, failedSkinCount: 0, packageCount: 2 },
  records: validated,
  boundaries: {
    currentStage32AuthorityRequired: true,
    full540GateUsed: false,
    historicalCompletionPromoted: false,
    heroSkinSemanticRecomputed: false,
    sourceOrderRecomputed: false,
    exactRuntimePathOnly: true,
    pngBytesRevalidatedIndependently: true,
  },
  nextStart: 'Generate the first deterministic 30-Skin production batch from the current frozen Skin population and resolve only that batch. Do not reopen Batch 0 or validate all 540 at once.',
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(validation, null, 2) + '\n');
console.log('PASS_SKIN_STAGE3_3_BATCH0_STATIC_PROOF');
console.log(JSON.stringify(validation, null, 2));
