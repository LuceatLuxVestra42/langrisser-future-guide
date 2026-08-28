import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STAGE2_CHECKPOINT = "data/checkpoints/equipment-image-stage2-final.v3.json";
const STAGE2_SUMMARY = "data/validation/equipment-image-stage2-final-summary.v3.json";
const STAGE2_SOURCE_EVIDENCE = "data/evidence/equipment-image-stage2-source-evidence.v1.json";
const STAGE2_APK_EVIDENCE = "data/evidence/equipment-image-stage2-final373-official-apk.v3.json";
const STAGE3_FRONTEND = "data/validation/equipment-image-stage3-frontend-summary.v1.json";
const STAGE3_HOSTED = "data/validation/equipment-image-stage3-hosted-qa-summary.v1.json";
const STAGE3_BROWSER = "data/evidence/equipment-image-stage3-browser-ui.v1.json";
const STAGE3_CHECKPOINT = "data/checkpoints/equipment-image-stage3-final.v1.json";
const IMAGE_DIR = "public/images/equipment";

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const gitBlobSha = file => {
  const bytes = fs.readFileSync(file);
  return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};
const assert = (condition, message) => {
  if (!condition) throw new Error(`[EQUIPMENT_IMAGE_FINAL_INVALID] ${message}`);
};

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
  const imageNames = fs.readdirSync(IMAGE_DIR)
    .filter(name => /^\d+\.png$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  assert(imageNames.length === 373, `expected 373 numeric Equipment PNGs, got ${imageNames.length}`);
  const files = [...sourceFiles, ...imageNames.map(name => `${IMAGE_DIR}/${name}`)];
  const hash = crypto.createHash("sha256");
  hash.update("equipment-image-stage3-browser-input-v1\0");
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
    equipmentImageCount: imageNames.length,
  };
}

const frozenStage2Blobs = {
  [STAGE2_CHECKPOINT]: "a5cef0832c54e36fd56b9104aa765d627a856beb",
  [STAGE2_SUMMARY]: "4fde14fc3ae1b17ce08908c217279a0e26c7ac42",
  [STAGE2_SOURCE_EVIDENCE]: "3603fddfeadcde9f91cc5e512739779fb11bf577",
  [STAGE2_APK_EVIDENCE]: "30f35be16dcb77d83724338ba77c6f8707a9d1ae",
};
for (const [file, expectedBlob] of Object.entries(frozenStage2Blobs)) {
  assert(gitBlobSha(file) === expectedBlob, `frozen Stage 2 blob drift: ${file}`);
}

const stage2Checkpoint = readJson(STAGE2_CHECKPOINT);
const stage2Summary = readJson(STAGE2_SUMMARY);
const sourceEvidence = readJson(STAGE2_SOURCE_EVIDENCE);
const apkEvidence = readJson(STAGE2_APK_EVIDENCE);
const frontend = readJson(STAGE3_FRONTEND);
const hosted = readJson(STAGE3_HOSTED);
const browser = readJson(STAGE3_BROWSER);
const checkpoint = readJson(STAGE3_CHECKPOINT);

assert(stage2Checkpoint.status === "PASS_EQUIPMENT_IMAGE_STAGE2", "Stage 2 checkpoint status");
assert(stage2Checkpoint.completion === "COMPLETE", "Stage 2 checkpoint completion");
assert(stage2Checkpoint.freezeState === "EQUIPMENT_IMAGE_STAGE2_FROZEN", "Stage 2 checkpoint freeze");
assert(stage2Checkpoint.confirmedJoinKey === "equipmentId", "Stage 2 join key");
assert(stage2Checkpoint.repositoryAssets === 373 && stage2Checkpoint.verifiedEvidence === 373, "Stage 2 checkpoint coverage");
assert(stage2Checkpoint.frozenExistingSubset === 344 && stage2Checkpoint.resolvedHeldSubset === 29, "Stage 2 frozen/hold partition");
assert(stage2Checkpoint.existing344Changed === 0 && stage2Checkpoint.sourceUnresolved === 0, "Stage 2 unresolved/mutation boundary");

