import fs from 'node:fs';
import path from 'node:path';
import {
  adaptSoldierTrainingMaterialContractDocument,
  stableSoldierTrainingMaterialAdapterJson,
} from '../tools/asset-intake/adapters/soldier-training-material-v1.mjs';
import { collectContractErrors } from '../tools/asset-intake/core/contract-v1.mjs';

const CONTRACT_PATH = 'data/contracts/soldier-training-material-asset-intake.v1.json';
const A2_PATH = 'data/generated/soldier-training-material-assets-a2-source-census.v1.json';
const A2_BLOB = '415e6b7a5d8febbbb7f285577de149bd54bb09df';
const DRIVE_FOLDER_ID = '1fVm9JVJlOiswiTezoRWFJQmUZWof8db8';

const observed = [
  {
    family: 'TROOP_TIER03',
    itemId: 6003,
    filename: 'Training_Sword03.png',
    driveFileId: '1qyNIfv3CuNEmUwDPJS_Lz95hKJ6GOmSB',
    driveCreatedTime: '2021-02-16T23:57:10.330Z',
    driveModifiedTime: '2020-09-09T09:14:33.000Z',
    driveMetadataByteSize: 30962,
    byteSize: 30962,
    signature: 'PNG',
    pngSignatureHex: '89504e470d0a1a0a',
    width: 172,
    height: 172,
    bitDepth: 8,
    colorType: 6,
    sha256: 'bf7a3aa5378cf0bab8ce659c6119ea129b1e4dce02eace3f54ddcfae658488f9',
  },
  {
    family: 'TROOP_TIER04',
    itemId: 6045,
    filename: 'Training_Ride04.png',
    driveFileId: '1DAdSxrWLH86SuzBeQ4x3ViwFXJVCOBRj',
    driveCreatedTime: '2021-02-16T23:57:06.946Z',
    driveModifiedTime: '2020-09-09T09:14:37.000Z',
    driveMetadataByteSize: 31854,
    byteSize: 31854,
    signature: 'PNG',
    pngSignatureHex: '89504e470d0a1a0a',
    width: 172,
    height: 172,
    bitDepth: 8,
    colorType: 6,
    sha256: '1c07dd3bea24d4c737b9f91dea2f57a94c5435b36e71c0ae7f9073a092ffb200',
  },
  {
    family: 'FACILITY',
    itemId: 6031,
    filename: 'Training_Facility04.png',
    driveFileId: '1RUAN3T11UE7W7H9NCpb-RYJ-MXIpYTql',
    driveCreatedTime: '2021-02-16T23:57:02.470Z',
    driveModifiedTime: '2020-09-09T09:14:35.000Z',
    driveMetadataByteSize: 25172,
    byteSize: 25172,
    signature: 'PNG',
    pngSignatureHex: '89504e470d0a1a0a',
    width: 172,
    height: 172,
    bitDepth: 8,
    colorType: 6,
    sha256: 'c6767023d171d009f593c27116d9983d5532134068c6ab482c682c0c04b96f6f',
  },
  {
    family: 'ANIKI',
    itemId: 6039,
    filename: 'Training_Aniki03.png',
    driveFileId: '1w9IR8iyZopMMQZntfyNj8w-z9Uy5vkmv',
    driveCreatedTime: '2021-02-16T23:56:54.413Z',
    driveModifiedTime: '2020-09-09T09:14:36.000Z',
    driveMetadataByteSize: 36024,
    byteSize: 36024,
    signature: 'PNG',
    pngSignatureHex: '89504e470d0a1a0a',
    width: 172,
    height: 172,
    bitDepth: 8,
    colorType: 6,
    sha256: '6b1ba5d200ed56369e116d44d49a5a9bb6543f3b2c5afe63ff921111dbed3696',
  },
];

