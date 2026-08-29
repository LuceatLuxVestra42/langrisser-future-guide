import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.HERO_HEADER_QA_BASE_URL || 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/$/, '/');
const expectedSourceSha = process.env.HERO_HEADER_QA_EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error('HERO_HEADER_QA_EXPECTED_SOURCE_SHA is required');

const outDir = path.join(process.cwd(), 'test-results', 'hero-detail-header-hosted-qa');
fs.mkdirSync(outDir, { recursive: true });

const result = { status: 'RUNNING', baseUrl, expectedSourceSha, hosted: {}, browser: {}, checks: [] };

function check(id, pass, detail) {
  result.checks.push({ id, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`${id}: ${detail}`);
}

async function fetchRelative(relative, options = {}) {
  const url = new URL(relative, baseUrl);
  const response = await fetch(url, { redirect: 'follow', ...options });
  return { url: url.href, response };
}

async function waitForDeployment() {
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    try {
      const { response } = await fetchRelative('qa-main-source.txt', { cache: 'no-store' });
      const text = response.ok ? (await response.text()).trim() : '';
      if (text === expectedSourceSha) return attempt;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`deployed source marker did not reach ${expectedSourceSha}`);
}

async function validateHosted() {
  result.hosted.deploymentReadyAttempt = await waitForDeployment();
  for (const relative of ['heroes/', 'heroes/6/', 'images/heroes/cards/6.png']) {
    const { url, response } = await fetchRelative(relative, { cache: 'no-store' });
    check(`http-${relative}`, response.status === 200, `${url} -> ${response.status}`);
  }
}

async function waitImage(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  return locator.evaluate((img) => {
    if (!(img instanceof HTMLImageElement)) throw new Error('target is not an image');
    if (img.complete && img.naturalWidth > 0) return { src: img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`image timeout: ${img.src}`)), 15000);
      img.addEventListener('load', () => { clearTimeout(timeout); resolve({ src: img.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`image failed: ${img.src}`)); }, { once: true });
    });
  });
}

async function assertHeader(page, mode) {
  await page.getByRole('heading', { level: 1, name: '레온' }).waitFor({ timeout: 15000 });
  check(`${mode}-hero-id`, await page.getByText('Hero #6', { exact: true }).count() === 1, 'Hero #6');
  check(`${mode}-cn-name`, await page.getByText('利昂', { exact: true }).count() >= 1, '利昂');
  check(`${mode}-rarity`, await page.getByText('SSR', { exact: true }).count() >= 1, 'SSR badge');
  check(`${mode}-faction-label`, await page.getByText('진영', { exact: true }).count() >= 1, 'faction block');
  check(`${mode}-origin-label`, await page.getByText('출전작', { exact: true }).count() >= 1, 'origin block');
  check(`${mode}-cv-label`, await page.getByText('성우', { exact: true }).count() >= 1, 'CV block');
  check(`${mode}-job-chip`, await page.getByText(/^직업 분기 \d+$/).count() >= 1, 'job branch chip');
  check(`${mode}-soldier-chip`, await page.getByText(/^용병 \d+$/).count() >= 1, 'soldier count chip');
  check(`${mode}-skin-chip`, await page.getByText(/^스킨 \d+$/).count() >= 1, 'skin count chip');

  const image = page.locator('img[src*="/images/heroes/cards/6.png"]').first();
  const state = await waitImage(image);
  check(`${mode}-art-src`, state.src.endsWith('/langrisser-future-guide/images/heroes/cards/6.png'), state.src);
  const art = await image.evaluate((img) => {
    const style = getComputedStyle(img);
    const parent = img.parentElement;
    return {
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      imageRect: img.getBoundingClientRect().toJSON(),
      parentRect: parent?.getBoundingClientRect().toJSON() ?? null,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };
  });
  check(`${mode}-object-fit-contain`, art.objectFit === 'contain', JSON.stringify(art));
  check(`${mode}-object-position-bottom`, art.objectPosition.toLowerCase().includes('bottom') || art.objectPosition.endsWith('100%'), JSON.stringify(art));
  return art;
}

async function validateDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(new URL('heroes/', baseUrl).href, { waitUntil: 'networkidle' });
  check('desktop-current-artwork-copy', await page.getByText('공식 초상화 267명 연결', { exact: true }).count() === 1, 'current list copy');
  check('desktop-no-stale-copy', await page.getByText(/나머지는 placeholder/).count() === 0, 'stale copy absent');
  await page.locator('#hero-search').fill('레온');
  const link = page.getByRole('link', { name: /레온 .*상세 보기/ }).first();
  await link.waitFor();
  await link.click();
  await page.waitForURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  const art = await assertHeader(page, 'desktop');
  check('desktop-art-panel-height', Number(art.parentRect?.height ?? 0) >= 600, JSON.stringify(art.parentRect));
  await page.screenshot({ path: path.join(outDir, 'desktop-hero-6-header.png'), fullPage: false });

  await page.reload({ waitUntil: 'networkidle' });
  await assertHeader(page, 'desktop-reload');
  check('desktop-page-errors', errors.length === 0, JSON.stringify(errors));
  result.browser.desktop = { errors, artPanelHeight: art.parentRect?.height ?? null };
  await context.close();
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' });
  const art = await assertHeader(page, 'mobile');
  check('mobile-art-panel-height', Number(art.parentRect?.height ?? 0) >= 400, JSON.stringify(art.parentRect));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile-no-horizontal-overflow', overflow <= 1, `overflow=${overflow}`);
  await page.screenshot({ path: path.join(outDir, 'mobile-hero-6-header.png'), fullPage: false });

  const back = page.getByRole('link', { name: '영웅 목록' }).first();
  await back.click();
  await page.waitForURL(/\/langrisser-future-guide\/heroes\/?$/);
  await page.getByRole('heading', { level: 1, name: '영웅' }).waitFor();
  check('mobile-page-errors', errors.length === 0, JSON.stringify(errors));
  result.browser.mobile = { errors, overflow, artPanelHeight: art.parentRect?.height ?? null };
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
  result.status = 'PASS_HERO_DETAIL_HEADER_HOSTED_BROWSER_QA';
} catch (error) {
  result.status = 'FAIL_HERO_DETAIL_HEADER_HOSTED_BROWSER_QA';
  result.error = error instanceof Error ? error.stack || error.message : String(error);
  throw error;
} finally {
  result.summary = {
    checkCount: result.checks.length,
    passed: result.checks.filter((row) => row.pass).length,
    failed: result.checks.filter((row) => !row.pass).length,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