assert(stage2Summary.status === "PASS_EQUIPMENT_IMAGE_STAGE2", "Stage 2 summary status");
assert(stage2Summary.completion === "COMPLETE" && stage2Summary.freezeState === "EQUIPMENT_IMAGE_STAGE2_FROZEN", "Stage 2 summary freeze");
assert(stage2Summary.productionJoinKey === "equipmentId", "Stage 2 summary join key");
assert(stage2Summary.semanticStageReopened === false && stage2Summary.canonicalIdentityChanged === false, "Stage 2 semantic boundary");
assert(stage2Summary.finalStage2Complete === true, "Stage 2 final completion flag");
for (const [key, value] of Object.entries({
  publicEquipment: 373,
  existingExactSourceAssets: 344,
  heldEquipment: 29,
  heldResolved: 29,
  verifiedRepositoryAssets: 373,
  verifiedEvidence: 373,
  existingAssetsChanged: 0,
  unexpectedDeleted: 0,
  unexpectedAddedOutsideHold29: 0,
  missing: 0,
  invalidPng: 0,
  ambiguousLocator: 0,
  hardErrors: 0,
})) assert(stage2Summary.counts?.[key] === value, `Stage 2 count ${key}`);

assert(sourceEvidence.status === "PASS_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION", "Stage 2 exact-source evidence status");
assert(sourceEvidence.productionJoinKey === "equipmentId", "Stage 2 exact-source join key");
assert(sourceEvidence.sourceLocatorAuthority === "ConfigDataEquipmentInfo.Icon full path", "Stage 2 locator authority");
assert(Array.isArray(sourceEvidence.records) && sourceEvidence.records.length === 344, `exact-source evidence count ${sourceEvidence.records?.length}`);

assert(apkEvidence.status === "PASS_EQUIPMENT_IMAGE_STAGE2_OFFICIAL_APK_HOLD29", "Stage 2 APK evidence status");
assert(apkEvidence.contract === "equipment-image-stage2-official-apk-finalization-v2", "Stage 2 APK evidence contract");
assert(apkEvidence.sourceAuthority?.officialPage === "https://mz.zlongame.com/main.shtml", "Stage 2 official source page");
assert(apkEvidence.sourceAuthority?.officialApkUrl === "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk", "Stage 2 official APK URL");
assert(apkEvidence.identityBoundary?.productionJoinKey === "equipmentId", "APK evidence join key");
assert(apkEvidence.identityBoundary?.sourceLocatorAuthority === "ConfigDataEquipmentInfo.Icon full path", "APK locator authority");
for (const key of ["basenameOnlyResolutionUsed","filenameSimilarityUsed","visualSimilarityResolutionUsed","crossRootFallbackUsed","canonicalIdentityChanged","semanticStageReopened"]) {
  assert(apkEvidence.identityBoundary?.[key] === false, `APK forbidden boundary ${key}`);
}
assert(apkEvidence.runtimeTextureFormat?.code === 47 && apkEvidence.runtimeTextureFormat?.name === "ETC2_RGBA8", "APK texture format");
assert(apkEvidence.representativeProof?.fixtures === 5 && apkEvidence.representativeProof?.passed === 5, "APK representative proof");
assert(apkEvidence.heldResolvedCount === 29, "APK held resolved count");
assert(Array.isArray(apkEvidence.records) && apkEvidence.records.length === 29, `APK record count ${apkEvidence.records?.length}`);
assert(apkEvidence.collisionFixture547_550?.sameTexture2DName === true, "547/550 collision same basename");
assert(apkEvidence.collisionFixture547_550?.distinctSourceRoots === true, "547/550 collision source-root separation");
assert(apkEvidence.collisionFixture547_550?.distinctBundleEntries === true, "547/550 collision bundle separation");

