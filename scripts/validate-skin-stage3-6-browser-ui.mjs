import crypto from "node:crypto";
import fs from "node:fs";
import { chromium } from "playwright";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const HOSTED_SUMMARY_PATH = "data/validation/skin-stage3-6-hosted-summary.v1.json";
const HOSTED_CHECKPOINT_PATH = "data/checkpoints/skin-stage3-6-hosted.v1.json";
const RELATION_PATH = "data/generated/skin-stage2-3-bidirectional-relation.v1.json";
const ASSET_MAP_PATH = "data/generated/skin-stage3-5-static-web-asset-map.v1.json";
const ASSET_VALIDATION_PATH = "data/validation/skin-stage3-5-static-web-asset-map.v1.json";
const EVIDENCE_PATH = "data/evidence/skin-stage3-6-browser-ui.v1.json";
const FINAL_SUMMARY_PATH = "data/validation/skin-stage3-6-browser-ui-summary.v1.json";
const FINAL_CHECKPOINT_PATH = "data/checkpoints/skin-stage3-6-final.v1.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function url(path) {
  return new URL(path.replace(/^\//, ""), BASE_URL).toString();
}

const relation = readJson(RELATION_PATH);
const assetMap = readJson(ASSET_MAP_PATH);
const assetValidation = readJson(ASSET_VALIDATION_PATH);
const hostedSummary = readJson(HOSTED_SUMMARY_PATH);
const hostedCheckpoint = readJson(HOSTED_CHECKPOINT_PATH);

assert(hostedSummary.status === "PASS_SKIN_STAGE3_6_HOSTED_QA" && hostedSummary.finalReady === true, "Hosted predecessor is not final PASS");
assert(hostedSummary.gates?.preflight === "PASS", "Preflight predecessor is not PASS");
assert(hostedSummary.gates?.build === "PASS", "Build predecessor is not PASS");
assert(hostedSummary.gates?.deploymentHosted === "PASS", "Deployment/Hosted predecessor is not PASS");
assert(hostedSummary.gates?.browserUi === "PENDING", "Browser/UI predecessor state changed");
assert(/^[0-9a-f]{40}$/i.test(hostedSummary.sourceSha ?? ""), "Hosted source SHA is invalid");
assert(hostedCheckpoint.status === "PASS_SKIN_STAGE3_6_HOSTED_QA" && hostedCheckpoint.sourceSha === hostedSummary.sourceSha, "Hosted checkpoint/source SHA mismatch");
assert(assetValidation.status === "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP" && assetValidation.finalReady === true, "Stage 3-5 asset predecessor is not final PASS");
assert(assetValidation.boundaries?.actualPublicArtifactHashVerified === true, "Stage 3-5 public artifact hash proof is absent");
assert(assetValidation.boundaries?.semanticOwnershipRecomputed === false && assetValidation.boundaries?.sourceOrderRecomputed === false, "Frozen Skin semantic boundary changed");
assert(relation.counts?.bySkinId === 540 && relation.counts?.byHeroId === 267 && relation.counts?.edgeCount === 540, "Frozen Skin population changed");
assert(assetMap.records?.length === 540, "Frozen Skin asset population changed");

const heroRows = Object.entries(relation.byHeroId ?? {}).map(([heroId, skinIds]) => ({
  heroId: Number(heroId),
  skinIds: Array.isArray(skinIds) ? skinIds.map(Number) : [],
})).sort((a, b) => a.heroId - b.heroId);
assert(heroRows.length === 267, `Expected 267 Hero rows, got ${heroRows.length}`);
const skinHero = [...heroRows].sort((a, b) => b.skinIds.length - a.skinIds.length || a.heroId - b.heroId)[0];
const zeroSkinHero = heroRows.find((row) => row.skinIds.length === 0);
assert(skinHero?.skinIds?.length >= 2, "Browser/UI representative Skin Hero must have multiple Skins");
assert(zeroSkinHero, "Browser/UI zero-Skin representative Hero is missing");
const firstSkinId = skinHero.skinIds[0];
const secondSkinId = skinHero.skinIds[1];

function computeBrowserInputFingerprint() {
  const sourceFiles = [
    RELATION_PATH,
    ASSET_MAP_PATH,
    ASSET_VALIDATION_PATH,
    "src/lib/skin-detail.server.ts",
    "src/lib/hero-detail-stage5.server.ts",
    "src/routes/heroes_.$heroId.tsx",
  ];
  const skinDir = "public/images/skins";
  const skinNames = fs.readdirSync(skinDir)
    .filter((name) => /^\d+\.png$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  assert(skinNames.length === 540, `Expected 540 Skin PNGs for Browser/UI fingerprint, got ${skinNames.length}`);
  const files = [...sourceFiles, ...skinNames.map((name) => `${skinDir}/${name}`)];
  const hash = crypto.createHash("sha256");
  hash.update("skin-stage3-6-browser-input-v1\0");
  for (const file of files) {
    assert(fs.existsSync(file), `Browser/UI fingerprint input missing: ${file}`);
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return {
    version: 1,
    algorithm: "sha256",
    sha256: hash.digest("hex"),
    fileCount: files.length,
    skinImageCount: skinNames.length,
    deployedSourceSha: hostedSummary.sourceSha,
  };
}

function createDiagnostics(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error));
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL) && response.status() >= 400) {
      badResponses.push({ url: response.url(), status: response.status() });
    }
  });
  return { label, consoleErrors, pageErrors, badResponses };
}

