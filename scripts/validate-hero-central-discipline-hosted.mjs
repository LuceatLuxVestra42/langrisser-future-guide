import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

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

const response = await fetch(url(`heroes/6/?qa=${Date.now()}`), { cache: "no-store" });
check(response.ok, `Hero 6 Hosted HTTP failed: ${response.status}`);

const requiredTokens = [
  "중앙율정",
  "RELEASED",
  "骑士楷模",
  "Skill #90085",
  "장비 레벨",
  "Lv.1",
  "영웅 성급",
  "6성",
  "율정 레벨",
  "Lv.5",
  "GoodsType 6 · ID 3303",
  "× 12",
  "Template #3",
  "Template #1",
  "Template #29",
  "Template #32",
  "Template #41",
  "ConfigDataHeroInfo.CastingLawSkill_ID -> ConfigDataSkillInfo.ID",
];

async function verifyCentralDiscipline(page, label) {
  const navigation = await page.goto(url("heroes/6/"), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 6 ${label} detail failed: ${navigation?.status()}`);
  await page.getByText("Hero #6", { exact: true }).waitFor();
  const section = page.locator("[data-hero-central-discipline]");
  check(await section.count() === 1, `Hero 6 ${label} central discipline section missing or duplicated`);
  const text = await section.innerText();
  for (const token of requiredTokens) {
    check(text.includes(token), `Hero 6 ${label} central discipline missing token: ${token}`);
  }
  return section;
}

const browser = await chromium.launch({ headless: true });
try {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const desktopPageErrors = [];
  const desktopConsoleErrors = [];
  desktopPage.on("pageerror", (error) => desktopPageErrors.push(String(error)));
  desktopPage.on("console", (message) => { if (message.type() === "error") desktopConsoleErrors.push(message.text()); });
  await verifyCentralDiscipline(desktopPage, "desktop");
  check(desktopPageErrors.length === 0, `desktop page errors: ${JSON.stringify(desktopPageErrors)}`);
  check(desktopConsoleErrors.length === 0, `desktop console errors: ${JSON.stringify(desktopConsoleErrors)}`);
  await desktopPage.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  const mobilePageErrors = [];
  const mobileConsoleErrors = [];
  mobilePage.on("pageerror", (error) => mobilePageErrors.push(String(error)));
  mobilePage.on("console", (message) => { if (message.type() === "error") mobileConsoleErrors.push(message.text()); });
  await verifyCentralDiscipline(mobilePage, "mobile");
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `Hero 6 mobile horizontal overflow=${overflow}`);
  check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
  check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  await mobileContext.close();

  console.log(JSON.stringify({
    status: "PASS_HERO_CENTRAL_DISCIPLINE_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroId: 6,
    centralDiscipline: {
      status: "RELEASED",
      skillId: 90085,
      equipmentLevel: 1,
      heroStarLevel: 6,
      castingLawLevel: 5,
      material: { goodsType: 6, sourceId: 3303, count: 12 },
      templateIds: [3, 1, 29, 32, 41],
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
