import { chromium } from "playwright";

const base = (process.env.HOSTED_BASE_URL ?? "").replace(/\/?$/, "/");
if (!base) {
  throw new Error("HOSTED_BASE_URL is required.");
}

const GENERAL_STORAGE_KEY = "equipment-general-list-ui.v1";
const EXCLUSIVE_STORAGE_KEY = "equipment-exclusive-list-ui.v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isAscending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function isKoreanNameAscending(values) {
  const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
  return values.every(
    (value, index) => index === 0 || collator.compare(values[index - 1], value) <= 0,
  );
}

async function clearStoredState(page, key) {
  await page.evaluate((storageKey) => window.localStorage.removeItem(storageKey), key);
  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
}

async function waitForStoredState(page, key, expected) {
  await page.waitForFunction(
    ({ storageKey, expectedState }) => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Object.entries(expectedState).every(([name, value]) => parsed[name] === value);
      } catch {
        return false;
      }
    },
    { storageKey: key, expectedState: expected },
    { timeout: 15_000 },
  );
}

async function readIds(cards) {
  const texts = await cards.allTextContents();
  return texts.map((text) => {
    const match = text.match(/\bID\s+(\d+)\b/u);
    assert(match, `Card is missing equipment ID text: ${text.slice(0, 120)}`);
    return Number(match[1]);
  });
}

async function readNames(cards) {
  const count = await cards.count();
  const names = [];
  for (let index = 0; index < count; index += 1) {
    names.push((await cards.nth(index).locator("h2").innerText()).trim());
  }
  return names;
}

function installDiagnostics(page, bucket) {
  page.on("console", (message) => {
    if (message.type() === "error") bucket.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => bucket.pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 400) {
      bucket.badResponses.push({ url: response.url(), status: response.status() });
    }
  });
}

async function validateGeneralDesktop(page) {
  const response = await page.goto(new URL("equipment/", base).toString(), {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  assert(response && response.status() < 400, `General Equipment page failed: ${response?.status()}`);
  await clearStoredState(page, GENERAL_STORAGE_KEY);
  await page.getByRole("heading", { name: "SSR 장비", exact: true }).waitFor({ timeout: 15_000 });

  const search = page.locator('input[type="search"]').first();
  const sort = page.locator("select").first();
  const cards = page.locator('section[aria-label="SSR 장비 이미지 목록"] > a');

  await search.fill("서리검");
  await page.getByRole("heading", { name: "서리검", exact: true }).waitFor({ timeout: 15_000 });
  assert((await cards.count()) === 1, `Expected one Korean-name search result for 서리검, got ${await cards.count()}`);

  await search.fill("冰霜之刃");
  await page.getByRole("heading", { name: "서리검", exact: true }).waitFor({ timeout: 15_000 });
  assert((await cards.count()) === 1, `Expected one Chinese-name search result for 冰霜之刃, got ${await cards.count()}`);

  await search.fill("");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });

  await sort.selectOption("id");
  const ids = await readIds(cards);
  assert(ids.length > 1, "General ID sort requires multiple visible records.");
  assert(isAscending(ids), `General Equipment ID sort is not ascending: ${ids.slice(0, 12).join(", ")}`);
  await page.getByText("장비 ID순으로 표시 중이야. 이 정렬은 출시순 의미를 갖지 않아.", { exact: true }).waitFor({ timeout: 15_000 });

  await sort.selectOption("name");
  const names = await readNames(cards);
  assert(names.length > 1, "General name sort requires multiple visible records.");
  assert(isKoreanNameAscending(names), `General Equipment name sort is not ascending: ${names.slice(0, 12).join(" | ")}`);

  await page.getByRole("button", { name: "무기", exact: true }).click();
  await search.fill("서리검");
  await sort.selectOption("name");
  await waitForStoredState(page, GENERAL_STORAGE_KEY, {
    tab: 1,
    group: "weapon",
    query: "서리검",
    sort: "name",
  });
  assert((await cards.count()) === 1, "General persistence fixture should have one visible result before reload.");

  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
  assert((await search.inputValue()) === "서리검", "General search query did not persist across reload.");
  assert((await sort.inputValue()) === "name", "General sort mode did not persist across reload.");
  assert(
    (await page.getByRole("button", { name: "무기", exact: true }).getAttribute("aria-pressed")) === "true",
    "General group filter did not persist across reload.",
  );
  assert((await cards.count()) === 1, "General persisted state did not reproduce the filtered result.");

  await search.fill("__equipment_p2_no_match__");
  await page.getByText("조건에 맞는 장비가 없어.", { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "검색·필터 초기화", exact: true }).click();
  assert((await search.inputValue()) === "", "General empty-state reset did not clear query.");
  assert((await sort.inputValue()) === "default", "General empty-state reset did not restore default sort.");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });

  return {
    koreanNameSearch: "PASS",
    chineseNameSearch: "PASS",
    idSort: "PASS",
    nameSort: "PASS",
    persistence: "PASS",
    emptyStateReset: "PASS",
  };
}

