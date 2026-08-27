import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const V5_PATH = 'data/generated/soldier-portrait-manifest.v5.json';
const CONFIG_PATH = 'data/configdata/ConfigDataSoldierInfo.json';
const SP_CONFIG_PATH = 'data/configdata/ConfigDataSPSoldierInfo.json';
const DETAIL_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const NAME_MAP_PATH = 'data/contracts/soldier-low-tier-cn-kr-map.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v6.json';
const EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3g-low-tier-evidence.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3g-low-tier.txt';
const PUBLIC_DIR = 'public/images/soldiers';
const TARGET_IDS = [300, 303, 600, 625, 1000, 407, 503, 619, 1100, 1108];
const DRIVE_TIER_FOLDERS = {
  1: '1Br-tmzvjc4xo7baBaiziwweGyU75H-8x',
  2: '15a3Rc2w2i3Zkf32LZwB4xT8Ldaej0yXl',
};
const REQUEST_TIMEOUT_MS = 15000;

function normalizeName(value) {
  return String(value ?? '').normalize('NFC').replace(/[\s_\-]/g, '').toLowerCase();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function pngDimensions(bytes) {
  if (!isPng(bytes) || bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function fetchResponse(url) {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3G/1.1' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function fetchText(url) {
  const response = await fetchResponse(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetchResponse(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function loadDriveFolderIndex(tier) {
  const parentFolderId = DRIVE_TIER_FOLDERS[tier];
  const text = await fetchText(`https://drive.google.com/drive/folders/${parentFolderId}`);
  const matches = [...text.matchAll(/aria-label="([^"]+) Shared folder"[\s\S]{0,900}?data-id="([^"]+)"/g)];
  const records = [...new Map(matches.map((match) => [match[2], {
    name: match[1],
    nameKey: normalizeName(match[1]),
    folderId: match[2],
  }])).values()];
  return records;
}

async function resolveDefaultPng(folderId) {
  const text = await fetchText(`https://drive.google.com/drive/folders/${folderId}`);
  const patterns = [
    /aria-label="Default\.png(?: Image)?(?: Shared)?"[\s\S]{0,1200}?data-id="([^"]+)"/,
    /data-id="([^"]+)"[\s\S]{0,1200}?aria-label="Default\.png(?: Image)?(?: Shared)?"/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  throw new Error(`Default.png not found in Drive folder ${folderId}`);
}

async function downloadDrivePng(fileId) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];
  const failures = [];
  for (const url of urls) {
    try {
      const bytes = await fetchBytes(url);
      if (!isPng(bytes)) {
        failures.push(`non-PNG from ${new URL(url).host}`);
        continue;
      }
      return { bytes, sourceUrl: url };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Drive PNG download failed for ${fileId}: ${failures.join('; ')}`);
}

const v5 = JSON.parse(await readFile(V5_PATH, 'utf8'));
const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
const spConfig = JSON.parse(await readFile(SP_CONFIG_PATH, 'utf8'));
const detail = JSON.parse(await readFile(DETAIL_PATH, 'utf8')).records;
const nameMap = JSON.parse(await readFile(NAME_MAP_PATH, 'utf8'));

if (nameMap.status !== 'USER_REVIEWED' || nameMap.rows.length !== 39) {
  throw new Error('Stage 3G reviewed CN-KR mapping contract mismatch');
}
const krByCn = new Map();
for (const row of nameMap.rows) {
  if (!row.nameCn || !row.nameKr || krByCn.has(row.nameCn)) throw new Error(`Invalid/duplicate reviewed name row ${JSON.stringify(row)}`);
  krByCn.set(row.nameCn, row.nameKr);
}

if (v5.coverage.resolvedCount !== 158 || v5.coverage.unresolvedCount !== 66 || v5.coverage.tier3Resolved !== 129) {
  throw new Error('Stage 3G parent v5 invariant mismatch');
}
const configById = new Map(config.map((row) => [Number(row.ID), row]));
const detailById = new Map(detail.map((row) => [Number(row.soldierId), row]));
const spIds = new Set(spConfig.map((row) => Number(row.ID)));
const unresolvedById = new Map(v5.unresolved.map((row) => [Number(row.soldierId), row]));
const records = v5.records.map((row) => ({ ...row }));
const evidenceRows = [];
const newlyResolved = [];
await mkdir(PUBLIC_DIR, { recursive: true });

const driveByTier = {
  1: await loadDriveFolderIndex(1),
  2: await loadDriveFolderIndex(2),
};
if (driveByTier[1].length !== 11) throw new Error(`Expected 11 Drive I folders, got ${driveByTier[1].length}`);
if (driveByTier[2].length !== 27) throw new Error(`Expected 27 Drive II folders, got ${driveByTier[2].length}`);

for (const soldierId of TARGET_IDS) {
  const c = configById.get(soldierId);
  const d = detailById.get(soldierId);
  const unresolved = unresolvedById.get(soldierId);
  if (!c || !d) throw new Error(`Stage 3G canonical/config target missing ${soldierId}`);
  if (!unresolved) throw new Error(`Stage 3G target is not unresolved in v5: ${soldierId}`);
  if (spIds.has(soldierId)) throw new Error(`Stage 3G target unexpectedly classified as SP by explicit SPSoldierInfo ID: ${soldierId}`);

  const tier = Number(c.Rank);
  if (tier !== 1 && tier !== 2) throw new Error(`Stage 3G target is not T1/T2: ${soldierId} rank=${c.Rank}`);
  const nameCn = c.Name ?? d.identity?.nameCn ?? null;
  const model = c.Model ?? null;
  const model2 = c.Model2 ?? null;
  if (!nameCn || !model) throw new Error(`Stage 3G identity/model evidence incomplete ${soldierId}`);
  if (d.identity?.nameCn && d.identity.nameCn !== nameCn) throw new Error(`Stage 3G ConfigData/detail CN mismatch ${soldierId}`);
  const nameKr = krByCn.get(nameCn);
  if (!nameKr) throw new Error(`Stage 3G reviewed Korean mapping missing exact CN name ${soldierId} ${nameCn}`);

  const modelStem = model.split('/').at(-2) ?? null;
  const prefab = model.split('/').at(-1) ?? null;
  if (!modelStem || !prefab) throw new Error(`Stage 3G malformed model path ${soldierId}: ${model}`);

  const nameKey = normalizeName(nameKr);
  const driveCandidates = driveByTier[tier].filter((row) => row.nameKey === nameKey);
  if (driveCandidates.length !== 1) {
    throw new Error(`Stage 3G Drive T${tier} exact reviewed-KR folder mismatch ${soldierId} ${nameCn} -> ${nameKr}: candidates=${JSON.stringify(driveCandidates)}`);
  }
  const drive = driveCandidates[0];
  const driveFileId = await resolveDefaultPng(drive.folderId);
  const downloaded = await downloadDrivePng(driveFileId);
  const bytes = downloaded.bytes;
  const dimensions = pngDimensions(bytes);
  if (!dimensions) throw new Error(`Stage 3G PNG dimension parse failed ${soldierId}`);
  const fileName = `${soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr,
    nameCn,
    tier,
    sourceKind: `DRIVE_DEFAULT_PNG_STAGE3G_T${tier}_USER_REVIEWED_CN_KR_EXACT`,
    sourceFileName: 'Default.png',
    driveFolderId: drive.folderId,
    driveFileId,
    sourceUrl: downloaded.sourceUrl,
    model,
    modelStem,
    fileName,
    resolutionMethod: 'CANONICAL_SOLDIER_ID_TO_CONFIGDATA_CN_MODEL_TO_USER_REVIEWED_KR_TO_EXACT_DRIVE_TIER_FOLDER_DEFAULT_PNG',
    size: bytes.length,
    sha256: sha256(bytes),
    width: dimensions.width,
    height: dimensions.height,
  };
  records.push(record);
  newlyResolved.push(record);
  unresolvedById.delete(soldierId);
  evidenceRows.push({
    soldierId,
    status: 'PASS',
    tier,
    nameCn,
    nameKr,
    previousNameKr: d.identity?.nameKr ?? null,
    nameMappingBasis: 'USER_REVIEWED_EXACT_CN_KR_MAP',
    driveName: drive.name,
    driveTierFolderId: DRIVE_TIER_FOLDERS[tier],
    driveFolderId: drive.folderId,
    driveFileId,
    driveFileName: 'Default.png',
    model,
    model2,
    modelStem,
    prefab,
    byteSize: bytes.length,
    sha256: record.sha256,
    width: record.width,
    height: record.height,
  });
}

const newlyT1 = newlyResolved.filter((row) => row.tier === 1).length;
const newlyT2 = newlyResolved.filter((row) => row.tier === 2).length;
if (newlyT1 !== 5 || newlyT2 !== 5) throw new Error(`Stage 3G expected 5 T1 + 5 T2, got ${newlyT1} + ${newlyT2}`);

records.sort((a, b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a, b) => a.soldierId - b.soldierId);
const ids = new Set(records.map((row) => row.soldierId));
if (ids.size !== records.length) throw new Error('Duplicate Soldier portrait ID after Stage 3G');
if (records.length + unresolved.length !== 224) throw new Error('Stage 3G total coverage mismatch');
if (TARGET_IDS.some((id) => unresolvedById.has(id))) throw new Error('Stage 3G low-tier target remains unresolved');
if (unresolved.some((row) => !spIds.has(Number(row.soldierId)))) throw new Error('Stage 3G normal Soldier remains unresolved after low-tier closeout');

const sourceCounts = Object.fromEntries(
  [...new Set(records.map((row) => row.sourceKind))]
    .sort()
    .map((kind) => [kind, records.filter((row) => row.sourceKind === kind).length]),
);

const output = {
  version: 6,
  stage: 'frontend-stage3g-low-tier-normal-closeout',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  publicRoot: v5.publicRoot,
  assetsReady: true,
  policy: {
    ...v5.policy,
    stage3gAdmission: 'Target must be one of the 10 v5 unresolved normal T1/T2 Soldier IDs. ConfigDataSoldierInfo exact ID supplies Chinese name + Model; Korean presentation name must exact-match the user-reviewed CN-KR contract; that reviewed Korean name must exact-normalize to exactly one folder in the corresponding Drive I/II tier; use Default.png only.',
    stage3gAssetTransport: 'Use the existing public Korean legacy-sheet Drive tier folders, resolve Default.png only, validate PNG signature/dimensions/SHA-256, and time out each request.',
    lowTierNameSimilarityUsedForAdmission: false,
    lowTierCombatSignatureUsedForAdmission: false,
    lowTierIdArithmeticUsedForAdmission: false,
    allNormalPortraitsResolved: true,
    spPortraitExpansion: 'Not included; all remaining unresolved records must be explicit SPSoldierInfo IDs.',
  },
  sources: {
    ...v5.sources,
    previousManifest: V5_PATH,
    configDataSoldierInfo: CONFIG_PATH,
    configDataSpSoldierInfo: SP_CONFIG_PATH,
    userReviewedLowTierNameMap: NAME_MAP_PATH,
    driveTier1FolderId: DRIVE_TIER_FOLDERS[1],
    driveTier2FolderId: DRIVE_TIER_FOLDERS[2],
    stage3gEvidence: EVIDENCE_PATH,
  },
  coverage: {
    canonicalSoldierCount: 224,
    canonicalNormalCount: 168,
    canonicalSpCount: 56,
    resolvedCount: records.length,
    unresolvedCount: unresolved.length,
    resolvedNormalCount: v5.coverage.resolvedNormalCount + newlyResolved.length,
    resolvedSpCount: v5.coverage.resolvedSpCount,
    tier1Resolved: v5.coverage.tier1Resolved + newlyT1,
    tier2Resolved: v5.coverage.tier2Resolved + newlyT2,
    tier3Resolved: v5.coverage.tier3Resolved,
    newlyResolvedCount: newlyResolved.length,
    remainingNormalUnresolvedCount: 0,
    remainingSpUnresolvedCount: unresolved.length,
    sourceCounts,
  },
  newlyResolvedSoldierIds: newlyResolved.map((row) => row.soldierId).sort((a, b) => a - b),
  records,
  unresolved,
};

if (output.coverage.resolvedCount !== 168 || output.coverage.unresolvedCount !== 56) throw new Error(`Unexpected Stage 3G coverage ${output.coverage.resolvedCount}/${output.coverage.unresolvedCount}`);
if (output.coverage.resolvedNormalCount !== 168 || output.coverage.resolvedSpCount !== 0) throw new Error('Stage 3G normal/SP coverage mismatch');
if (output.coverage.tier1Resolved !== 12 || output.coverage.tier2Resolved !== 27 || output.coverage.tier3Resolved !== 129) throw new Error('Stage 3G tier coverage mismatch');
if (unresolved.length !== spIds.size || spIds.size !== 56) throw new Error(`Stage 3G SP unresolved invariant mismatch unresolved=${unresolved.length} spIds=${spIds.size}`);

const evidence = {
  version: 1,
  stage: 'soldier-portrait-stage3g-low-tier-evidence',
  generatedAt: new Date().toISOString(),
  targetCount: TARGET_IDS.length,
  passCount: evidenceRows.length,
  mappingContractCount: nameMap.rows.length,
  driveTier1FolderCount: driveByTier[1].length,
  driveTier2FolderCount: driveByTier[2].length,
  rows: evidenceRows.sort((a, b) => a.soldierId - b.soldierId),
};
await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(CHECKPOINT_PATH, [
  'Soldier Frontend Stage 3G — lower-tier normal portrait closeout',
  'status: PASS_WITH_REVIEW',
  `parentManifest: ${V5_PATH}`,
  'targetLowTierNormalCount: 10',
  `resolvedThisStage: ${newlyResolved.length}`,
  `tier1Resolved: ${output.coverage.tier1Resolved}/12`,
  `tier2Resolved: ${output.coverage.tier2Resolved}/27`,
  'tier3Resolved: 129/129',
  `normalResolved: ${output.coverage.resolvedNormalCount}/168`,
  `overallResolved: ${output.coverage.resolvedCount}/224`,
  `overallUnresolved: ${output.coverage.unresolvedCount}/224`,
  'remainingNormalUnresolved: 0',
  'remainingSpUnresolved: 56',
  `nameSource: ${NAME_MAP_PATH}`,
  'identityRule: canonical Soldier ID -> ConfigDataSoldierInfo exact ID -> exact Chinese name + Model -> user-reviewed exact CN-KR mapping -> exact same-tier Drive I/II Korean folder -> Default.png',
  'nameSimilarity: PROHIBITED',
  'combatSignature: NOT_USED_FOR_STAGE3G',
  'idArithmetic: PROHIBITED',
  'spPortraitReuse: PROHIBITED',
  'next: SP 56 portrait source-resolution proof; normal Soldier portrait work is closed',
  '',
].join('\n'));

console.log(`STAGE3G_LOW_TIER_CLOSEOUT resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} normal=${output.coverage.resolvedNormalCount} t1=${output.coverage.tier1Resolved} t2=${output.coverage.tier2Resolved} t3=${output.coverage.tier3Resolved}`);
for (const row of evidence.rows) console.log(`${row.soldierId}\tT${row.tier}\t${row.nameCn}\t${row.nameKr}\t${row.modelStem}\t${row.driveName}\t${row.driveFolderId}\t${row.driveFileId}`);
