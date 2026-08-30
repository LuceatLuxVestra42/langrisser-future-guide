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
check(deployment.semanticStageReopened === false, "deployment manifest reopened Hero foundation semantic stage");
check(deployment.fusionSemanticExpanded === true, "deployment manifest did not record fusion semantic expansion");
check(deployment.heroCardIconResolvedCount === 267, `deployment Hero card icon count mismatch: ${deployment.heroCardIconResolvedCount}`);
check(deployment.heroFusionPowerResolvedCount === 43, `deployment Hero fusion-power count mismatch: ${deployment.heroFusionPowerResolvedCount}`);
check(deployment.heroFusionFactionTargetHeroCount === 41, `deployment faction fusion count mismatch: ${deployment.heroFusionFactionTargetHeroCount}`);
check(deployment.heroFusionClassTargetHeroCount === 2, `deployment class fusion count mismatch: ${deployment.heroFusionClassTargetHeroCount}`);
check(deployment.heroFusionFactionAssetCount === 12, `deployment faction-mark asset count mismatch: ${deployment.heroFusionFactionAssetCount}`);
check(deployment.heroFusionClassAssetCount === 3, `deployment class-mark asset count mismatch: ${deployment.heroFusionClassAssetCount}`);
check(deployment.heroFusionPowerFreezeState === "HERO_FUSION_POWER_EXPANDED_FROZEN", "deployment expanded fusion-power freeze mismatch");
check(deployment.heroFusionPowerBaselineFreezeState === "HERO_FUSION_POWER_PRESENTATION_FROZEN", "deployment baseline fusion freeze mismatch");
check(deployment.heroFusionPowerExceptionFreezeState === "HERO_FUSION_POWER_EXCEPTION_EXPANSION_FROZEN", "deployment exception fusion freeze mismatch");
check(deployment.heroFusionFactionAssetFreezeState === "HERO_FUSION_FACTION_ASSETS_FROZEN", "deployment faction-asset freeze mismatch");

async function waitForImage(image, message) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((node) => node.complete && node.naturalWidth > 0 ? true : new Promise((resolve, reject) => {
    node.addEventListener("load", () => resolve(true), { once: true });
    node.addEventListener("error", () => reject(new Error("image failed to load")), { once: true });
  })).catch((error) => { throw new Error(`${message}: ${error}`); });
}

