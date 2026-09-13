import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const EXPECTED_SOURCE_SHA = process.env.EXPECTED_SOURCE_SHA;
const baseUrl = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const trainingUrl = new URL("soldiers/training", baseUrl).href;
const manifestUrl = new URL("authoritative-pages-source.json", baseUrl).href;

if (!EXPECTED_SOURCE_SHA) {
  throw new Error("EXPECTED_SOURCE_SHA is required for Soldier Training hosted QA.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readFreshManifest() {
  let last = null;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    const url = `${manifestUrl}?trainingQa=${Date.now()}-${attempt}`;
    try {
      const response = await fetch(url, { redirect: "follow", cache: "no-store" });
      const text = await response.text();
      if (response.ok) {
        const parsed = JSON.parse(text);
        last = parsed;
        if (parsed.sourceSha === EXPECTED_SOURCE_SHA) return parsed;
      }
    } catch (error) {
      last = { error: String(error) };
    }
    await sleep(5000);
  }
  throw new Error(
    `Hosted manifest did not reach expected source ${EXPECTED_SOURCE_SHA}. Last probe: ${JSON.stringify(last)}`,
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    metrics.scrollWidth <= metrics.innerWidth + 1,
    `${label} horizontal overflow: ${JSON.stringify(metrics)}`,
  );
}

async function assertCurrentTrainingControls(page) {
  const infantry = page.getByRole("button", { name: "보병", exact: true });
  const lancer = page.getByRole("button", { name: "창병", exact: true });
  const stat = page.getByRole("button", { name: "스탯", exact: true });
  const passive = page.getByRole("button", { name: "패시브", exact: true });

  await infantry.waitFor({ timeout: 20000 });
  await stat.waitFor({ timeout: 20000 });
  assert.equal(await infantry.getAttribute("aria-pressed"), "true", "Infantry must be the default training group.");
  assert.equal(await stat.getAttribute("aria-pressed"), "true", "Stat must be the default training type.");

  return { infantry, lancer, stat, passive };
}

async function selectLancerPassive(page) {
  const controls = await assertCurrentTrainingControls(page);
  await controls.lancer.click();
  await controls.passive.click();
  assert.equal(await controls.lancer.getAttribute("aria-pressed"), "true", "Lancer training group did not activate.");
  assert.equal(await controls.passive.getAttribute("aria-pressed"), "true", "Passive training type did not activate.");

  const tech = page.getByRole("button", { name: "창병 대항 특훈", exact: true });
  await tech.waitFor({ timeout: 20000 });
  await tech.click();
  await page.getByRole("heading", { name: "창병 대항 특훈", exact: true }).waitFor({ timeout: 20000 });
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const response = await page.goto(`${trainingUrl}?qa=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const directStatus = response?.status() ?? null;

  await assertCurrentTrainingControls(page);

  const bodyText = await page.locator("body").innerText();
  for (const forbidden of [
    "Training Hall",
    "Simulator",
    "frozen TrainingTech",
    "COMMON_STAT frozen consumer",
    "COMMON_PASSIVE frozen consumer",
    "조건/대상 AST",
  ]) {
    assert.ok(!bodyText.includes(forbidden), `Internal implementation wording leaked: ${forbidden}`);
  }

  for (const groupName of ["보병", "창병", "기병", "비병 + 수병", "궁병 + 암살자", "마법사 + 승려 + 마물"]) {
    await page.getByRole("button", { name: groupName, exact: true }).waitFor({ timeout: 10000 });
  }

  await selectLancerPassive(page);

  const slider = page.getByRole("slider", { name: "목표 레벨 조절", exact: true });
  assert.equal(await slider.count(), 1, "Expected one target-level slider.");
  const sliderMax = Number(await slider.getAttribute("max"));
  assert.ok(sliderMax >= 2, `Unexpected slider max: ${sliderMax}`);
  await slider.fill("2");

  const currentLevel = page.getByRole("spinbutton", { name: "현재 Lv", exact: true });
  const targetLevel = page.getByRole("spinbutton", { name: "목표 Lv", exact: true });
  await currentLevel.fill("1");
  await targetLevel.fill("2");
  assert.equal(await currentLevel.inputValue(), "1", "Current level input did not update to Lv.1.");
  assert.equal(await targetLevel.inputValue(), "2", "Target level input did not update to Lv.2.");

  await page.getByText("현재 효과", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("목표 효과", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByLabel("Lv.1에서 Lv.2로 강화", { exact: true }).waitFor({ timeout: 10000 });

  await assertNoHorizontalOverflow(page, "desktop");
  await context.close();
  return directStatus;
}

async function runMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${trainingUrl}?qaMobile=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await selectLancerPassive(page);
  await page.getByRole("slider", { name: "목표 레벨 조절", exact: true }).waitFor({ timeout: 10000 });
  await assertNoHorizontalOverflow(page, "mobile");

  await context.close();
}

const manifest = await readFreshManifest();
const browser = await chromium.launch({ headless: true });
try {
  const directStatus = await runDesktop(browser);
  await runMobile(browser);
  assert.ok(
    directStatus === 200 || directStatus === 404,
    `Unexpected direct-route HTTP status: ${directStatus}`,
  );
  console.log(
    `[soldier-training-hosted] PASS sourceSha=${manifest.sourceSha} directStatus=${directStatus} route=/soldiers/training groups=6 types=stat/passive lancerPassive=true levelComparison=true mobile=true`,
  );
} finally {
  await browser.close();
}
