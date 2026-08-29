import { chromium } from "playwright";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const GENERAL_STORAGE_KEY = "equipment-general-list-ui.v1";
const EXCLUSIVE_STORAGE_KEY = "equipment-exclusive-list-ui.v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function url(path) {
  return new URL(path.replace(/^\//, ""), BASE_URL).toString();
}

async function gotoChecked(page, path) {
  const response = await page.goto(url(path), { waitUntil: "networkidle", timeout: 45_000 });
  assert(response && response.status() < 400, `${path} failed: ${response?.status()}`);
}

function attachDiagnostics(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL) && response.status() >= 400) {
      errors.push(`http:${response.status()}:${response.url()}`);
    }
  });
  return {
    assertClean() {
      assert(errors.length === 0, `${label} diagnostics: ${JSON.stringify(errors)}`);
    },
  };
}

async function resetStorage(page, storageKey, path) {
  await gotoChecked(page, path);
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
}

async function cardIds(page, listLabel) {
  const hrefs = await page.locator(`section[aria-label="${listLabel}"] a[href*="/equipment/"]`).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter(Boolean),
  );
  return hrefs.map((href) => {
    const match = href.match(/\/equipment\/(\d+)\/?$/);
    assert(match, `Could not parse equipment ID from href: ${href}`);
    return Number(match[1]);
  });
}

