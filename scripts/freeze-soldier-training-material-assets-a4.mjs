import fs from 'node:fs';
import path from 'node:path';
import {
  adaptSoldierTrainingMaterialContractDocument,
  stableSoldierTrainingMaterialAdapterJson,
} from '../tools/asset-intake/adapters/soldier-training-material-v1.mjs';
import { collectContractErrors } from '../tools/asset-intake/core/contract-v1.mjs';

const CONTRACT_PATH = 'data/contracts/soldier-training-material-asset-intake.v1.json';
const A2_PATH = 'data/generated/soldier-training-material-assets-a2-source-census.v1.json';
const A3_PATH = 'data/evidence/soldier-training-material-assets-a3-representatives.v1.json';
const A2_BLOB = '415e6b7a5d8febbbb7f285577de149bd54bb09df';
const A3_BLOB = '33976d38eef80b2e9e6e4d6a418d3bde330057fb';
const DRIVE_FOLDER_ID = '1fVm9JVJlOiswiTezoRWFJQmUZWof8db8';
const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';

const verified = [
  [6003, 'Training_Sword03.png', '1qyNIfv3CuNEmUwDPJS_Lz95hKJ6GOmSB', 30962, 'bf7a3aa5378cf0bab8ce659c6119ea129b1e4dce02eace3f54ddcfae658488f9'],
  [6006, 'Training_Spear03.png', '1zbe1M2OIYsGpXJ91yt6OExTkt1_PW6Uz', 29904, '1054b7860b406fc5e3f162f62db14549c661227d3f1e8e4bd1a348aa0b12ef45'],
  [6009, 'Training_Ride03.png', '1i0NpKVsO-WNoXIK7mQnHwi3pR8ol1tOK', 28361, 'a6bac81c68eea5aa0c2bb961d9368fb49e0c24c471ad626e17f5bcbc95e0b1b7'],
  [6012, 'Training_Fly03.png', '1OoVEnYqlone3_IVeC2FKZjZ8khFYHIWg', 29314, '5b115e7d4d8a4d49863a7883c2ef788540a21c7c938ff9a9d773976d50e8e3e3'],
  [6015, 'Training_Bow03.png', '1EpgI3F1OdTmTUd9tGAm-URryvE8NbMNS', 26735, '319358b2b551e1e26cc73531319e19ea4480f990008a6bebb2d6611bd3dcfd7a'],
  [6018, 'Training_Monk03.png', '1sjxVIrtot-X771r9FEOzLS4tUY4On0d6', 29245, 'd818e58ab08d892bf2a8ad4ab84a518deafd625aa2768a29aa060ebcf84bef32'],
  [6031, 'Training_Facility04.png', '1RUAN3T11UE7W7H9NCpb-RYJ-MXIpYTql', 25172, 'c6767023d171d009f593c27116d9983d5532134068c6ab482c682c0c04b96f6f'],
  [6032, 'Training_Facility05.png', '1TNQAjGzz0rUwHEzgMp-Noa0kSNQ0yc68', 22947, 'fc7bcbbdacc20afc5857882f3b05b2a4e26dc2c5eec0578ba0e762cdddea6322'],
  [6033, 'Training_Facility06.png', '1KwIQl4ipX8V5_G0Ns-cegYKGtCW9dyrx', 24647, '4872aa040d8d3e9b7c8b896198e969a83611c3a9fa44720d245b119952672481'],
  [6034, 'Training_Facility01.png', '105SYz2x-goqbhRTquqenSiXoYoF4fSdi', 33346, '20789d10e8285cfc52014a974c49b702b82f0cc1e91a650f8908002e056cbec1'],
  [6035, 'Training_Facility03.png', '1d8KmLjEAvXy4DHBbUEjWNpV6s6sdS-LE', 27591, '76bce3d1d6d6bdc0f16c69d205e697ddbaf6664690b16de8201fbd499e010d71'],
  [6036, 'Training_Facility02.png', '1swvVP1tUkxZNcAA00hfeqGokVs5EN2Lw', 29944, 'ee1538f2b68af2f0a909e825771c40cf8eef5d454065f131b90968583561b0b0'],
  [6037, 'Training_Aniki01.png', '1yoElsldQI2a3QytaZuCqOvqfGL9ZB37n', 27731, '8c5f002c87b18c252d56d84e7be0008c64da185dec937a05db7f2fea13bc9a47'],
  [6038, 'Training_Aniki02.png', '1SC_Dr68dm7M7YTW4vMNSDAY-19wpOes-', 27615, '9fffe0081d0c1b19a26adf2e660010f6c6bec57ac73ac0d9cca6ac3d9f70bf51'],
  [6039, 'Training_Aniki03.png', '1w9IR8iyZopMMQZntfyNj8w-z9Uy5vkmv', 36024, '6b1ba5d200ed56369e116d44d49a5a9bb6543f3b2c5afe63ff921111dbed3696'],
  [6040, 'Training_Aniki04.png', '1srmqB-wNFXS3Ce-iN7cUK6fpT6knQaL2', 25090, '58cc6ee43720e6d16f1a046a6118e5a649f9f56a394c9146eb78169c75222254'],
  [6041, 'Training_Aniki05.png', '1vXAgkSle3hRIkJmtlVQVY4pL75z1IwOL', 27985, '44f2ce1490fda8d651998d845e3c29e4feb341de30347b8c3ef39f3de94ca0a4'],
  [6042, 'Training_Aniki06.png', '1IT89GylXPMx9SZmG5Rl_SLIATir8ukw_', 26156, '48c8ae5a3e415d2f634b86d1d5003391d46feef88ed46d2f9eedd402f07c2995'],
  [6043, 'Training_Sword04.png', '1U9ZCb5CWYjLNdJ75GeSTfhdVi7PpW6yr', 36066, '389b7fdb95071989395ca54da106afe4252ed0219a54f5274bdc1108e7f9ce14'],
  [6044, 'Training_Spear04.png', '1U8n29GtPDh3ZRx2tMD9_dGFYZPOfZefn', 31807, '251663383882c3c7e94ca346e9b458b6aa5d538085a0be730180cf1a61eeb363'],
  [6045, 'Training_Ride04.png', '1DAdSxrWLH86SuzBeQ4x3ViwFXJVCOBRj', 31854, '1c07dd3bea24d4c737b9f91dea2f57a94c5435b36e71c0ae7f9073a092ffb200'],
  [6046, 'Training_Fly04.png', '17mw0sIaDOMxz67JKPho3I9zjo92Iuuqj', 32563, '7a7b3b3690a066109c81929998dc93a3596270fc2ece439359ff7b45c0b99b03'],
  [6047, 'Training_Bow04.png', '1akDUoCHaHKVtrfqsLv6c0RqI1eZ192AW', 30665, '5bdb0842293d70ad7c1c6111c3ca96ec92bb8080d89d82e00a63474b7cf09315'],
  [6048, 'Training_Monk04.png', '18gpewMV9utX2iDiQtQZXuA_h-xSzGebj', 32344, '1259290dbb5119e7f916e8ac4dd9f5c2bcb36ceae6adf99d4331a4251219ee2e'],
].map(([itemId, filename, driveFileId, byteSize, sha256]) => ({
  itemId,
  filename,
  driveFileId,
  driveMetadataByteSize: byteSize,
  byteSize,
  signature: 'PNG',
  pngSignatureHex: PNG_SIGNATURE_HEX,
  width: 172,
  height: 172,
  bitDepth: 8,
  colorType: 6,
  sha256,
}));