async function verifyList(page, label, expectedMarkSize) {
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
  check(await fusionMarks.count() === 43, `Hero list ${label} fusion mark count mismatch: ${await fusionMarks.count()}`);
  const markState = await fusionMarks.evaluateAll((nodes) => nodes.map((node) => ({
    heroId: Number(node.getAttribute("data-hero-id")),
    targetType: node.getAttribute("data-target-type") || "",
    factionId: node.hasAttribute("data-target-faction-id") ? Number(node.getAttribute("data-target-faction-id")) : null,
    classIds: node.getAttribute("data-target-class-ids") || "",
    markKind: node.getAttribute("data-mark-kind") || "",
    srcs: Array.from(node.querySelectorAll("img")).map((image) => image.getAttribute("src") || ""),
    text: node.textContent?.trim() || "",
    width: Math.round(node.getBoundingClientRect().width),
    height: Math.round(node.getBoundingClientRect().height),
    rightInset: Math.round(node.parentElement.getBoundingClientRect().right - node.getBoundingClientRect().right),
    topInset: Math.round(node.getBoundingClientRect().top - node.parentElement.getBoundingClientRect().top),
  })));
  check(markState.every((row) => Number.isInteger(row.heroId) && row.heroId > 0), `Hero list ${label} has invalid fusion Hero ID`);
  check(new Set(markState.map((row) => row.heroId)).size === 43, `Hero list ${label} fusion Hero IDs are not unique`);
  check(markState.every((row) => row.targetType === "FACTION" || row.targetType === "CLASS"), `Hero list ${label} has invalid fusion target type`);
  check(markState.every((row) => row.text === ""), `Hero list ${label} fusion mark contains visible text`);
  check(markState.every((row) => row.width === expectedMarkSize && row.height === expectedMarkSize), `Hero list ${label} fusion mark responsive size mismatch`);
  check(markState.every((row) => row.rightInset === 6 && row.topInset === 6), `Hero list ${label} fusion mark inset must remain 6px`);

  const factionMarks = markState.filter((row) => row.targetType === "FACTION");
  const classMarks = markState.filter((row) => row.targetType === "CLASS");
  check(factionMarks.length === 41, `Hero list ${label} faction fusion mark count mismatch: ${factionMarks.length}`);
  check(classMarks.length === 2, `Hero list ${label} class fusion mark count mismatch: ${classMarks.length}`);
  check(factionMarks.every((row) => Number.isInteger(row.factionId) && row.factionId >= 1 && row.factionId <= 12), `Hero list ${label} has invalid target faction ID`);
  check(new Set(factionMarks.map((row) => row.factionId)).size === 12, `Hero list ${label} must cover 12 faction marks`);
  check(factionMarks.every((row) => row.srcs.length === 1 && row.srcs[0].includes(`/images/factions/${row.factionId}.png`)), `Hero list ${label} faction mark source mismatch`);

  const expectedFactionExceptions = new Map([
    [124, 6],
    [99197, 10],
    [99192, 7],
    [99218, 11],
    [99237, 9],
    [99287, 12],
  ]);
  for (const [heroId, factionId] of expectedFactionExceptions) {
    const row = factionMarks.find((candidate) => candidate.heroId === heroId);
    check(row?.factionId === factionId, `Hero ${heroId} ${label} expanded faction target mismatch`);
  }

  const heavenDefier = classMarks.find((row) => row.heroId === 99264);
  check(heavenDefier?.classIds === "9", `HeavenDefier ${label} class target must be Monster(9)`);
  check(heavenDefier?.markKind === "SINGLE" && heavenDefier.srcs.length === 1, `HeavenDefier ${label} class mark must be single`);
  check(heavenDefier?.srcs[0]?.includes("/images/army/Icon_Occupation_Monster.png"), `HeavenDefier ${label} must use official Monster class icon`);

  const lightbringer = classMarks.find((row) => row.heroId === 99184);
  check(lightbringer?.classIds === "2,8", `Lightbringer ${label} class targets must be Infantry(2)+Holy(8)`);
  check(lightbringer?.markKind === "COMPOSITE" && lightbringer.srcs.length === 2, `Lightbringer ${label} class mark must be a two-icon composite`);
  check(lightbringer?.srcs[0]?.includes("/images/army/Icon_Occupation_Infantryman.png"), `Lightbringer ${label} composite first half must use official Infantry icon`);
  check(lightbringer?.srcs[1]?.includes("/images/army/Icon_Occupation_Monk.png"), `Lightbringer ${label} composite second half must use official Monk icon`);

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

  for (const mark of [page.locator('[data-hero-fusion-power-mark="true"][data-hero-id="99264"] img'), page.locator('[data-hero-fusion-power-mark="true"][data-hero-id="99184"] img').first(), page.locator('[data-hero-fusion-power-mark="true"][data-hero-id="99184"] img').nth(1)]) {
    await waitForImage(mark, `Hero list ${label} expanded class mark failed`);
  }

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

  return {
    iconCount: sources.length,
    fusionMarkCount: markState.length,
    factionFusionMarkCount: factionMarks.length,
    classFusionMarkCount: classMarks.length,
    uniqueFactionMarks: new Set(factionMarks.map((row) => row.factionId)).size,
    markSize: expectedMarkSize,
    markInset: 6,
    hero6State,
    overflow,
  };
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
  const desktop = await verifyList(desktopPage, "desktop", 32);
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
  const mobile = await verifyList(mobilePage, "mobile", 28);
  check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
  check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  await mobileContext.close();

  const representativeCardResponse = await fetch(url(`images/heroes/card-icons-webp/6.webp?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeCardResponse.ok, `Hosted Hero 6 WebP card icon HTTP failed: ${representativeCardResponse.status}`);
  check((representativeCardResponse.headers.get("content-type") || "").includes("image/webp"), "Hosted Hero 6 card icon content type is not WebP");

  const representativeFactionResponse = await fetch(url(`images/factions/4.png?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeFactionResponse.ok, `Hosted faction 4 mark HTTP failed: ${representativeFactionResponse.status}`);
  check((representativeFactionResponse.headers.get("content-type") || "").includes("image/png"), "Hosted faction mark content type is not PNG");

  const representativeClassResponse = await fetch(url(`images/army/Icon_Occupation_Monster.png?qa=${Date.now()}`), { cache: "no-store" });
  check(representativeClassResponse.ok, `Hosted Monster class mark HTTP failed: ${representativeClassResponse.status}`);
  check((representativeClassResponse.headers.get("content-type") || "").includes("image/png"), "Hosted Monster class mark content type is not PNG");

  console.log(JSON.stringify({
    status: "PASS_HERO_CARD_AND_EXPANDED_FUSION_MARKS_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroCardIconCount: 267,
    fusionPowerHeroCount: 43,
    factionFusionHeroCount: 41,
    classFusionHeroCount: 2,
    factionAssetCount: 12,
    classAssetCount: 3,
    fusionMarkMobileSizePx: 28,
    fusionMarkDesktopSizePx: 32,
    fusionMarkInsetPx: 6,
    remoteRuntimeHotlink: false,
    listDetailArtworkSeparated: true,
    heroFoundationSemanticStageReopened: false,
    fusionSemanticExpanded: true,
    desktop,
    mobile,
    detailArtworkSrc,
    pageErrors: 0,
    consoleErrors: 0,
  }, null, 2));
} finally {
  await browser.close();
}
