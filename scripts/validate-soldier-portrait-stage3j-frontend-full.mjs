import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v8.json';
const LIST_PATH = 'data/generated/soldier-list-stage5-8.v1.json';
const ASSET_LIB_PATH = 'src/lib/soldier-portrait-assets.ts';
const LIST_ROUTE_PATH = 'src/routes/soldiers.tsx';
const DETAIL_ROUTE_PATH = 'src/routes/soldiers.$soldierId.tsx';
const DETAIL_MODAL_PATH = 'src/components/soldier-detail-modal.tsx';
const PUBLIC_DIR = 'public/images/soldiers';
const EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3j-frontend-full.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3j-portrait-full.txt';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`STAGE3J_FAIL: ${message}`);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const soldierList = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
const assetLib = readFileSync(ASSET_LIB_PATH, 'utf8');
const listRoute = readFileSync(LIST_ROUTE_PATH, 'utf8');
const detailRoute = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
const detailModal = readFileSync(DETAIL_MODAL_PATH, 'utf8');

if (manifest.status !== 'PASS' || manifest.assetsReady !== true) fail('portrait manifest v8 is not ready');
if (manifest.coverage?.canonicalSoldierCount !== 224) fail(`canonical portrait count=${manifest.coverage?.canonicalSoldierCount}`);
if (manifest.coverage?.canonicalNormalCount !== 168 || manifest.coverage?.canonicalSpCount !== 56) fail('normal/SP canonical split mismatch');
if (manifest.coverage?.resolvedCount !== 224 || manifest.coverage?.unresolvedCount !== 0) fail('portrait coverage is not 224/224');
if (manifest.coverage?.resolvedNormalCount !== 168 || manifest.coverage?.resolvedSpCount !== 56) fail('resolved normal/SP split mismatch');
if (manifest.records?.length !== 224 || manifest.unresolved?.length !== 0) fail('manifest record arrays mismatch');
if (manifest.policy?.allNormalPortraitsResolved !== true || manifest.policy?.allSpPortraitsResolved !== true || manifest.policy?.allSoldierPortraitsResolved !== true) fail('manifest final coverage policy flags are not all true');
if (manifest.policy?.spNormalPortraitReuse !== false || manifest.policy?.spNormalImageFallbackUsed !== false || manifest.policy?.spNameSimilarityUsedForAdmission !== false || manifest.policy?.spIdArithmeticUsedForAdmission !== false) fail('SP no-guessing policy regression');

if (soldierList.status !== 'PASS') fail(`soldier list status=${soldierList.status}`);
if (soldierList.summary?.recordCount !== 224 || soldierList.summary?.normalCount !== 168 || soldierList.summary?.spCount !== 56) fail('canonical Soldier list summary mismatch');
if (!Array.isArray(soldierList.records) || soldierList.records.length !== 224) fail('canonical Soldier list record count mismatch');

const canonicalIds = soldierList.records.map((row) => Number(row.soldierId));
const portraitIds = manifest.records.map((row) => Number(row.soldierId));
const canonicalSet = new Set(canonicalIds);
const portraitSet = new Set(portraitIds);
if (canonicalSet.size !== 224) fail(`duplicate canonical Soldier IDs: unique=${canonicalSet.size}`);
if (portraitSet.size !== 224) fail(`duplicate portrait Soldier IDs: unique=${portraitSet.size}`);
const missingPortraitIds = [...canonicalSet].filter((id) => !portraitSet.has(id)).sort((a, b) => a - b);
const extraPortraitIds = [...portraitSet].filter((id) => !canonicalSet.has(id)).sort((a, b) => a - b);
if (missingPortraitIds.length || extraPortraitIds.length) fail(`ID parity mismatch missing=${missingPortraitIds.join(',')} extra=${extraPortraitIds.join(',')}`);

const canonicalById = new Map(soldierList.records.map((row) => [Number(row.soldierId), row]));
const fileNames = new Set();
let byteTotal = 0;
let normalCount = 0;
let spCount = 0;
const extensionCounts = {};

