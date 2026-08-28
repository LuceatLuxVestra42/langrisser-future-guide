import crypto from "node:crypto";
import fs from "node:fs";
import { chromium } from "playwright";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const HOSTED_SUMMARY_PATH = "data/validation/equipment-image-stage3-hosted-qa-summary.v1.json";
const EVIDENCE_PATH = "data/evidence/equipment-image-stage3-browser-ui.v1.json";
const FINAL_CHECKPOINT_PATH = "data/checkpoints/equipment-image-stage3-final.v1.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function url(path) {
  return new URL(path.replace(/^\//, ""), BASE_URL).toString();
}

function computeBrowserInputFingerprint() {
  const sourceFiles = [
    "data/checkpoints/equipment-image-stage2-final.v3.json",
    "data/validation/equipment-image-stage3-frontend-summary.v1.json",
    "public/equipment-image-stage3-ready.json",
    "src/lib/equipment-image-assets.ts",
    "src/routes/equipment.tsx",
    "src/routes/equipment_.exclusive.tsx",
    "src/routes/equipment_.$equipmentId.tsx",
  ];
  const imageDir = "public/images/equipment";
  const imageNames = fs
    .readdirSync(imageDir)
    .filter((name) => /^\d+\.png$/.test(name))
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));

  assert(imageNames.length === 373, `Expected 373 Equipment PNGs for Browser/UI fingerprint, got ${imageNames.length}`);

  const files = [...sourceFiles, ...imageNames.map((name) => `${imageDir}/${name}`)];
  const hash = crypto.createHash("sha256");
  hash.update("equipment-image-stage3-browser-input-v1\0");

  for (const path of files) {
    assert(fs.existsSync(path), `Browser/UI fingerprint input is missing: ${path}`);
    hash.update(`${path}\0`);
    hash.update(fs.readFileSync(path));
    hash.update("\0");
  }

  return {
    version: 1,
    algorithm: "sha256",
    sha256: hash.digest("hex"),
    fileCount: files.length,
    equipmentImageCount: imageNames.length,
  };
}

function createDiagnostics(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL) && response.status() >= 400) {
      badResponses.push({ url: response.url(), status: response.status() });
    }
  });

  return {
    label,
    consoleErrors,
    pageErrors,
    badResponses,
  };
}

async function gotoChecked(page, path) {
  const response = await page.goto(url(path), { waitUntil: "networkidle", timeout: 45_000 });
  assert(response, `No navigation response for ${path}`);
  assert(response.status() < 400, `${path} returned HTTP ${response.status()}`);
  return response;
}