const expected = new Map();
for (const record of sourceEvidence.records) {
  const id = Number(record.equipmentId);
  const expectedPath = `${IMAGE_DIR}/${id}.png`;
  assert(Number.isSafeInteger(id) && id > 0, `invalid exact-source equipmentId ${record.equipmentId}`);
  assert(record.targetRepositoryPath === expectedPath, `exact-source repository path mismatch for ${id}`);
  assert(record.sourceEvidenceStatus === "VERIFIED_EXACT_SOURCE_EXPORT", `exact-source status mismatch for ${id}`);
  assert(typeof record.sourceLocator === "string" && /^(UI\/Icon\/Equip_ABS\/|UI\/Icon\/Item04_ABS\/)/.test(record.sourceLocator), `exact-source locator root mismatch for ${id}`);
  assert(record.sourceBasename === path.posix.basename(record.sourceLocator), `exact-source basename record mismatch for ${id}`);
  assert(record.targetUrlPath === `/images/equipment/${id}.png`, `exact-source target URL mismatch for ${id}`);
  assert(Number.isInteger(record.sourceWidth) && record.sourceWidth > 0 && Number.isInteger(record.sourceHeight) && record.sourceHeight > 0, `exact-source dimensions invalid for ${id}`);
  assert(record.sourceRepositorySha256Parity === true, `source/repository parity false for ${id}`);
  assert(/^[0-9a-f]{64}$/.test(record.sourceSha256 ?? ""), `exact-source source sha missing for ${id}`);
  assert(/^[0-9a-f]{64}$/.test(record.repositorySha256 ?? ""), `exact-source repository sha missing for ${id}`);
  assert(record.sourceSha256 === record.repositorySha256, `exact-source source/repository hash mismatch for ${id}`);
  assert(!expected.has(id), `duplicate equipmentId ${id}`);
  expected.set(id, { path: expectedPath, sha256: record.repositorySha256, provenance: "exact-source" });
}
for (const record of apkEvidence.records) {
  const id = Number(record.equipmentId);
  const expectedPath = `${IMAGE_DIR}/${id}.png`;
  assert(Number.isSafeInteger(id) && id > 0, `invalid APK equipmentId ${record.equipmentId}`);
  assert(record.repositoryPath === expectedPath, `APK repository path mismatch for ${id}`);
  assert(record.resolutionStatus === "VERIFIED_OFFICIAL_APK_ETC2_TEXTURE_EXTRACT", `APK resolution status mismatch for ${id}`);
  assert(record.texture2DExactNameMatch === true, `APK Texture2D exact-name mismatch for ${id}`);
  assert(record.textureFormatCode === 47 && record.textureFormatName === "ETC2_RGBA8", `APK texture format mismatch for ${id}`);
  assert(record.width === 172 && record.height === 172 && record.hasAlpha === true, `APK image structure mismatch for ${id}`);
  assert(record.stagedToRepositoryShaParity === true, `APK staged/repository parity false for ${id}`);
  assert(/^[0-9a-f]{64}$/.test(record.decodedPixelSha256 ?? ""), `APK decoded pixel sha missing for ${id}`);
  assert(/^[0-9a-f]{64}$/.test(record.stagedPngSha256 ?? ""), `APK staged PNG sha missing for ${id}`);
  assert(/^[0-9a-f]{64}$/.test(record.repositoryPngSha256 ?? ""), `APK repository sha missing for ${id}`);
  assert(record.stagedPngSha256 === record.repositoryPngSha256, `APK staged/repository hash mismatch for ${id}`);
  assert(typeof record.sourceIconPath === "string" && record.sourceIconPath.startsWith(record.sourceRoot), `APK full locator/root mismatch for ${id}`);
  assert(!expected.has(id), `duplicate equipmentId across provenance sets ${id}`);
  expected.set(id, { path: expectedPath, sha256: record.repositoryPngSha256, provenance: "official-apk" });
}
assert(expected.size === 373, `combined evidence coverage ${expected.size}`);

const actualNames = fs.readdirSync(IMAGE_DIR)
  .filter(name => /^\d+\.png$/.test(name))
  .sort((a,b) => Number.parseInt(a,10) - Number.parseInt(b,10));
assert(actualNames.length === 373, `repository PNG count ${actualNames.length}`);
const actualIds = actualNames.map(name => Number.parseInt(name, 10));
assert(actualIds.length === new Set(actualIds).size, "duplicate numeric PNG ids");
assert(actualIds.every(id => expected.has(id)) && [...expected.keys()].every(id => actualIds.includes(id)), "repository/evidence ID set mismatch");

let verifiedHashes = 0;
for (const [id, record] of expected) {
  assert(fs.existsSync(record.path), `repository PNG missing for ${id}`);
  const actualSha = sha256File(record.path);
  assert(actualSha === record.sha256, `repository PNG hash drift for ${id}`);
  verifiedHashes += 1;
}

assert(frontend.status === "PASS_EQUIPMENT_IMAGE_STAGE3_FRONTEND", "Stage 3 frontend status");
assert(frontend.completion === "PREDEPLOY_COMPLETE" && frontend.freezeState === "EQUIPMENT_IMAGE_STAGE3_PREDEPLOY_FROZEN", "Stage 3 frontend freeze");
assert(frontend.productionJoinKey === "equipmentId", "Stage 3 frontend join key");
assert(frontend.semanticStageReopened === false && frontend.canonicalIdentityChanged === false, "Stage 3 frontend semantic boundary");
assert(frontend.counts?.publicEquipment === 373 && frontend.counts?.verifiedAssets === 373 && frontend.counts?.missingAssets === 0, "Stage 3 frontend asset coverage");
assert(frontend.assetContract?.basePathAware === true && frontend.assetContract?.rootRelativeAssetPathForbidden === true, "Stage 3 asset-path contract");

