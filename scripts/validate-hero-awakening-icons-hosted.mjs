#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.HOSTED_BASE_URL;
const EXPECTED_SOURCE_SHA = process.env.EXPECTED_SOURCE_SHA;
if (!BASE_URL) throw new Error('HOSTED_BASE_URL is required');
if (!/^[0-9a-f]{40}$/i.test(EXPECTED_SOURCE_SHA ?? '')) throw new Error('EXPECTED_SOURCE_SHA must be a 40-character Git SHA');

const manifest = JSON.parse(fs.readFileSync('data/generated/hero-skill-icon-assets.v1.json', 'utf8'));
const admitted = [...manifest.records, ...manifest.awakeningRecords];
const bySourcePath = new Map(admitted.map((row) => [row.sourcePath, row]));

const fixtures = [
  { heroId: 14, sourcePath: 'UI/Icon/Skill_ABS/Skill_Super1.png', family: 'Skill_ABS' },
  { heroId: 99269, sourcePath: 'UI/Icon/Skill2_ABS/Skil_Klaudia_4.png', family: 'Skill2_ABS' },
  { heroId: 99264, sourcePath: 'UI/Icon/Item05_ABS/Skill_HeavenDefier_3_1.png', family: 'Item05_ABS' },
].map((fixture) => {
  const record = bySourcePath.get(fixture.sourcePath);
  if (!record) throw new Error(`Fixture sourcePath is not admitted: ${fixture.sourcePath}`);
  return { ...fixture, publicPath: record.publicPath };
});

const base = new URL(BASE_URL);
const expectedRepositoryBase = '/langrisser-future-guide/';
if (base.origin !== 'https://luceatluxvestra42.github.io' || base.pathname !== expectedRepositoryBase) {
  throw new Error(`Unexpected hosted base: ${BASE_URL}`);
}

const manifestResponse = await fetch(new URL(`authoritative-pages-source.json?awakeningQa=${Date.now()}`, base), {
  headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
});
if (!manifestResponse.ok) throw new Error(`Hosted source manifest returned ${manifestResponse.status}`);
const deployed = await manifestResponse.json();
if (String(deployed.sourceSha).toLowerCase() !== EXPECTED_SOURCE_SHA.toLowerCase()) {
  throw new Error(`Hosted source mismatch: expected=${EXPECTED_SOURCE_SHA} actual=${deployed.sourceSha}`);
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const fixture of fixtures) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const pageUrl = new URL(`heroes/${fixture.heroId}/?awakeningQa=${Date.now()}-${fixture.heroId}`, base).toString();
    const response = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
    if (!response || response.status() !== 200) throw new Error(`Hero ${fixture.heroId} page status ${response?.status() ?? 0}`);

    const section = page.locator('[data-hero-awakening-skill="true"]');
    await section.waitFor({ state: 'visible', timeout: 15000 });
    await section.scrollIntoViewIfNeeded();
    const image = section.locator('img').first();
    await image.waitFor({ state: 'visible', timeout: 15000 });

    const expectedPath = `${expectedRepositoryBase.replace(/\/$/, '')}${fixture.publicPath}`;
    const imageState = await image.evaluate((node) => ({
      srcAttr: node.getAttribute('src'),
      currentSrc: node.currentSrc,
      complete: node.complete,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
    }));
    const currentUrl = new URL(imageState.currentSrc, base);
    if (currentUrl.origin !== base.origin || currentUrl.pathname !== expectedPath) {
      throw new Error(`Hero ${fixture.heroId} icon URL mismatch: expected=${expectedPath} actual=${currentUrl.pathname}`);
    }
    if (!imageState.complete || imageState.naturalWidth <= 0 || imageState.naturalHeight <= 0) {
      throw new Error(`Hero ${fixture.heroId} awakening icon did not decode`);
    }

    const assetResponse = await context.request.get(imageState.currentSrc, {
      headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
      timeout: 15000,
    });
    const contentType = assetResponse.headers()['content-type'] ?? '';
    if (!assetResponse.ok() || !/^image\/png\b/i.test(contentType)) {
      throw new Error(`Hero ${fixture.heroId} icon response invalid: status=${assetResponse.status()} contentType=${contentType}`);
    }
    if (pageErrors.length || consoleErrors.length) {
      throw new Error(`Hero ${fixture.heroId} browser errors: ${JSON.stringify({ pageErrors, consoleErrors })}`);
    }

    results.push({
      heroId: fixture.heroId,
      family: fixture.family,
      sourcePath: fixture.sourcePath,
      publicPath: fixture.publicPath,
      status: response.status(),
      assetStatus: assetResponse.status(),
      naturalWidth: imageState.naturalWidth,
      naturalHeight: imageState.naturalHeight,
    });
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobileContext.newPage();
  const mobileUrl = new URL(`heroes/14/?awakeningQa=mobile-${Date.now()}`, base).toString();
  const mobileResponse = await mobilePage.goto(mobileUrl, { waitUntil: 'networkidle', timeout: 30000 });
  if (!mobileResponse || mobileResponse.status() !== 200) throw new Error(`Mobile Hero 14 page status ${mobileResponse?.status() ?? 0}`);
  const mobileSection = mobilePage.locator('[data-hero-awakening-skill="true"]');
  await mobileSection.waitFor({ state: 'visible', timeout: 15000 });
  await mobileSection.scrollIntoViewIfNeeded();
  const mobileImage = mobileSection.locator('img').first();
  await mobileImage.waitFor({ state: 'visible', timeout: 15000 });
  const mobileBox = await mobileImage.boundingBox();
  if (!mobileBox || mobileBox.width <= 0 || mobileBox.height <= 0 || mobileBox.x < 0 || mobileBox.x + mobileBox.width > 390) {
    throw new Error(`Mobile awakening icon layout invalid: ${JSON.stringify(mobileBox)}`);
  }
  await mobileContext.close();

  console.log(JSON.stringify({
    checkpoint: 'AWAKENING_ICON_A9_BROWSER_UI',
    status: 'PASS',
    completion: 'COMPLETE',
    expectedSourceSha: EXPECTED_SOURCE_SHA.toLowerCase(),
    fixtureCount: results.length,
    families: results.map((row) => row.family),
    desktopResults: results,
    mobileHeroId: 14,
    mobileViewport: { width: 390, height: 844 },
    semanticReopen: false,
  }, null, 2));
} finally {
  await browser.close();
}