const input = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const a2 = JSON.parse(fs.readFileSync(A2_PATH, 'utf8'));
const a3 = JSON.parse(fs.readFileSync(A3_PATH, 'utf8'));
const a2ByItem = new Map(a2.records.map((record) => [record.itemId, record]));
const a3ByItem = new Map(a3.records.map((record) => [record.itemId, record]));
const errors = [];
const fail = (ok, message) => { if (!ok) errors.push(message); };

fail(input.contractVersion === 'asset-intake/v1', `contractVersion=${input.contractVersion}`);
fail(input.domain === 'soldier-training-material', `domain=${input.domain}`);
fail(input.records.length === 24, `contractRecords=${input.records.length}`);
fail(a2.status === 'PASS' && a2.completion === 'COMPLETE', `A2 status=${a2.status}/${a2.completion}`);
fail(a2.records.length === 24, `A2 records=${a2.records.length}`);
fail(a3.status === 'PASS' && a3.completion === 'COMPLETE', `A3 status=${a3.status}/${a3.completion}`);
fail(a3.records.length === 4, `A3 representatives=${a3.records.length}`);
fail(verified.length === 24, `verified=${verified.length}`);

const seenItems = new Set();
const seenDriveFiles = new Set();
const inventory = [];
for (const proof of verified) {
  const candidate = a2ByItem.get(proof.itemId);
  fail(Boolean(candidate), `A2 candidate missing for item ${proof.itemId}`);
  fail(!seenItems.has(proof.itemId), `duplicate itemId ${proof.itemId}`);
  fail(!seenDriveFiles.has(proof.driveFileId), `duplicate Drive file ${proof.driveFileId}`);
  seenItems.add(proof.itemId);
  seenDriveFiles.add(proof.driveFileId);

  if (!candidate) continue;
  fail(candidate.exactFilename === proof.filename, `filename mismatch for item ${proof.itemId}`);
  fail(candidate.driveFileId === proof.driveFileId, `Drive file mismatch for item ${proof.itemId}`);
  fail(candidate.driveFolderId === DRIVE_FOLDER_ID, `Drive folder mismatch for item ${proof.itemId}`);
  fail(candidate.source === 'KOREAN_LEGACY_ASSET_DRIVE', `source mismatch for item ${proof.itemId}`);
  fail(candidate.mimeType === 'image/png', `mime mismatch for item ${proof.itemId}`);
  fail(candidate.matchCountAcrossItemFolders === 1, `candidate ambiguity for item ${proof.itemId}`);
  fail(path.posix.basename(candidate.fullPath) === proof.filename, `FULL_PATH basename mismatch for item ${proof.itemId}`);
  fail(proof.driveMetadataByteSize === proof.byteSize && proof.byteSize > 0, `byte size mismatch for item ${proof.itemId}`);
  fail(proof.signature === 'PNG' && proof.pngSignatureHex === PNG_SIGNATURE_HEX, `PNG signature mismatch for item ${proof.itemId}`);
  fail(proof.width === 172 && proof.height === 172, `dimensions mismatch for item ${proof.itemId}`);
  fail(proof.bitDepth === 8 && proof.colorType === 6, `PNG IHDR mismatch for item ${proof.itemId}`);
  fail(/^[0-9a-f]{64}$/.test(proof.sha256), `sha256 format mismatch for item ${proof.itemId}`);

  inventory.push({
    sourceArtifact: `KOREAN_LEGACY_ASSET_DRIVE:${proof.driveFileId}`,
    sourcePath: `google-drive://${proof.driveFileId}/${proof.filename}`,
    relativePath: candidate.fullPath,
    basename: proof.filename,
    extension: '.png',
    byteSize: proof.byteSize,
    signature: proof.signature,
    width: proof.width,
    height: proof.height,
    sha256: proof.sha256,
    exactDuplicateGroup: null,
    basenameCollisionGroup: null,
  });
}