const fingerprint = computeBrowserInputFingerprint();
assert(browser.status === "PASS_EQUIPMENT_IMAGE_STAGE3_BROWSER_UI", "Browser evidence status");
assert(browser.productionJoinKey === "equipmentId" && browser.publicEquipment === 373, "Browser evidence identity/coverage");
assert(browser.inputFingerprint?.version === 1 && browser.inputFingerprint?.algorithm === "sha256", "Browser fingerprint schema");
assert(browser.inputFingerprint?.sha256 === fingerprint.sha256, "Browser evidence is stale for current inputs");
assert(browser.inputFingerprint?.fileCount === 380 && browser.inputFingerprint?.equipmentImageCount === 373, "Browser fingerprint counts");
for (const key of ["pageErrors","consoleErrors","hostedHttpFailuresObservedByBrowser"]) assert(browser.checks?.[key] === 0, `Browser diagnostics ${key}`);
for (const key of ["desktopGeneralListImage","generalFilterInteraction","keyboardListToDetailNavigation","detailRefresh","exclusiveListToDetailNavigation","collisionFixtureDetails547_550","mobileGeneralList","mobileDetail","mobileExclusiveList","horizontalOverflow"]) {
  assert(browser.checks?.[key] === "PASS", `Browser check ${key}`);
}

assert(hosted.status === "PASS_EQUIPMENT_IMAGE_STAGE3", "Stage 3 final summary status");
assert(hosted.completion === "COMPLETE" && hosted.freezeState === "EQUIPMENT_IMAGE_STAGE3_FROZEN", "Stage 3 final summary freeze");
assert(hosted.semanticStageReopened === false && hosted.canonicalIdentityChanged === false, "Stage 3 final summary semantic boundary");
assert(hosted.productionJoinKey === "equipmentId" && hosted.publicEquipment === 373, "Stage 3 final summary identity/coverage");
assert(hosted.gates?.preflight === "PASS" && hosted.gates?.build === "PASS" && hosted.gates?.deploymentHosted === "PASS" && hosted.gates?.browserUi === "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI", "Stage 3 four-gate closeout");
assert(hosted.browserUiFreshness?.status === "PASS_FRESH_BROWSER_UI_EVIDENCE", "Stage 3 Browser freshness status");
assert(hosted.browserUiFreshness?.currentInputFingerprint?.sha256 === fingerprint.sha256, "Stage 3 summary fingerprint drift");
assert(hosted.browserUiEvidence?.path === STAGE3_BROWSER && hosted.browserUiEvidence?.status === browser.status, "Stage 3 Browser evidence reference");

assert(checkpoint.status === "PASS_EQUIPMENT_IMAGE_STAGE3", "Stage 3 checkpoint status");
assert(checkpoint.completion === "COMPLETE" && checkpoint.freezeState === "EQUIPMENT_IMAGE_STAGE3_FROZEN", "Stage 3 checkpoint freeze");
assert(checkpoint.productionJoinKey === "equipmentId" && checkpoint.publicEquipment === 373, "Stage 3 checkpoint identity/coverage");
assert(checkpoint.browserUi === "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI", "Stage 3 checkpoint Browser gate");
assert(checkpoint.browserUiFreshness === "PASS_FRESH_BROWSER_UI_EVIDENCE", "Stage 3 checkpoint freshness");
assert(checkpoint.browserUiEvidencePath === STAGE3_BROWSER, "Stage 3 checkpoint evidence path");
assert(checkpoint.browserUiInputFingerprint === fingerprint.sha256, "Stage 3 checkpoint fingerprint drift");
assert(checkpoint.semanticStageReopened === false, "Stage 3 checkpoint semantic boundary");

console.log(JSON.stringify({
  status: "PASS_EQUIPMENT_IMAGE_FINAL_OWNER",
  stage2: { exactSource: 344, officialApkHold: 29, verifiedRepositoryAssets: verifiedHashes },
  stage3: {
    publicEquipment: 373,
    browserInputFingerprint: fingerprint.sha256,
    browserUi: "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI",
    browserUiFreshness: "PASS_FRESH_BROWSER_UI_EVIDENCE",
  },
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
}, null, 2));