async function assertDiagnosticsClean(diagnostics) {
  assert(diagnostics.pageErrors.length === 0, `${diagnostics.label} page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert(diagnostics.consoleErrors.length === 0, `${diagnostics.label} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert(diagnostics.badResponses.length === 0, `${diagnostics.label} bad hosted responses: ${JSON.stringify(diagnostics.badResponses)}`);
}

async function gotoChecked(page, path) {
  const response = await page.goto(url(path), { waitUntil: "networkidle", timeout: 45_000 });
  assert(response, `No navigation response for ${path}`);
  assert(response.status() < 400, `${path} returned HTTP ${response.status()}`);
  return response;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label} document horizontal overflow: ${JSON.stringify(metrics)}`);
  assert(metrics.bodyScrollWidth <= metrics.innerWidth + 1, `${label} body horizontal overflow: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function activeHeroVisual(page) {
  const heroRegion = page.locator("section").first().locator("div").filter({ has: page.getByText(/Hero #\d+/) }).first();
  const image = page.locator('main section img[alt]').first();
  assert((await image.count()) === 1, `Expected exactly one active Hero/Skin visual at ${page.url()}`);
  await image.waitFor({ state: "visible", timeout: 15_000 });
  const metrics = await image.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect() ?? null;
    return {
      complete: element.complete,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      currentSrc: element.currentSrc || element.src,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      parentRect: parentRect ? { left: parentRect.left, top: parentRect.top, right: parentRect.right, bottom: parentRect.bottom, width: parentRect.width, height: parentRect.height } : null,
    };
  });
  assert(metrics.complete && metrics.naturalWidth > 0 && metrics.naturalHeight > 0, `Active Hero/Skin image is broken at ${page.url()}`);
  assert(metrics.clientWidth > 0 && metrics.clientHeight > 0, `Active Hero/Skin image has no rendered box at ${page.url()}`);
  assert(metrics.objectFit === "contain", `Active Hero/Skin image object-fit changed: ${metrics.objectFit}`);
  assert(metrics.parentRect && metrics.rect.width <= metrics.parentRect.width + 1 && metrics.rect.height <= metrics.parentRect.height + 1, `Active Hero/Skin image exceeds carousel region: ${JSON.stringify(metrics)}`);
  void heroRegion;
  return metrics;
}

async function currentSkinLabel(page) {
  const locator = page.getByText(/스킨 \d+ · ID \d+/, { exact: true }).first();
  if ((await locator.count()) === 0) return null;
  return locator.textContent();
}

async function reachSkin(page, skinId, maxSteps) {
  const expected = new RegExp(`^스킨 \\d+ · ID ${skinId}$`);
  for (let step = 0; step <= maxSteps; step += 1) {
    const label = await currentSkinLabel(page);
    if (label && expected.test(label.trim())) return { step, label: label.trim(), image: await activeHeroVisual(page) };
    if (step === maxSteps) break;
    const next = page.getByRole("button", { name: "다음 일러스트" });
    assert((await next.count()) === 1, `Next carousel control missing while seeking Skin ${skinId}`);
    await next.click();
    await page.waitForTimeout(80);
  }
  throw new Error(`Could not reach Skin ${skinId} within ${maxSteps} carousel steps; current label=${await currentSkinLabel(page)}`);
}

async function verifySkinImage(page, skinId) {
  const image = await activeHeroVisual(page);
  assert(image.currentSrc.includes(`/langrisser-future-guide/images/skins/${skinId}.png`), `Rendered Skin ${skinId} source mismatch: ${image.currentSrc}`);
  return image;
}

async function verifyHostedSentinel() {
  const response = await fetch(url(`skin-stage3-6-hosted-ready.json?browser=${Date.now()}`), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  assert(response.ok, `Hosted sentinel returned HTTP ${response.status}`);
  const payload = await response.json();
  assert(payload?.status === "READY_FOR_SKIN_STAGE3_6_HOSTED_QA", `Hosted sentinel status mismatch: ${JSON.stringify(payload)}`);
  assert(payload?.sourceSha === hostedSummary.sourceSha, `Hosted sentinel source SHA drift: ${payload?.sourceSha} != ${hostedSummary.sourceSha}`);
  assert(payload?.heroDetailPageCount === 267 && payload?.skinPngCount === 540, `Hosted sentinel population mismatch: ${JSON.stringify(payload)}`);
  return payload;
}

const sentinel = await verifyHostedSentinel();
const browser = await chromium.launch({ headless: true });
const results = { desktop: {}, mobile: {}, zeroSkinHero: {} };

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  const desktopDiagnostics = createDiagnostics(desktopPage, "desktop");

  await gotoChecked(desktopPage, `heroes/${skinHero.heroId}/`);
  await desktopPage.getByText(`Hero #${skinHero.heroId}`, { exact: true }).waitFor({ state: "visible" });
  results.desktop.initialImage = await activeHeroVisual(desktopPage);
  results.desktop.layout = await assertNoHorizontalOverflow(desktopPage, "desktop Skin Hero");
  const nextButton = desktopPage.getByRole("button", { name: "다음 일러스트" });
  const prevButton = desktopPage.getByRole("button", { name: "이전 일러스트" });
  assert((await nextButton.count()) === 1 && (await prevButton.count()) === 1, "Desktop carousel controls are not uniquely exposed");
  assert(await nextButton.isVisible() && await prevButton.isVisible(), "Desktop carousel controls are not visible");

  results.desktop.firstSkin = await reachSkin(desktopPage, firstSkinId, skinHero.skinIds.length + 2);
  results.desktop.firstSkin.image = await verifySkinImage(desktopPage, firstSkinId);
  const firstLabel = await currentSkinLabel(desktopPage);
  assert(firstLabel?.startsWith("스킨 1 · "), `First Skin sourceOrder label changed: ${firstLabel}`);

  await nextButton.focus();
  await desktopPage.keyboard.press("Enter");
  await desktopPage.waitForTimeout(80);
  const secondLabel = await currentSkinLabel(desktopPage);
  assert(secondLabel === `스킨 2 · ID ${secondSkinId}`, `Keyboard carousel next did not reach second Skin: ${secondLabel}`);
  results.desktop.secondSkin = await verifySkinImage(desktopPage, secondSkinId);
  results.desktop.keyboardNext = "PASS";

  await prevButton.focus();
  await desktopPage.keyboard.press("Space");
  await desktopPage.waitForTimeout(80);
  const returnedLabel = await currentSkinLabel(desktopPage);
  assert(returnedLabel === `스킨 1 · ID ${firstSkinId}`, `Keyboard carousel previous did not return to first Skin: ${returnedLabel}`);
  results.desktop.keyboardPrevious = "PASS";

  const counter = desktopPage.getByText(new RegExp(`\\d+ / ${skinHero.skinIds.length}(?:$|\\s)`)).first();
  assert((await counter.count()) > 0, "Carousel counter is missing");
  results.desktop.counter = (await counter.textContent())?.trim() ?? null;

  await desktopPage.reload({ waitUntil: "networkidle", timeout: 45_000 });
  await desktopPage.getByText(`Hero #${skinHero.heroId}`, { exact: true }).waitFor({ state: "visible" });
  results.desktop.refreshImage = await activeHeroVisual(desktopPage);
  results.desktop.directRefresh = "PASS";

  const listLink = desktopPage.getByRole("link", { name: "영웅 목록" }).first();
  assert((await listLink.count()) === 1, "Hero list navigation link missing");
  await Promise.all([
    desktopPage.waitForURL(/\/langrisser-future-guide\/heroes\/?$/, { timeout: 20_000 }),
    listLink.click(),
  ]);
  assert((await desktopPage.locator("main").count()) > 0, "Hero list navigation did not render main content");
  results.desktop.listNavigation = "PASS";
  await desktopPage.goBack({ waitUntil: "networkidle", timeout: 45_000 });
  await desktopPage.getByText(`Hero #${skinHero.heroId}`, { exact: true }).waitFor({ state: "visible" });
  results.desktop.historyBack = "PASS";

  await assertDiagnosticsClean(desktopDiagnostics);
  results.desktop.diagnostics = desktopDiagnostics;
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobileContext.newPage();
  const mobileDiagnostics = createDiagnostics(mobilePage, "mobile");

  await gotoChecked(mobilePage, `heroes/${skinHero.heroId}/`);
  await mobilePage.getByText(`Hero #${skinHero.heroId}`, { exact: true }).waitFor({ state: "visible" });
  results.mobile.layout = await assertNoHorizontalOverflow(mobilePage, "mobile Skin Hero");
  results.mobile.initialImage = await activeHeroVisual(mobilePage);
  const mobileNext = mobilePage.getByRole("button", { name: "다음 일러스트" });
  assert((await mobileNext.count()) === 1 && await mobileNext.isVisible(), "Mobile next carousel control is unavailable");

  const mobileReach = await reachSkin(mobilePage, firstSkinId, skinHero.skinIds.length + 2);
  results.mobile.firstSkin = mobileReach;
  results.mobile.firstSkin.image = await verifySkinImage(mobilePage, firstSkinId);
  await mobileNext.tap();
  await mobilePage.waitForTimeout(100);
  const mobileSecondLabel = await currentSkinLabel(mobilePage);
  assert(mobileSecondLabel === `스킨 2 · ID ${secondSkinId}`, `Touch carousel next did not reach second Skin: ${mobileSecondLabel}`);
  results.mobile.touchNext = "PASS";
  results.mobile.secondSkin = await verifySkinImage(mobilePage, secondSkinId);
  results.mobile.layoutAfterInteraction = await assertNoHorizontalOverflow(mobilePage, "mobile Skin Hero after carousel interaction");

  await assertDiagnosticsClean(mobileDiagnostics);
  results.mobile.diagnostics = mobileDiagnostics;
  await mobileContext.close();

  const zeroContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const zeroPage = await zeroContext.newPage();
  const zeroDiagnostics = createDiagnostics(zeroPage, "zero-skin-hero");
  await gotoChecked(zeroPage, `heroes/${zeroSkinHero.heroId}/`);
  await zeroPage.getByText(`Hero #${zeroSkinHero.heroId}`, { exact: true }).waitFor({ state: "visible" });
  assert((await zeroPage.getByText("스킨 0", { exact: true }).count()) > 0, `Hero ${zeroSkinHero.heroId} does not render explicit zero-Skin count`);
  assert((await zeroPage.getByText(/스킨 \d+ · ID \d+/, { exact: true }).count()) === 0, `Hero ${zeroSkinHero.heroId} fabricated a Skin carousel label`);
  assert((await zeroPage.getByRole("button", { name: "다음 일러스트" }).count()) === 0, `Hero ${zeroSkinHero.heroId} exposed a carousel next control without Skins`);
  assert((await zeroPage.getByRole("button", { name: "이전 일러스트" }).count()) === 0, `Hero ${zeroSkinHero.heroId} exposed a carousel previous control without Skins`);
  results.zeroSkinHero.heroId = zeroSkinHero.heroId;
  results.zeroSkinHero.explicitZeroCount = "PASS";
  results.zeroSkinHero.noFabricatedSkinControls = "PASS";
  results.zeroSkinHero.layout = await assertNoHorizontalOverflow(zeroPage, "zero-Skin Hero");
  await assertDiagnosticsClean(zeroDiagnostics);
  results.zeroSkinHero.diagnostics = zeroDiagnostics;
  await zeroContext.close();
} finally {
  await browser.close();
}

const inputFingerprint = computeBrowserInputFingerprint();
const evidence = {
  schemaVersion: 1,
  stage: "skin-page-3",
  substage: "3-6-3",
  evidenceClass: "HOSTED_BROWSER_UI_INTERACTION_EVIDENCE",
  status: "PASS_SKIN_STAGE3_6_BROWSER_UI",
  finalReady: true,
  hostedBaseUrl: BASE_URL,
  deployedSourceSha: hostedSummary.sourceSha,
  deploymentSentinel: sentinel,
  automation: "Playwright Chromium headless against exact hosted GitHub Pages Skin candidate",
  inputFingerprint,
  representatives: {
    skinHeroId: skinHero.heroId,
    skinCount: skinHero.skinIds.length,
    firstSkinId,
    secondSkinId,
    zeroSkinHeroId: zeroSkinHero.heroId,
  },
  viewports: {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844, hasTouch: true },
    zeroSkinHero: { width: 1280, height: 800 },
  },
  checks: {
    exactHostedSourceSha: "PASS",
    desktopSkinImageLoad: "PASS",
    desktopCarouselMouseAndKeyboard: "PASS",
    desktopPreviousNextOrder: "PASS",
    desktopCounter: "PASS",
    directRefresh: "PASS",
    heroListNavigation: "PASS",
    browserHistoryBack: "PASS",
    imageObjectFitContain: "PASS",
    mobileSkinImageLoad: "PASS",
    mobileTouchCarousel: "PASS",
    responsiveHorizontalOverflow: "PASS",
    zeroSkinHeroNoFabrication: "PASS",
    pageErrors: 0,
    consoleErrors: 0,
    hostedHttpFailuresObservedByBrowser: 0,
  },
  boundaries: {
    semanticOwnershipRecomputed: false,
    sourceOrderRecomputed: false,
    releaseMetadataSynthesized: false,
    acquisitionMethodSynthesized: false,
    hostedDeploymentMutatedByBrowserGate: false,
  },
  results,
};

const summary = {
  schemaVersion: 1,
  stage: "skin-page-3",
  substage: "3-6",
  status: "PASS_SKIN_STAGE3_6_FRONTEND_QA",
  completion: "COMPLETE",
  finalReady: true,
  sourceSha: hostedSummary.sourceSha,
  gates: {
    preflight: "PASS",
    build: "PASS",
    deploymentHosted: "PASS",
    browserUi: "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI",
  },
  counts: {
    canonicalHeroCount: 267,
    canonicalSkinCount: 540,
    heroesWithSkinCount: heroRows.filter((row) => row.skinIds.length > 0).length,
    zeroSkinHeroCount: heroRows.filter((row) => row.skinIds.length === 0).length,
  },
  browserUiFreshness: {
    status: "PASS_FRESH_BROWSER_UI_EVIDENCE",
    inputFingerprint,
    evidencePath: EVIDENCE_PATH,
    deployedSourceSha: hostedSummary.sourceSha,
  },
  boundaries: evidence.boundaries,
  nonBlockingReview: [
    "Korean Skin display names and release/acquisition presentation metadata remain a separate presentation/localization review and were not synthesized in this gate.",
    "CHAR_SPINE and MODEL_PRIMARY web presentation remains deferred from Stage 3-5 static-image scope.",
  ],
  nextStartPoint: "Freeze Stage 3-6 frontend presentation checkpoint, then evaluate Project Doctor skin-assets admission without weakening the manual-review guard.",
};

const checkpoint = {
  checkpoint: "skin-stage3-6-final-v1",
  status: summary.status,
  completion: summary.completion,
  finalReady: true,
  sourceSha: hostedSummary.sourceSha,
  predecessorHostedCheckpoint: HOSTED_CHECKPOINT_PATH,
  preflight: "PASS_SKIN_STAGE3_6_HERO_DETAIL_CONSUMER_PREFLIGHT",
  build: "PASS_SKIN_STAGE3_6_STATIC_CANDIDATE",
  hosted: "PASS_SKIN_STAGE3_6_HOSTED_QA",
  browserUi: "PASS_SKIN_STAGE3_6_BROWSER_UI",
  browserUiEvidencePath: EVIDENCE_PATH,
  browserUiInputFingerprint: inputFingerprint.sha256,
  semanticStageReopened: false,
  projectDoctorSkinAssetsPromoted: false,
  review: summary.nonBlockingReview,
  blocker: [],
  nextStart: summary.nextStartPoint,
  reopenConditions: [
    "canonical Skin/Hero population or Stage 2 relation changes",
    "Stage 3-5 public asset manifest/hash validation changes",
    "Hero detail Skin consumer contract changes",
    "hosted route/asset or Browser/UI regression occurs",
  ],
};

fs.mkdirSync("data/evidence", { recursive: true });
fs.mkdirSync("data/validation", { recursive: true });
fs.mkdirSync("data/checkpoints", { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(FINAL_SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(FINAL_CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
