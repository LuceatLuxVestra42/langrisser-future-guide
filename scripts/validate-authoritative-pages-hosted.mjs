import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
const expectedSkinRef = process.env.EXPECTED_SKIN_REF;
if (!expectedSourceSha || !expectedSkinRef) throw new Error("EXPECTED_SOURCE_SHA and EXPECTED_SKIN_REF are required");

const relation = JSON.parse(fs.readFileSync("data/generated/skin-stage2-3-bidirectional-relation.v1.json", "utf8"));
const projection = JSON.parse(fs.readFileSync("data/presentation/equipment-p3-1-release-metadata.v1.json", "utf8"));
const expectedPolicy = "장비 종류·세부 타입 순서를 유지하고, 같은 세부 타입 안에서는 확인된 출시 그룹 기준 최신순이야. 같은 출시 그룹 안의 개별 순서는 별도 출시순 의미가 없어.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();

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

let manifest = null;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha && candidate.skinRuntimeRef === expectedSkinRef) {
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 30) await sleep(5000);
}
check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha} skin=${expectedSkinRef}`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");

for (const path of ["", "heroes/", "equipment/", "equipment/642/", "equipment/299/"]) {
  await fetchWithRetry(path || "index.html");
}
await fetchWithRetry("images/equipment/567.png");

const heroRows = Object.entries(relation.byHeroId ?? {})
  .map(([heroId, skinIds]) => ({ heroId: Number(heroId), skinIds: Array.isArray(skinIds) ? skinIds.map(Number) : [] }))
  .sort((a, b) => b.skinIds.length - a.skinIds.length || a.heroId - b.heroId);
const skinHero = heroRows[0];
check(skinHero?.skinIds?.length >= 2, "no multi-Skin representative Hero");
const firstSkinId = skinHero.skinIds[0];
const secondSkinId = skinHero.skinIds[1];
await fetchWithRetry(`images/skins/${firstSkinId}.png`);
await fetchWithRetry(`images/skins/${secondSkinId}.png`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

try {
  let response = await page.goto(url(`heroes/${skinHero.heroId}/`), { waitUntil: "networkidle", timeout: 45000 });
  check(response && response.status() < 400, `Hero ${skinHero.heroId} route failed: ${response?.status()}`);
  await page.getByText(`Hero #${skinHero.heroId}`, { exact: true }).waitFor();
  const next = page.getByRole("button", { name: "다음 일러스트" });
  const prev = page.getByRole("button", { name: "이전 일러스트" });
  check(await next.count() === 1 && await prev.count() === 1, "Skin carousel controls are missing or duplicated");

  async function currentSkinLabel() {
    const locator = page.getByText(/스킨 \d+ · ID \d+/).first();
    return await locator.count() ? (await locator.textContent())?.trim() ?? null : null;
  }
  async function reachSkin(skinId) {
    for (let step = 0; step <= skinHero.skinIds.length + 2; step += 1) {
      const label = await currentSkinLabel();
      if (label?.endsWith(`ID ${skinId}`)) return label;
      await next.click();
      await page.waitForTimeout(100);
    }
    throw new Error(`Could not reach Skin ${skinId}`);
  }

  const firstLabel = await reachSkin(firstSkinId);
  check(firstLabel === `스킨 1 · ID ${firstSkinId}`, `first Skin label mismatch: ${firstLabel}`);
  let activeImage = page.locator("main section img[alt]").first();
  check((await activeImage.getAttribute("src"))?.includes(`/images/skins/${firstSkinId}.png`), "first Skin image source mismatch");
  await next.click();
  await page.waitForTimeout(100);
  const secondLabel = await currentSkinLabel();
  check(secondLabel === `스킨 2 · ID ${secondSkinId}`, `second Skin label mismatch: ${secondLabel}`);
  activeImage = page.locator("main section img[alt]").first();
  check((await activeImage.getAttribute("src"))?.includes(`/images/skins/${secondSkinId}.png`), "second Skin image source mismatch");

  response = await page.goto(url("equipment/"), { waitUntil: "networkidle", timeout: 45000 });
  check(response && response.status() < 400, `Equipment list failed: ${response?.status()}`);
  await page.getByRole("button", { name: /장비패스/ }).click();
  await page.getByText(expectedPolicy, { exact: true }).waitFor({ state: "visible" });
  const cardLinks = page.locator('section[aria-label="SSR 장비 이미지 목록"] a[href]');
  const cardCount = await cardLinks.count();
  check(cardCount === projection.scope.targetCount, `Equipment tab3 card count mismatch: ${cardCount}`);
  const actualIds = [];
  for (let index = 0; index < cardCount; index += 1) {
    const href = await cardLinks.nth(index).getAttribute("href");
    const match = href?.match(/\/equipment\/(\d+)\/?$/);
    check(match, `unexpected Equipment href: ${href}`);
    actualIds.push(Number(match[1]));
  }
  check(JSON.stringify(actualIds) === JSON.stringify(projection.defaultOrderEquipmentIds), "Equipment P3-2 default order parity failed");

  for (const [equipmentId, expectedDate] of [[642, "2026-07-16"], [299, "2019-05-09"]]) {
    response = await page.goto(url(`equipment/${equipmentId}/`), { waitUntil: "networkidle", timeout: 45000 });
    check(response && response.status() < 400, `Equipment ${equipmentId} detail failed: ${response?.status()}`);
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "획득 계열", exact: true }) }).first();
    await section.getByText("확인된 출시 그룹 날짜", { exact: true }).waitFor();
    await section.getByText(expectedDate, { exact: true }).waitFor();
    check(!(await section.innerText()).includes("REVIEW"), `Equipment ${equipmentId} acquisition exposes REVIEW`);
  }

  check(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
  check(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);

  console.log(JSON.stringify({
    status: "PASS_AUTHORITATIVE_GITHUB_PAGES_HOSTED",
    sourceSha: expectedSourceSha,
    skinRuntimeRef: expectedSkinRef,
    skinRepresentative: { heroId: skinHero.heroId, firstSkinId, secondSkinId },
    equipmentP3_2: { tab3Count: cardCount, defaultOrderParity: "PASS", details: { 642: "2026-07-16", 299: "2019-05-09" } },
    equipmentImage567: "HTTP_PASS_WITH_RETRY_POLICY",
    pageErrors: 0,
    consoleErrors: 0,
    semanticStageReopened: false,
  }, null, 2));
} finally {
  await browser.close();
}