async function ensureEquipmentImage(page, equipmentId) {
  const selector = `img[src$="/images/equipment/${equipmentId}.png"]`;
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const locator = page.locator(selector).first();
      assert((await locator.count()) > 0, `Equipment image ${equipmentId} is missing from rendered DOM at ${page.url()}`);
      await locator.waitFor({ state: "visible", timeout: 15_000 });
      await locator.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await locator.waitFor({ state: "visible", timeout: 5_000 });
      const image = await locator.evaluate((element) => ({
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        src: element.currentSrc || element.src,
      }));
      assert(image.complete, `Equipment image ${equipmentId} did not complete loading`);
      assert(image.naturalWidth > 0 && image.naturalHeight > 0, `Equipment image ${equipmentId} is broken`);
      assert(image.clientWidth > 0 && image.clientHeight > 0, `Equipment image ${equipmentId} has no rendered box`);
      return { ...image, hydrationSafeAttempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await page.waitForTimeout(250);
    }
  }

  throw lastError;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label} horizontal overflow: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function assertDiagnosticsClean(diagnostics) {
  assert(diagnostics.pageErrors.length === 0, `${diagnostics.label} page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert(diagnostics.consoleErrors.length === 0, `${diagnostics.label} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert(diagnostics.badResponses.length === 0, `${diagnostics.label} hosted HTTP failures: ${JSON.stringify(diagnostics.badResponses)}`);
}

const hostedSummary = JSON.parse(fs.readFileSync(HOSTED_SUMMARY_PATH, "utf8"));
const acceptedHostedSummaryStatuses = new Set([
  "PASS_EQUIPMENT_IMAGE_STAGE3_HOSTED_QA",
  "PASS_EQUIPMENT_IMAGE_STAGE3",
]);
assert(acceptedHostedSummaryStatuses.has(hostedSummary.status), "Hosted QA predecessor/final state is not PASS");
assert(hostedSummary.completion === "COMPLETE", "Hosted QA predecessor is not complete");
assert(hostedSummary.gates.preflight === "PASS", "Preflight gate is not PASS");
assert(hostedSummary.gates.build === "PASS", "Build gate is not PASS");
assert(hostedSummary.gates.deploymentHosted === "PASS", "Deployment/Hosted gate is not PASS");
assert(hostedSummary.productionJoinKey === "equipmentId", "Production join key changed");
assert(hostedSummary.publicEquipment === 373, "Public Equipment count changed");

const browser = await chromium.launch({ headless: true });
const results = { desktop: {}, mobile: {} };

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  const desktopDiagnostics = createDiagnostics(desktopPage, "desktop");

  await gotoChecked(desktopPage, "equipment/");
  await desktopPage.locator('section[aria-label="SSR 장비 이미지 목록"]').waitFor({ state: "visible" });
  results.desktop.generalListImage6 = await ensureEquipmentImage(desktopPage, 6);
  results.desktop.generalListLayout = await assertNoHorizontalOverflow(desktopPage, "desktop general list");

  const weaponFilter = desktopPage.getByRole("button", { name: "무기", exact: true });
  await weaponFilter.click();
  assert((await weaponFilter.getAttribute("aria-pressed")) === "true", "General Equipment weapon filter did not activate");
  results.desktop.filterInteraction = "PASS";

  const detail6Link = desktopPage.locator('a[href$="/equipment/6"]').first();
  assert((await detail6Link.count()) > 0, "General Equipment link for equipmentId 6 is missing");
  await detail6Link.focus();
  await Promise.all([
    desktopPage.waitForURL(/\/langrisser-future-guide\/equipment\/6\/?$/, { timeout: 20_000 }),
    desktopPage.keyboard.press("Enter"),
  ]);
  results.desktop.keyboardNavigationToDetail6 = "PASS";
  results.desktop.detail6Image = await ensureEquipmentImage(desktopPage, 6);

  await desktopPage.reload({ waitUntil: "networkidle", timeout: 45_000 });
  results.desktop.detail6AfterRefresh = await ensureEquipmentImage(desktopPage, 6);
  results.desktop.detailRefresh = "PASS";

  await gotoChecked(desktopPage, "equipment/exclusive/");
  await desktopPage.locator('section[aria-label="전용장비 목록"]').waitFor({ state: "visible" });
  results.desktop.exclusiveImage273 = await ensureEquipmentImage(desktopPage, 273);
  const exclusive273Link = desktopPage.locator('a[href$="/equipment/273"]').first();
  assert((await exclusive273Link.count()) > 0, "Exclusive Equipment link for equipmentId 273 is missing");
  await Promise.all([
    desktopPage.waitForURL(/\/langrisser-future-guide\/equipment\/273\/?$/, { timeout: 20_000 }),
    exclusive273Link.click(),
  ]);
  results.desktop.exclusiveNavigationToDetail273 = "PASS";
  results.desktop.detail273Image = await ensureEquipmentImage(desktopPage, 273);

  for (const equipmentId of [547, 550]) {
    await gotoChecked(desktopPage, `equipment/${equipmentId}/`);
    results.desktop[`detail${equipmentId}Image`] = await ensureEquipmentImage(desktopPage, equipmentId);
  }

  await assertDiagnosticsClean(desktopDiagnostics);
  results.desktop.diagnostics = desktopDiagnostics;
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  const mobileDiagnostics = createDiagnostics(mobilePage, "mobile");

  await gotoChecked(mobilePage, "equipment/");
  results.mobile.generalListImage6 = await ensureEquipmentImage(mobilePage, 6);
  results.mobile.generalListLayout = await assertNoHorizontalOverflow(mobilePage, "mobile general list");

  await gotoChecked(mobilePage, "equipment/550/");
  results.mobile.detail550Image = await ensureEquipmentImage(mobilePage, 550);
  results.mobile.detail550Layout = await assertNoHorizontalOverflow(mobilePage, "mobile detail 550");

  await gotoChecked(mobilePage, "equipment/exclusive/");
  results.mobile.exclusiveImage273 = await ensureEquipmentImage(mobilePage, 273);
  results.mobile.exclusiveLayout = await assertNoHorizontalOverflow(mobilePage, "mobile exclusive list");

  await assertDiagnosticsClean(mobileDiagnostics);
  results.mobile.diagnostics = mobileDiagnostics;
  await mobileContext.close();
} finally {
  await browser.close();
}

