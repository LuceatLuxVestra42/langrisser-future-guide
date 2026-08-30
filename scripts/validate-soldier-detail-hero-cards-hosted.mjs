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

async function waitForImage(image, message) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((node) => node.complete && node.naturalWidth > 0 ? true : new Promise((resolve, reject) => {
    node.addEventListener("load", () => resolve(true), { once: true });
    node.addEventListener("error", () => reject(new Error("image failed to load")), { once: true });
  })).catch((error) => { throw new Error(`${message}: ${error}`); });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  const navigation = await page.goto(url(`soldiers/?qa=${Date.now()}`), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Soldier list navigation failed: ${navigation?.status()}`);

  const soldier101Link = page.locator('a[href$="/soldiers/101"]');
  check(await soldier101Link.count() === 1, `Soldier 101 list link missing/duplicated: ${await soldier101Link.count()}`);
  await soldier101Link.click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 20000 });
  check(new URL(page.url()).pathname.endsWith("/soldiers/101"), `Soldier detail client navigation did not reach /soldiers/101: ${page.url()}`);
  await page.getByText("사용 가능 영웅", { exact: true }).waitFor({ state: "visible", timeout: 20000 });

  const heroCardImages = dialog.locator('img[src*="/images/heroes/card-icons-webp/"]');
  const heroCardCount = await heroCardImages.count();
  check(heroCardCount > 0, "Soldier 101 detail rendered no Hero card WebP images");
  await waitForImage(heroCardImages.first(), "Soldier 101 first Hero card image failed");

  const sources = await heroCardImages.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  check(sources.every((src) => src.includes("/images/heroes/card-icons-webp/") && src.endsWith(".webp")), "Soldier detail contains a non-WebP Hero card source");
  check(pageErrors.length === 0, `Soldier detail page errors: ${JSON.stringify(pageErrors)}`);
  check(consoleErrors.length === 0, `Soldier detail console errors: ${JSON.stringify(consoleErrors)}`);

  console.log(JSON.stringify({
    status: "PASS_SOLDIER_DETAIL_HERO_CARDS_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    soldierId: 101,
    heroCardCount,
    clientNavigation: true,
    pageErrors: 0,
    consoleErrors: 0,
    semanticStageReopened: false,
  }, null, 2));
} finally {
  await browser.close();
}
