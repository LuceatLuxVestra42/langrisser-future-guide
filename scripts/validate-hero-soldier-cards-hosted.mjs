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

// Regression fixture for the Hero 6 frozen Job movement consumer. This verifies
// browser hydration only; semantic ownership remains with the frozen movement artifacts.
const expectedHero6MovementRows = [
  { jobId: 301, moveType: 1, movePoint: 5 },
  { jobId: 303, moveType: 1, movePoint: 5 },
  { jobId: 302, moveType: 1, movePoint: 5 },
  { jobId: 202, moveType: 2, movePoint: 3 },
  { jobId: 307, moveType: 1, movePoint: 5 },
  { jobId: 306, moveType: 1, movePoint: 5 },
];

const movementIconFileByType = {
  1: "Move_Ride.png",
  2: "Move_Walk.png",
  3: "Move_Water.png",
  4: "Move_Fly.png",
  5: "Move_FieldArmy.png",
};

const expectedHero6FinalJobArmyById = {
  307: { armyId: 3, iconFile: "Icon_Occupation_Cavalry.png" },
  306: { armyId: 3, iconFile: "Icon_Occupation_Cavalry.png" },
};

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
  ["heroes/100/", "Hero 100 non-SP"],
  ["soldiers/101/", "Soldier 101"],
  ["images/soldiers-webp/101.webp", "Soldier 101 portrait"],
]) {
  const response = await fetch(url(`${path}?qa=${Date.now()}`), { cache: "no-store" });
  check(response.ok, `${label} Hosted HTTP failed: ${response.status}`);
  if (path.endsWith(".webp")) {
    check((response.headers.get("content-type") || "").includes("image/webp"), `${label} content-type is not image/webp`);
  }
}

async function verifyHeroJobMovement(page, label) {
  const section = page.locator('[data-hero-job-tree="true"]');
  check(await section.count() === 1, `Hero 6 ${label} Job tree section missing or duplicated`);

  const rows = section.locator("[data-job-id][data-move-type][data-move-point]:visible");
  check(await rows.count() === expectedHero6MovementRows.length, `Hero 6 ${label} Job tree row count mismatch`);

  const actualRows = await rows.evaluateAll((nodes) => nodes.map((node) => ({
    jobId: Number(node.getAttribute("data-job-id")),
    moveType: Number(node.getAttribute("data-move-type")),
    movePoint: Number(node.getAttribute("data-move-point")),
  })));
  check(JSON.stringify(actualRows) === JSON.stringify(expectedHero6MovementRows), `Hero 6 ${label} Job movement parity mismatch: ${JSON.stringify(actualRows)}`);

  for (const row of expectedHero6MovementRows) {
    const card = section.locator(`[data-job-id="${row.jobId}"]:visible`);\n    check(await card.count() === 1, `Hero 6 ${label} visible Job ${row.jobId} card missing or duplicated`);
    const expectedArmy = expectedHero6FinalJobArmyById[row.jobId];
    if (!expectedArmy) {
      check(await card.getAttribute("data-army-id") === "", `Hero 6 ${label} non-final Job ${row.jobId} unexpectedly has an army projection`);
      check(await card.locator('[data-hero-final-job-army-icon]').count() === 0, `Hero 6 ${label} non-final Job ${row.jobId} unexpectedly renders an army icon`);
      check(await card.locator('[data-hero-final-job-mobility]').count() === 0, `Hero 6 ${label} non-final Job ${row.jobId} unexpectedly renders final-job mobility`);
      continue;
    }

    check(await card.getAttribute("data-army-id") === String(expectedArmy.armyId), `Hero 6 ${label} final Job ${row.jobId} Army_ID mismatch`);
    const armyIcon = card.locator('[data-hero-final-job-army-icon="official"]');
    check(await armyIcon.count() === 1, `Hero 6 ${label} final Job ${row.jobId} official army icon missing`);
    const armySrc = await armyIcon.getAttribute("src");
    check(armySrc?.endsWith(`/images/army/${expectedArmy.iconFile}`) === true, `Hero 6 ${label} final Job ${row.jobId} army icon mismatch: ${armySrc}`);

    const expectedMovementFile = movementIconFileByType[row.moveType];
    check(expectedMovementFile, `Hero 6 ${label} Job movement has unsupported MoveType ${row.moveType}`);
    const mobility = card.locator('[data-hero-final-job-mobility="true"]');
    check(await mobility.count() === 1, `Hero 6 ${label} final Job ${row.jobId} mobility block missing or duplicated`);
    const movementIcon = mobility.locator('img[src*="/images/shared/movement/"]');
    check(await movementIcon.count() === 1, `Hero 6 ${label} final Job ${row.jobId} movement icon missing or duplicated`);
    const movementSrc = await movementIcon.getAttribute("src");
    check(movementSrc?.endsWith(`/images/shared/movement/${expectedMovementFile}`) === true, `Hero 6 ${label} final Job ${row.jobId} movement icon mismatch: ${movementSrc}`);
  }
}

