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
const BWIKI_API = 'https://wiki.biligame.com/langrisser/api.php';
const BWIKI_FILE_REDIRECT = 'https://wiki.biligame.com/langrisser/Special:Redirect/file/';
const REQUEST_TIMEOUT_MS = 15000;

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
    headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3G/1.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function fetchJson(url) {
  const response = await fetchResponse(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function tryPng(url) {
  try {
    const response = await fetchResponse(url);
    if (!response.ok) return { ok: false, error: `${response.status} ${response.statusText}`, finalUrl: response.url };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isPng(bytes)) {
      return { ok: false, error: `NON_PNG ${response.headers.get('content-type') ?? ''}`, finalUrl: response.url };
    }
    return { ok: true, bytes, finalUrl: response.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), finalUrl: null };
  }
}

async function resolveBwikiAsset(nameCn) {
  const fileNames = [`Q${nameCn}.png`, `士兵 ${nameCn}.png`];
  const attempts = [];

  for (const fileName of fileNames) {
    const title = `File:${fileName}`;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      prop: 'imageinfo',
      iiprop: 'url|size|sha1',
      titles: title,
    });
    const apiUrl = `${BWIKI_API}?${params}`;
    try {
      const json = await fetchJson(apiUrl);
      const page = Object.values(json?.query?.pages ?? {})[0];
      const info = page?.imageinfo?.[0];
      if (page && !page.missing && info?.url) {
        const asset = await tryPng(info.url);
        if (asset.ok) {
          return {
            title,
            fileName,
            resolution: 'MEDIAWIKI_IMAGEINFO',
            apiUrl,
            sourceUrl: asset.finalUrl ?? info.url,
            bytes: asset.bytes,
          };
        }
        attempts.push({ title, method: 'MEDIAWIKI_IMAGEINFO', status: 'BAD_ASSET', error: asset.error, sourceUrl: info.url });
      } else {
        attempts.push({ title, method: 'MEDIAWIKI_IMAGEINFO', status: 'MISSING' });
      }
    } catch (error) {
      attempts.push({ title, method: 'MEDIAWIKI_IMAGEINFO', status: 'ERROR', error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const fileName of fileNames) {
    const title = `File:${fileName}`;
    const redirectUrl = `${BWIKI_FILE_REDIRECT}${encodeURIComponent(fileName)}`;
    const asset = await tryPng(redirectUrl);
    if (asset.ok) {
      return {
        title,
        fileName,
        resolution: 'MEDIAWIKI_SPECIAL_REDIRECT',
        apiUrl: null,
        sourceUrl: asset.finalUrl ?? redirectUrl,
        bytes: asset.bytes,
      };
    }
    attempts.push({
      title,
      method: 'MEDIAWIKI_SPECIAL_REDIRECT',
      status: 'ERROR',
      error: asset.error,
      sourceUrl: redirectUrl,
      finalUrl: asset.finalUrl,
    });
  }

  throw new Error(`BWIKI image unresolved for ${nameCn}: ${JSON.stringify(attempts)}`);
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

  const bwiki = await resolveBwikiAsset(nameCn);
  const bytes = bwiki.bytes;
  const dimensions = pngDimensions(bytes);
  if (!dimensions) throw new Error(`Stage 3G PNG dimension parse failed ${soldierId}`);
  const fileName = `${soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr,
    nameCn,
    tier,
    sourceKind: bwiki.fileName.startsWith('Q') ? 'BWIKI_CURRENT_CN_EXACT_Q_PNG_STAGE3G_LOW_TIER' : 'BWIKI_CURRENT_CN_EXACT_SOLDIER_PNG_STAGE3G_LOW_TIER',
    sourceUrl: bwiki.sourceUrl,
    bwikiFileTitle: bwiki.title,
    bwikiResolution: bwiki.resolution,
    bwikiPageUrl: `https://wiki.biligame.com/langrisser/士兵/${encodeURIComponent(nameCn)}`,
    model,
    modelStem,
    fileName,
    resolutionMethod: 'CANONICAL_SOLDIER_ID_TO_CONFIGDATA_CN_MODEL_TO_USER_REVIEWED_KR_AND_BWIKI_EXACT_CN_IMAGE',
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
    model,
    model2,
    modelStem,
    prefab,
    bwikiFileTitle: bwiki.title,
    bwikiResolution: bwiki.resolution,
    bwikiApiUrl: bwiki.apiUrl,
    sourceUrl: bwiki.sourceUrl,
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
if (unresolved.some((row) => !spIds.has(Number(row.soldierId)))) {
  throw new Error('Stage 3G normal Soldier remains unresolved after low-tier closeout');
}

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
    stage3gAdmission: 'Target must be one of the 10 v5 unresolved normal T1/T2 Soldier IDs. ConfigDataSoldierInfo exact ID supplies Chinese name + Model; Korean presentation name must exact-match the user-reviewed CN-KR contract; BWIKI image file must exact-match the same Chinese name.',
    stage3gAssetTransport: 'Prefer MediaWiki imageinfo, fall back only to MediaWiki Special:Redirect/file for the same exact file title, validate PNG signature/dimensions/SHA-256, and time out each request.',
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
    bwikiApi: BWIKI_API,
    bwikiFileRedirect: BWIKI_FILE_REDIRECT,
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

if (output.coverage.resolvedCount !== 168 || output.coverage.unresolvedCount !== 56) {
  throw new Error(`Unexpected Stage 3G coverage ${output.coverage.resolvedCount}/${output.coverage.unresolvedCount}`);
}
if (output.coverage.resolvedNormalCount !== 168 || output.coverage.resolvedSpCount !== 0) {
  throw new Error('Stage 3G normal/SP coverage mismatch');
}
if (output.coverage.tier1Resolved !== 12 || output.coverage.tier2Resolved !== 27 || output.coverage.tier3Resolved !== 129) {
  throw new Error('Stage 3G tier coverage mismatch');
}
if (unresolved.length !== spIds.size || spIds.size !== 56) throw new Error(`Stage 3G SP unresolved invariant mismatch unresolved=${unresolved.length} spIds=${spIds.size}`);

const evidence = {
  version: 1,
  stage: 'soldier-portrait-stage3g-low-tier-evidence',
  generatedAt: new Date().toISOString(),
  targetCount: TARGET_IDS.length,
  passCount: evidenceRows.length,
  mappingContractCount: nameMap.rows.length,
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
  'identityRule: canonical Soldier ID -> ConfigDataSoldierInfo exact ID -> exact Chinese name + Model -> user-reviewed exact CN-KR mapping + BWIKI exact Chinese-name image file',
  'nameSimilarity: PROHIBITED',
  'combatSignature: NOT_USED_FOR_STAGE3G',
  'idArithmetic: PROHIBITED',
  'spPortraitReuse: PROHIBITED',
  'next: SP 56 portrait source-resolution proof; normal Soldier portrait work is closed',
  '',
].join('\n'));

console.log(`STAGE3G_LOW_TIER_CLOSEOUT resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} normal=${output.coverage.resolvedNormalCount} t1=${output.coverage.tier1Resolved} t2=${output.coverage.tier2Resolved} t3=${output.coverage.tier3Resolved}`);
for (const row of evidence.rows) {
  console.log(`${row.soldierId}\tT${row.tier}\t${row.nameCn}\t${row.nameKr}\t${row.modelStem}\t${row.bwikiFileTitle}\t${row.bwikiResolution}`);
}
