import crypto from "node:crypto";
import fs from "node:fs";

const RELATION_PATH = "data/generated/skin-stage2-3-bidirectional-relation.v1.json";
const ASSET_MAP_PATH = "data/generated/skin-stage3-5-static-web-asset-map.v1.json";
const ASSET_VALIDATION_PATH = "data/validation/skin-stage3-5-static-web-asset-map.v1.json";
const HOSTED_SUMMARY_PATH = "data/validation/skin-stage3-6-hosted-summary.v1.json";
const BROWSER_EVIDENCE_PATH = "data/evidence/skin-stage3-6-browser-ui.v1.json";
const FRONTEND_SUMMARY_PATH = "data/validation/skin-stage3-6-browser-ui-summary.v1.json";
const FINAL_CHECKPOINT_PATH = "data/checkpoints/skin-stage3-6-final.v1.json";
const IMAGE_DIR = "public/images/skins";

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`[SKIN_ASSETS_FINAL_INVALID] ${message}`);
};

function computeBrowserInputFingerprint() {
  const sourceFiles = [
    RELATION_PATH,
    ASSET_MAP_PATH,
    ASSET_VALIDATION_PATH,
    "src/lib/skin-detail.server.ts",
    "src/lib/hero-detail-stage5.server.ts",
    "src/routes/heroes_.$heroId.tsx",
  ];
  const skinNames = fs.readdirSync(IMAGE_DIR)
    .filter(name => /^\d+\.png$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  assert(skinNames.length === 540, `expected 540 numeric Skin PNGs, got ${skinNames.length}`);
  const files = [...sourceFiles, ...skinNames.map(name => `${IMAGE_DIR}/${name}`)];
  const hash = crypto.createHash("sha256");
  hash.update("skin-stage3-6-browser-input-v1\0");
  for (const file of files) {
    assert(fs.existsSync(file), `Browser fingerprint input missing: ${file}`);
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
  };
}

const relation = readJson(RELATION_PATH);
const assetMap = readJson(ASSET_MAP_PATH);
const assetValidation = readJson(ASSET_VALIDATION_PATH);
const hosted = readJson(HOSTED_SUMMARY_PATH);
const browser = readJson(BROWSER_EVIDENCE_PATH);
const frontend = readJson(FRONTEND_SUMMARY_PATH);
const checkpoint = readJson(FINAL_CHECKPOINT_PATH);

assert(relation.status === "ACCEPTED", "Stage 2 relation status");
assert(relation.cardinality?.skinToHero === "EXACTLY_ONE" && relation.cardinality?.heroToSkin === "ZERO_OR_MANY", "Stage 2 relation cardinality");
assert(relation.counts?.bySkinId === 540 && relation.counts?.byHeroId === 267 && relation.counts?.edgeCount === 540, "Stage 2 relation population");

assert(assetMap.status === "STAGE3_5_STATIC_WEB_ASSETS_MATERIALIZED", "Stage 3-5 asset-map status");
assert(assetMap.output?.root === IMAGE_DIR && assetMap.output?.filenamePolicy === "DECIMAL_SKIN_ID_PNG", "Stage 3-5 output contract");
assert(assetMap.output?.copyMode === "EXACT_BYTES_NO_REENCODE", "Stage 3-5 copy mode");
assert(assetMap.counts?.mappedSkinCount === 540 && assetMap.counts?.materializedFileCount === 540, "Stage 3-5 mapped/materialized count");
assert(assetMap.counts?.missingFileCount === 0 && assetMap.counts?.hashMismatchCount === 0 && assetMap.counts?.pathCollisionCount === 0 && assetMap.counts?.unexpectedFileCount === 0, "Stage 3-5 blocker counts");
assert(Array.isArray(assetMap.records) && assetMap.records.length === 540, `Stage 3-5 record count ${assetMap.records?.length}`);

assert(assetValidation.status === "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP" && assetValidation.finalReady === true, "Stage 3-5 validation final PASS");
assert(assetValidation.counts?.expectedSkinCount === 540 && assetValidation.counts?.acceptedSkinCount === 540, "Stage 3-5 validation population");
assert(assetValidation.counts?.missingFileCount === 0 && assetValidation.counts?.hashMismatchCount === 0 && assetValidation.counts?.pathCollisionCount === 0 && assetValidation.counts?.unexpectedFileCount === 0, "Stage 3-5 validation blocker counts");
assert(assetValidation.boundaries?.actualPublicArtifactHashVerified === true && assetValidation.boundaries?.exactBytesNoReencodeRequired === true, "Stage 3-5 actual artifact proof");
assert(assetValidation.boundaries?.semanticOwnershipRecomputed === false && assetValidation.boundaries?.sourceOrderRecomputed === false, "Stage 3-5 semantic boundary");
assert(Array.isArray(assetValidation.blockers) && assetValidation.blockers.length === 0, "Stage 3-5 blockers remain");

const expectedIds = new Set();
let verifiedHashes = 0;
for (const record of assetMap.records) {
  const skinId = Number(record.skinId);
  const relationRow = relation.bySkinId?.[String(skinId)];
  const expectedRepoPath = `${IMAGE_DIR}/${skinId}.png`;
  assert(Number.isSafeInteger(skinId) && skinId > 0, `invalid skinId ${record.skinId}`);
  assert(!expectedIds.has(skinId), `duplicate skinId ${skinId}`);
  expectedIds.add(skinId);
  assert(record.repoPath === expectedRepoPath, `repository path mismatch for Skin ${skinId}`);
  assert(record.publicPath === `images/skins/${skinId}.png`, `public path mismatch for Skin ${skinId}`);
  assert(record.requestId === `skin:${skinId}:static`, `requestId mismatch for Skin ${skinId}`);
  assert(relationRow && Number(relationRow.heroId) === Number(record.heroId), `Hero ownership mismatch for Skin ${skinId}`);
  assert(Number(relationRow.sourceOrder) === Number(record.sourceOrder), `sourceOrder mismatch for Skin ${skinId}`);
  assert(record.sourceSelectionPolicy === "SOLE_EXACT_BUNDLE_CAB", `source selection policy mismatch for Skin ${skinId}`);
  assert(/^[0-9a-f]{64}$/.test(record.sha256 ?? ""), `missing SHA-256 for Skin ${skinId}`);
  assert(Number.isInteger(record.sizeBytes) && record.sizeBytes > 0, `invalid size for Skin ${skinId}`);
  assert(fs.existsSync(record.repoPath), `repository PNG missing for Skin ${skinId}`);
  const stat = fs.statSync(record.repoPath);
  assert(stat.size === record.sizeBytes, `repository PNG size drift for Skin ${skinId}`);
  assert(sha256File(record.repoPath) === record.sha256, `repository PNG hash drift for Skin ${skinId}`);
  verifiedHashes += 1;
}
assert(expectedIds.size === 540 && Object.keys(relation.bySkinId ?? {}).length === 540, "Skin ID coverage mismatch");
const actualNames = fs.readdirSync(IMAGE_DIR).filter(name => /^\d+\.png$/.test(name));
assert(actualNames.length === 540, `repository numeric PNG count ${actualNames.length}`);
for (const name of actualNames) assert(expectedIds.has(Number.parseInt(name, 10)), `unexpected numeric Skin PNG ${name}`);

assert(hosted.status === "PASS_SKIN_STAGE3_6_HOSTED_QA" && hosted.finalReady === true, "Hosted QA predecessor");
assert(hosted.gates?.preflight === "PASS" && hosted.gates?.build === "PASS" && hosted.gates?.deploymentHosted === "PASS", "Hosted QA gate chain");
assert(/^[0-9a-f]{40}$/.test(hosted.sourceSha ?? ""), "Hosted source SHA");

const fingerprint = computeBrowserInputFingerprint();
assert(fingerprint.fileCount === 546 && fingerprint.skinImageCount === 540, "Browser fingerprint population");
assert(browser.status === "PASS_SKIN_STAGE3_6_BROWSER_UI" && browser.finalReady === true, "Browser/UI evidence final PASS");
assert(browser.deployedSourceSha === hosted.sourceSha && browser.deploymentSentinel?.sourceSha === hosted.sourceSha, "Browser/Hosted deployed source SHA parity");
assert(browser.deploymentSentinel?.heroDetailPageCount === 267 && browser.deploymentSentinel?.skinPngCount === 540, "Browser deployment sentinel population");
assert(browser.inputFingerprint?.version === 1 && browser.inputFingerprint?.algorithm === "sha256", "Browser fingerprint schema");
assert(browser.inputFingerprint?.sha256 === fingerprint.sha256, "Browser/UI evidence is stale for current Skin inputs");
assert(browser.inputFingerprint?.fileCount === 546 && browser.inputFingerprint?.skinImageCount === 540, "Browser evidence fingerprint counts");
for (const key of ["exactHostedSourceSha","desktopSkinImageLoad","desktopCarouselMouseAndKeyboard","desktopPreviousNextOrder","desktopCounter","directRefresh","heroListNavigation","browserHistoryBack","imageObjectFitContain","mobileSkinImageLoad","mobileTouchCarousel","responsiveHorizontalOverflow","zeroSkinHeroNoFabrication"]) {
  assert(browser.checks?.[key] === "PASS", `Browser/UI check ${key}`);
}
for (const key of ["pageErrors","consoleErrors","hostedHttpFailuresObservedByBrowser"]) assert(browser.checks?.[key] === 0, `Browser diagnostics ${key}`);
assert(browser.boundaries?.semanticOwnershipRecomputed === false && browser.boundaries?.sourceOrderRecomputed === false, "Browser semantic boundary");
assert(browser.boundaries?.hostedDeploymentMutatedByBrowserGate === false, "Browser gate deployment mutation boundary");

assert(frontend.status === "PASS_SKIN_STAGE3_6_FRONTEND_QA" && frontend.completion === "COMPLETE" && frontend.finalReady === true, "Stage 3-6 frontend final PASS");
assert(frontend.sourceSha === hosted.sourceSha, "Stage 3-6 frontend/Hosted source SHA parity");
assert(frontend.gates?.preflight === "PASS" && frontend.gates?.build === "PASS" && frontend.gates?.deploymentHosted === "PASS" && frontend.gates?.browserUi === "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI", "Stage 3-6 frontend gate chain");
assert(frontend.counts?.canonicalHeroCount === 267 && frontend.counts?.canonicalSkinCount === 540 && frontend.counts?.heroesWithSkinCount === 235 && frontend.counts?.zeroSkinHeroCount === 32, "Stage 3-6 frontend population");
assert(frontend.browserUiFreshness?.status === "PASS_FRESH_BROWSER_UI_EVIDENCE" && frontend.browserUiFreshness?.inputFingerprint?.sha256 === fingerprint.sha256, "Stage 3-6 Browser freshness");
assert(frontend.boundaries?.semanticOwnershipRecomputed === false && frontend.boundaries?.sourceOrderRecomputed === false, "Stage 3-6 frontend semantic boundary");

assert(checkpoint.status === "PASS_SKIN_STAGE3_6_FRONTEND_QA" && checkpoint.completion === "COMPLETE" && checkpoint.finalReady === true, "Stage 3-6 final checkpoint");
assert(checkpoint.sourceSha === hosted.sourceSha, "Final checkpoint source SHA parity");
assert(checkpoint.preflight === "PASS_SKIN_STAGE3_6_HERO_DETAIL_CONSUMER_PREFLIGHT" && checkpoint.build === "PASS_SKIN_STAGE3_6_STATIC_CANDIDATE" && checkpoint.hosted === "PASS_SKIN_STAGE3_6_HOSTED_QA" && checkpoint.browserUi === "PASS_SKIN_STAGE3_6_BROWSER_UI", "Final checkpoint gate markers");
assert(checkpoint.browserUiInputFingerprint === fingerprint.sha256, "Final checkpoint Browser fingerprint freshness");
assert(checkpoint.semanticStageReopened === false, "Final checkpoint semantic boundary");
assert(Array.isArray(checkpoint.blocker) && checkpoint.blocker.length === 0, "Final checkpoint blockers remain");

console.log(JSON.stringify({
  status: "PASS_SKIN_ASSETS_FINAL_OWNER",
  completion: "COMPLETE",
  finalReady: true,
  skinCount: expectedIds.size,
  heroCount: relation.counts.byHeroId,
  verifiedRepositoryHashes: verifiedHashes,
  browserInputFingerprint: fingerprint.sha256,
  deployedSourceSha: hosted.sourceSha,
  browserUi: browser.status,
  semanticStageReopened: false,
  sourceOrderRecomputed: false,
  liveBrowserExecutionInsideValidator: false,
}, null, 2));
