import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

const targets = [
  { heroId: 99273, nameKr: "태초의 젤다", nameCn: "初真泽瑞达", nameEn: "PureZalrahda" },
  { heroId: 99281, nameKr: "효랑어홍사", nameCn: "骁浪驭虹使", nameEn: "TidalVindicator" },
  { heroId: 99282, nameKr: "은(밴시)", nameCn: "狺", nameEn: "Banshee" },
  { heroId: 99283, nameKr: "아윈(쿠모)", nameCn: "阿云", nameEn: "Kumo" },
  { heroId: 99287, nameKr: "마검의 화신", nameCn: "魔骸剑使", nameEn: "Necroblade" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();

let manifest = null;
for (let attempt = 1; attempt <= 24; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?hero-localization-qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha) {
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 24) await sleep(5000);
}
check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha}`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");

async function assertTargetCard(page, target, query, queryLabel) {
  const input = page.locator("#hero-search");
  await input.fill("");
  await input.fill(query);
  const targetCard = page.locator(`[data-hero-card="true"][data-hero-id="${target.heroId}"]`);
  await targetCard.waitFor({ state: "visible", timeout: 15000 });
  check((await targetCard.innerText()).includes(target.nameKr), `${target.heroId} ${queryLabel} search lost effective Korean display name`);
  check(await targetCard.getAttribute("data-name-kr-status") === "provisional-display", `${target.heroId} ${queryLabel} search status metadata mismatch`);
  check(await targetCard.getAttribute("data-name-source-authority") === "CN", `${target.heroId} ${queryLabel} search authority metadata mismatch`);
  return targetCard;
}

async function verifyDesktop(page) {
  const navigation = await page.goto(url("heroes/"), { waitUntil: "domcontentloaded", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero list desktop failed: ${navigation?.status()}`);
  await page.locator("#hero-search").waitFor({ state: "visible", timeout: 15000 });

  for (const target of targets) {
    await assertTargetCard(page, target, target.nameKr, "KR");
    await assertTargetCard(page, target, target.nameCn, "CN");
    await assertTargetCard(page, target, target.nameEn, "EN");

    const card = await assertTargetCard(page, target, target.nameKr, "KR-navigation");
    await card.click();
    await page.waitForURL(new RegExp(`/heroes/${target.heroId}/?$`), { timeout: 45000 });

    const main = page.locator("main").first();
    check(await main.getAttribute("data-name-kr-status") === "provisional-display", `${target.heroId} detail status metadata mismatch`);
    check(await main.getAttribute("data-name-source-authority") === "CN", `${target.heroId} detail authority metadata mismatch`);
    check((await page.locator("h1").first().innerText()).trim() === target.nameKr, `${target.heroId} detail H1 mismatch`);
    check((await page.title()).startsWith(`${target.nameKr} |`), `${target.heroId} detail title mismatch: ${await page.title()}`);
    check(await page.getByText(target.nameCn, { exact: true }).count() >= 1, `${target.heroId} detail CN name missing`);
    check(await page.getByText(target.nameEn, { exact: true }).count() >= 1, `${target.heroId} detail EN name missing`);

    const back = await page.goto(url("heroes/"), { waitUntil: "domcontentloaded", timeout: 45000 });
    check(back && back.status() < 400, `${target.heroId} return to Hero list failed: ${back?.status()}`);
    await page.locator("#hero-search").waitFor({ state: "visible", timeout: 15000 });
  }
}

async function verifyMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  try {
    const navigation = await page.goto(url("heroes/"), { waitUntil: "domcontentloaded", timeout: 45000 });
    check(navigation && navigation.status() < 400, `Hero list mobile failed: ${navigation?.status()}`);
    await page.locator("#hero-search").waitFor({ state: "visible", timeout: 15000 });
    for (const target of targets) {
      await assertTargetCard(page, target, target.nameKr, "mobile-KR");
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `Hero list mobile horizontal overflow=${overflow}`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await verifyDesktop(page);
  check(pageErrors.length === 0, `desktop page errors: ${JSON.stringify(pageErrors)}`);
  await page.close();
  await verifyMobile(browser);

  console.log(JSON.stringify({
    status: "PASS_HERO_PROVISIONAL_LOCALIZATION_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroCount: targets.length,
    krSearch: "5/5",
    cnAliasSearch: "5/5",
    enAliasSearch: "5/5",
    cardMetadata: "5/5 provisional-display / CN",
    detailNavigation: "5/5",
    detailDisplay: "5/5",
    detailMetadata: "5/5 provisional-display / CN",
    mobileKrSearch: "5/5",
    semanticStageReopened: false,
  }, null, 2));
} finally {
  await browser.close();
}
