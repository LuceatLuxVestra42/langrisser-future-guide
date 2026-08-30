import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const heroList = JSON.parse(fs.readFileSync('data/generated/hero-list-stage1.v1.json', 'utf8'));
const diagnostic = JSON.parse(fs.readFileSync('data/validation/hero-card-icon-bwiki-diagnostic.v1.json', 'utf8'));

if (
  heroList.status !== 'PASS' ||
  heroList.completion !== 'COMPLETE' ||
  heroList.summary?.generatedRecordCount !== 267 ||
  heroList.summary?.hardErrorCount !== 0 ||
  heroList.records?.length !== 267
) {
  throw new Error('Frozen Hero list source is not production-ready.');
}

if (
  diagnostic.status !== 'PASS' ||
  diagnostic.summary?.heroCount !== 267 ||
  diagnostic.summary?.resolvedCount !== 267 ||
  diagnostic.summary?.missingCount !== 0 ||
  diagnostic.summary?.errorCount !== 0 ||
  diagnostic.summary?.invalidShapeCount !== 0 ||
  diagnostic.summary?.duplicateSourceUrlGroupCount !== 0 ||
  diagnostic.source?.mappingMode !== 'EXACT_CN_FILENAME_ONLY' ||
  diagnostic.source?.fuzzyMatching !== false ||
  diagnostic.source?.rawConfigDataRead !== false ||
  diagnostic.source?.semanticRelationReopened !== false
) {
  throw new Error('BWIKI Hero card icon diagnostic is not frozen-ready.');
}

const heroById = new Map(heroList.records.map((hero) => [hero.heroId, hero]));
const rows = diagnostic.records;
if (rows.length !== 267 || new Set(rows.map((row) => row.heroId)).size !== 267) {
  throw new Error('Diagnostic Hero population is not exactly 267 unique IDs.');
}

for (const row of rows) {
  const hero = heroById.get(row.heroId);
  if (!hero || hero.identity.nameCn !== row.nameCn || row.status !== 'RESOLVED') {
    throw new Error(`Hero ${row.heroId} diagnostic identity/parity mismatch.`);
  }
  if (row.requestedFileName !== `头像 ${hero.identity.nameCn}.png`) {
    throw new Error(`Hero ${row.heroId} exact BWIKI filename mismatch.`);
  }
}

const OUT_DIR = 'public/images/heroes/card-icons';
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'user-agent': 'langrisser-future-guide/hero-card-icon-acquisition',
          accept: 'image/png,image/*;q=0.8,*/*;q=0.1',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(700 * attempt);
    }
  }
  throw lastError;
}

function readPngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Downloaded asset is not a valid PNG with IHDR.');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function acquire(row) {
  const hero = heroById.get(row.heroId);
  const bytes = await downloadWithRetry(row.sourceUrl);
  const sourceSha1 = crypto.createHash('sha1').update(bytes).digest('hex');
  if (sourceSha1 !== row.sha1) {
    throw new Error(`Hero ${row.heroId} source SHA-1 mismatch: ${sourceSha1} != ${row.sha1}`);
  }
  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== row.width || dimensions.height !== row.height || Math.abs(dimensions.width - dimensions.height) > 8) {
    throw new Error(`Hero ${row.heroId} PNG dimension mismatch: ${dimensions.width}x${dimensions.height}`);
  }

  const expectedFilePath = `${OUT_DIR}/${row.heroId}.png`;
  fs.writeFileSync(expectedFilePath, bytes);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  return {
    heroId: row.heroId,
    nameKr: hero.identity.nameKr,
    nameCn: hero.identity.nameCn,
    sourceTitle: row.resolvedTitle,
    sourceUrl: row.sourceUrl,
    sourceSha1: row.sha1,
    width: dimensions.width,
    height: dimensions.height,
    expectedFilePath,
    webAssetPath: `/images/heroes/card-icons/${row.heroId}.png`,
    assetStatus: 'RESOLVED',
    sha256,
    byteLength: bytes.length,
  };
}

const acquired = [];
const concurrency = 12;
for (let offset = 0; offset < rows.length; offset += concurrency) {
  const batch = rows.slice(offset, offset + concurrency);
  acquired.push(...await Promise.all(batch.map(acquire)));
  process.stdout.write(`acquired ${Math.min(offset + batch.length, rows.length)}/${rows.length}\n`);
}
acquired.sort((a, b) => a.heroId - b.heroId);

const fileCount = fs.readdirSync(OUT_DIR).filter((name) => /^\d+\.png$/.test(name)).length;
const uniqueHeroIds = new Set(acquired.map((row) => row.heroId)).size;
const uniqueSourceUrls = new Set(acquired.map((row) => row.sourceUrl)).size;
const hardErrorCount = fileCount === 267 && acquired.length === 267 && uniqueHeroIds === 267 && uniqueSourceUrls === 267 ? 0 : 1;
if (hardErrorCount !== 0) {
  throw new Error(`Hero card icon acquisition integrity failure: files=${fileCount}, records=${acquired.length}, ids=${uniqueHeroIds}, urls=${uniqueSourceUrls}`);
}

const manifest = {
  version: 1,
  stage: 'hero-card-icon-assets',
  schemaId: 'hero-card-icon-assets/v1',
  status: 'PASS',
  completion: 'COMPLETE',
  freezeState: 'HERO_CARD_ICON_ASSETS_FROZEN',
  sourcePolicy: {
    heroListStage1FrozenOnly: true,
    bwikiExactCnFileOnly: true,
    mappingMode: 'EXACT_CN_FILENAME_ONLY',
    rawConfigDataRead: false,
    fuzzyMatching: false,
    nameSimilarityJoin: false,
    idArithmetic: false,
    semanticRelationReopened: false,
    remoteRuntimeHotlink: false,
  },
  source: {
    diagnostic: 'data/validation/hero-card-icon-bwiki-diagnostic.v1.json',
    upstreamHeroList: 'data/generated/hero-list-stage1.v1.json',
    provider: 'BWIKI / patchwiki.biligame.com',
    webAssetRoot: '/images/heroes/card-icons',
    localAssetRoot: OUT_DIR,
  },
  summary: {
    heroCount: 267,
    resolvedCount: acquired.length,
    fileCount,
    uniqueHeroIdCount: uniqueHeroIds,
    uniqueSourceUrlCount: uniqueSourceUrls,
    pendingCount: 0,
    hardErrorCount,
  },
  records: acquired,
};

const validation = {
  version: 1,
  stage: 'hero-card-icon-assets-validation',
  status: 'PASS',
  completion: 'COMPLETE',
  sourceManifest: 'data/generated/hero-card-icon-assets.v1.json',
  checks: {
    canonicalHeroCount: 267,
    exactCnFilenameResolved: 267,
    localPngCount: fileCount,
    sourceSha1Verified: 267,
    squareImageVerified: 267,
    uniqueHeroIdCount: uniqueHeroIds,
    uniqueSourceUrlCount: uniqueSourceUrls,
    remoteRuntimeHotlink: false,
    rawConfigDataRead: false,
    semanticRelationReopened: false,
  },
  hardErrorCount,
};

fs.mkdirSync('data/generated', { recursive: true });
fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/generated/hero-card-icon-assets.v1.json', `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync('data/validation/hero-card-icon-assets.v1.json', `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(manifest.summary));
