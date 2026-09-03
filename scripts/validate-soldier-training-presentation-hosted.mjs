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

async function waitForMaterialImage(image) {
  await image.scrollIntoViewIfNeeded();
  await image.waitFor({ state: "visible", timeout: 10000 });
  const loaded = await image.evaluate(
    (target) =>
      new Promise((resolve) => {
        if (target.complete) {
          resolve(target.naturalWidth > 0 && target.naturalHeight > 0);
          return;
        }
        const timer = window.setTimeout(() => resolve(false), 10000);
        target.addEventListener(
          "load",
          () => {
            window.clearTimeout(timer);
            resolve(target.naturalWidth > 0 && target.naturalHeight > 0);
          },
          { once: true },
        );
        target.addEventListener(
          "error",
          () => {
            window.clearTimeout(timer);
            resolve(false);
          },
          { once: true },
        );
      }),
  );
  assert.equal(loaded, true, `Material image failed to load: ${await image.getAttribute("src")}`);
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

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const response = await page.goto(`${trainingUrl}?qa=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const directStatus = response?.status() ?? null;

  await page.getByRole("heading", { name: "훈련장", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("heading", { name: "레벨별 상승 효과", exact: true }).waitFor();
  await page.getByPlaceholder("한국어 이름 / 중문 이름 / 훈련 ID / 병종 ID 검색").waitFor();

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

  assert.ok(bodyText.includes("훈련장 자료"), "Missing G training-page heading copy.");
  assert.ok(bodyText.includes("훈련 효과"), "Missing G training-effect heading copy.");
  assert.ok(bodyText.includes("검증된 효과 130개"), "Missing 130-effect coverage witness.");

  const materialImages = page.locator('img[src*="soldier-training-materials/"]');
  assert.equal(await materialImages.count(), 24, "Expected exactly 24 Soldier Training material images.");
  for (let index = 0; index < 24; index += 1) {
    await waitForMaterialImage(materialImages.nth(index));
  }

  const trainingSection = page
    .getByRole("heading", { name: "레벨별 상승 효과", exact: true })
    .locator("xpath=ancestor::section[1]");
  const techButtons = trainingSection.locator("button").filter({ hasText: /#\d+/ });
  assert.equal(await techButtons.count(), 130, "ALL filter must render exactly 130 TrainingTech rows.");

  await page.getByRole("button", { name: "기본 능력치", exact: true }).click();
  assert.equal(await techButtons.count(), 84, "COMMON_STAT filter must render exactly 84 rows.");

  await page.getByRole("button", { name: "조건부 효과", exact: true }).click();
  assert.equal(await techButtons.count(), 46, "COMMON_PASSIVE filter must render exactly 46 rows.");

  await page.getByRole("button", { name: "전체", exact: true }).click();
  assert.equal(await techButtons.count(), 130, "ALL filter must restore exactly 130 rows.");

  const search = page.getByPlaceholder("한국어 이름 / 중문 이름 / 훈련 ID / 병종 ID 검색");

  await search.fill("창병 대항 특훈");
  assert.equal(await techButtons.count(), 1, "Korean TrainingTech search should resolve one exact row.");
  assert.ok(await page.getByText("창병 대항 특훈", { exact: true }).count(), "Korean search result missing.");

  await search.fill("对枪特训");
  assert.equal(await techButtons.count(), 1, "Chinese source-name search should resolve one exact row.");
  assert.ok(await page.getByText("창병 대항 특훈", { exact: true }).count(), "Chinese search did not resolve Korean row.");

  await search.fill("127");
  assert.equal(await techButtons.count(), 1, "Training ID search should resolve Tech 127 exactly.");
  assert.ok(await page.getByText("연합 공격 훈련", { exact: true }).count(), "Tech 127 Korean display name missing.");
  assert.ok(await page.getByText("임시 표기", { exact: true }).count(), "Provisional display badge missing for Tech 127.");

  await search.fill("창병 대항 특훈");
  await techButtons.first().click();
  await search.fill("");

  const slider = page.locator('input[type="range"]');
  assert.equal(await slider.count(), 1, "Expected one Training level slider.");
  const sliderMax = Number(await slider.getAttribute("max"));
  assert.ok(sliderMax >= 2, `Unexpected slider max: ${sliderMax}`);
  await slider.evaluate((element) => {
    element.value = "2";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.ok((await trainingSection.innerText()).includes(`Lv.2 / ${sliderMax}`), "Slider did not select Lv.2.");
  assert.ok((await trainingSection.innerText()).includes("Lv.2 효과"), "Selected-level effect panel did not update to Lv.2.");

  const levelOneRow = trainingSection.locator("button").filter({ hasText: /^Lv\.1(?:\D|$)/ }).first();
  await levelOneRow.click();
  assert.ok((await trainingSection.innerText()).includes("Lv.1 효과"), "Full level table click did not return to Lv.1.");

  const materialButton = page.getByRole("button", { name: /고급 보병 교재/ }).first();
  await materialButton.click();
  await page.waitForTimeout(700);
  const effectHeadingBox = await page.getByRole("heading", { name: "레벨별 상승 효과", exact: true }).boundingBox();
  assert.ok(effectHeadingBox && effectHeadingBox.y < 1000, "Material click did not bring the training-effect section into view.");

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

  await page.getByRole("heading", { name: "훈련장", exact: true }).waitFor({ timeout: 20000 });
  const search = page.getByPlaceholder("한국어 이름 / 중문 이름 / 훈련 ID / 병종 ID 검색");
  await search.waitFor();
  await page.getByRole("button", { name: "조건부 효과", exact: true }).click();
  await search.fill("对枪特训");
  assert.ok(await page.getByText("창병 대항 특훈", { exact: true }).count(), "Mobile Chinese-name search failed.");
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
    `[soldier-training-hosted] PASS sourceSha=${manifest.sourceSha} directStatus=${directStatus} route=/soldiers/training materials=24 techs=130 filters=84/46 searches=kr/cn/id slider=true levelTable=true materialScroll=true mobile=true`,
  );
} finally {
  await browser.close();
}
