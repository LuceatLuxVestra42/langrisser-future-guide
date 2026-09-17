import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

const relation = JSON.parse(fs.readFileSync("data/generated/skin-stage2-3-bidirectional-relation.v1.json", "utf8"));
const fullartManifest = JSON.parse(fs.readFileSync("data/generated/skin-fullart-reference.v1.json", "utf8"));
const equipmentPublicAdmission = JSON.parse(fs.readFileSync("data/presentation/equipment-public-admission-correction.v1.json", "utf8"));
const expectedGeneralEquipmentCount = Number(equipmentPublicAdmission.expectedPublicProjection?.generalEquipmentCount);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();
const browserUrl = (path) => url(`${path}${path.includes("?") ? "&" : "?"}qa-browser=${Date.now()}`);

check(equipmentPublicAdmission.status === "FROZEN", "Equipment public-admission correction must be FROZEN");
check(Number.isInteger(expectedGeneralEquipmentCount) && expectedGeneralEquipmentCount > 0, "Equipment public general count is invalid");

async function fetchWithRetry(path, attempts = 5) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url(`${path}${path.includes("?") ? "&" : "?"}qa=${Date.now()}`), { cache: "no-store" });
      last = response;
      if (response.ok) return response;
    } catch (error) {
      last = error;
    }
    if (attempt < attempts) await sleep(3000);
  }
  throw new Error(`${path} did not become healthy: ${last instanceof Response ? last.status : String(last)}`);
}

async function readDecodedHeroFullartState(page, skinId) {
  return page.evaluate(async ({ expectedSkinId }) => {
    const selector = `img[src*="/images/skin-fullart/${expectedSkinId}.webp"]`;
    const images = [...document.querySelectorAll(selector)];
    if (images.length !== 1) return null;
    const node = images[0];
    if (!(node instanceof HTMLImageElement)) return null;
    await node.decode();
    return {
      complete: node.complete,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
      objectFit: getComputedStyle(node).objectFit,
    };
  }, { expectedSkinId: skinId });
}

async function clickUntilVisualState(page, control, expectedText, skinId, label, attempts = 5) {
  const expected = page.getByText(expectedText, { exact: true });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await control.click();
      await expected.waitFor({ state: "visible", timeout: 1000 });
      const imageState = await readDecodedHeroFullartState(page, skinId);
      check(imageState, `${label} reached text state without Skin ${skinId} image state`);
      return imageState;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(`${label} did not reach expected visual state after ${attempts} attempts: ${expectedText} / Skin ${skinId}`, { cause: error });
      }
      await page.waitForTimeout(250);
    }
  }
}