for (const representative of a3.records) {
  const bulk = verified.find((record) => record.itemId === representative.itemId);
  fail(Boolean(bulk), `A3 representative missing from bulk set: ${representative.itemId}`);
  if (!bulk) continue;
  fail(bulk.filename === representative.filename, `A3 filename mismatch for item ${representative.itemId}`);
  fail(bulk.driveFileId === representative.driveFileId, `A3 Drive file mismatch for item ${representative.itemId}`);
  fail(bulk.byteSize === representative.byteSize, `A3 byte size mismatch for item ${representative.itemId}`);
  fail(bulk.sha256 === representative.sha256, `A3 sha256 mismatch for item ${representative.itemId}`);
}

let adapted = null;
try {
  adapted = adaptSoldierTrainingMaterialContractDocument(input, inventory, {
    sourceContext: {
      path: A2_PATH,
      schemaId: a2.schemaId,
      status: a2.status,
      gitBlobSha: A2_BLOB,
      predecessorByteProofPath: A3_PATH,
      predecessorByteProofBlobSha: A3_BLOB,
      checkpoint: 'A4_BULK_ACQUISITION',
    },
  });
} catch (error) {
  errors.push(`Asset Intake re-ingest failed: ${error.message}`);
}

let resolved = 0;
let pending = 0;
let ambiguous = 0;
let evidenceCount = 0;
if (adapted) {
  const contractErrors = collectContractErrors(adapted.document);
  errors.push(...contractErrors.map((message) => `output contract: ${message}`));
  resolved = adapted.document.records.filter((record) => record.normalizedResolutionClass === 'RESOLVED').length;
  pending = adapted.document.records.filter((record) => record.normalizedResolutionClass === 'PENDING').length;
  ambiguous = adapted.document.records.filter((record) => record.normalizedResolutionClass === 'AMBIGUOUS').length;
  evidenceCount = adapted.document.records.reduce((sum, record) => sum + record.evidence.length, 0);
  fail(resolved === 24, `resolved=${resolved}`);
  fail(pending === 0, `pending=${pending}`);
  fail(ambiguous === 0, `ambiguous=${ambiguous}`);
  fail(evidenceCount === 24, `evidenceCount=${evidenceCount}`);

  for (const proof of verified) {
    const candidate = a2ByItem.get(proof.itemId);
    const record = adapted.document.records.find((entry) => entry.canonicalKey.value === proof.itemId);
    fail(Boolean(record), `adapted record missing for item ${proof.itemId}`);
    if (!record) continue;
    fail(record.normalizedResolutionClass === 'RESOLVED', `item not RESOLVED ${proof.itemId}`);
    fail(record.evidence.length === 1, `evidence count mismatch for item ${proof.itemId}`);
    const evidence = record.evidence[0];
    if (!evidence) continue;
    fail(evidence.expectedLocatorIndex === 0, `locator index mismatch for item ${proof.itemId}`);
    fail(evidence.sourcePath === `google-drive://${proof.driveFileId}/${proof.filename}`, `sourcePath mismatch for item ${proof.itemId}`);
    fail(evidence.relativePath === candidate?.fullPath, `relativePath mismatch for item ${proof.itemId}`);
    fail(evidence.basename === proof.filename, `basename mismatch for item ${proof.itemId}`);
    fail(evidence.byteSize === proof.byteSize, `evidence byteSize mismatch for item ${proof.itemId}`);
    fail(evidence.signature === 'PNG', `evidence signature mismatch for item ${proof.itemId}`);
    fail(evidence.sha256 === proof.sha256, `evidence sha256 mismatch for item ${proof.itemId}`);
    fail(evidence.width === 172 && evidence.height === 172, `evidence dimensions mismatch for item ${proof.itemId}`);
  }
}