const input = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const a2 = JSON.parse(fs.readFileSync(A2_PATH, 'utf8'));
const a2ByItem = new Map(a2.records.map((record) => [record.itemId, record]));
const errors = [];
const fail = (ok, message) => { if (!ok) errors.push(message); };

fail(input.contractVersion === 'asset-intake/v1', `contractVersion=${input.contractVersion}`);
fail(input.domain === 'soldier-training-material', `domain=${input.domain}`);
fail(input.records.length === 24, `contractRecords=${input.records.length}`);
fail(a2.status === 'PASS' && a2.completion === 'COMPLETE', `A2 status=${a2.status}/${a2.completion}`);
fail(a2.records.length === 24, `A2 records=${a2.records.length}`);
fail(observed.length === 4, `representativeCount=${observed.length}`);

const expectedFamilies = new Set(['TROOP_TIER03', 'TROOP_TIER04', 'FACILITY', 'ANIKI']);
const actualFamilies = new Set(observed.map((record) => record.family));
fail(actualFamilies.size === expectedFamilies.size && [...expectedFamilies].every((family) => actualFamilies.has(family)), 'representative family coverage mismatch');

const seenItems = new Set();
const seenDriveFiles = new Set();
const seenHashes = new Set();
const inventory = [];
for (const proof of observed) {
  const candidate = a2ByItem.get(proof.itemId);
  fail(Boolean(candidate), `A2 candidate missing for item ${proof.itemId}`);
  fail(!seenItems.has(proof.itemId), `duplicate representative item ${proof.itemId}`);
  fail(!seenDriveFiles.has(proof.driveFileId), `duplicate representative Drive file ${proof.driveFileId}`);
  fail(!seenHashes.has(proof.sha256), `duplicate representative sha256 ${proof.sha256}`);
  seenItems.add(proof.itemId);
  seenDriveFiles.add(proof.driveFileId);
  seenHashes.add(proof.sha256);

  if (!candidate) continue;
  fail(candidate.exactFilename === proof.filename, `filename mismatch for item ${proof.itemId}`);
  fail(candidate.driveFileId === proof.driveFileId, `Drive file mismatch for item ${proof.itemId}`);
  fail(candidate.driveFolderId === DRIVE_FOLDER_ID, `Drive folder mismatch for item ${proof.itemId}`);
  fail(candidate.source === 'KOREAN_LEGACY_ASSET_DRIVE', `source mismatch for item ${proof.itemId}`);
  fail(candidate.mimeType === 'image/png', `A2 mime mismatch for item ${proof.itemId}`);
  fail(path.posix.basename(candidate.fullPath) === proof.filename, `FULL_PATH basename mismatch for item ${proof.itemId}`);
  fail(proof.driveMetadataByteSize === proof.byteSize && proof.byteSize > 0, `byte size mismatch for item ${proof.itemId}`);
  fail(proof.signature === 'PNG' && proof.pngSignatureHex === '89504e470d0a1a0a', `PNG signature mismatch for item ${proof.itemId}`);
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

let adapted = null;
try {
  adapted = adaptSoldierTrainingMaterialContractDocument(input, inventory, {
    sourceContext: {
      path: A2_PATH,
      schemaId: a2.schemaId,
      status: a2.status,
      gitBlobSha: A2_BLOB,
      checkpoint: 'A3_REPRESENTATIVE_BYTE_PROOF',
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
  fail(resolved === 4, `resolved=${resolved}`);
  fail(pending === 20, `pending=${pending}`);
  fail(ambiguous === 0, `ambiguous=${ambiguous}`);
  fail(evidenceCount === 4, `evidenceCount=${evidenceCount}`);

  for (const proof of observed) {
    const record = adapted.document.records.find((entry) => entry.canonicalKey.value === proof.itemId);
    fail(Boolean(record), `adapted record missing for item ${proof.itemId}`);
    if (!record) continue;
    fail(record.normalizedResolutionClass === 'RESOLVED', `representative not RESOLVED for item ${proof.itemId}`);
    fail(record.evidence.length === 1, `representative evidence count for item ${proof.itemId}`);
    const evidence = record.evidence[0];
    if (!evidence) continue;
    fail(evidence.expectedLocatorIndex === 0, `locator index mismatch for item ${proof.itemId}`);
    fail(evidence.sourcePath === `google-drive://${proof.driveFileId}/${proof.filename}`, `sourcePath mismatch for item ${proof.itemId}`);
    fail(evidence.relativePath === a2ByItem.get(proof.itemId)?.fullPath, `relativePath mismatch for item ${proof.itemId}`);
    fail(evidence.basename === proof.filename, `basename mismatch for item ${proof.itemId}`);
    fail(evidence.byteSize === proof.byteSize, `evidence byteSize mismatch for item ${proof.itemId}`);
    fail(evidence.signature === 'PNG', `evidence signature mismatch for item ${proof.itemId}`);
    fail(evidence.sha256 === proof.sha256, `evidence sha256 mismatch for item ${proof.itemId}`);
    fail(evidence.width === 172 && evidence.height === 172, `evidence dimensions mismatch for item ${proof.itemId}`);
  }
}

const status = errors.length === 0 ? 'PASS' : 'FAIL';
const completion = errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE';

const proofDocument = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a3-representative-byte-proof/v1',
  stage: 'A3 - Representative Byte/Provenance Proof',
  status,
  completion,
  predecessor: {
    a2Path: A2_PATH,
    a2BlobSha: A2_BLOB,
    a2Status: a2.status,
    a1ContractPath: CONTRACT_PATH,
  },
  acquisition: {
    source: 'KOREAN_LEGACY_ASSET_DRIVE',
    driveFolderId: DRIVE_FOLDER_ID,
    retrievalDate: '2026-08-30',
    method: 'Exact A2 Drive file ID -> raw file download; mounted bytes independently checked for PNG signature, IHDR, byte length and SHA-256.',
    repositoryBytesAdded: false,
  },
  coverage: {
    representativeCount: observed.length,
    families: [...actualFamilies].sort(),
    rationale: 'Covers troop tier-03, troop tier-04, Facility, and Aniki filename families before bulk acquisition.',
  },
  records: observed.map((proof) => ({
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
    representativeBytesDownloaded: true,
    repositoryAssetBytesChanged: false,
    bulk24AcquisitionPerformed: false,
    webpGenerated: false,
    frontendChanged: false,
  },
};

const validation = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a3-validation/v1',
  stage: 'A3 - Representative Byte/Provenance Proof',
  status,
  completion,
  counts: {
    a2Candidates: a2.records.length,
    representatives: observed.length,
    verifiedPng: observed.filter((record) => record.signature === 'PNG' && record.pngSignatureHex === '89504e470d0a1a0a').length,
    nonZeroBytes: observed.filter((record) => record.byteSize > 0).length,
    metadataByteSizeMatches: observed.filter((record) => record.driveMetadataByteSize === record.byteSize).length,
    sha256Calculated: observed.filter((record) => /^[0-9a-f]{64}$/.test(record.sha256)).length,
    dimensions172x172: observed.filter((record) => record.width === 172 && record.height === 172).length,
    assetIntakeResolved: resolved,
    assetIntakePending: pending,
    assetIntakeAmbiguous: ambiguous,
    assetIntakeEvidence: evidenceCount,
    errors: errors.length,
  },
  admissionStatus: errors.length === 0 ? 'READY_FOR_A4_BULK_ACQUISITION' : 'BLOCKED_A3_VALIDATION',
  hardErrors: errors,
};

const checkpoint = `# Soldier Training Material Assets A3 — Representative Byte/Provenance Proof

상태: \`${status} / ${completion} / ${validation.admissionStatus}\`

## 목적

A2에서 24/24로 고정한 Drive exact candidate 전체를 바로 ingest하지 않고, filename family를 대표하는 소수 후보만 실제 bytes로 검증해 acquisition 규칙과 Asset Intake evidence shape를 먼저 확정한다.

## authoritative predecessor

- \`${A2_PATH}\`
- A2 blob: \`${A2_BLOB}\`
- \`${CONTRACT_PATH}\`
- \`tools/asset-intake/adapters/soldier-training-material-v1.mjs\`
- \`tools/asset-intake/core/engine-v1.mjs\`

## 대표 샘플

| Family | Item ID | File | Drive file ID | Bytes | SHA-256 |
|---|---:|---|---|---:|---|
${observed.map((proof) => `| ${proof.family} | ${proof.itemId} | \`${proof.filename}\` | \`${proof.driveFileId}\` | ${proof.byteSize} | \`${proof.sha256}\` |`).join('\n')}

대표 4개 모두 actual byte length가 Drive metadata와 일치하고, PNG signature \`89504e470d0a1a0a\`, IHDR \`172x172 / bitDepth=8 / colorType=6(RGBA)\`, SHA-256을 확인했다.

## Asset Intake 재투입

A1 frozen contract에 대표 4개만 inventory evidence로 재투입했다.

\`RESOLVED=${resolved} / PENDING=${pending} / AMBIGUOUS=${ambiguous} / evidence=${evidenceCount}\`

대표 4개만 \`RESOLVED\`이며 나머지 20개는 계속 \`PENDING\`이다. A3 proof만으로 24개 전체를 해결한 것으로 확대하지 않는다.

## artifacts

- \`data/evidence/soldier-training-material-assets-a3-representatives.v1.json\`
- \`data/contracts/soldier-training-material-asset-intake-a3.v1.json\`
- \`data/validation/soldier-training-material-assets-a3.v1.json\`
- \`scripts/freeze-soldier-training-material-assets-a3.mjs\`
- \`.github/workflows/soldier-training-material-assets-a3.yml\`
- \`docs/checkpoints/soldier-training-material-assets-a3.md\`

## 완료 범위

- Drive exact file ID provenance representative 4/4 확인
- raw PNG bytes representative 4/4 확인
- non-zero / metadata byte size parity 4/4
- PNG signature / IHDR 4/4
- SHA-256 4/4
- Asset Intake evidence shape 및 representative RESOLVED 4/4

## 하지 않은 것

- A1/A2 semantic 또는 candidate relation 재계산
- 나머지 20개 byte download
- source PNG repository admission
- WebP 생성/public 배포
- resolver/frontend 변경

## 다음 시작점

A4에서 A2 frozen 24개 Drive file ID를 같은 exact-file-ID raw-download 규칙으로 전수 acquisition한다. 각 파일마다 byte size, PNG signature, dimensions, SHA-256을 생성하고 24/24를 Asset Intake에 재투입해 \`RESOLVED=24 / PENDING=0 / AMBIGUOUS=0\`을 완료 조건으로 둔다.

## 다시 열리는 조건

- A2 candidate file ID/FULL_PATH가 대표 proof와 불일치
- raw bytes 재다운로드 시 SHA-256 또는 PNG metadata 불일치
- Asset Intake evidence contract 변경
- representative family coverage 규칙 변경
`;

const outputs = [
  ['data/evidence/soldier-training-material-assets-a3-representatives.v1.json', `${JSON.stringify(proofDocument, null, 2)}\n`],
  ['data/contracts/soldier-training-material-asset-intake-a3.v1.json', adapted ? stableSoldierTrainingMaterialAdapterJson(adapted.document) : `${JSON.stringify({ status: 'INVALID', errors }, null, 2)}\n`],
  ['data/validation/soldier-training-material-assets-a3.v1.json', `${JSON.stringify(validation, null, 2)}\n`],
  ['docs/checkpoints/soldier-training-material-assets-a3.md', checkpoint],
];
for (const [file, content] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 1;
