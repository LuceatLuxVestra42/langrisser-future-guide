import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const baseUrl = (process.env.HERO_ARTWORK_QA_BASE_URL || 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/$/, '/');
const expectedSourceSha = process.env.HERO_ARTWORK_QA_EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error('HERO_ARTWORK_QA_EXPECTED_SOURCE_SHA is required');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'test-results', 'hero-artwork-hosted-qa');
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = {
  status: 'RUNNING',
  baseUrl,
  expectedSourceSha,
  hosted: {},
  browser: {},
  checks: [],
};

function check(id, pass, detail) {
  result.checks.push({ id, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`${id}: ${detail}`);
}

async function fetchOk(relative, options = {}) {
  const url = new URL(relative, baseUrl);
  const response = await fetch(url, { redirect: 'follow', ...options });
  return { url: url.href, response };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

async function waitForDeployment() {
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    try {
      const { response } = await fetchOk('qa-main-source.txt', { cache: 'no-store' });
      const text = response.ok ? (await response.text()).trim() : '';
      if (text === expectedSourceSha) return attempt;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`deployed source marker did not reach ${expectedSourceSha}`);
}

async function validateHosted() {
  const attempts = await waitForDeployment();
  result.hosted.deploymentReadyAttempt = attempts;

  for (const relative of ['', 'heroes/', 'heroes/6/', 'heroes/99204/']) {
    const { url, response } = await fetchOk(relative, { cache: 'no-store' });
    check(`http-${relative || 'root'}`, response.status === 200, `${url} -> ${response.status}`);
  }

  const heroIds = fs.readdirSync(path.join(ROOT, 'public', 'images', 'heroes', 'cards'))
    .filter((name) => /^\d+\.png$/.test(name))
    .map((name) => name.replace(/\.png$/, ''))
    .sort((a, b) => Number(a) - Number(b));
  check('local-hero-png-count', heroIds.length === 267, `count=${heroIds.length}`);

  let hostedOk = 0;
  const concurrency = 16;
  for (let i = 0; i < heroIds.length; i += concurrency) {
    const batch = heroIds.slice(i, i + concurrency);
    const responses = await Promise.all(batch.map(async (id) => {
      const { response } = await fetchOk(`images/heroes/cards/${id}.png`, { method: 'HEAD', cache: 'no-store' });
      return { id, status: response.status, contentType: response.headers.get('content-type') || '' };
    }));
    for (const item of responses) {
      if (item.status === 200 && item.contentType.toLowerCase().includes('image/png')) hostedOk += 1;
      else throw new Error(`hero asset HEAD failed id=${item.id} status=${item.status} type=${item.contentType}`);
    }
  }
  result.hosted.assetHeadPassCount = hostedOk;
  check('hosted-267-png-head', hostedOk === 267, `passed=${hostedOk}`);

  for (const id of ['6', '99204']) {
    const local = fs.readFileSync(path.join(ROOT, 'public', 'images', 'heroes', 'cards', `${id}.png`));
    const { response } = await fetchOk(`images/heroes/cards/${id}.png`, { cache: 'no-store' });
    check(`asset-get-${id}`, response.status === 200, `status=${response.status}`);
    const remote = Buffer.from(await response.arrayBuffer());
    const localHash = sha256(local);
    const remoteHash = sha256(remote);
    check(`asset-sha-${id}`, localHash === remoteHash, `${remoteHash} == ${localHash}`);
  }
}

async function imageLoaded(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.evaluate((img) => {
    if (!(img instanceof HTMLImageElement)) throw new Error('target is not an image');
    if (img.complete && img.naturalWidth > 0) return;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`image load timeout: ${img.src}`)), 15000);
      img.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`image failed: ${img.src}`)); }, { once: true });
    });
  });
  const state = await locator.evaluate((img) => ({ src: img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }));
  check(`image-loaded-${state.src}`, state.naturalWidth > 0 && state.naturalHeight > 0, JSON.stringify(state));
  return state;
}

async function validateDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(new URL('heroes/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.locator('h1').filter({ hasText: '영웅' }).waitFor();
  const lazyCount = await page.locator('section[aria-label="영웅 목록"] img[loading="lazy"]').count();
  check('desktop-lazy-image-dom-count', lazyCount === 267, `count=${lazyCount}`);
  check('desktop-no-stale-placeholder-copy', !(await page.getByText(/나머지는 placeholder/).count()), 'stale placeholder copy absent');

  await page.locator('#hero-search').fill('레온');
  const leonLink = page.getByRole('link', { name: /레온 .*상세 보기/ }).first();
  await leonLink.waitFor();
  const leonListImage = leonLink.locator('img').first();
  const leonListState = await imageLoaded(leonListImage);
  check('desktop-leon-list-src', leonListState.src.endsWith('/langrisser-future-guide/images/heroes/cards/6.png'), leonListState.src);
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-heroes-leon.png'), fullPage: false });

  await leonLink.click();
  await page.waitForURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  await page.getByRole('heading', { level: 1, name: '레온' }).waitFor();
  const leonDetail = page.locator('img[src*="/images/heroes/cards/6.png"]').first();
  await imageLoaded(leonDetail);
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-hero-6.png'), fullPage: false });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: '레온' }).waitFor();
  await imageLoaded(page.locator('img[src*="/images/heroes/cards/6.png"]').first());

  await page.goto(new URL('heroes/99204/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: '타탈리아' }).waitFor();
  const beginImage = page.locator('img[src*="/images/heroes/cards/99204.png"]').first();
  const beginState = await imageLoaded(beginImage);
  check('desktop-begin-owner-src', beginState.src.endsWith('/langrisser-future-guide/images/heroes/cards/99204.png'), beginState.src);
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-hero-99204.png'), fullPage: false });

  check('desktop-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  result.browser.desktop = { lazyCount, pageErrors };
  await context.close();
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(new URL('heroes/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.locator('#hero-search').fill('타탈리아');
  const link = page.getByRole('link', { name: /타탈리아 .*상세 보기/ }).first();
  await link.waitFor();
  await imageLoaded(link.locator('img').first());
  const listOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile-list-no-horizontal-overflow', listOverflow <= 1, `overflow=${listOverflow}`);
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-heroes-99204.png'), fullPage: false });

  await link.click();
  await page.waitForURL(/\/langrisser-future-guide\/heroes\/99204\/?$/);
  await page.getByRole('heading', { level: 1, name: '타탈리아' }).waitFor();
  await imageLoaded(page.locator('img[src*="/images/heroes/cards/99204.png"]').first());
  const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile-detail-no-horizontal-overflow', detailOverflow <= 1, `overflow=${detailOverflow}`);
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-hero-99204.png'), fullPage: false });

  check('mobile-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  result.browser.mobile = { listOverflow, detailOverflow, pageErrors };
  await context.close();
}

try {
  await validateHosted();
  const browser = await chromium.launch({ headless: true });
  try {
    await validateDesktop(browser);
    await validateMobile(browser);
  } finally {
    await browser.close();
  }
  result.status = 'PASS_HERO_ARTWORK_HOSTED_BROWSER_QA';
} catch (error) {
  result.status = 'FAIL_HERO_ARTWORK_HOSTED_BROWSER_QA';
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  throw error;
} finally {
  result.summary = {
    checkCount: result.checks.length,
    passed: result.checks.filter((row) => row.pass).length,
    failed: result.checks.filter((row) => !row.pass).length,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
