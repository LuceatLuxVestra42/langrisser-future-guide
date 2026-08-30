import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/soldier-training-material-asset-intake.v1.json';
const CONTRACT_BLOB = '90ab214f1b775659cd570c1e750a50f0c8ee464f';
const DRIVE_FOLDER = '1fVm9JVJlOiswiTezoRWFJQmUZWof8db8';

const captured = [
  [6003, 'Training_Sword03.png', '1qyNIfv3CuNEmUwDPJS_Lz95hKJ6GOmSB'],
  [6006, 'Training_Spear03.png', '1zbe1M2OIYsGpXJ91yt6OExTkt1_PW6Uz'],
  [6009, 'Training_Ride03.png', '1i0NpKVsO-WNoXIK7mQnHwi3pR8ol1tOK'],
  [6012, 'Training_Fly03.png', '1OoVEnYqlone3_IVeC2FKZjZ8khFYHIWg'],
  [6015, 'Training_Bow03.png', '1EpgI3F1OdTmTUd9tGAm-URryvE8NbMNS'],
  [6018, 'Training_Monk03.png', '1sjxVIrtot-X771r9FEOzLS4tUY4On0d6'],
  [6031, 'Training_Facility04.png', '1RUAN3T11UE7W7H9NCpb-RYJ-MXIpYTql'],
  [6032, 'Training_Facility05.png', '1TNQAjGzz0rUwHEzgMp-Noa0kSNQ0yc68'],
  [6033, 'Training_Facility06.png', '1KwIQl4ipX8V5_G0Ns-cegYKGtCW9dyrx'],
  [6034, 'Training_Facility01.png', '105SYz2x-goqbhRTquqenSiXoYoF4fSdi'],
  [6035, 'Training_Facility03.png', '1d8KmLjEAvXy4DHBbUEjWNpV6s6sdS-LE'],
  [6036, 'Training_Facility02.png', '1swvVP1tUkxZNcAA00hfeqGokVs5EN2Lw'],
  [6037, 'Training_Aniki01.png', '1yoElsldQI2a3QytaZuCqOvqfGL9ZB37n'],
  [6038, 'Training_Aniki02.png', '1SC_Dr68dm7M7YTW4vMNSDAY-19wpOes-'],
  [6039, 'Training_Aniki03.png', '1w9IR8iyZopMMQZntfyNj8w-z9Uy5vkmv'],
  [6040, 'Training_Aniki04.png', '1srmqB-wNFXS3Ce-iN7cUK6fpT6knQaL2'],
  [6041, 'Training_Aniki05.png', '1vXAgkSle3hRIkJmtlVQVY4pL75z1IwOL'],
  [6042, 'Training_Aniki06.png', '1IT89GylXPMx9SZmG5Rl_SLIATir8ukw_'],
  [6043, 'Training_Sword04.png', '1U9ZCb5CWYjLNdJ75GeSTfhdVi7PpW6yr'],
  [6044, 'Training_Spear04.png', '1U8n29GtPDh3ZRx2tMD9_dGFYZPOfZefn'],
  [6045, 'Training_Ride04.png', '1DAdSxrWLH86SuzBeQ4x3ViwFXJVCOBRj'],
  [6046, 'Training_Fly04.png', '17mw0sIaDOMxz67JKPho3I9zjo92Iuuqj'],
  [6047, 'Training_Bow04.png', '1akDUoCHaHKVtrfqsLv6c0RqI1eZ192AW'],
  [6048, 'Training_Monk04.png', '18gpewMV9utX2iDiQtQZXuA_h-xSzGebj'],
];

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const contractMap = new Map(contract.records.map((record) => [
  record.canonicalKey.value,
  record.expectedLocators.find((locator) => locator.assetRole === 'trainingMaterialIcon')?.value ?? null,
]));

const errors = [];
const fail = (ok, message) => { if (!ok) errors.push(message); };
fail(contract.contractVersion === 'asset-intake/v1', 'contract version mismatch');
fail(contract.domain === 'soldier-training-material', 'contract domain mismatch');
fail(contract.records.length === 24, `contract record count ${contract.records.length}`);
fail(captured.length === 24, `captured count ${captured.length}`);