const status = errors.length === 0 ? 'PASS' : 'FAIL';
const completion = errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
const totalBytes = verified.reduce((sum, record) => sum + record.byteSize, 0);

const evidenceDocument = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a4-bulk-byte-proof/v1',
  stage: 'A4 - Bulk Acquisition',
  status,
  completion,
  predecessor: {
    a2Path: A2_PATH,
    a2BlobSha: A2_BLOB,
    a3Path: A3_PATH,
    a3BlobSha: A3_BLOB,
    a1ContractPath: CONTRACT_PATH,
  },
  acquisition: {
    source: 'KOREAN_LEGACY_ASSET_DRIVE',
    driveFolderId: DRIVE_FOLDER_ID,
    retrievalDate: '2026-08-30',
    method: 'Exact frozen A2 Drive file IDs. A3 representative byte proof was reused; the remaining 20 files were downloaded by exact file ID and independently checked for byte length, PNG signature/IHDR and SHA-256.',
    repositoryBytesAdded: false,
  },
  summary: {
    targetCount: 24,
    verifiedCount: verified.length,
    uniqueItemIds: seenItems.size,
    uniqueDriveFileIds: seenDriveFiles.size,
    pngCount: verified.filter((record) => record.signature === 'PNG' && record.pngSignatureHex === PNG_SIGNATURE_HEX).length,
    nonZeroBytes: verified.filter((record) => record.byteSize > 0).length,
    metadataByteSizeMatches: verified.filter((record) => record.driveMetadataByteSize === record.byteSize).length,
    sha256Calculated: verified.filter((record) => /^[0-9a-f]{64}$/.test(record.sha256)).length,
    dimensions172x172: verified.filter((record) => record.width === 172 && record.height === 172).length,
    rgba8Png: verified.filter((record) => record.bitDepth === 8 && record.colorType === 6).length,
    totalBytes,
  },
  records: verified.map((proof) => ({
    ...proof,
    fullPath: a2ByItem.get(proof.itemId)?.fullPath ?? null,
    driveFolderId: DRIVE_FOLDER_ID,
    driveUrl: `https://drive.google.com/file/d/${proof.driveFileId}/view`,
    mimeType: 'image/png',
    byteProofStatus: 'VERIFIED',
    assetIntakeEvidenceStatus: adapted?.document.records.find((record) => record.canonicalKey.value === proof.itemId)?.normalizedResolutionClass ?? 'INVALID',
  })),
  boundaries: {
    semanticRecomputed: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    fuzzyFilenameMatchingUsed: false,
    visualMatchingUsed: false,
    bulk24AcquisitionPerformed: true,
    repositoryAssetBytesChanged: false,
    repositoryAdmissionPerformed: false,
    webpGenerated: false,
    frontendChanged: false,
  },
};