const inputFingerprint = computeBrowserInputFingerprint();
const evidence = {
  stage: "Equipment Image Stage 3 Browser/UI QA",
  version: 1,
  status: "PASS_EQUIPMENT_IMAGE_STAGE3_BROWSER_UI",
  hostedBaseUrl: BASE_URL,
  productionJoinKey: "equipmentId",
  publicEquipment: 373,
  automation: "Playwright Chromium headless against deployed GitHub Pages",
  inputFingerprint,
  checks: {
    desktopGeneralListImage: "PASS",
    generalFilterInteraction: "PASS",
    keyboardListToDetailNavigation: "PASS",
    detailRefresh: "PASS",
    exclusiveListToDetailNavigation: "PASS",
    collisionFixtureDetails547_550: "PASS",
    mobileGeneralList: "PASS",
    mobileDetail: "PASS",
    mobileExclusiveList: "PASS",
    horizontalOverflow: "PASS",
    pageErrors: 0,
    consoleErrors: 0,
    hostedHttpFailuresObservedByBrowser: 0,
  },
  fixtures: {
    existingBaseline: 6,
    exclusiveBaseline: 273,
    collisionFixtures: [547, 550],
  },
  viewports: {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  },
  results,
};

fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

const finalSummary = {
  ...hostedSummary,
  status: "PASS_EQUIPMENT_IMAGE_STAGE3",
  completion: "COMPLETE",
  freezeState: "EQUIPMENT_IMAGE_STAGE3_FROZEN",
  gates: {
    ...hostedSummary.gates,
    browserUi: "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI",
  },
  browserUiFreshness: {
    status: "PASS_FRESH_BROWSER_UI_EVIDENCE",
    currentInputFingerprint: inputFingerprint,
    evidencePath: EVIDENCE_PATH,
    evidenceInputFingerprint: inputFingerprint,
  },
  browserUiEvidence: {
    path: EVIDENCE_PATH,
    status: evidence.status,
    automation: evidence.automation,
    inputFingerprint,
    desktopViewport: evidence.viewports.desktop,
    mobileViewport: evidence.viewports.mobile,
    pageErrors: 0,
    consoleErrors: 0,
    hostedHttpFailuresObservedByBrowser: 0,
  },
  nextStage: "EQUIPMENT_IMAGE_STAGE3_COMPLETE",
};
fs.writeFileSync(HOSTED_SUMMARY_PATH, `${JSON.stringify(finalSummary, null, 2)}\n`);

const checkpoint = JSON.parse(fs.readFileSync(FINAL_CHECKPOINT_PATH, "utf8"));
const finalCheckpoint = {
  ...checkpoint,
  status: finalSummary.status,
  completion: "COMPLETE",
  freezeState: "EQUIPMENT_IMAGE_STAGE3_FROZEN",
  browserUi: "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI",
  browserUiEvidencePath: EVIDENCE_PATH,
  browserUiFreshness: "PASS_FRESH_BROWSER_UI_EVIDENCE",
  browserUiInputFingerprint: inputFingerprint.sha256,
  semanticStageReopened: false,
  nextStart: "Equipment Image Stage 3 complete; continue with later Equipment presentation/features without reopening frozen Stage 2/3 identity semantics.",
};
fs.writeFileSync(FINAL_CHECKPOINT_PATH, `${JSON.stringify(finalCheckpoint, null, 2)}\n`);

console.log(JSON.stringify(evidence, null, 2));