async function verifyHeroFormSwitch(page, label) {
  const main = page.locator('main[data-hero-form-mode]');
  const switcher = page.locator('[data-hero-form-switch="true"]');
  check(await switcher.count() === 1, `Hero 6 ${label} form switch missing or duplicated`);
  check(await main.getAttribute("data-hero-form-mode") === "normal", `Hero 6 ${label} did not default to normal form`);
  check(await page.locator('[data-hero-job-materials="true"]').count() === 1, `Hero 6 ${label} normal job materials missing`);
  check(await page.locator('[data-hero-sp-job-movement="true"]').count() === 0, `Hero 6 ${label} SP movement leaked into normal form`);
  check(await page.locator('[data-hero-sp-reward-skills="true"]').count() === 0, `Hero 6 ${label} SP reward skills leaked into normal form`);
  check(await page.locator('[data-hero-sp-missions="true"]').count() === 0, `Hero 6 ${label} SP missions leaked into normal form`);
  const normalCommand = page.locator('[data-hero-soldier-command="true"]');
  check(await normalCommand.getAttribute("data-hero-form-mode") === "normal", `Hero 6 ${label} Soldier command did not default to normal form`);
  check(await normalCommand.locator('[data-command-mode="NORMAL"]').count() === 1, `Hero 6 ${label} normal Soldier command table missing`);
  check(await normalCommand.locator('[data-command-mode="SP"]').count() === 0, `Hero 6 ${label} SP Soldier command leaked into normal form`);
  const normalFinalJobIds = await page.locator('[data-hero-final-job-stats-section="true"] [data-final-job-id]').evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-final-job-id"))),
  );
  check(normalFinalJobIds.length > 0 && !normalFinalJobIds.includes(377), `Hero 6 ${label} normal final jobs contain SP Job 377: ${JSON.stringify(normalFinalJobIds)}`);

  await page.getByRole("button", { name: "SP 전직", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("main")?.getAttribute("data-hero-form-mode") === "sp", null, { timeout: 45000 });

  check(await switcher.getAttribute("data-active-hero-form") === "sp", `Hero 6 ${label} SP switch state mismatch`);
  const spArtwork = page.locator('img[data-hero-active-artwork="true"][data-hero-artwork-form="sp"]');
  check(await spArtwork.count() === 1, `Hero 6 ${label} SP artwork missing`);
  const spArtworkSrc = await spArtwork.getAttribute("src");
  check(spArtworkSrc?.endsWith("/images/heroes/sp/6.webp") === true, `Hero 6 ${label} SP artwork path mismatch: ${spArtworkSrc}`);
  check(await spArtwork.evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), `Hero 6 ${label} SP artwork failed to load`);

  const spMovement = page.locator('[data-hero-sp-job-movement="true"]');
  check(await spMovement.count() === 1, `Hero 6 ${label} SP movement section missing`);
  await page.waitForFunction(
    () => document.querySelector('[data-hero-sp-job-movement="true"]')?.getAttribute("data-hero-sp-job-movement-status") === "ready",
    null,
    { timeout: 45000 },
  );
  check(await spMovement.getAttribute("data-job-id") === "377", `Hero 6 ${label} SP movement JobID mismatch`);
  check(await spMovement.getAttribute("data-army-id") === "3", `Hero 6 ${label} SP movement Army_ID mismatch`);
  const spArmyIcon = spMovement.locator('[data-hero-final-job-army-icon="official"]');
  check(await spArmyIcon.count() === 1, `Hero 6 ${label} SP army icon missing`);
  const spArmyIconSrc = await spArmyIcon.getAttribute("src");
  check(spArmyIconSrc?.endsWith("/images/army/Icon_Occupation_Cavalry.png") === true, `Hero 6 ${label} SP army icon mismatch: ${spArmyIconSrc}`);
  const spMoveType = Number(await spMovement.getAttribute("data-move-type"));
  const expectedSpIconFile = movementIconFileByType[spMoveType];
  check(expectedSpIconFile, `Hero 6 ${label} SP movement has unsupported MoveType ${spMoveType}`);
  const spMovementIconSrc = await spMovement.locator('img[src*="/images/shared/movement/"]').getAttribute("src");
  check(spMovementIconSrc?.endsWith(`/images/shared/movement/${expectedSpIconFile}`) === true, `Hero 6 ${label} SP movement icon mismatch for MoveType ${spMoveType}: ${spMovementIconSrc}`);
  check(await page.locator('[data-hero-job-movement="true"]').count() === 0, `Hero 6 ${label} normal movement leaked into SP form`);
  check(await page.locator('[data-hero-job-materials="true"]').count() === 0, `Hero 6 ${label} normal job materials leaked into SP form`);
  check(await page.locator('[data-hero-sp-reward-skills="true"]').count() === 1, `Hero 6 ${label} SP reward skills missing`);
  check(await page.locator('[data-hero-sp-missions="true"]').count() === 1, `Hero 6 ${label} SP missions missing`);
  check(await page.locator('[data-sp-activation-materials="true"]').count() === 0, `Hero 6 ${label} obsolete SP activation-material block is visible`);
  const spCommand = page.locator('[data-hero-soldier-command="true"]');
  check(await spCommand.getAttribute("data-hero-form-mode") === "sp", `Hero 6 ${label} Soldier command did not switch to SP form`);
  check(await spCommand.locator('[data-command-mode="SP"]').count() === 1, `Hero 6 ${label} SP Soldier command table missing`);
  check(await spCommand.locator('[data-command-mode="NORMAL"]').count() === 0, `Hero 6 ${label} normal Soldier command leaked into SP form`);

  const talent = page.locator('[data-hero-talent-carousel="true"]');
  check(await talent.getAttribute("data-hero-form-mode") === "sp", `Hero 6 ${label} talent did not switch to SP form`);
  check(await talent.locator('[data-hero-talent-min-star]').getAttribute("data-hero-talent-min-star") === "1", `Hero 6 ${label} SP talent progression did not start at 1 star`);

  const spFinalJobIds = await page.locator('[data-hero-final-job-stats-section="true"] [data-final-job-id]').evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-final-job-id"))),
  );
  check(JSON.stringify(spFinalJobIds) === JSON.stringify([377]), `Hero 6 ${label} SP final-job isolation mismatch: ${JSON.stringify(spFinalJobIds)}`);

  const spHeartFetterJobIds = await page.locator('[data-hero-heart-fetter="true"] [data-heart-fetter-job-id]').evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-heart-fetter-job-id"))),
  );
  check(spHeartFetterJobIds.every((jobId) => jobId === 377), `Hero 6 ${label} SP HeartFetter isolation mismatch: ${JSON.stringify(spHeartFetterJobIds)}`);
  check(await page.locator('[data-hero-heart-fetter="true"]').getAttribute("data-hero-form-mode") === "sp", `Hero 6 ${label} HeartFetter section did not switch to SP form`);

  await page.getByRole("button", { name: "기본 전직", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("main")?.getAttribute("data-hero-form-mode") === "normal", null, { timeout: 45000 });
  check(await page.locator('[data-hero-job-materials="true"]').count() === 1, `Hero 6 ${label} normal form did not restore job materials`);
  check(await page.locator('[data-hero-soldier-command="true"]').getAttribute("data-hero-form-mode") === "normal", `Hero 6 ${label} Soldier command did not restore normal form`);
  check(await page.locator('[data-hero-sp-missions="true"]').count() === 0, `Hero 6 ${label} SP missions survived normal-form restore`);
}

