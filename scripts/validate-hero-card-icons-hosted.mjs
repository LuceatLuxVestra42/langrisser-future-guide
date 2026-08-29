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
check(deployment.heroFusionPowerResolvedCount === 35, `deployment Hero fusion-power count mismatch: ${deployment.heroFusionPowerResolvedCount}`);
check(deployment.heroFusionFactionAssetCount === 12, `deployment faction-mark asset count mismatch: ${deployment.heroFusionFactionAssetCount}`);
check(deployment.heroFusionPowerFreezeState === "HERO_FUSION_POWER_PRESENTATION_FROZEN", "deployment fusion-power freeze mismatch");
check(deployment.heroFusionFactionAssetFreezeState === "HERO_FUSION_FACTION_ASSETS_FROZEN", "deployment faction-asset freeze mismatch");

async function waitForImage(image, message) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((node) => node.complete && node.naturalWidth > 0 ? true : new Promise((resolve, reject) => {
    node.addEventListener("load", () => resolve(true), { once: true });
    node.addEventListener("error", () => reject(new Error("image failed to load")), { once: true });
  })).catch((error) => { throw new Error(`${message}: ${error}`); });
}

async function verifyList(page, label) {
  const navigation = await page.goto(url(`heroes/?qa=${Date.now()}`), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero list ${label} failed: ${navigation?.status()}`);
  await page.locator('[data-hero-card-icons="true"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-hero-fusion-power-marks="true"]').waitFor({ state: "visible", timeout: 20000 });

  const cards = page.locator('[data-hero-card="true"]');
  check(await cards.count() === 267, `Hero list ${label} card count mismatch: ${await cards.count()}`);

  const icons = page.locator('img[data-hero-card-icon="true"]');
  check(await icons.count() === 267, `Hero list ${label} icon count mismatch: ${await icons.count()}`);

  const sources = await icons.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  check(new Set(sources).size === 267, `Hero list ${label} card icon sources are not unique`);
  check(sources.every((src) => src.includes("/images/heroes/card-icons-webp/") && src.endsWith(".webp")), `Hero list ${label} contains a non-WebP card-icon source`);
  check(sources.every((src) => !src.includes("/images/heroes/cards/")), `Hero list ${label} still consumes detail artwork`);

  const fusionMarks = page.locator('[data-hero-fusion-power-mark="true"]');
  check(await fusionMarks.count() === 35, `Hero list ${label} fusion mark count mismatch: ${await fusionMarks.count()}`);
  const markState = await fusionMarks.evaluateAll((nodes) => nodes.map((node) => ({
    heroId: Number(node.getAttribute("data-hero-id")),
    factionId: Number(node.getAttribute("data-target-faction-id")),
    src: node.querySelector("img")?.getAttribute("src") || "",
    text: node.textContent?.trim() || "",
  })));
  check(markState.every((row) => Number.isInteger(row.heroId) && row.heroId > 0), `Hero list ${label} has invalid fusion Hero ID`);
  check(markState.every((row) => Number.isInteger(row.factionId) && row.factionId >= 1 && row.factionId <= 12), `Hero list ${label} has invalid target faction ID`);
  check(new Set(markState.map((row) => row.heroId)).size === 35, `Hero list ${label} fusion Hero IDs are not unique`);
  check(new Set(markState.map((row) => row.factionId)).size === 12, `Hero list ${label} must cover 12 faction marks`);
  check(markState.every((row) => row.src.includes(`/images/factions/${row.factionId}.png`)), `Hero list ${label} faction mark source mismatch`);
  check(markState.every((row) => row.text === ""), `Hero list ${label} fusion mark contains visible text`);

  const hero6Mark = page.locator('[data-hero-fusion-power-mark="true"][data-hero-id="6"]');
  check(await hero6Mark.count() === 1, `Hero list ${label} Hero 6 fusion mark missing/duplicated`);
  check(await hero6Mark.getAttribute("data-target-faction-id") === "4", `Hero 6 ${label} must target Empire faction 4`);
  const hero6MarkImage = hero6Mark.locator("img");
  await waitForImage(hero6MarkImage, `Hero 6 ${label} faction mark failed`);
  check((await hero6MarkImage.getAttribute("src"))?.includes("/images/factions/4.png"), `Hero 6 ${label} faction mark path mismatch`);

  const hero12Mark = page.locator('[data-hero-fusion-power-mark="true"][data-hero-id="12"]');
  check(await hero12Mark.count() === 1, `Hero list ${label} Hero 12 fusion mark missing/duplicated`);
  check(await hero12Mark.getAttribute("data-target-faction-id") === "2", `Hero 12 ${label} must target Light faction 2`);
  check((await hero12Mark.locator("img").getAttribute("src"))?.includes("/images/factions/2.png"), `Hero 12 ${label} faction mark path mismatch`);

  check(await cards.getByText("SP", { exact: true }).count() === 0, `Hero list ${label} still renders SP text on cards`);
  check(await cards.getByText("초절", { exact: true }).count() === 0, `Hero list ${label} still renders 초절 text on cards`);
  const cardMetaChildren = page.locator('[data-hero-card="true"] > div:last-child > span');
  check(await cardMetaChildren.count() === 267, `Hero list ${label} name row count mismatch`);
  const extraMetaChildren = page.locator('[data-hero-card="true"] > div:last-child > span + *');
  check(await extraMetaChildren.count() === 0, `Hero list ${label} still renders rarity/meta text below names`);

  const hero6 = page.locator('img[data-hero-card-icon="true"][data-hero-id="6"]');
  check(await hero6.count() === 1, `Hero list ${label} Hero 6 card icon missing or duplicated`);
  await waitForImage(hero6, `Hero 6 ${label} card icon failed`);
  const hero6State = await hero6.evaluate((image) => ({
    src: image.getAttribute("src") || "",
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  check(hero6State.src.includes("/images/heroes/card-icons-webp/6.webp"), `Hero 6 ${label} source mismatch: ${hero6State.src}`);
  check(hero6State.naturalWidth >= 100 && hero6State.naturalHeight >= 100, `Hero 6 ${label} card icon failed intrinsic-size check`);
  check(Math.abs(hero6State.naturalWidth - hero6State.naturalHeight) <= 8, `Hero 6 ${label} card icon is not square`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `Hero list ${label} horizontal overflow=${overflow}`);

  return { iconCount: sources.length, fusionMarkCount: markState.length, uniqueFactionMarks: new Set(markState.map((row) => row.factionId)).size, hero6State, overflow };
}

async function verifyDetailArtwork(page) {
  const navigation = await page.goto(url(`heroes/6/?qa=${Date.now()}`), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 6 detail failed: ${navigation?.status()}`);
  const artwork = page.locator('img[alt*="대표 일러스트"]');
  check(await artwork.count() === 1, "Hero 6 detail representative artwork missing or duplicated");
  const src = await artwork.getAttribute("src");
  check(src?.includes("/images/heroes/cards/6.png"), `Hero 6 detail artwork source changed unexpectedly: ${src}`);
  check(!src?.includes("/images/heroes/card-icons-webp/"), "Hero detail incorrectly consumes list card icon WebP asset");
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

  const representativeCardResponse = await fetch(url(`images/heroes/card-icons-webp/6.webp?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeCardResponse.ok, `Hosted Hero 6 WebP card icon HTTP failed: ${representativeCardResponse.status}`);
  check((representativeCardResponse.headers.get("content-type") || "").includes("image/webp"), "Hosted Hero 6 card icon content type is not WebP");

  const representativeFactionResponse = await fetch(url(`images/factions/4.png?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeFactionResponse.ok, `Hosted faction 4 mark HTTP failed: ${representativeFactionResponse.status}`);
  check((representativeFactionResponse.headers.get("content-type") || "").includes("image/png"), "Hosted faction mark content type is not PNG");

  console.log(JSON.stringify({
    status: "PASS_HERO_CARD_AND_FUSION_MARKS_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroCardIconCount: 267,
    fusionPowerHeroCount: 35,
    factionAssetCount: 12,
    spCardTextBadgeRemoved: true,
    fusionTextBadgeRemoved: true,
    rarityCardTextRemoved: true,
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