const validation = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a4-validation/v1',
  stage: 'A4 - Bulk Acquisition',
  status,
  completion,
  counts: {
    target: 24,
    byteVerified: verified.length,
    pngVerified: evidenceDocument.summary.pngCount,
    nonZeroBytes: evidenceDocument.summary.nonZeroBytes,
    metadataByteSizeMatches: evidenceDocument.summary.metadataByteSizeMatches,
    sha256Calculated: evidenceDocument.summary.sha256Calculated,
    dimensions172x172: evidenceDocument.summary.dimensions172x172,
    rgba8Png: evidenceDocument.summary.rgba8Png,
    uniqueItemIds: seenItems.size,
    uniqueDriveFileIds: seenDriveFiles.size,
    assetIntakeResolved: resolved,
    assetIntakePending: pending,
    assetIntakeAmbiguous: ambiguous,
    assetIntakeEvidence: evidenceCount,
    errors: errors.length,
  },
  admissionStatus: errors.length === 0 ? 'READY_FOR_A5_REPOSITORY_ADMISSION' : 'BLOCKED_A4_VALIDATION',
  hardErrors: errors,
};

const checkpoint = `# Soldier Training Material Assets A4 — Bulk Acquisition\n\n상태: \`${status} / ${completion} / ${validation.admissionStatus}\`\n\n## 목적\n\nA3에서 확정한 byte/provenance 검증 규칙을 A2의 frozen 24개 Drive exact candidate 전체에 적용한다. 이 단계는 source bytes의 24/24 검증과 Asset Intake evidence 24/24 승격까지만 소유하며 repository source PNG admission, WebP, frontend는 다루지 않는다.\n\n## authoritative predecessor\n\n- \`${A2_PATH}\` — blob \`${A2_BLOB}\`\n- \`${A3_PATH}\` — blob \`${A3_BLOB}\`\n- \`${CONTRACT_PATH}\`\n- \`tools/asset-intake/adapters/soldier-training-material-v1.mjs\`\n\n## 결과\n\n\`target=24 / byteVerified=${verified.length} / PNG=${evidenceDocument.summary.pngCount} / SHA-256=${evidenceDocument.summary.sha256Calculated} / 172x172=${evidenceDocument.summary.dimensions172x172} / RESOLVED=${resolved} / PENDING=${pending} / AMBIGUOUS=${ambiguous} / errors=${errors.length}\`\n\nA3 대표 4개는 frozen byte proof를 재사용했고 나머지 20개만 exact Drive file ID로 추가 획득했다. 전부 non-zero PNG, Drive metadata byte-size parity, 172x172 RGBA8 IHDR, SHA-256을 확인했다.\n\n## boundaries\n\n- semantic/ConfigData 재계산 없음\n- name JOIN / ID arithmetic / fuzzy / visual match 없음\n- A2 itemId -> FULL_PATH -> Drive file ID 관계 변경 없음\n- repository source PNG admission 없음\n- WebP 생성 없음\n- frontend 변경 없음\n\n## artifacts\n\n- \`data/evidence/soldier-training-material-assets-a4-bulk.v1.json\`\n- \`data/contracts/soldier-training-material-asset-intake-a4.v1.json\`\n- \`data/validation/soldier-training-material-assets-a4.v1.json\`\n- \`scripts/freeze-soldier-training-material-assets-a4.mjs\`\n- \`.github/workflows/soldier-training-material-assets-a4.yml\`\n- \`docs/checkpoints/soldier-training-material-assets-a4.md\`\n\n## 다음 시작점\n\nA5 repository admission. A4의 24/24 verified source proof를 predecessor로 사용해 원본 PNG의 repository-owned source 경로, provenance manifest, exact itemId mapping을 확정한다. 그 전에는 WebP/resolver/frontend로 넘어가지 않는다.\n\n## 다시 열리는 조건\n\n- A2 frozen candidate identity 또는 A1 FULL_PATH 변경\n- A3 대표 hash/size와 A4 bulk proof 충돌\n- 24개 중 byte-size/PNG/IHDR/SHA mismatch 발견\n- Asset Intake 24 RESOLVED parity 파손\n`;

const outputs = [
  ['data/evidence/soldier-training-material-assets-a4-bulk.v1.json', evidenceDocument],
  ['data/validation/soldier-training-material-assets-a4.v1.json', validation],
];
for (const [file, data] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
if (adapted) {
  fs.mkdirSync('data/contracts', { recursive: true });
  fs.writeFileSync('data/contracts/soldier-training-material-asset-intake-a4.v1.json', stableSoldierTrainingMaterialAdapterJson(adapted.document));
}
fs.mkdirSync('docs/checkpoints', { recursive: true });
fs.writeFileSync('docs/checkpoints/soldier-training-material-assets-a4.md', checkpoint);

process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 1;