async function validateExclusiveDesktop(page) {
  const response = await page.goto(new URL("equipment/exclusive/", base).toString(), {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  assert(response && response.status() < 400, `Exclusive Equipment page failed: ${response?.status()}`);
  await clearStoredState(page, EXCLUSIVE_STORAGE_KEY);
  await page.getByRole("heading", { name: "전용장비", exact: true }).waitFor({ timeout: 15_000 });

  const search = page.locator('input[type="search"]').first();
  const sort = page.locator("select").first();
  const cards = page.locator('section[aria-label="전용장비 목록"] > a');

  await search.fill("엘윈");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });
  assert((await cards.count()) === 1, `Expected one owner-Hero search result for 엘윈, got ${await cards.count()}`);
  const elwinCardText = await cards.first().innerText();
  assert(elwinCardText.includes("엘윈"), "Exclusive owner-Hero search result does not show 엘윈.");
  assert(/\bID\s+273\b/u.test(elwinCardText), `Expected Equipment 273 for 엘윈, got: ${elwinCardText.slice(0, 180)}`);

  await search.fill("273");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });
  assert((await cards.count()) === 1, `Expected one ID search result for 273, got ${await cards.count()}`);
  assert(/\bID\s+273\b/u.test(await cards.first().innerText()), "Exclusive ID search did not resolve Equipment 273.");

  await search.fill("");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });
  await sort.selectOption("id");
  const ids = await readIds(cards);
  assert(ids.length === 167, `Expected 167 exclusive Equipment records, got ${ids.length}`);
  assert(isAscending(ids), `Exclusive Equipment ID sort is not ascending: ${ids.slice(0, 12).join(", ")}`);

  await sort.selectOption("name");
  const names = await readNames(cards);
  assert(names.length === 167, `Expected 167 exclusive names, got ${names.length}`);
  assert(isKoreanNameAscending(names), `Exclusive Equipment name sort is not ascending: ${names.slice(0, 12).join(" | ")}`);

  await page.getByRole("button", { name: "무기", exact: true }).click();
  await search.fill("엘윈");
  await sort.selectOption("name");
  await waitForStoredState(page, EXCLUSIVE_STORAGE_KEY, {
    group: "weapon",
    query: "엘윈",
    sort: "name",
  });
  assert((await cards.count()) === 1, "Exclusive persistence fixture should have one visible result before reload.");

  await page.reload({ waitUntil: "networkidle", timeout: 45_000 });
  assert((await search.inputValue()) === "엘윈", "Exclusive search query did not persist across reload.");
  assert((await sort.inputValue()) === "name", "Exclusive sort mode did not persist across reload.");
  assert(
    (await page.getByRole("button", { name: "무기", exact: true }).getAttribute("aria-pressed")) === "true",
    "Exclusive group filter did not persist across reload.",
  );
  assert((await cards.count()) === 1, "Exclusive persisted state did not reproduce the filtered result.");

  await search.fill("__equipment_p2_no_match__");
  await page.getByText("조건에 맞는 전용장비가 없어.", { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "검색·필터 초기화", exact: true }).click();
  assert((await search.inputValue()) === "", "Exclusive empty-state reset did not clear query.");
  assert((await sort.inputValue()) === "default", "Exclusive empty-state reset did not restore default sort.");
  await cards.first().waitFor({ state: "visible", timeout: 15_000 });

  return {
    ownerHeroSearch: "PASS",
    equipmentIdSearch: "PASS",
    idSort: "PASS",
    nameSort: "PASS",
    persistence: "PASS",
    emptyStateReset: "PASS",
  };
}

