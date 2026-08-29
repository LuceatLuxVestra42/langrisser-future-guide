import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();

let deployment = null;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha) {
        deployment = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 30) await sleep(5000);
}
check(deployment, `authoritative deployment manifest did not reach source=${expectedSourceSha}`);
check(deployment.semanticStageReopened === false, "deployment manifest reopened semantic stage");
check(deployment.heroCardIconResolvedCount === 267, `deployment Hero card icon count mismatch: ${deployment.heroCardIconResolvedCount}`);

async function verifyList(page, label) {
  const navigation = await page.goto(url(`heroes/?qa=${Date.now()}`), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero list ${label} failed: ${navigation?.status()}`);
  await page.locator('[data-hero-card-icons="true"]').waitFor({ state: "visible", timeout: 20000 });

  const icons = page.locator('img[data-hero-card-icon="true"]');
  check(await icons.count() === 267, `Hero list ${label} icon count mismatch: ${await icons.count()}`);

  const sources = await icons.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  check(new Set(sources).size === 267, `Hero list ${label} card icon sources are not unique`);
  check(sources.every((src) => src.includes("/images/heroes/card-icons/") && src.endsWith(".png")), `Hero list ${label} contains a non-card-icon source`);
  check(sources.every((src) => !src.includes("/images/heroes/cards/")), `Hero list ${label} still consumes detail artwork`);

  const hero6 = page.locator('img[data-hero-card-icon="true"][data-hero-id="6"]');
  check(await hero6.count() === 1, `Hero list ${label} Hero 6 card icon missing or duplicated`);
  await hero6.scrollIntoViewIfNeeded();
  await hero6.evaluate((image) => image.complete && image.naturalWidth > 0 ? true : new Promise((resolve, reject) => {
    image.addEventListener("load", () => resolve(true), { once: true });
    image.addEventListener("error", () => reject(new Error("Hero 6 card icon failed to load")), { once: true });
  }));
  const hero6State = await hero6.evaluate((image) => ({
    src: image.getAttribute("src") || "",
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  check(hero6State.src.includes("/images/heroes/card-icons/6.png"), `Hero 6 ${label} source mismatch: ${hero6State.src}`);
  check(hero6State.naturalWidth >= 100 && hero6State.naturalHeight >= 100, `Hero 6 ${label} card icon failed intrinsic-size check`);
  check(Math.abs(hero6State.naturalWidth - hero6State.naturalHeight) <= 8, `Hero 6 ${label} card icon is not square`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `Hero list ${label} horizontal overflow=${overflow}`);

  return { iconCount: sources.length, hero6State, overflow };
}

async function verifyDetailArtwork(page) {
  const navigation = await page.goto(url(`heroes/6/?qa=${Date.now()}`), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 6 detail failed: ${navigation?.status()}`);
  const artwork = page.locator('img[alt*="대표 일러스트"]');
  check(await artwork.count() === 1, "Hero 6 detail representative artwork missing or duplicated");
  const src = await artwork.getAttribute("src");
  check(src?.includes("/images/heroes/cards/6.png"), `Hero 6 detail artwork source changed unexpectedly: ${src}`);
  check(!src?.includes("/images/heroes/card-icons/"), "Hero detail incorrectly consumes list card icon asset");
  return src;
}

const browser = await chromium.launch({ headless: true });
try {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const desktopPageErrors = [];
  const desktopConsoleErrors = [];
  desktopPage.on("pageerror", (error) => desktopPageErrors.push(String(error)));
  desktopPage.on("console", (message) => { if (message.type() === "error") desktopConsoleErrors.push(message.text()); });
  const desktop = await verifyList(desktopPage, "desktop");
  const detailArtworkSrc = await verifyDetailArtwork(desktopPage);
  check(desktopPageErrors.length === 0, `desktop page errors: ${JSON.stringify(desktopPageErrors)}`);
  check(desktopConsoleErrors.length === 0, `desktop console errors: ${JSON.stringify(desktopConsoleErrors)}`);
  await desktopPage.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  const mobilePageErrors = [];
  const mobileConsoleErrors = [];
  mobilePage.on("pageerror", (error) => mobilePageErrors.push(String(error)));
  mobilePage.on("console", (message) => { if (message.type() === "error") mobileConsoleErrors.push(message.text()); });
  const mobile = await verifyList(mobilePage, "mobile");
  check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
  check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  await mobileContext.close();

  const representativeAssetResponse = await fetch(url(`images/heroes/card-icons/6.png?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeAssetResponse.ok, `Hosted Hero 6 card icon HTTP failed: ${representativeAssetResponse.status}`);
  check((representativeAssetResponse.headers.get("content-type") || "").includes("image/png"), "Hosted Hero 6 card icon content type is not PNG");

  console.log(JSON.stringify({
    status: "PASS_HERO_CARD_ICONS_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroCardIconCount: 267,
    localFrozenAssets: true,
    remoteRuntimeHotlink: false,
    listDetailArtworkSeparated: true,
    semanticStageReopened: false,
    desktop,
    mobile,
    detailArtworkSrc,
    pageErrors: 0,
    consoleErrors: 0,
  }, null, 2));
} finally {
  await browser.close();
}