for (const record of manifest.records) {
  const id = Number(record.soldierId);
  const canonical = canonicalById.get(id);
  if (!canonical) fail(`manifest record ${id} is not canonical`);
  if (!record.fileName || fileNames.has(record.fileName)) fail(`missing/duplicate portrait fileName for ${id}: ${record.fileName}`);
  fileNames.add(record.fileName);

  const filePath = path.join(PUBLIC_DIR, record.fileName);
  if (!existsSync(filePath)) fail(`portrait asset missing ${id}: ${filePath}`);
  const bytes = readFileSync(filePath);
  if (bytes.length !== Number(record.size)) fail(`portrait byte size mismatch ${id}`);
  if (sha256(bytes) !== record.sha256) fail(`portrait SHA-256 mismatch ${id}`);
  if (bytes.length === 0) fail(`empty portrait asset ${id}`);
  byteTotal += bytes.length;

  const ext = path.extname(record.fileName).toLowerCase() || '<none>';
  extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;

  if (canonical.isSp === true) {
    spCount += 1;
    if (record.isSp !== true) fail(`SP manifest flag missing ${id}`);
    if (Number(record.normalSoldierId) !== Number(canonical.normalSoldierId)) fail(`SP explicit normal relation mismatch ${id}`);
    const expectedTitle = `File:Q${record.nameCn}SP.png`;
    if (record.bwikiFileTitle !== expectedTitle) fail(`SP exact file-title mismatch ${id}: ${record.bwikiFileTitle}`);
    if (record.sourceKind !== 'BWIKI_CURRENT_CN_EXACT_Q_SP_PNG_STAGE3I') fail(`SP sourceKind mismatch ${id}: ${record.sourceKind}`);
  } else {
    normalCount += 1;
    if (record.isSp === true) fail(`normal Soldier incorrectly flagged SP ${id}`);
  }
}

if (normalCount !== 168 || spCount !== 56) fail(`verified normal/SP count=${normalCount}/${spCount}`);

const requiredAssetLibChecks = [
  'soldier-portrait-manifest.v8.json',
  'getOfficialSoldierPortraitUrl',
  'portraitBySoldierId',
];
for (const needle of requiredAssetLibChecks) {
  if (!assetLib.includes(needle)) fail(`asset resolver missing ${needle}`);
}
if (assetLib.includes('soldier-portrait-manifest.v6.json') || assetLib.includes('soldier-portrait-manifest.v7.json')) fail('asset resolver still references stale manifest');

if (!listRoute.includes('getOfficialSoldierPortraitUrl(record.soldierId)')) fail('Soldier list cards do not consume shared portrait resolver by canonical soldierId');
if (!detailModal.includes('getOfficialSoldierPortraitUrl(record.soldierId)')) fail('Soldier detail UI does not consume shared portrait resolver by canonical soldierId');
if (!detailRoute.includes('SoldierDetailModal')) fail('Soldier direct detail route no longer delegates to the shared detail UI');

const evidence = {
  version: 1,
  stage: 'soldier-portrait-stage3j-frontend-full',
  status: 'PASS',
  manifest: MANIFEST_PATH,
  canonicalList: LIST_PATH,
  coverage: {
    canonicalSoldierCount: canonicalSet.size,
    portraitRecordCount: portraitSet.size,
    normalPortraitCount: normalCount,
    spPortraitCount: spCount,
    missingPortraitCount: missingPortraitIds.length,
    extraPortraitCount: extraPortraitIds.length,
    missingPortraitIds,
    extraPortraitIds,
    verifiedAssetFileCount: fileNames.size,
    verifiedByteTotal: byteTotal,
    extensionCounts,
  },
  frontendWiring: {
    sharedResolver: ASSET_LIB_PATH,
    manifestVersion: 8,
    listRoute: LIST_ROUTE_PATH,
    listUsesCanonicalIdResolver: true,
    detailRoute: DETAIL_ROUTE_PATH,
    detailModal: DETAIL_MODAL_PATH,
    detailUsesCanonicalIdResolver: true,
    hardcodedPerSoldierPortraitMap: false,
  },
  safety: {
    noMissingCanonicalPortraits: true,
    noExtraPortraitIds: true,
    noDuplicatePortraitIds: true,
    noDuplicatePortraitFileNames: true,
    allAssetHashesVerified: true,
    staleManifestImportAbsent: true,
    spNormalPortraitReuse: false,
    spNameSimilarityAdmission: false,
    spIdArithmeticAdmission: false,
  },
};

writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(CHECKPOINT_PATH, [
  'Soldier Frontend Stage 3J — portrait full wiring closeout',
  'status: PASS',
  `portraitManifest: ${MANIFEST_PATH}`,
  `canonicalList: ${LIST_PATH}`,
  'canonicalSoldiers: 224',
  'normalPortraits: 168/168',
  'spPortraits: 56/56',
  'overallPortraits: 224/224',
  'missingPortraits: 0',
  'extraPortraits: 0',
  'assetHashValidation: 224/224 PASS',
  'frontendListWiring: getOfficialSoldierPortraitUrl(record.soldierId) PASS',
  'frontendDetailWiring: getOfficialSoldierPortraitUrl(record.soldierId) PASS',
  'sharedResolverManifest: v8',
  'perSoldierHardcodedPortraitMap: NOT_USED',
  'spNormalPortraitReuse: PROHIBITED / 0',
  'result: ALL_224_SOLDIER_PORTRAITS_FRONTEND_WIRED',
  '',
].join('\n'));

console.log(`STAGE3J_FRONTEND_PORTRAIT_FULL PASS canonical=${canonicalSet.size} portraits=${portraitSet.size} normal=${normalCount} sp=${spCount} files=${fileNames.size}`);
