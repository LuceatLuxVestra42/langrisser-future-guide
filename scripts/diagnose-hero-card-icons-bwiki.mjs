import fs from 'node:fs';
import path from 'node:path';

const heroList = JSON.parse(fs.readFileSync('data/generated/hero-list-stage1.v1.json', 'utf8'));
if (heroList.status !== 'PASS' || heroList.completion !== 'COMPLETE' || heroList.summary?.generatedRecordCount !== 267 || heroList.summary?.hardErrorCount !== 0) {
  throw new Error('Frozen Hero list source is not production-ready.');
}

const API = 'https://wiki.biligame.com/langrisser/api.php';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'langrisser-future-guide/hero-card-icon-diagnostic',
          accept: 'application/json',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function resolveOne(hero) {
  const fileName = `头像 ${hero.identity.nameCn}.png`;
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|sha1',
    titles: `File:${fileName}`,
  });
  const url = `${API}?${query.toString()}`;
  try {
    const json = await fetchJsonWithRetry(url);
    const page = json?.query?.pages?.[0] ?? null;
    const image = page?.imageinfo?.[0] ?? null;
    if (!page || page.missing || !image?.url) {
      return {
        heroId: hero.heroId,
        nameKr: hero.identity.nameKr,
        nameCn: hero.identity.nameCn,
        requestedFileName: fileName,
        status: 'MISSING',
      };
    }
    return {
      heroId: hero.heroId,
      nameKr: hero.identity.nameKr,
      nameCn: hero.identity.nameCn,
      requestedFileName: fileName,
      resolvedTitle: page.title,
      status: 'RESOLVED',
      sourceUrl: image.url,
      width: image.width ?? null,
      height: image.height ?? null,
      mime: image.mime ?? null,
      sha1: image.sha1 ?? null,
    };
  } catch (error) {
    return {
      heroId: hero.heroId,
      nameKr: hero.identity.nameKr,
      nameCn: hero.identity.nameCn,
      requestedFileName: fileName,
      status: 'ERROR',
      error: String(error?.stack ?? error),
    };
  }
}

const records = [];
const concurrency = 8;
for (let offset = 0; offset < heroList.records.length; offset += concurrency) {
  const batch = heroList.records.slice(offset, offset + concurrency);
  records.push(...await Promise.all(batch.map(resolveOne)));
  process.stdout.write(`resolved ${Math.min(offset + batch.length, heroList.records.length)}/${heroList.records.length}\n`);
}

const resolved = records.filter((row) => row.status === 'RESOLVED');
const missing = records.filter((row) => row.status === 'MISSING');
const errors = records.filter((row) => row.status === 'ERROR');
const invalidShape = resolved.filter((row) => !Number.isFinite(row.width) || !Number.isFinite(row.height) || row.width <= 0 || row.height <= 0 || Math.abs(row.width - row.height) > 8);
const duplicateSourceUrls = [...new Map(resolved.map((row) => [row.sourceUrl, resolved.filter((other) => other.sourceUrl === row.sourceUrl)])).values()]
  .filter((group) => group.length > 1)
  .map((group) => group.map((row) => ({ heroId: row.heroId, nameCn: row.nameCn, sourceUrl: row.sourceUrl })));

const report = {
  version: 1,
  stage: 'hero-card-icon-bwiki-diagnostic',
  status: missing.length === 0 && errors.length === 0 && invalidShape.length === 0 && duplicateSourceUrls.length === 0 ? 'PASS' : 'PASS_WITH_REVIEW',
  source: {
    heroList: 'data/generated/hero-list-stage1.v1.json',
    heroCount: heroList.summary.generatedRecordCount,
    wikiApi: API,
    fileNameRule: '头像 {identity.nameCn}.png',
    mappingMode: 'EXACT_CN_FILENAME_ONLY',
    fuzzyMatching: false,
    rawConfigDataRead: false,
    semanticRelationReopened: false,
  },
  summary: {
    heroCount: heroList.records.length,
    resolvedCount: resolved.length,
    missingCount: missing.length,
    errorCount: errors.length,
    invalidShapeCount: invalidShape.length,
    duplicateSourceUrlGroupCount: duplicateSourceUrls.length,
  },
  missing,
  errors,
  invalidShape,
  duplicateSourceUrls,
  records,
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/hero-card-icon-bwiki-diagnostic.v1.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));

if (errors.length > 0) process.exitCode = 2;
