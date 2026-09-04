import fs from "node:fs";
import path from "node:path";

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const fail = (message) => { throw new Error(message); };

const retirement = readJson("data/contracts/skin-stage3-5-static-retirement.v1.json");
const historicalContract = readJson("data/contracts/skin-stage3-5-static-web-asset-map.v1.json");
const historicalManifest = readJson("data/generated/skin-stage3-5-static-web-asset-map.v1.json");
const historicalValidation = readJson("data/validation/skin-stage3-5-static-web-asset-map.v1.json");
const fullartManifest = readJson(retirement.productionBoundary.fullartManifestPath);

if (retirement.status !== "DESIGN_FROZEN" || retirement.completion?.status !== "PASS_SKIN_STAGE3_5_STATIC_RETIREMENT") {
  fail("Legacy Skin static retirement contract is not frozen.");
}
if (retirement.retirementPolicy?.semanticPopulationChange !== false || retirement.retirementPolicy?.semanticRelationChange !== false || retirement.retirementPolicy?.semanticRecomputation !== false || retirement.retirementPolicy?.nameJoin !== false || retirement.retirementPolicy?.idArithmetic !== false || retirement.retirementPolicy?.filenameSimilarity !== false) {
  fail("Legacy Skin static retirement non-semantic boundaries changed.");
}
if (historicalContract.status !== "DESIGN_FROZEN" || historicalContract.output?.expectedFileCount !== 540) {
  fail("Historical Stage 3-5 static contract changed.");
}
if (historicalValidation.status !== "PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP" || historicalValidation.finalReady !== true || historicalValidation.counts?.expectedSkinCount !== 540 || historicalValidation.counts?.acceptedSkinCount !== 540) {
  fail("Historical Stage 3-5 validation checkpoint changed.");
}
if (!Array.isArray(historicalManifest.records) || historicalManifest.records.length !== 540) {
  fail(`Historical Stage 3-5 manifest record count changed: ${historicalManifest.records?.length ?? "missing"}.`);
}
if (fullartManifest.boundaries?.legacyStaticAssetConsumed !== false || fullartManifest.boundaries?.semanticRecomputed !== false || fullartManifest.boundaries?.relationRecomputed !== false || fullartManifest.boundaries?.nameJoin !== false || fullartManifest.boundaries?.idArithmetic !== false) {
  fail("Current Skin fullart manifest no longer preserves the legacy/non-semantic boundary.");
}

const helperPath = retirement.productionBoundary.fullartHelperPath;
const heroRoutePath = retirement.productionBoundary.heroDetailConsumerPath;
const helperSource = fs.readFileSync(helperPath, "utf8");
const heroRouteSource = fs.readFileSync(heroRoutePath, "utf8");
if (!helperSource.includes("skin-fullart-reference.v1.json") || !helperSource.includes("getSkinFullartVisuals")) {
  fail("Current Skin fullart helper no longer consumes the frozen fullart manifest.");
}
if (!heroRouteSource.includes('getSkinFullartVisuals') || !heroRouteSource.includes('@/lib/skin-fullart-assets')) {
  fail("Hero detail no longer consumes the Skin fullart helper.");
}
if (!heroRouteSource.includes("ImageOff") || !heroRouteSource.includes("이미지 연결 대기") || !heroRouteSource.includes("activeVisual ?")) {
  fail("Hero detail missing-visual fallback boundary changed.");
}

const productionExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".html"]);
const legacyNeedles = ["/images/skins/", "public/images/skins/"];
const legacyReferences = [];
const walk = (root) => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(current);
      continue;
    }
    if (!productionExtensions.has(path.extname(entry.name))) continue;
    const source = fs.readFileSync(current, "utf8");
    for (const needle of legacyNeedles) {
      if (source.includes(needle)) legacyReferences.push({ path: current.replaceAll("\\", "/"), needle });
    }
  }
};
walk("src");
if (legacyReferences.length !== 0) {
  fail(`Production source still references retired Skin static delivery: ${JSON.stringify(legacyReferences)}`);
}

const legacyRoot = retirement.productionBoundary.legacyRoot;
const remainingLegacyFiles = fs.existsSync(legacyRoot)
  ? fs.readdirSync(legacyRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).length
  : 0;

console.log(JSON.stringify({
  status: "PASS_SKIN_STAGE3_5_STATIC_RETIREMENT",
  finalReady: true,
  historicalSkinCount: 540,
  productionLegacyReferenceCount: 0,
  remainingLegacyFileCount: remainingLegacyFiles,
  legacyDirectoryMayBeAbsent: true,
  repositoryMutation: false
}, null, 2));
