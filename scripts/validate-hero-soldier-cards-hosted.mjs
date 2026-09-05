import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

// Independent hosted fixture for the Hero Soldier presentation contract:
// SP > T3 > T2 > T1 -> army type -> Soldier ID descending.
const expectedHero6SoldierIds = [
  5248, 5231, 5203, 5320, 5314, 5311, 5423, 5410, 5402,
  249, 248, 231, 203, 341, 340, 339, 337, 336, 334, 320, 317, 311, 426, 424, 410, 403, 1036, 1032,
  228, 201, 101, 304, 301, 407,
  300,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();

let manifest = null;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha) {
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 30) await sleep(5000);
}
check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha}`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");

for (const [path, label] of [
  ["heroes/6/", "Hero 6"],
  ["soldiers/101/", "Soldier 101"],
  ["images/soldiers-webp/101.webp", "Soldier 101 portrait"],
]) {
  const response = await fetch(url(`${path}?qa=${Date.now()}`), { cache: "no-store" });
  check(response.ok, `${label} Hosted HTTP failed: ${response.status}`);
  if (path.endsWith(".webp")) {
    check((response.headers.get("content-type") || "").includes("image/webp"), `${label} content-type is not image/webp`);
  }
}

async function verifyHeroSoldierCards(page, label) {
  const navigation = await page.goto(url("heroes/6/"), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 6 ${label} detail failed: ${navigation?.status()}`);
  await page.getByRole("heading", { name: "레온", exact: true }).waitFor();

  const section = page.locator('[data-hero-soldier-cards="true"]');
  check(await section.count() === 1, `Hero 6 ${label} Soldier card section missing or duplicated`);
  check((await section.innerText()).includes("사용 가능 용병"), `Hero 6 ${label} Soldier section title missing`);
  check((await section.innerText()).includes("35종"), `Hero 6 ${label} Soldier count label missing`);

  const cards = section.locator('a[href*="/soldiers/"]');
  check(await cards.count() === expectedHero6SoldierIds.length, `Hero 6 ${label} Soldier card count mismatch`);

  const hrefs = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  const parsedIds = hrefs.map((href) => {
    const match = href?.match(/\/soldiers\/(\d+)\/?$/);
    return match ? Number(match[1]) : null;
  });
  check(JSON.stringify(parsedIds) === JSON.stringify(expectedHero6SoldierIds), `Hero 6 ${label} Soldier card ID/order mismatch: ${JSON.stringify(parsedIds)}`);

  const portraits = section.locator('img[src*="/images/soldiers-webp/"]');
  check(await portraits.count() === expectedHero6SoldierIds.length, `Hero 6 ${label} portrait count mismatch`);
  const portraitIds = await portraits.evaluateAll((nodes) => nodes.map((node) => {
    const match = node.getAttribute("src")?.match(/\/soldiers-webp\/(\d+)\.webp$/);
    return match ? Number(match[1]) : null;
  }));
  check(JSON.stringify(portraitIds) === JSON.stringify(expectedHero6SoldierIds), `Hero 6 ${label} portrait ID/order mismatch: ${JSON.stringify(portraitIds)}`);
  const allPortraitsLoaded = await portraits.evaluateAll((nodes) => nodes.every((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0));
  check(allPortraitsLoaded, `Hero 6 ${label} has an unloaded Soldier portrait`);

  return { section, cards };
}

async function verifyInlineSoldierDialog(page, cards, cardIndex, label) {
  const card = cards.nth(cardIndex);
  check(await card.count() === 1, `Hero 6 ${label} target Soldier card missing`);
  const heroUrl = page.url();

  await card.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 45000 });
  check(page.url() === heroUrl, `Hero 6 ${label} navigated away while opening inline Soldier dialog: ${page.url()}`);
  const detailTitle = (await page.locator("#soldier-detail-title").innerText()).trim();
  check(detailTitle.length > 0, `Hero 6 ${label} inline Soldier detail title is empty`);
  check((await dialog.innerText()).includes("사용 가능 영웅"), `Hero 6 ${label} inline Soldier detail did not render expected frontend consumer content`);

  await page.getByRole("button", { name: "상세 창 닫기" }).click();
  await dialog.waitFor({ state: "detached", timeout: 45000 });
  check(page.url() === heroUrl, `Hero 6 ${label} URL changed after closing inline Soldier dialog`);
  check(await cards.count() === expectedHero6SoldierIds.length, `Hero 6 ${label} Soldier cards did not survive inline dialog close`);

  await card.click();
  await page.getByRole("dialog").waitFor({ timeout: 45000 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 45000 });
  check(page.url() === heroUrl, `Hero 6 ${label} URL changed after Escape-closing inline Soldier dialog`);
}

const browser = await chromium.launch({ headless: true });
try {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const desktopPageErrors = [];
  const desktopConsoleErrors = [];
  desktopPage.on("pageerror", (error) => desktopPageErrors.push(String(error)));
  desktopPage.on("console", (message) => { if (message.type() === "error") desktopConsoleErrors.push(message.text()); });

  const desktop = await verifyHeroSoldierCards(desktopPage, "desktop");
  const soldier101Index = expectedHero6SoldierIds.indexOf(101);
  check(soldier101Index >= 0, "Hero 6 expected Soldier 101 index missing");
  await verifyInlineSoldierDialog(desktopPage, desktop.cards, soldier101Index, "desktop Soldier 101");
  check(desktopPageErrors.length === 0, `desktop page errors: ${JSON.stringify(desktopPageErrors)}`);
  check(desktopConsoleErrors.length === 0, `desktop console errors: ${JSON.stringify(desktopConsoleErrors)}`);
  await desktopPage.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  const mobilePageErrors = [];
  const mobileConsoleErrors = [];
  mobilePage.on("pageerror", (error) => mobilePageErrors.push(String(error)));
  mobilePage.on("console", (message) => { if (message.type() === "error") mobileConsoleErrors.push(message.text()); });

  const mobile = await verifyHeroSoldierCards(mobilePage, "mobile");
  await verifyInlineSoldierDialog(mobilePage, mobile.cards, soldier101Index, "mobile Soldier 101");
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `Hero 6 mobile horizontal overflow=${overflow}`);
  check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
  check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  await mobileContext.close();

  console.log(JSON.stringify({
    status: "PASS_HERO_SOLDIER_CARDS_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroId: 6,
    soldierCards: {
      relationCount: expectedHero6SoldierIds.length,
      ids: expectedHero6SoldierIds,
      idOrderParity: "PASS",
      portraitCoverage: "35/35",
      portraitFormat: "WebP",
      progressiveRouteFallbackHrefs: "PASS",
      heroInlineSoldierDialog: "PASS",
      heroRoutePreservedDuringDialog: "PASS",
      closeButton: "PASS",
      escapeClose: "PASS",
      desktop: "PASS",
      mobile: "PASS",
      mobileOverflow: 0,
    },
    pageErrors: 0,
    consoleErrors: 0,
    semanticStageReopened: false,
  }, null, 2));
} finally {
  await browser.close();
}