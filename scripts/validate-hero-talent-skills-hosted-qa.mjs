import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.HERO_TALENT_SKILL_QA_BASE_URL || 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/$/, '/');
const expectedSourceSha = process.env.HERO_TALENT_SKILL_QA_EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error('HERO_TALENT_SKILL_QA_EXPECTED_SOURCE_SHA is required');

const OUT_DIR = path.join(process.cwd(), 'test-results', 'hero-talent-skills-hosted-qa');
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

  const talentHeading = page.getByRole('heading', { level: 2, name: '재능' });
  await talentHeading.waitFor();
  const talentSection = talentHeading.locator('xpath=ancestor::section[1]');
  const talentCards = talentSection.locator('article');
  check('desktop-talent-card-count', await talentCards.count() === 6, `count=${await talentCards.count()}`);
  check('desktop-talent-six-star', await talentSection.getByText(/6성 · 传说的骑士/).count() === 1, 'Leon 6-star talent visible');

  const skillHeading = page.getByRole('heading', { level: 2, name: '스킬' });
  await skillHeading.waitFor();
  const skillSection = skillHeading.locator('xpath=ancestor::section[1]');
  const skillCards = skillSection.locator('article');
  check('desktop-skill-card-count', await skillCards.count() === 9, `count=${await skillCards.count()}`);
  check('desktop-direct-skill-group', await skillSection.getByText('기본 보유 스킬', { exact: true }).count() === 1, 'direct group visible');
  check('desktop-job-skill-group', await skillSection.getByText('전직 습득 스킬', { exact: true }).count() === 1, 'job group visible');
  check('desktop-leon-direct-skill', await skillSection.getByText('突击', { exact: true }).count() >= 1, 'direct skill 突击 visible');
  check('desktop-leon-super-buff', await skillSection.getByText('帝国冲锋', { exact: true }).count() >= 1, 'job skill 帝国冲锋 visible');

  const bodyText = await page.locator('body').innerText();
  check('desktop-no-config-color-markup', !bodyText.includes('<color='), 'raw ConfigData color tags absent');
  check('desktop-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-hero-6-talent-skills.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 2, name: '재능' }).waitFor();
  await page.getByRole('heading', { level: 2, name: '스킬' }).waitFor();
  result.browser.desktop = { talentCards: 6, skillCards: 9, pageErrors };
  await context.close();
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 2, name: '재능' }).waitFor();
  await page.getByRole('heading', { level: 2, name: '스킬' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile-no-horizontal-overflow', overflow <= 1, `overflow=${overflow}`);
  check('mobile-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-hero-6-talent-skills.png'), fullPage: true });
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
  result.status = 'PASS_HERO_TALENT_SKILLS_HOSTED_BROWSER_QA';
} catch (error) {
  result.status = 'FAIL_HERO_TALENT_SKILLS_HOSTED_BROWSER_QA';
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