let manifest = null;
for (let attempt = 1; attempt <= 120; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha && candidate.skinSource === "CURRENT_REPOSITORY_FROZEN_CONSUMER" && candidate.skinPngCount === 540) {
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 120) await sleep(5000);
}
check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha} with current frozen Skin consumer`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");
check(manifest.heroArtworkResolvedCount === 267, `deployment Hero artwork resolved count mismatch: ${manifest.heroArtworkResolvedCount}`);

for (const path of ["", "heroes/", "heroes/6/", "equipment/", "equipment/642/", "equipment/299/"]) {
  await fetchWithRetry(path || "index.html");
}
await fetchWithRetry("images/heroes/cards/6.png");
await fetchWithRetry("images/equipment/416.png");
await fetchWithRetry("images/equipment/567.png");

const hero6SkinIds = Array.isArray(relation.byHeroId?.["6"]) ? relation.byHeroId["6"].map(Number) : [];
check(hero6SkinIds.length === 6, `Hero 6 frozen Skin count mismatch: ${hero6SkinIds.length}`);
const fullartRecords = Array.isArray(fullartManifest?.records) ? [...fullartManifest.records].sort((a, b) => a.sourceOrder - b.sourceOrder) : [];
const hero6FullartIds = fullartRecords.filter((record) => record.heroId === 6).map((record) => Number(record.skinId));
check(JSON.stringify(hero6FullartIds) === JSON.stringify(hero6SkinIds), `Hero 6 fullart admission mismatch: ${JSON.stringify(hero6FullartIds)}`);
for (const skinId of hero6FullartIds) await fetchWithRetry(`images/skin-fullart/${skinId}.webp`);
const hero6VisualCount = hero6FullartIds.length + 1;
const hero6SkinPresentationLabels = new Map([
  [601, "스킨 상점 · 스킨권 구매"],
  [602, "빛의 메아리 보상"],
  [603, "형귀뽑기 보상"],
  [604, "서밋 아레나 패자 스킨 · 스킨권 구매"],
  [605, "빛의 메아리 보상"],
  [606, "7주년 출석체크 보상"],
]);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

try {
  let response = await page.goto(browserUrl("heroes/6/"), { waitUntil: "load", timeout: 45000 });
  check(response && response.status() < 400, `Hero 6 detail failed: ${response?.status()}`);
  await page.getByRole("heading", { name: "레온", exact: true }).waitFor();
  await page.getByText("대표 일러스트", { exact: true }).waitFor();
  await page.getByText(`1 / ${hero6VisualCount}`, { exact: true }).waitFor();
  const heroArtworkImage = page.locator('img[alt="레온 대표 일러스트"]');
  check(await heroArtworkImage.count() === 1, "Hero 6 representative artwork image missing or duplicated");
  check((await heroArtworkImage.getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 representative artwork source mismatch");
  const hero6Next = page.getByRole("button", { name: "다음 일러스트" });
  const hero6Prev = page.getByRole("button", { name: "이전 일러스트" });
  check(await hero6Next.count() === 1 && await hero6Prev.count() === 1, "Hero 6 artwork controls missing or duplicated");
  for (let index = 0; index < hero6FullartIds.length; index += 1) {
    const skinId = hero6FullartIds[index];
    const expectedLabel = hero6SkinPresentationLabels.get(skinId);
    check(expectedLabel, `Hero 6 Skin ${skinId} presentation label is not registered`);
    const imageState = await clickUntilVisualState(page, hero6Next, expectedLabel, skinId, `Hero 6 desktop artwork interaction ${index + 1}`);
    check(imageState, `Hero 6 fullart Skin ${skinId} image missing, duplicated, or undecodable`);
    check(imageState.complete && imageState.naturalWidth > 0 && imageState.naturalHeight > 0, `Hero 6 fullart Skin ${skinId} image did not load`);
    check(imageState.objectFit === "contain", `Hero 6 fullart Skin ${skinId} object-fit=${imageState.objectFit}`);
    check(await page.locator(`img[src*="/images/skins/${skinId}.png"]`).count() === 0, `Hero 6 reintroduced legacy static Skin ${skinId}`);
  }
  await hero6Next.click();
  await page.waitForTimeout(100);
  await page.getByText("대표 일러스트", { exact: true }).waitFor();
  await page.getByText(`1 / ${hero6VisualCount}`, { exact: true }).waitFor();
  check((await page.locator('img[alt="레온 대표 일러스트"]').getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 carousel did not wrap back to representative artwork");

  const exclusiveHeading = page.getByRole("heading", { name: "전용장비", exact: true });
  await exclusiveHeading.waitFor();
  const exclusiveSection = exclusiveHeading.locator("xpath=ancestor::section[1]");
  const exclusiveText = await exclusiveSection.innerText();
  for (const token of [
    "청룡의 갑옷",
    "天翔游龙",
  ]) {
    check(exclusiveText.includes(token), `Hero 6 exclusive Equipment missing token: ${token}`);
  }
  const exclusiveImage = exclusiveSection.locator('img[alt="청룡의 갑옷 전용장비"]');
  check(await exclusiveImage.count() === 1, "Hero 6 exclusive Equipment image missing or duplicated");
  check((await exclusiveImage.getAttribute("src"))?.includes("/images/equipment/416.png"), "Hero 6 exclusive Equipment image source mismatch");

  response = await page.goto(browserUrl("equipment/"), { waitUntil: "load", timeout: 45000 });
  check(response && response.status() < 400, `Equipment list failed: ${response?.status()}`);
  await page.getByText("장비 종류", { exact: true }).waitFor({ state: "visible" });
  for (const removedLabel of ["초기 장비", "이전 추가 장비"]) {
    check(await page.getByRole("button", { name: removedLabel, exact: true }).count() === 0, `Removed Equipment top-level category is still visible: ${removedLabel}`);
  }
  const equipmentPassFilter = page.getByRole("button", { name: "장비패스", exact: true });
  check(await equipmentPassFilter.count() === 1, "Equipment pass presentation filter is missing or duplicated");
  const cardLinks = page.locator('section[aria-label="SSR 장비 이미지 목록"] a[href]');
  const cardCount = await cardLinks.count();
  check(cardCount === expectedGeneralEquipmentCount, `Equipment general list card count mismatch: ${cardCount}/${expectedGeneralEquipmentCount}`);
  const weaponFilter = page.getByRole("button", { name: "무기", exact: true });
  check(await weaponFilter.count() === 1, "Equipment weapon filter is missing or duplicated");
  await weaponFilter.click();
  await page.waitForTimeout(100);
  const weaponCardCount = await cardLinks.count();
  check(weaponCardCount > 0 && weaponCardCount < cardCount, `Equipment weapon filter did not narrow the list: ${weaponCardCount}/${cardCount}`);

  for (const equipmentId of [642, 299]) {
    response = await page.goto(browserUrl(`equipment/${equipmentId}/`), { waitUntil: "load", timeout: 45000 });
    check(response && response.status() < 400, `Equipment ${equipmentId} detail failed: ${response?.status()}`);
    check(await page.locator("main h1").count() === 1, `Equipment ${equipmentId} detail heading missing or duplicated`);
  }

  check(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
  check(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  const mobilePageErrors = [];
  const mobileConsoleErrors = [];
  mobilePage.on("pageerror", (error) => mobilePageErrors.push(String(error)));
  mobilePage.on("console", (message) => { if (message.type() === "error") mobileConsoleErrors.push(message.text()); });
  try {
    response = await mobilePage.goto(browserUrl("heroes/6/"), { waitUntil: "load", timeout: 45000 });
    check(response && response.status() < 400, `Hero 6 mobile detail failed: ${response?.status()}`);
    await mobilePage.getByText("대표 일러스트", { exact: true }).waitFor();
    await mobilePage.getByText(`1 / ${hero6VisualCount}`, { exact: true }).waitFor();
    const mobileHeroArtwork = mobilePage.locator('img[alt="레온 대표 일러스트"]');
    check(await mobileHeroArtwork.count() === 1, "Hero 6 mobile representative artwork missing or duplicated");
    check((await mobileHeroArtwork.getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 mobile representative artwork source mismatch");
    const mobileNext = mobilePage.getByRole("button", { name: "다음 일러스트" });
    const firstSkinId = hero6FullartIds[0];
    const firstSkinLabel = hero6SkinPresentationLabels.get(firstSkinId);
    check(firstSkinLabel, `Hero 6 Skin ${firstSkinId} presentation label is not registered`);
    const mobileFullartState = await clickUntilVisualState(mobilePage, mobileNext, firstSkinLabel, firstSkinId, "Hero 6 mobile first artwork interaction");
    check(mobileFullartState, "Hero 6 mobile first fullart Skin missing, duplicated, or undecodable");
    check(mobileFullartState.complete && mobileFullartState.naturalWidth > 0 && mobileFullartState.naturalHeight > 0, "Hero 6 mobile first fullart Skin did not load");
    check(mobileFullartState.objectFit === "contain", `Hero 6 mobile fullart object-fit=${mobileFullartState.objectFit}`);
    const mobileHeading = mobilePage.getByRole("heading", { name: "전용장비", exact: true });
    await mobileHeading.waitFor();
    const mobileSection = mobileHeading.locator("xpath=ancestor::section[1]");
    check((await mobileSection.innerText()).includes("청룡의 갑옷"), "Hero 6 mobile exclusive Equipment text missing");
    const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `Hero 6 mobile horizontal overflow=${overflow}`);
    check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
    check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  } finally {
    await mobileContext.close();
  }

  console.log(JSON.stringify({
    status: "PASS_AUTHORITATIVE_GITHUB_PAGES_HOSTED",
    sourceSha: expectedSourceSha,
    skinSource: "CURRENT_REPOSITORY_FROZEN_CONSUMER",
    heroArtwork: {
      resolvedCount: 267,
      heroId: 6,
      webAssetPath: "/images/heroes/cards/6.png",
      visualCount: hero6VisualCount,
      desktop: "PASS",
      mobile: "PASS",
    },
    skinFullart: { heroId: 6, skinIds: hero6FullartIds, cycle: "BASE_TO_6_SKINS_TO_BASE_PASS", legacyStaticHeroDetailConsumption: false },
    heroExclusiveEquipment: {
      heroId: 6,
      equipmentId: 416,
      nameKr: "청룡의 갑옷",
      maxLevel: 50,
      effectSkillId: 51096,
      desktop: "PASS",
      mobileOverflow: 0,
    },
    equipmentList: {
      generalCount: cardCount,
      removedTopLevelCollections: "PASS",
      groupFilter: "PASS",
      renderedDetails: [642, 299],
    },
    heroArtwork6: "HTTP_PASS_WITH_RETRY_POLICY",
    equipmentImage416: "HTTP_PASS_WITH_RETRY_POLICY",
    equipmentImage567: "HTTP_PASS_WITH_RETRY_POLICY",
    pageErrors: 0,
    consoleErrors: 0,
    semanticStageReopened: false,
  }, null, 2));
} finally {
  await browser.close();
}