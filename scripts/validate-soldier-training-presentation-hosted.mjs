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

async function assertPressed(button, expected, label) {
  await button.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await button.getAttribute("aria-pressed"), String(expected), `${label} pressed state drifted.`);
}

async function assertCurrentPresentation(page) {
  await page.getByText("훈련 계열", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  await page.getByText("유형", { exact: true }).waitFor({ state: "visible", timeout: 20000 });

  const groupLabels = [
    "보병",
    "창병",
    "기병",
    "비병 + 수병",
    "궁병 + 암살자",
    "마법사 + 승려 + 마물",
  ];
  for (const label of groupLabels) {
    await page.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible", timeout: 20000 });
  }

  for (const label of ["스탯", "패시브"]) {
    await page.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible", timeout: 20000 });
  }

  const defaultGroup = page.getByRole("button", { name: "보병", exact: true });
  const defaultKind = page.getByRole("button", { name: "스탯", exact: true });
  await assertPressed(defaultGroup, true, "Default training group");
  await assertPressed(defaultKind, true, "Default training kind");

  const targetSlider = page.getByRole("slider", { name: "목표 레벨 조절", exact: true });
  await targetSlider.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await targetSlider.count(), 1, "Expected one target-level slider for the selected training tech.");

  const currentLevel = page.getByRole("spinbutton").first();
  const targetLevel = page.getByRole("spinbutton").nth(1);
  await currentLevel.waitFor({ state: "visible", timeout: 20000 });
  await targetLevel.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await page.getByRole("spinbutton").count(), 2, "Expected current and target level controls.");

  await page.getByText("현재 효과", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  await page.getByText("목표 효과", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const response = await page.goto(`${trainingUrl}?qa=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const directStatus = response?.status() ?? null;

  await assertCurrentPresentation(page);

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

  const lancer = page.getByRole("button", { name: "창병", exact: true });
  await lancer.click();
  await assertPressed(lancer, true, "Lancer training group");
  await assertPressed(page.getByRole("button", { name: "보병", exact: true }), false, "Infantry training group");

  const passive = page.getByRole("button", { name: "패시브", exact: true });
  await passive.click();
  await assertPressed(passive, true, "Passive training kind");
  await assertPressed(page.getByRole("button", { name: "스탯", exact: true }), false, "Stat training kind");

  const targetSlider = page.getByRole("slider", { name: "목표 레벨 조절", exact: true });
  const sliderMin = Number(await targetSlider.getAttribute("min"));
  const sliderMax = Number(await targetSlider.getAttribute("max"));
  assert.ok(Number.isFinite(sliderMin) && Number.isFinite(sliderMax) && sliderMax >= sliderMin, `Unexpected target slider bounds: ${sliderMin}-${sliderMax}`);
  if (sliderMax > sliderMin) {
    await targetSlider.fill(String(sliderMin));
    assert.equal(Number(await targetSlider.inputValue()), sliderMin, "Target-level slider did not accept a valid value.");
  }

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

  await assertCurrentPresentation(page);

  const flyingWater = page.getByRole("button", { name: "비병 + 수병", exact: true });
  await flyingWater.click();
  await assertPressed(flyingWater, true, "Mobile flying/water training group");

  const passive = page.getByRole("button", { name: "패시브", exact: true });
  await passive.click();
  await assertPressed(passive, true, "Mobile passive training kind");

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
    `[soldier-training-hosted] PASS sourceSha=${manifest.sourceSha} directStatus=${directStatus} route=/soldiers/training groups=6 kinds=2 levelControls=true mobile=true`,
  );
} finally {
  await browser.close();
}
