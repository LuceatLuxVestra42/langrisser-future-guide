import fs from "node:fs";

const CATALOG_PATH = "data/generated/hero-casting-law-materials.v1.json";
const MANIFEST_PATH = "data/generated/hero-casting-law-material-icon-assets.v1.json";
const SUMMARY_PATH = "data/validation/hero-casting-law-material-icon-assets-summary.v1.json";
const EXPECTED_COUNT = 45;
const EXPECTED_SOURCE_COMMIT = "2993e19ff392212f76b7ce006a6314ec0f10de4d";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const fail = (message) => {
  throw new Error(message);
};

const catalog = readJson(CATALOG_PATH);
const manifest = readJson(MANIFEST_PATH);
const summary = readJson(SUMMARY_PATH);

if (catalog?.version !== 1 || catalog?.domain !== "hero-casting-law-materials" || catalog?.status !== "PASS") {
  fail("Casting Law catalog contract mismatch");
}
if (catalog?.summary?.distinctMaterialItemCount !== EXPECTED_COUNT) {
  fail(`Casting Law catalog distinct item count=${catalog?.summary?.distinctMaterialItemCount}`);
}
if (
  manifest?.version !== 1 ||
  manifest?.schemaId !== "hero-casting-law-material-icon-assets/v1" ||
  manifest?.status !== "FROZEN" ||
  manifest?.completion !== "COMPLETE" ||
  manifest?.semanticReopen !== false
) {
  fail("Casting Law icon manifest contract mismatch");
}
if (
  manifest?.sourceSnapshot?.repository !== "redpanda7301/langrisser" ||
  manifest?.sourceSnapshot?.commit !== EXPECTED_SOURCE_COMMIT ||
  manifest?.sourceSnapshot?.directory !== "img/item/CastFigure"
) {
  fail("Casting Law icon source snapshot drift");
}
if (manifest?.authority?.assetRelation !== "explicit frozen record only" || manifest?.authority?.runtimeDerivation !== false) {
  fail("Casting Law icon relation boundary mismatch");
}

const canonical = new Map();
for (const template of catalog.templates ?? []) {
  for (const level of template.levels ?? []) {
    for (const material of level.materials ?? []) {
      const item = material.item;
      if (!Number.isSafeInteger(item?.itemId) || item.itemId <= 0 || !item.icon) {
        fail("Casting Law catalog material item identity/icon missing");
      }
      const row = {
        itemId: item.itemId,
        nameCn: item.nameCn ?? "",
        rank: item.rank ?? null,
        sourcePath: item.icon,
      };
      const existing = canonical.get(item.itemId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(row)) {
        fail(`Casting Law item ${item.itemId} has conflicting canonical snapshots`);
      }
      canonical.set(item.itemId, row);
    }
  }
}
if (canonical.size !== EXPECTED_COUNT) fail(`canonical item count=${canonical.size}`);

const records = manifest.records ?? [];
if (records.length !== EXPECTED_COUNT) fail(`manifest record count=${records.length}`);
const byId = new Map();
const sourcePaths = new Set();
const urls = new Set();
const blobShas = new Set();

for (const row of records) {
  if (!Number.isSafeInteger(row?.itemId) || row.itemId <= 0 || byId.has(row.itemId)) {
    fail(`invalid/duplicate manifest itemId=${String(row?.itemId)}`);
  }
  const expected = canonical.get(row.itemId);
  if (!expected || expected.nameCn !== row.nameCn || expected.rank !== row.rank || expected.sourcePath !== row.sourcePath) {
    fail(`manifest canonical relation mismatch itemId=${row.itemId}`);
  }
  if (sourcePaths.has(row.sourcePath)) fail(`duplicate sourcePath=${row.sourcePath}`);
  sourcePaths.add(row.sourcePath);

  const asset = row.asset;
  if (
    asset?.repository !== "redpanda7301/langrisser" ||
    asset?.commit !== EXPECTED_SOURCE_COMMIT ||
    typeof asset?.path !== "string" ||
    !asset.path.startsWith("img/item/CastFigure/") ||
    typeof asset?.gitBlobSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(asset.gitBlobSha) ||
    !Number.isSafeInteger(asset?.bytes) ||
    asset.bytes <= 0 ||
    typeof asset?.url !== "string"
  ) {
    fail(`invalid asset provenance itemId=${row.itemId}`);
  }
  const expectedUrl = `https://raw.githubusercontent.com/redpanda7301/langrisser/${EXPECTED_SOURCE_COMMIT}/${asset.path}`;
  if (asset.url !== expectedUrl) fail(`asset URL provenance mismatch itemId=${row.itemId}`);
  if (urls.has(asset.url)) fail(`duplicate asset URL itemId=${row.itemId}`);
  urls.add(asset.url);
  blobShas.add(asset.gitBlobSha);
  byId.set(row.itemId, row);
}

for (const itemId of canonical.keys()) {
  if (!byId.has(itemId)) fail(`canonical itemId ${itemId} missing icon asset`);
}

if (
  manifest?.summary?.targetCount !== EXPECTED_COUNT ||
  manifest?.summary?.resolvedCount !== EXPECTED_COUNT ||
  manifest?.summary?.unresolvedCount !== 0 ||
  manifest?.summary?.uniqueItemIdCount !== EXPECTED_COUNT ||
  manifest?.summary?.uniqueSourcePathCount !== EXPECTED_COUNT ||
  manifest?.summary?.uniqueAssetUrlCount !== EXPECTED_COUNT
) {
  fail("manifest summary mismatch");
}

const expectedSummary = {
  version: 1,
  domain: "hero-casting-law-material-icon-assets",
  status: "PASS",
  completion: "COMPLETE",
  targetCount: EXPECTED_COUNT,
  resolvedCount: EXPECTED_COUNT,
  unresolvedCount: 0,
  duplicateItemIdCount: 0,
  duplicateSourcePathCount: 0,
  duplicateAssetUrlCount: 0,
  sourceCommit: EXPECTED_SOURCE_COMMIT,
  hardErrors: [],
};
if (JSON.stringify(summary) !== JSON.stringify(expectedSummary)) fail("frozen validation summary drift");

console.log(JSON.stringify({
  checkpoint: "HERO_CASTING_LAW_MATERIAL_ICON_ASSETS",
  status: "PASS",
  targetCount: EXPECTED_COUNT,
  canonicalItemCount: canonical.size,
  manifestRecordCount: records.length,
  uniqueSourcePathCount: sourcePaths.size,
  uniqueAssetUrlCount: urls.size,
  sourceCommit: EXPECTED_SOURCE_COMMIT,
  semanticReopen: false,
}, null, 2));
