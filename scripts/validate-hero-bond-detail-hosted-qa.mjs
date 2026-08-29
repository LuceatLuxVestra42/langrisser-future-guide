import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.HERO_BOND_QA_BASE_URL || 'https://luceatluxvestra42.github.io/langrisser-future-guide/').replace(/\/$/, '/');
const expectedSourceSha = process.env.HERO_BOND_QA_EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error('HERO_BOND_QA_EXPECTED_SOURCE_SHA is required');
const outDir = path.join(process.cwd(), 'test-results', 'hero-bond-detail-hosted-qa');
fs.mkdirSync(outDir, { recursive: true });
const result = { status: 'RUNNING', baseUrl, expectedSourceSha, hosted: {}, browser: {}, checks: [] };
function check(id, pass, detail) { result.checks.push({ id, pass: Boolean(pass), detail }); if (!pass) throw new Error(`${id}: ${detail}`); }
async function fetchOk(relative, options = {}) { const url = new URL(relative, baseUrl); const response = await fetch(url, { redirect: 'follow', ...options }); return { url: url.href, response }; }
async function waitForDeployment() { for (let attempt = 1; attempt <= 24; attempt += 1) { try { const { response } = await fetchOk('qa-main-source.txt', { cache: 'no-store' }); const text = response.ok ? (await response.text()).trim() : ''; if (text === expectedSourceSha) return attempt; } catch {} await new Promise((resolve) => setTimeout(resolve, 5000)); } throw new Error(`deployed source marker did not reach ${expectedSourceSha}`); }
async function validateHosted() { result.hosted.deploymentReadyAttempt = await waitForDeployment(); for (const relative of ['heroes/', 'heroes/6/', 'images/heroes/cards/6.png']) { const { url, response } = await fetchOk(relative, { cache: 'no-store' }); check(`http-${relative}`, response.status === 200, `${url} -> ${response.status}`); } }
async function validateDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const page = await context.newPage(); const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' });
  const heading = page.getByRole('heading', { level: 2, name: '유대' }); await heading.waitFor(); const section = heading.locator('xpath=ancestor::section[1]');
  const cards = section.locator('article'); check('desktop-bond-card-count', await cards.count() === 5, `count=${await cards.count()}`);
  check('desktop-favorability-condition', await section.getByText('레온 호감도 Lv.25', { exact: true }).count() === 1, 'favorability condition visible');
  check('desktop-required-hero-lyatt', await section.getByText(/레아드와 함께/).count() === 1, 'Lyatt requirement visible');
  check('desktop-required-hero-elwin', await section.getByText(/엘윈과 함께/).count() === 1, 'Elwin requirement visible');
  check('desktop-bond-name', await section.getByText('英雄羁绊·力', { exact: true }).count() === 1, 'bond name visible');
  check('desktop-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(outDir, 'desktop-hero-6-bonds.png'), fullPage: true }); result.browser.desktop = { bondCards: 5, pageErrors }; await context.close();
}
async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const page = await context.newPage(); const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(new URL('heroes/6/', baseUrl).href, { waitUntil: 'networkidle' }); await page.getByRole('heading', { level: 2, name: '유대' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check('mobile-no-horizontal-overflow', overflow <= 1, `overflow=${overflow}`); check('mobile-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.screenshot({ path: path.join(outDir, 'mobile-hero-6-bonds.png'), fullPage: true }); result.browser.mobile = { overflow, pageErrors }; await context.close();
}
try { await validateHosted(); const browser = await chromium.launch({ headless: true }); try { await validateDesktop(browser); await validateMobile(browser); } finally { await browser.close(); } result.status = 'PASS_HERO_BOND_DETAIL_HOSTED_BROWSER_QA'; }
catch (error) { result.status = 'FAIL_HERO_BOND_DETAIL_HOSTED_BROWSER_QA'; result.error = error instanceof Error ? error.stack || error.message : String(error); throw error; }
finally { result.summary = { checkCount: result.checks.length, passed: result.checks.filter((row) => row.pass).length, failed: result.checks.filter((row) => !row.pass).length }; fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result, null, 2)); }