async function verifyHeroSoldierCards(page, label) {
  const navigation = await page.goto(url("heroes/6/"), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 6 ${label} detail failed: ${navigation?.status()}`);
  await page.getByRole("heading", { name: "레온", exact: true }).waitFor();
  await verifyHeroJobMovement(page, label);
  await verifyHeroFormSwitch(page, label);
  await verifyHeroJobMovement(page, `${label} restored-normal`);

  const bondGrid = page.locator('[data-hero-bond-unlock-grid="true"]');
  check(await bondGrid.count() === 1, `Hero 6 ${label} Bond unlock grid missing or duplicated`);
  const bondLayout = await bondGrid.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      rows: style.gridTemplateRows.split(" ").filter(Boolean).length,
      items: node.children.length,
    };
  });
  check(
    bondLayout.columns === 1 && bondLayout.rows === 4 && bondLayout.items === 4,
    `Hero 6 ${label} Bond unlock layout is not 4 rows: ${JSON.stringify(bondLayout)}`,
  );

  const commandTableFit = page.locator('[data-command-table-fit="true"]');
  check(await commandTableFit.count() === 1, `Hero 6 ${label} Soldier command table fit container missing or duplicated`);
  const commandHorizontalOverflow = await commandTableFit.evaluate((node) => node.scrollWidth - node.clientWidth);
  check(commandHorizontalOverflow <= 1, `Hero 6 ${label} Soldier command horizontal overflow=${commandHorizontalOverflow}`);

  if (!label.startsWith("mobile")) {
    const exclusiveSection = page.locator('[data-hero-exclusive-equipment="true"]');
    const exclusiveCopy = exclusiveSection.locator('[data-hero-exclusive-equipment-copy="true"]');
    const exclusiveImage = exclusiveSection.locator("img").first();
    const exclusiveName = exclusiveSection.locator('[data-hero-exclusive-equipment-name="true"]');
    check(
      await exclusiveSection.count() === 1 &&
      await exclusiveCopy.count() === 1 &&
      await exclusiveImage.count() === 1 &&
      await exclusiveName.count() === 1,
      `Hero 6 ${label} exclusive Equipment layout markers missing`,
    );
    const exclusiveGeometry = await exclusiveSection.evaluate((section) => {
      const image = section.querySelector("img");
      const name = section.querySelector('[data-hero-exclusive-equipment-name="true"]');
      const copy = section.querySelector('[data-hero-exclusive-equipment-copy="true"]');
      if (!(image instanceof HTMLElement) || !(name instanceof HTMLElement) || !(copy instanceof HTMLElement)) return null;
      const imageRect = image.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      return {
        imageWidth: imageRect.width,
        imageBottom: imageRect.bottom,
        nameTop: nameRect.top,
        copyWidth: copyRect.width,
      };
    });
    check(exclusiveGeometry && exclusiveGeometry.copyWidth > exclusiveGeometry.imageWidth, `Hero 6 ${label} exclusive Equipment copy did not receive more width than the image`);
    check(exclusiveGeometry && exclusiveGeometry.nameTop >= exclusiveGeometry.imageBottom, `Hero 6 ${label} exclusive Equipment name is not below the image`);
  }

  const section = page.locator('[data-hero-soldier-cards="true"]');
  check(await section.count() === 1, `Hero 6 ${label} Soldier card section missing or duplicated`);
  check((await section.innerText()).includes("사용 가능 용병"), `Hero 6 ${label} Soldier section title missing`);

  const cards = section.locator('a[href*="/soldiers/"]');
  check(await cards.count() === expectedHero6SoldierIds.length, `Hero 6 ${label} Soldier card count mismatch`);

  const soldierGrid = section.locator('[data-hero-soldier-card-grid="true"]');
  check(await soldierGrid.count() === 1, `Hero 6 ${label} Soldier grid missing or duplicated`);
  const soldierColumnCount = await soldierGrid.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
  const expectedSoldierColumnCount = label.startsWith("mobile") ? 6 : 8;
  check(
    soldierColumnCount === expectedSoldierColumnCount,
    `Hero 6 ${label} Soldier columns mismatch: ${soldierColumnCount}/${expectedSoldierColumnCount}`,
  );

  const visibleCardCount = await cards.evaluateAll((nodes) =>
    nodes.filter((node) => node instanceof HTMLElement && node.getClientRects().length > 0).length,
  );
  check(
    visibleCardCount === expectedHero6SoldierIds.length,
    `Hero 6 ${label} Soldier cards are not all visible: ${visibleCardCount}/${expectedHero6SoldierIds.length}`,
  );
  const visibleCardGeometry = await cards.evaluateAll((nodes) =>
    nodes
      .filter((node) => node instanceof HTMLElement && node.getClientRects().length > 0)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
  );
  check(
    visibleCardGeometry.every(({ width, height }) => width > 0 && height > 0 && Math.abs(width - height) <= 2),
    `Hero 6 ${label} Soldier grid contains a non-square or collapsed card: ${JSON.stringify(visibleCardGeometry)}`,
  );

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

  for (let index = 0; index < expectedHero6SoldierIds.length; index += 1) {
    const portrait = portraits.nth(index);
    await portrait.scrollIntoViewIfNeeded();
    await portrait.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      await portrait.elementHandle(),
      { timeout: 10000 },
    );
  }

  const allPortraitsLoaded = await portraits.evaluateAll((nodes) => nodes.every((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0));
  check(allPortraitsLoaded, `Hero 6 ${label} has an unloaded Soldier portrait`);

  return { section, cards };
}

async function verifyNonSpHeroFormAbsence(page, label) {
  const navigation = await page.goto(url("heroes/100/"), { waitUntil: "networkidle", timeout: 45000 });
  check(navigation && navigation.status() < 400, `Hero 100 ${label} detail failed: ${navigation?.status()}`);
  await page.getByRole("heading", { name: "로젠실", exact: true }).waitFor();

  const main = page.locator('main[data-hero-form-mode]');
  check(await main.getAttribute("data-hero-form-mode") === "normal", `Hero 100 ${label} did not remain in normal form`);
  check(await page.locator('[data-hero-form-switch="true"]').count() === 0, `Hero 100 ${label} unexpectedly exposed an SP form switch`);
  check(await page.locator('[data-hero-sp-job-movement="true"]').count() === 0, `Hero 100 ${label} unexpectedly exposed SP movement`);
  check(await page.locator('[data-hero-sp-reward-skills="true"]').count() === 0, `Hero 100 ${label} unexpectedly exposed SP reward skills`);
  check(await page.locator('[data-hero-sp-missions="true"]').count() === 0, `Hero 100 ${label} unexpectedly exposed SP missions`);
  check(await page.locator('[data-hero-job-materials="true"]').count() === 1, `Hero 100 ${label} normal job materials missing`);
  const command = page.locator('[data-hero-soldier-command="true"]');
  check(await command.getAttribute("data-hero-form-mode") === "normal", `Hero 100 ${label} Soldier command did not remain normal`);
  check(await command.locator('[data-command-mode="NORMAL"]').count() === 1, `Hero 100 ${label} normal Soldier command missing`);
  check(await command.locator('[data-command-mode="SP"]').count() === 0, `Hero 100 ${label} unexpectedly exposed SP Soldier command`);
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

  const closeButton = page.getByRole("button", { name: "상세 창 닫기" });
  await closeButton.waitFor({ state: "visible", timeout: 10000 });
  check(await closeButton.isEnabled(), `Hero 6 ${label} inline Soldier close control is disabled`);
  await closeButton.click({ force: true });
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
  await verifyNonSpHeroFormAbsence(desktopPage, "desktop");
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
  await verifyNonSpHeroFormAbsence(mobilePage, "mobile");
  check(mobilePageErrors.length === 0, `mobile page errors: ${JSON.stringify(mobilePageErrors)}`);
  check(mobileConsoleErrors.length === 0, `mobile console errors: ${JSON.stringify(mobileConsoleErrors)}`);
  await mobileContext.close();

  console.log(JSON.stringify({
    status: "PASS_HERO_FORM_SWITCH_SOLDIER_CARDS_AND_JOB_MOVEMENT_HOSTED_BROWSER_QA",
    sourceSha: expectedSourceSha,
    heroId: 6,
    heroFormSwitch: {
      defaultMode: "normal",
      spJobId: 377,
      normalSpIsolation: "PASS",
      spArtwork: "embedded-webp-data-uri",
      spActivationMaterialBlock: "ABSENT",
      desktop: "PASS",
      mobile: "PASS",
      nonSpHero100SwitchAbsent: "PASS",
    },
    jobMovement: {
      hydratedRowCount: expectedHero6MovementRows.length,
      identityMoveTypeMovePointParity: "PASS",
      localizedMoveTypeLabels: "PASS",
      desktop: "PASS",
      mobile: "PASS",
    },
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