const seenItems = new Set();
const seenFiles = new Set();
for (const [itemId, filename, fileId] of captured) {
  const expected = contractMap.get(itemId);
  fail(Boolean(expected), `unexpected itemId ${itemId}`);
  fail(path.posix.basename(expected ?? '') === filename, `basename mismatch ${itemId}`);
  fail(!seenItems.has(itemId), `duplicate itemId ${itemId}`);
  fail(!seenFiles.has(fileId), `duplicate Drive file ${fileId}`);
  seenItems.add(itemId);
  seenFiles.add(fileId);
}

const census = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a2-source-census/v1',
  stage: 'A2 - Source Census',
  status: errors.length === 0 ? 'PASS' : 'FAIL',
  completion: errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  predecessor: {
    contractPath: CONTRACT_PATH,
    contractBlobSha: CONTRACT_BLOB,
    contractVersion: contract.contractVersion,
    domain: contract.domain,
    recordCount: contract.records.length,
  },
  routing: {
    policyPath: 'docs/checkpoints/asset-intake-stage5-operational-routing.md',
    approvedExternalPriority: [
      'BILIBILI_WIKI_PUBLIC_ORIGINAL',
      'KOREAN_LEGACY_ASSET_DRIVE',
      'OTHER_EXTERNAL_SOURCE',
    ],
    directProductionUseAllowed: false,
  },
  sourceAttempts: [
    {
      priority: 1,
      source: 'BILIBILI_WIKI_PUBLIC_ORIGINAL',
      baseUrl: 'https://wiki.biligame.com/langrisser/首页',
      method: 'public web search restricted to wiki.biligame.com/langrisser using exact frozen basenames',
      result: 'NOT_FOUND_IN_PUBLIC_SEARCH_INDEX',
      matchedBasenameCount: 0,
      absenceProven: false,
      note: 'Search-index miss is not proof that the wiki stores no equivalent image; no exact frozen basename candidate was surfaced.',
    },
    {
      priority: 2,
      source: 'KOREAN_LEGACY_ASSET_DRIVE',
      rootFolderId: '1nYFa63uq00adpod_M1oDPPqGV4II5n5V',
      itemRootFolderId: '1sznTo-2Ou0Kf4K6bv05cQwOrsBlpXrut',
      method: 'Google Drive v3 parent-scoped exact name filters over the four known Item folders',
      folders: [
        { title: '아이템 1', folderId: DRIVE_FOLDER, matchedTargetCount: 24 },
        { title: '아이템 2', folderId: '11fcrLT_HME3baVSgQJUSQD7TnmH11pg2', matchedTargetCount: 0 },
        { title: '아이템 3', folderId: '1aHMOcGYMwWbeBvGbKIe6di0M-79m0sfj', matchedTargetCount: 0 },
        { title: '아이템 4', folderId: '1xbQ6N_ku7sgbRbObI9hMwyovIrE8Fz1y', matchedTargetCount: 0 },
      ],
      result: 'FOUND_EXACT_CANDIDATES_24_OF_24',
      matchedTargetCount: 24,
      ambiguousTargetCount: 0,
      missingTargetCount: 0,
    },
  ],
  records: captured.map(([itemId, exactFilename, driveFileId]) => ({
    itemId,
    fullPath: contractMap.get(itemId),
    exactFilename,
    candidateStatus: 'FOUND_EXACT_NAME_CANDIDATE',
    sourcePriority: 2,
    source: 'KOREAN_LEGACY_ASSET_DRIVE',
    driveFolderId: DRIVE_FOLDER,
    driveFileId,
    driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
    matchCountAcrossItemFolders: 1,
    mimeType: 'image/png',
    byteProofStatus: 'DEFERRED_TO_A3',
    sha256: null,
  })),
  summary: {
    targetCount: 24,
    bilibiliExactIndexedCandidates: 0,
    driveExactCandidates: 24,
    driveUniqueFileIds: seenFiles.size,
    found: 24,
    notFound: 0,
    ambiguous: 0,
    byteVerified: 0,
  },
  boundaries: {
    semanticRecomputed: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    fuzzyFilenameMatchingUsed: false,
    visualMatchingUsed: false,
    assetBytesDownloaded: false,
    sha256Calculated: false,
    assetIntakePromotedToResolved: false,
    frontendChanged: false,
  },
  nextStartPoint: 'A3 representative byte/provenance proof: download a small family-covering subset of the 24 Drive candidates, verify PNG signature/bytes/SHA-256, and re-ingest only verified evidence into Asset Intake.',
};