async function validateMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [], badResponses: [] };
  installDiagnostics(page, diagnostics);

  try {
    await page.goto(new URL("equipment/", base).toString(), { waitUntil: "networkidle", timeout: 45_000 });
    await clearStoredState(page, GENERAL_STORAGE_KEY);
    const generalSearch = page.locator('input[type="search"]').first();
    const generalSort = page.locator("select").first();
    await generalSearch.fill("서리검");
    await page.getByRole("heading", { name: "서리검", exact: true }).waitFor({ timeout: 15_000 });
    await generalSort.selectOption("id");
    const generalLayout = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(generalLayout.scrollWidth <= generalLayout.innerWidth, `General mobile overflow: ${JSON.stringify(generalLayout)}`);

    await page.goto(new URL("equipment/exclusive/", base).toString(), { waitUntil: "networkidle", timeout: 45_000 });
    await clearStoredState(page, EXCLUSIVE_STORAGE_KEY);
    const exclusiveSearch = page.locator('input[type="search"]').first();
    const exclusiveSort = page.locator("select").first();
    await exclusiveSearch.fill("엘윈");
    const exclusiveCards = page.locator('section[aria-label="전용장비 목록"] > a');
    await exclusiveCards.first().waitFor({ state: "visible", timeout: 15_000 });
    assert((await exclusiveCards.count()) === 1, "Exclusive mobile owner-Hero search did not narrow to one result.");
    await exclusiveSort.selectOption("id");
    const exclusiveLayout = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(exclusiveLayout.scrollWidth <= exclusiveLayout.innerWidth, `Exclusive mobile overflow: ${JSON.stringify(exclusiveLayout)}`);

    assert(diagnostics.pageErrors.length === 0, `Mobile pageerror detected: ${JSON.stringify(diagnostics.pageErrors)}`);
    assert(diagnostics.consoleErrors.length === 0, `Mobile console error detected: ${JSON.stringify(diagnostics.consoleErrors)}`);
    assert(diagnostics.badResponses.length === 0, `Mobile hosted HTTP failure detected: ${JSON.stringify(diagnostics.badResponses)}`);

    return {
      viewport: { width: 390, height: 844 },
      generalSearchSort: "PASS",
      exclusiveSearchSort: "PASS",
      horizontalOverflow: "PASS",
    };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktopPage = await desktopContext.newPage();
const desktopDiagnostics = { consoleErrors: [], pageErrors: [], badResponses: [] };
installDiagnostics(desktopPage, desktopDiagnostics);

try {
  const general = await validateGeneralDesktop(desktopPage);
  const exclusive = await validateExclusiveDesktop(desktopPage);
  const mobile = await validateMobile(browser);

  assert(desktopDiagnostics.pageErrors.length === 0, `Desktop pageerror detected: ${JSON.stringify(desktopDiagnostics.pageErrors)}`);
  assert(desktopDiagnostics.consoleErrors.length === 0, `Desktop console error detected: ${JSON.stringify(desktopDiagnostics.consoleErrors)}`);
  assert(desktopDiagnostics.badResponses.length === 0, `Desktop hosted HTTP failure detected: ${JSON.stringify(desktopDiagnostics.badResponses)}`);

  console.log(JSON.stringify({
    stage: "Equipment Presentation P2 Browser/UI QA",
    status: "PASS_EQUIPMENT_PRESENTATION_P2_HOSTED_CLOSEOUT",
    hostedBaseUrl: base,
    semanticStageReopened: false,
    general,
    exclusive,
    mobile,
    diagnostics: {
      desktopPageErrors: 0,
      desktopConsoleErrors: 0,
      desktopHostedHttpFailures: 0,
      mobilePageErrors: 0,
      mobileConsoleErrors: 0,
      mobileHostedHttpFailures: 0,
    },
  }, null, 2));
} finally {
  await desktopContext.close();
  await browser.close();
}
