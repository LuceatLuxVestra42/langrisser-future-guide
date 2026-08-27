import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PARENT_MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v6.json';
const INVALID_MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v7.json';
const INVALID_EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3h-sp-evidence.v1.json';
const INVALID_CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3h-sp.txt';
const SOLDIER_CONFIG_PATH = 'data/configdata/ConfigDataSoldierInfo.json';
const SP_CONFIG_PATH = 'data/configdata/ConfigDataSPSoldierInfo.json';
const DETAIL_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v8.json';
const EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3i-sp-exact-evidence.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3i-sp-exact.txt';
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
    headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3I/1.0' },
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

async function resolveExactSpBwikiAsset(nameCn) {
  const fileName = `Q${nameCn}SP.png`;
  const title = `File:${fileName}`;
  const attempts = [];
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
      attempts.push({ method: 'MEDIAWIKI_IMAGEINFO', status: 'BAD_ASSET', error: asset.error, sourceUrl: info.url });
    } else {
      attempts.push({ method: 'MEDIAWIKI_IMAGEINFO', status: 'MISSING' });
    }
  } catch (error) {
    attempts.push({
      method: 'MEDIAWIKI_IMAGEINFO',
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const redirectUrl = `${BWIKI_FILE_REDIRECT}${encodeURIComponent(fileName)}`;
  const redirected = await tryPng(redirectUrl);
  if (redirected.ok) {
    return {
      title,
      fileName,
      resolution: 'MEDIAWIKI_SPECIAL_REDIRECT',
      apiUrl: null,
      sourceUrl: redirected.finalUrl ?? redirectUrl,
      bytes: redirected.bytes,
    };
  }
  attempts.push({
    method: 'MEDIAWIKI_SPECIAL_REDIRECT',
    status: 'ERROR',
    error: redirected.error,
    sourceUrl: redirectUrl,
    finalUrl: redirected.finalUrl,
  });

  throw new Error(`BWIKI exact SP-suffixed image unresolved for ${nameCn}: ${title} ${JSON.stringify(attempts)}`);
}

const parent = JSON.parse(await readFile(PARENT_MANIFEST_PATH, 'utf8'));
const soldierConfig = JSON.parse(await readFile(SOLDIER_CONFIG_PATH, 'utf8'));
const spConfig = JSON.parse(await readFile(SP_CONFIG_PATH, 'utf8'));
const detailJson = JSON.parse(await readFile(DETAIL_PATH, 'utf8'));
const detailRows = Array.isArray(detailJson) ? detailJson : detailJson.records;

if (parent.version !== 6) throw new Error(`Expected portrait manifest v6, got ${parent.version}`);
if (parent.coverage?.canonicalSoldierCount !== 224 || parent.coverage?.resolvedCount !== 168 || parent.coverage?.unresolvedCount !== 56) {
  throw new Error('Parent v6 coverage mismatch');
}
if (parent.coverage?.resolvedNormalCount !== 168 || parent.coverage?.resolvedSpCount !== 0) {
  throw new Error('Parent v6 normal/SP coverage mismatch');
}
if (!Array.isArray(spConfig) || spConfig.length !== 56) throw new Error('Expected exactly 56 SPSoldierInfo records');

const configById = new Map(soldierConfig.map((row) => [Number(row.ID), row]));
const detailById = new Map((detailRows ?? []).map((row) => [Number(row.soldierId), row]));
const spById = new Map(spConfig.map((row) => [Number(row.ID), row]));
const targetIds = [...spById.keys()].sort((a, b) => a - b);
const parentUnresolvedIds = parent.unresolved.map((row) => Number(row.soldierId)).sort((a, b) => a - b);
const parentRecordById = new Map(parent.records.map((row) => [Number(row.soldierId), row]));

if (spById.size !== 56) throw new Error(`SPSoldierInfo ID uniqueness mismatch ${spById.size}`);
if (parentUnresolvedIds.join(',') !== targetIds.join(',')) {
  throw new Error('Parent v6 unresolved set is not exactly the 56 SPSoldierInfo IDs');
}

const resolvedAssets = [];
for (const soldierId of targetIds) {
  const sp = spById.get(soldierId);
  const config = configById.get(soldierId);
  const unresolved = parent.unresolved.find((row) => Number(row.soldierId) === soldierId);
  const detail = detailById.get(soldierId);
  if (!sp || !config || !unresolved) throw new Error(`SP target source missing ${soldierId}`);

  const normalSoldierId = Number(sp.NormalSoliderId);
  const normalConfig = configById.get(normalSoldierId);
  const normalPortrait = parentRecordById.get(normalSoldierId);
  if (!Number.isInteger(normalSoldierId) || !normalConfig || !normalPortrait) {
    throw new Error(`Explicit SP-normal relation or resolved normal portrait missing ${soldierId} -> ${sp.NormalSoliderId}`);
  }

  const nameCn = config.Name ?? detail?.identity?.nameCn ?? null;
  const nameKr = detail?.identity?.nameKr ?? unresolved.nameKr ?? null;
  const model = config.Model ?? null;
  const model2 = config.Model2 ?? null;
  if (!nameCn || !model) throw new Error(`SP ConfigData identity/model incomplete ${soldierId}`);
  if (detail?.identity?.nameCn && detail.identity.nameCn !== nameCn) {
    throw new Error(`SP ConfigData/detail Chinese-name mismatch ${soldierId}`);
  }
  const modelStem = model.split('/').at(-2) ?? null;
  const prefab = model.split('/').at(-1) ?? null;
  if (!modelStem || !prefab) throw new Error(`SP malformed Model path ${soldierId}: ${model}`);

  const bwiki = await resolveExactSpBwikiAsset(nameCn);
  const bytes = bwiki.bytes;
  const dimensions = pngDimensions(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`SP PNG dimension parse failed ${soldierId}`);
  }
  const digest = sha256(bytes);
  if (digest === normalPortrait.sha256) {
    throw new Error(`SP exact-suffixed asset byte-identical to paired normal portrait ${soldierId} -> ${normalSoldierId}`);
  }

  resolvedAssets.push({
    soldierId,
    normalSoldierId,
    nameKr,
    nameCn,
    rank: Number(config.Rank) || null,
    model,
    model2,
    modelStem,
    prefab,
    modelLooksSp: model.includes('/SP/') || /(^|[/_])SP([/_]|$)/i.test(model),
    bwiki,
    bytes,
    dimensions,
    sha256: digest,
    normalPortraitSha256: normalPortrait.sha256,
    normalPortraitFileName: normalPortrait.fileName,
  });
  console.log(`SP_EXACT_DISCOVERED ${soldierId} ${nameCn} -> ${bwiki.title}`);
}

if (resolvedAssets.length !== 56) throw new Error(`Expected 56 exact SP assets, got ${resolvedAssets.length}`);
if (resolvedAssets.some((row) => row.bwiki.title !== `File:Q${row.nameCn}SP.png`)) {
  throw new Error('Non-exact SP-suffixed BWiki file title admitted');
}

await mkdir(PUBLIC_DIR, { recursive: true });
const records = parent.records.map((row) => ({ ...row }));
const evidenceRows = [];
for (const asset of resolvedAssets) {
  const fileName = `${asset.soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), asset.bytes);
  const record = {
    soldierId: asset.soldierId,
    nameKr: asset.nameKr,
    nameCn: asset.nameCn,
    tier: asset.rank,
    isSp: true,
    normalSoldierId: asset.normalSoldierId,
    sourceKind: 'BWIKI_CURRENT_CN_EXACT_Q_SP_PNG_STAGE3I',
    sourceUrl: asset.bwiki.sourceUrl,
    bwikiFileTitle: asset.bwiki.title,
    bwikiResolution: asset.bwiki.resolution,
    bwikiPageUrl: `https://wiki.biligame.com/langrisser/士兵/${encodeURIComponent(asset.nameCn)}`,
    model: asset.model,
    model2: asset.model2,
    modelStem: asset.modelStem,
    fileName,
    resolutionMethod: 'CANONICAL_SP_SOLDIER_ID_TO_SPSOLDIERINFO_EXPLICIT_RELATION_TO_CONFIGDATA_SP_RECORD_CN_MODEL_TO_BWIKI_EXACT_Q_CN_SP_IMAGE',
    size: asset.bytes.length,
    sha256: asset.sha256,
    width: asset.dimensions.width,
    height: asset.dimensions.height,
  };
  records.push(record);
  evidenceRows.push({
    soldierId: asset.soldierId,
    status: 'PASS',
    isSp: true,
    normalSoldierId: asset.normalSoldierId,
    nameKr: asset.nameKr,
    nameCn: asset.nameCn,
    rank: asset.rank,
    model: asset.model,
    model2: asset.model2,
    modelStem: asset.modelStem,
    prefab: asset.prefab,
    modelLooksSp: asset.modelLooksSp,
    bwikiFileTitle: asset.bwiki.title,
    bwikiResolution: asset.bwiki.resolution,
    bwikiApiUrl: asset.bwiki.apiUrl,
    bwikiPageUrl: record.bwikiPageUrl,
    sourceUrl: asset.bwiki.sourceUrl,
    fileName,
    byteSize: asset.bytes.length,
    sha256: asset.sha256,
    width: asset.dimensions.width,
    height: asset.dimensions.height,
    pairedNormalPortraitFileName: asset.normalPortraitFileName,
    pairedNormalPortraitSha256: asset.normalPortraitSha256,
    byteIdenticalToPairedNormal: false,
    identityBasis: 'SPSoldierInfo exact SP ID + explicit NormalSoliderId relation + ConfigDataSoldierInfo exact SP ID Chinese name and SP Model + exact BWiki Q<ChineseName>SP.png file title',
    normalPortraitReused: false,
  });
}