function assertAscending(values, label) {
  assert(values.length > 1, `${label}: expected multiple values`);
  for (let index = 1; index < values.length; index += 1) {
    assert(values[index - 1] <= values[index], `${label}: not ascending at ${values[index - 1]} > ${values[index]}`);
  }
}

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label} horizontal overflow: ${JSON.stringify(metrics)}`);
}

async function validateGeneral(page) {
  await resetStorage(page, GENERAL_STORAGE_KEY, "equipment/");
  const input = page.locator('input[placeholder="장비명·효과·ID 검색"]');
  const sort = page.locator('select').filter({ has: page.locator('option[value="default"]') }).first();
  const list = page.locator('section[aria-label="SSR 장비 이미지 목록"]');
  await list.waitFor({ state: "visible", timeout: 15_000 });
  await input.waitFor({ state: "visible", timeout: 15_000 });
  assert(await sort.count(), "general: sort control missing");

  const baselineCount = await list.locator('a[href*="/equipment/"]').count();
  assert(baselineCount > 1, `general: unexpected baseline count ${baselineCount}`);
  const firstCard = list.locator('a[href*="/equipment/"]').first();
  const targetName = (await firstCard.locator("h2").innerText()).trim();
  const targetHref = await firstCard.getAttribute("href");
  assert(targetName && targetHref, "general: dynamic search target missing");

  await input.fill(targetName);
  await page.waitForTimeout(100);
  const narrowedCount = await list.locator('a[href*="/equipment/"]').count();
  assert(narrowedCount >= 1 && narrowedCount < baselineCount, `general: search did not narrow ${baselineCount} -> ${narrowedCount}`);
  assert(await list.locator(`a[href="${targetHref}"]`).count(), `general: target card disappeared for query ${targetName}`);

  await input.fill("");
  await sort.selectOption("id");
  await page.waitForTimeout(100);
  assertAscending(await cardIds(page, "SSR 장비 이미지 목록"), "general ID sort");
  const policyText = await page.getByText(/장비 ID순으로 표시 중이야/).innerText();
  assert(policyText.includes("출시순 의미를 갖지 않아"), "general: ID sort chronology boundary copy missing");

  await input.fill(targetName);
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
  assert((await input.inputValue()) === targetName, "general: search query did not restore after reload");
  assert((await sort.inputValue()) === "id", "general: sort mode did not restore after reload");
  assert(await page.locator(`section[aria-label="SSR 장비 이미지 목록"] a[href="${targetHref}"]`).count(), "general: restored query lost target card");

  await input.fill("__P2_NO_MATCH__");
  await page.getByText("조건에 맞는 장비가 없어.", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "검색·필터 초기화", exact: true }).click();
  await list.waitFor({ state: "visible", timeout: 10_000 });
  assert((await input.inputValue()) === "", "general: reset did not clear query");
  assert((await sort.inputValue()) === "default", "general: reset did not restore default sort");
}

async function validateExclusive(page) {
  await resetStorage(page, EXCLUSIVE_STORAGE_KEY, "equipment/exclusive/");
  const input = page.locator('input[placeholder="장비명·영웅명·효과·ID 검색"]');
  const sort = page.locator('select').filter({ has: page.locator('option[value="default"]') }).first();
  const list = page.locator('section[aria-label="전용장비 목록"]');
  await list.waitFor({ state: "visible", timeout: 15_000 });
  await input.waitFor({ state: "visible", timeout: 15_000 });
  assert(await sort.count(), "exclusive: sort control missing");

  const baselineCount = await list.locator('a[href*="/equipment/"]').count();
  assert(baselineCount > 1, `exclusive: unexpected baseline count ${baselineCount}`);
  const firstCard = list.locator('a[href*="/equipment/"]').first();
  const ownerLabel = firstCard.getByText("전용 영웅", { exact: true });
  const ownerName = (await ownerLabel.locator("..").locator("p").nth(1).innerText()).trim();
  assert(ownerName.length > 0, "exclusive: could not derive owner Hero name");

  await input.fill(ownerName);
  await page.waitForTimeout(100);
  const narrowedCount = await list.locator('a[href*="/equipment/"]').count();
  assert(narrowedCount >= 1 && narrowedCount < baselineCount, `exclusive: Hero search did not narrow ${baselineCount} -> ${narrowedCount}`);
  const visibleTexts = await list.locator('a[href*="/equipment/"]').allInnerTexts();
  assert(visibleTexts.every((text) => text.includes(ownerName)), `exclusive: Hero search returned nonmatching card for ${ownerName}`);

  await input.fill("");
  await sort.selectOption("id");
  await page.waitForTimeout(100);
  assertAscending(await cardIds(page, "전용장비 목록"), "exclusive ID sort");
  const policyText = await page.getByText(/장비 ID순으로 표시 중이야/).innerText();
  assert(policyText.includes("출시순 의미를 갖지 않아"), "exclusive: ID sort chronology boundary copy missing");

  await input.fill(ownerName);
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
  assert((await input.inputValue()) === ownerName, "exclusive: Hero query did not restore after reload");
  assert((await sort.inputValue()) === "id", "exclusive: sort mode did not restore after reload");
  assert((await list.locator('a[href*="/equipment/"]').count()) >= 1, "exclusive: restored Hero query has no results");
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page, "mobile P2");
  try {
    await resetStorage(page, GENERAL_STORAGE_KEY, "equipment/");
    const generalInput = page.locator('input[placeholder="장비명·효과·ID 검색"]');
    await generalInput.waitFor({ state: "visible", timeout: 15_000 });
    assert(await page.locator('select').first().isVisible(), "mobile general: sort control not visible");
    await assertNoOverflow(page, "mobile general P2");

    await resetStorage(page, EXCLUSIVE_STORAGE_KEY, "equipment/exclusive/");
    const exclusiveInput = page.locator('input[placeholder="장비명·영웅명·효과·ID 검색"]');
    await exclusiveInput.waitFor({ state: "visible", timeout: 15_000 });
    assert(await page.locator('select').first().isVisible(), "mobile exclusive: sort control not visible");
    await assertNoOverflow(page, "mobile exclusive P2");
    diagnostics.assertClean();
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const diagnostics = attachDiagnostics(page, "desktop P2");
  try {
    await validateGeneral(page);
    await validateExclusive(page);
    diagnostics.assertClean();
  } finally {
    await desktop.close();
  }
  await validateMobile(browser);
} finally {
  await browser.close();
}

console.log("PASS_EQUIPMENT_PRESENTATION_P2_HOSTED_BROWSER_UI");
