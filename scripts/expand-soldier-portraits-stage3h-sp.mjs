import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PARENT_MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v6.json';
const SOLDIER_CONFIG_PATH = 'data/configdata/ConfigDataSoldierInfo.json';
const SP_CONFIG_PATH = 'data/configdata/ConfigDataSPSoldierInfo.json';
const DETAIL_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v7.json';
const EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3h-sp-evidence.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3h-sp.txt';
const FRONTEND_RESOLVER_PATH = 'src/lib/soldier-portrait-assets.ts';
const PUBLIC_DIR = 'public/images/soldiers';
const BWIKI_API = 'https://wiki.biligame.com/langrisser/api.php';
const BWIKI_FILE_REDIRECT = 'https://wiki.biligame.com/langrisser/Special:Redirect/file/';
const REQUEST_TIMEOUT_MS = 20000;

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
    headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3H/1.0' },
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
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}`, finalUrl: response.url };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isPng(bytes)) {
      return {
        ok: false,
        error: `NON_PNG ${response.headers.get('content-type') ?? ''}`,
        finalUrl: response.url,
      };
    }
    return { ok: true, bytes, finalUrl: response.url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      finalUrl: null,
    };
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
        attempts.push({
          title,
          method: 'MEDIAWIKI_IMAGEINFO',
          status: 'BAD_ASSET',
          error: asset.error,
          sourceUrl: info.url,
        });
      } else {
        attempts.push({ title, method: 'MEDIAWIKI_IMAGEINFO', status: 'MISSING' });
      }
    } catch (error) {
      attempts.push({
        title,
        method: 'MEDIAWIKI_IMAGEINFO',
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
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

  throw new Error(`BWIKI exact SP image unresolved for ${nameCn}: ${JSON.stringify(attempts)}`);
}

const parent = JSON.parse(await readFile(PARENT_MANIFEST_PATH, 'utf8'));
const soldierConfig = JSON.parse(await readFile(SOLDIER_CONFIG_PATH, 'utf8'));
const spConfig = JSON.parse(await readFile(SP_CONFIG_PATH, 'utf8'));
const detailJson = JSON.parse(await readFile(DETAIL_PATH, 'utf8'));
const detailRows = Array.isArray(detailJson) ? detailJson : detailJson.records;

if (parent.version !== 6) throw new Error(`Expected portrait manifest v6, got ${parent.version}`);
if (parent.coverage?.canonicalSoldierCount !== 224) throw new Error('Parent canonical Soldier count mismatch');
if (parent.coverage?.resolvedCount !== 168 || parent.coverage?.unresolvedCount !== 56) {
  throw new Error('Parent portrait coverage is not 168 resolved / 56 unresolved');
}
if (parent.coverage?.resolvedNormalCount !== 168 || parent.coverage?.resolvedSpCount !== 0) {
  throw new Error('Parent normal/SP coverage mismatch');
}
if (!Array.isArray(spConfig) || spConfig.length !== 56) {
  throw new Error(`Expected 56 SPSoldierInfo records, got ${Array.isArray(spConfig) ? spConfig.length : 'non-array'}`);
}

const configById = new Map(soldierConfig.map((row) => [Number(row.ID), row]));
const detailById = new Map((detailRows ?? []).map((row) => [Number(row.soldierId), row]));
const spById = new Map(spConfig.map((row) => [Number(row.ID), row]));
const targetIds = [...spById.keys()].sort((a, b) => a - b);
const targetIdSet = new Set(targetIds);
const parentUnresolvedIds = [...parent.unresolved.map((row) => Number(row.soldierId))].sort((a, b) => a - b);

if (spById.size !== 56) throw new Error(`SPSoldierInfo ID uniqueness mismatch: ${spById.size}`);
if (parentUnresolvedIds.join(',') !== targetIds.join(',')) {
  throw new Error(`Parent unresolved set is not exact SPSoldierInfo ID set. unresolved=${parentUnresolvedIds.join(',')} sp=${targetIds.join(',')}`);
}

const normalIds = new Set(spConfig.map((row) => Number(row.NormalSoliderId)));
if (normalIds.size === 0 || targetIds.some((id) => normalIds.has(id))) {
  throw new Error('SP/normal explicit relation sanity check failed');
}

const records = parent.records.map((row) => ({ ...row }));
const unresolvedById = new Map(parent.unresolved.map((row) => [Number(row.soldierId), row]));
const evidenceRows = [];
const newlyResolved = [];
await mkdir(PUBLIC_DIR, { recursive: true });

for (const soldierId of targetIds) {
  const sp = spById.get(soldierId);
  const config = configById.get(soldierId);
  const unresolved = unresolvedById.get(soldierId);
  const detail = detailById.get(soldierId);

  if (!sp || !config || !unresolved) throw new Error(`SP target source missing ${soldierId}`);
  if (Number(sp.ID) !== soldierId) throw new Error(`SPSoldierInfo ID mismatch ${soldierId}`);
  const normalSoldierId = Number(sp.NormalSoliderId);
  if (!Number.isInteger(normalSoldierId) || !configById.has(normalSoldierId)) {
    throw new Error(`SP explicit normal Soldier relation unresolved ${soldierId} -> ${sp.NormalSoliderId}`);
  }

  const nameCn = config.Name ?? detail?.identity?.nameCn ?? null;
  const model = config.Model ?? null;
  const model2 = config.Model2 ?? null;
  if (!nameCn || !model) throw new Error(`SP ConfigData identity/model incomplete ${soldierId}`);
  if (detail?.identity?.nameCn && detail.identity.nameCn !== nameCn) {
    throw new Error(`SP ConfigData/detail Chinese-name mismatch ${soldierId}`);
  }
  const modelStem = model.split('/').at(-2) ?? null;
  const prefab = model.split('/').at(-1) ?? null;
  if (!modelStem || !prefab) throw new Error(`SP malformed Model path ${soldierId}: ${model}`);
  const nameKr = detail?.identity?.nameKr ?? unresolved.nameKr ?? null;

  const bwiki = await resolveBwikiAsset(nameCn);
  const bytes = bwiki.bytes;
  const dimensions = pngDimensions(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`SP PNG dimension parse failed ${soldierId}`);
  }

  const fileName = `${soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr,
    nameCn,
    tier: Number(config.Rank) || null,
    isSp: true,
    normalSoldierId,
    sourceKind: bwiki.fileName.startsWith('Q')
      ? 'BWIKI_CURRENT_CN_EXACT_Q_PNG_STAGE3H_SP'
      : 'BWIKI_CURRENT_CN_EXACT_SOLDIER_PNG_STAGE3H_SP',
    sourceUrl: bwiki.sourceUrl,
    bwikiFileTitle: bwiki.title,
    bwikiResolution: bwiki.resolution,
    bwikiPageUrl: `https://wiki.biligame.com/langrisser/士兵/${encodeURIComponent(nameCn)}`,
    model,
    model2,
    modelStem,
    fileName,
    resolutionMethod: 'CANONICAL_SP_SOLDIER_ID_TO_SPSOLDIERINFO_EXPLICIT_RELATION_TO_CONFIGDATA_SP_RECORD_CN_MODEL_TO_BWIKI_EXACT_CN_IMAGE',
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
    isSp: true,
    normalSoldierId,
    nameKr,
    nameCn,
    rank: Number(config.Rank) || null,
    model,
    model2,
    modelStem,
    prefab,
    bwikiFileTitle: bwiki.title,
    bwikiResolution: bwiki.resolution,
    bwikiApiUrl: bwiki.apiUrl,
    bwikiPageUrl: record.bwikiPageUrl,
    sourceUrl: bwiki.sourceUrl,
    fileName,
    byteSize: bytes.length,
    sha256: record.sha256,
    width: record.width,
    height: record.height,
    identityBasis: 'SPSoldierInfo.ID exact set + SPSoldierInfo.NormalSoliderId explicit relation + ConfigDataSoldierInfo exact SP ID Chinese name and Model',
    normalPortraitReused: false,
  });

  console.log(`SP_PORTRAIT_RESOLVED ${soldierId} ${nameCn} -> ${bwiki.title}`);
}