records.sort((a, b) => Number(a.soldierId) - Number(b.soldierId));
const recordIds = new Set(records.map((row) => Number(row.soldierId)));
if (records.length !== 224 || recordIds.size !== 224) throw new Error('Stage 3I full portrait record coverage mismatch');

const sourceCounts = Object.fromEntries(
  [...new Set(records.map((row) => row.sourceKind))]
    .sort()
    .map((kind) => [kind, records.filter((row) => row.sourceKind === kind).length]),
);

const output = {
  version: 8,
  stage: 'frontend-stage3i-sp-exact-portrait-correction',
  status: 'PASS',
  publicRoot: parent.publicRoot,
  assetsReady: true,
  correction: {
    invalidatedManifest: INVALID_MANIFEST_PATH,
    reason: 'Stage 3H used base Q<ChineseName>.png files. Current BWIKI Hero build pages expose SP Soldier portraits as Q<ChineseName>SP.png, so base-name images are not admissible as SP-specific portrait evidence.',
    invalidatedArtifactsRemovedFromCurrentTree: true,
  },
  policy: {
    ...parent.policy,
    spPortraitExpansion: 'Complete: exact ConfigDataSPSoldierInfo.ID population only.',
    spPortraitNormalReuse: false,
    spBwikiAdmission: 'Only exact File:Q<ConfigDataSoldierInfo.Name>SP.png is admissible for SP portrait bytes.',
    spBwikiAssetTransport: 'Prefer MediaWiki imageinfo; fall back only to Special:Redirect/file for the exact same Q<ChineseName>SP.png title.',
    spNameSimilarityUsedForAdmission: false,
    spIdArithmeticUsedForAdmission: false,
    spNormalImageFallbackUsed: false,
    baseBwikiQNameImageUsedForSp: false,
    pairedNormalByteHashCollisionAllowed: false,
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
    stage3iEvidence: EVIDENCE_PATH,
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
  unresolved: [],
};

const evidence = {
  version: 1,
  stage: 'soldier-portrait-stage3i-sp-exact-evidence',
  status: 'PASS',
  targetCount: 56,
  passCount: evidenceRows.length,
  exactSpSuffixFileCount: evidenceRows.filter((row) => row.bwikiFileTitle === `File:Q${row.nameCn}SP.png`).length,
  basePortraitFilenameUsedCount: 0,
  normalPortraitReuseCount: 0,
  pairByteHashCollisionCount: evidenceRows.filter((row) => row.byteIdenticalToPairedNormal).length,
  rows: evidenceRows,
};

await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(CHECKPOINT_PATH, [
  'Soldier Frontend Stage 3I — exact SP portrait correction closeout',
  'status: PASS',
  `parentManifest: ${PARENT_MANIFEST_PATH}`,
  `invalidatedManifest: ${INVALID_MANIFEST_PATH}`,
  'correction: Stage 3H base Q<name>.png admission rejected; exact Q<name>SP.png required',
  'targetSpCount: 56',
  'resolvedThisStage: 56',
  'spResolved: 56/56',
  'normalResolved: 168/168',
  'overallResolved: 224/224',
  'overallUnresolved: 0/224',
  'exactSpSuffixFileCount: 56',
  'basePortraitFilenameUsedCount: 0',
  'normalPortraitReuse: PROHIBITED / 0',
  'pairByteHashCollisionCount: 0',
  'identityRule: exact SPSoldierInfo.ID -> explicit NormalSoliderId relation -> ConfigDataSoldierInfo exact SP ID current Chinese name + Model -> BWiki exact Q<ChineseName>SP.png',
  'nameSimilarity: PROHIBITED',
  'idArithmetic: PROHIBITED',
  'result: ALL_SP_SPECIFIC_PORTRAITS_RESOLVED',
  '',
].join('\n'));

const frontendSource = await readFile(FRONTEND_RESOLVER_PATH, 'utf8');
const currentImport = frontendSource.includes('soldier-portrait-manifest.v7.json')
  ? 'soldier-portrait-manifest.v7.json'
  : frontendSource.includes('soldier-portrait-manifest.v6.json')
    ? 'soldier-portrait-manifest.v6.json'
    : null;
if (!currentImport) throw new Error('Frontend portrait resolver import is neither v6 nor invalidated v7');
await writeFile(
  FRONTEND_RESOLVER_PATH,
  frontendSource.replace(currentImport, 'soldier-portrait-manifest.v8.json'),
);

await rm(INVALID_MANIFEST_PATH, { force: true });
await rm(INVALID_EVIDENCE_PATH, { force: true });
await rm(INVALID_CHECKPOINT_PATH, { force: true });

console.log('STAGE3I_SP_EXACT_CLOSEOUT resolved=224 unresolved=0 normal=168 sp=56 exactSpSuffix=56');
console.log(`STAGE3I_SP_IDS=${targetIds.join(',')}`);
