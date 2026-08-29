import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.HERO_JOB_TREE_QA_BASE_URL || 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/$/, '/');
const expectedSourceSha = process.env.HERO_JOB_TREE_QA_EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error('HERO_JOB_TREE_QA_EXPECTED_SOURCE_SHA is required');

const OUT_DIR = path.join(process.cwd(), 'test-results', 'hero-job-tree-hosted-qa');
fs.mkdirSync(OUT_DIR, { recursive: true });
const result = { status: 'RUNNING', baseUrl, expectedSourceSha, hosted: {}, browser: {}, checks: [] };

function check(id, pass, detail) {
  result.checks.push({ id, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`${id}: ${detail}`);
}

async function fetchOk(relative, options = {}) {
  const url = new URL(relative, baseUrl);
  const response = await fetch(url, { redirect: 'follow', ...options });
  return { url: url.href, response };
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
  result.hosted.deploymentReadyAttempt = await waitForDeployment();
  for (const relative of ['heroes/', 'heroes/6/', 'images/heroes/cards/6.png']) {
    const { url, response } = await fetchOk(relative, { cache: 'no-store' });
    check(`http-${relative}`, response.status === 200, `${url} -> ${response.status}`);
  }
}

async function validateDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: '레온' }).waitFor();
  const heading = page.getByRole('heading', { level: 2, name: '직업 트리 · 최종 스탯' });
  await heading.waitFor();
  const section = heading.locator('xpath=ancestor::section[1]');
  const branchCards = section.locator('article');
  const branchCount = await branchCards.count();
  check('desktop-job-branch-count-positive', branchCount > 0, `count=${branchCount}`);
  check('desktop-job-stage-node-visible', await section.getByText('단계 1', { exact: true }).count() >= 1, 'stage node visible');
  check('desktop-capstone-stats-visible', await section.getByText('최종 직업 검증 스탯', { exact: true }).count() >= 1, 'capstone stats label visible');
  check('desktop-job-id-visible', await section.getByText(/Job #\d+/).count() >= 1, 'job id provenance visible');
  check('desktop-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-hero-6-job-tree.png'), fullPage: true });
  result.browser.desktop = { branchCount, pageErrors };
  await context.close();
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' });
  const heading = page.getByRole('heading', { level: 2, name: '직업 트리 · 최종 스탯' });
  await heading.waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile-no-page-horizontal-overflow', overflow <= 1, `overflow=${overflow}`);
  check('mobile-job-stage-node-visible', await page.getByText('단계 1', { exact: true }).count() >= 1, 'stage node visible');
  check('mobile-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-hero-6-job-tree.png'), fullPage: true });
  result.browser.mobile = { overflow, pageErrors };
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
  result.status = 'PASS_HERO_JOB_TREE_HOSTED_BROWSER_QA';
} catch (error) {
  result.status = 'FAIL_HERO_JOB_TREE_HOSTED_BROWSER_QA';
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