records.sort((a, b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a, b) => Number(a.soldierId) - Number(b.soldierId));
const recordIds = new Set(records.map((row) => Number(row.soldierId)));
if (recordIds.size !== records.length) throw new Error('Duplicate Soldier portrait ID after Stage 3H');
if (records.length !== 224 || unresolved.length !== 0) {
  throw new Error(`Stage 3H full coverage mismatch records=${records.length} unresolved=${unresolved.length}`);
}
if (newlyResolved.length !== 56 || evidenceRows.length !== 56) {
  throw new Error(`Stage 3H SP closeout count mismatch new=${newlyResolved.length} evidence=${evidenceRows.length}`);
}
if (targetIds.some((id) => unresolvedById.has(id))) throw new Error('Stage 3H SP target remains unresolved');
if (newlyResolved.some((row) => !targetIdSet.has(row.soldierId) || !row.isSp)) {
  throw new Error('Stage 3H admitted non-SP portrait');
}

const sourceCounts = Object.fromEntries(
  [...new Set(records.map((row) => row.sourceKind))]
    .sort()
    .map((kind) => [kind, records.filter((row) => row.sourceKind === kind).length]),
);

const output = {
  version: 7,
  stage: 'frontend-stage3h-sp-portrait-closeout',
  status: 'PASS',
  publicRoot: parent.publicRoot,
  assetsReady: true,
  policy: {
    ...parent.policy,
    spPortraitExpansion: 'Complete: exact ConfigDataSPSoldierInfo.ID population only.',
    spPortraitNormalReuse: false,
    spBwikiAdmission: 'SPSoldierInfo exact SP ID must be in v6 unresolved set; ConfigDataSoldierInfo exact SP ID supplies Chinese name + Model; BWIKI file must match the exact Chinese name as Q<name>.png or 士兵 <name>.png.',
    spBwikiAssetTransport: 'Prefer MediaWiki imageinfo; fall back only to Special:Redirect/file for the same exact file title; PNG bytes/signature/dimensions/SHA-256 are validated.',
    spNameSimilarityUsedForAdmission: false,
    spIdArithmeticUsedForAdmission: false,
    spNormalImageFallbackUsed: false,
    allNormalPortraitsResolved: true,
    allSpPortraitsResolved: true,
    allSoldierPortraitsResolved: true,
  },
  sources: {
    ...parent.sources,
    previousManifest: PARENT_MANIFEST_PATH,
    configDataSoldierInfo: SOLDIER_CONFIG_PATH,
    configDataSpSoldierInfo: SP_CONFIG_PATH,
    soldierDetail: DETAIL_PATH,
    bwikiApi: BWIKI_API,
    bwikiFileRedirect: BWIKI_FILE_REDIRECT,
    stage3hEvidence: EVIDENCE_PATH,
  },
  coverage: {
    canonicalSoldierCount: 224,
    canonicalNormalCount: 168,
    canonicalSpCount: 56,
    resolvedCount: 224,
    unresolvedCount: 0,
    resolvedNormalCount: 168,
    resolvedSpCount: 56,
    tier1Resolved: parent.coverage.tier1Resolved,
    tier2Resolved: parent.coverage.tier2Resolved,
    tier3Resolved: parent.coverage.tier3Resolved,
    newlyResolvedCount: 56,
    newlyResolvedSpCount: 56,
    remainingNormalUnresolvedCount: 0,
    remainingSpUnresolvedCount: 0,
    sourceCounts,
  },
  newlyResolvedSoldierIds: targetIds,
  records,
  unresolved,
};