const validation = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a2-validation/v1',
  stage: 'A2 - Source Census',
  status: errors.length === 0 ? 'PASS' : 'FAIL',
  completion: errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  counts: {
    contractRecords: contract.records.length,
    censusRecords: captured.length,
    uniqueItemIds: seenItems.size,
    uniqueDriveFileIds: seenFiles.size,
    driveFound: 24,
    driveMissing: 0,
    driveAmbiguous: 0,
    byteVerified: 0,
    errors: errors.length,
  },
  sourcePriority: ['BILIBILI_WIKI_PUBLIC_ORIGINAL', 'KOREAN_LEGACY_ASSET_DRIVE'],
  admissionStatus: errors.length === 0 ? 'READY_FOR_A3_REPRESENTATIVE_BYTE_PROOF' : 'BLOCKED_A2_VALIDATION',
  hardErrors: errors,
};

const checkpoint = `# Soldier Training Material Assets A2 — Source Census

상태: \`${validation.status} / ${validation.completion} / ${validation.admissionStatus}\`

## 목적

A1에서 동결한 24개 \`itemId -> ItemInfo.Icon FULL_PATH\`를 변경하지 않고 Asset Intake Stage 5 승인 source 순서로 exact candidate만 조사한다. PNG bytes, SHA-256, WebP, frontend는 이 단계에서 다루지 않는다.

## authoritative predecessor

- \`${CONTRACT_PATH}\`
- A1 contract blob: \`${CONTRACT_BLOB}\`
- \`docs/checkpoints/asset-intake-stage5-operational-routing.md\`

## source routing 결과

1. Bilibili Wiki public original: frozen basename exact public-search index candidate **0**. 이 값은 자산 부재 증명으로 사용하지 않는다.
2. 기존 한섭 asset Drive: \`아이템 1\`에서 **24/24 exact filename candidate**, \`아이템 2~4\`는 **0**, 따라서 Item folder 전체 기준 ambiguity **0**.

| Folder | Drive folder ID | Exact matches |
|---|---|---:|
| 아이템 1 | \`${DRIVE_FOLDER}\` | **24** |
| 아이템 2 | \`11fcrLT_HME3baVSgQJUSQD7TnmH11pg2\` | **0** |
| 아이템 3 | \`1aHMOcGYMwWbeBvGbKIe6di0M-79m0sfj\` | **0** |
| 아이템 4 | \`1xbQ6N_ku7sgbRbObI9hMwyovIrE8Fz1y\` | **0** |

## census

\`target=24 / FOUND=24 / NOT_FOUND=0 / AMBIGUOUS=0 / unique Drive file IDs=24 / byteVerified=0\`

각 record는 frozen itemId/FULL_PATH, exact basename, Drive folder/file ID와 PNG MIME만 보존한다. \`byteProofStatus=DEFERRED_TO_A3\`, \`sha256=null\`이며 Asset Intake를 RESOLVED로 승격하지 않는다.

## 하지 않은 것

- semantic/ConfigData 재계산
- name JOIN / ID arithmetic / fuzzy/visual matching
- asset bytes 다운로드 / SHA-256
- WebP/public asset/frontend 변경

## artifacts

- \`data/generated/soldier-training-material-assets-a2-source-census.v1.json\`
- \`data/validation/soldier-training-material-assets-a2.v1.json\`
- \`scripts/freeze-soldier-training-material-assets-a2.mjs\`
- \`.github/workflows/soldier-training-material-assets-a2.yml\`
- \`docs/checkpoints/soldier-training-material-assets-a2.md\`

## 다음 시작점

A3에서 filename family를 대표하는 소수 Drive 후보만 실제 다운로드해 PNG signature, non-zero bytes, SHA-256, exact file ID provenance, Asset Intake evidence shape를 먼저 검증한다. 대표 proof PASS 뒤에만 A4 bulk 24/24 acquisition으로 간다.

## 다시 열리는 조건

- A1 contract blob 또는 frozen itemId/FULL_PATH 변경
- Drive exact parity 24/24 파손 또는 duplicate candidate 발생
- source priority contract 변경
- A3 byte proof가 captured candidate identity와 충돌
`;

const outputs = [
  ['data/generated/soldier-training-material-assets-a2-source-census.v1.json', census],
  ['data/validation/soldier-training-material-assets-a2.v1.json', validation],
];
for (const [file, data] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
fs.mkdirSync('docs/checkpoints', { recursive: true });
fs.writeFileSync('docs/checkpoints/soldier-training-material-assets-a2.md', checkpoint);

process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 1;