const evidence = {
  version: 1,
  stage: 'soldier-portrait-stage3h-sp-evidence',
  status: 'PASS',
  targetCount: 56,
  passCount: evidenceRows.length,
  normalPortraitReuseCount: evidenceRows.filter((row) => row.normalPortraitReused).length,
  rows: evidenceRows,
};

await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(CHECKPOINT_PATH, [
  'Soldier Frontend Stage 3H — SP portrait closeout',
  'status: PASS',
  `parentManifest: ${PARENT_MANIFEST_PATH}`,
  'targetSpCount: 56',
  'resolvedThisStage: 56',
  'spResolved: 56/56',
  'normalResolved: 168/168',
  'overallResolved: 224/224',
  'overallUnresolved: 0/224',
  'identityRule: exact SPSoldierInfo.ID -> explicit NormalSoliderId relation validation -> ConfigDataSoldierInfo exact SP ID -> current Chinese name + Model -> BWIKI exact Chinese-name image file',
  'normalPortraitReuse: PROHIBITED / 0',
  'nameSimilarity: PROHIBITED',
  'idArithmetic: PROHIBITED',
  'result: ALL_SOLDIER_PORTRAITS_RESOLVED',
  '',
].join('\n'));

const frontendSource = await readFile(FRONTEND_RESOLVER_PATH, 'utf8');
if (!frontendSource.includes('soldier-portrait-manifest.v6.json')) {
  throw new Error('Frontend portrait resolver no longer imports v6; refusing blind replacement');
}
const nextFrontendSource = frontendSource.replace(
  'soldier-portrait-manifest.v6.json',
  'soldier-portrait-manifest.v7.json',
);
await writeFile(FRONTEND_RESOLVER_PATH, nextFrontendSource);

console.log('STAGE3H_SP_CLOSEOUT resolved=224 unresolved=0 normal=168 sp=56');
console.log(`STAGE3H_SP_IDS=${targetIds.join(',')}`);
