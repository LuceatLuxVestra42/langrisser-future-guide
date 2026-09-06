import crypto from "node:crypto";
import fs from "node:fs";

const INTAKE_PATH = "data/presentation/soldier-training-cost-material-localization-intake.v1.json";
const EXISTING_PATH = "data/manifests/soldier-training-material-assets-a6-webp.v1.json";
const MANIFEST_PATH = "data/manifests/soldier-training-material-cost-assets-supplemental.v1.json";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`[soldier-training-cost-material-assets-supplemental] FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const intake = readJson(INTAKE_PATH);
const existing = readJson(EXISTING_PATH);
const manifest = readJson(MANIFEST_PATH);

assert(intake.status === "PASS_WITH_REVIEW" && intake.completion === "COMPLETE", "Stage D intake must remain complete");
assert(intake.coverage?.targetUnresolvedReferenceCount === 24, "Stage D intake must contain the exact 24 unresolved refs");
assert(existing.status === "PASS" && existing.completion === "COMPLETE", "existing A6 asset manifest must remain frozen PASS/COMPLETE");
assert(existing.summary?.target === 24 && existing.records?.length === 24, "existing A6 asset set must remain 24 items");
assert(manifest.schemaId === "soldier-training-cost-material-assets-supplemental/v1", "schemaId mismatch");
assert(manifest.status === "PASS" && manifest.completion === "COMPLETE", "supplemental manifest must be PASS/COMPLETE");
assert(manifest.summary?.target === 24 && manifest.records?.length === 24, "supplemental manifest must contain 24 records");

const intakeById = new Map(intake.records.map((record) => [record.itemId, record]));
const existingIds = new Set(existing.records.map((record) => record.itemId));
const manifestIds = new Set();
const driveIds = new Set();
const repoPaths = new Set();

for (const record of manifest.records) {
  assert(Number.isInteger(record.itemId), "malformed itemId");
  assert(!manifestIds.has(record.itemId), `duplicate itemId=${record.itemId}`);
  manifestIds.add(record.itemId);
  assert(!existingIds.has(record.itemId), `supplemental itemId overlaps frozen A6: ${record.itemId}`);

  const source = intakeById.get(record.itemId);
  assert(source, `itemId not present in Stage D intake: ${record.itemId}`);
  assert(record.configIconPath === source.iconPath, `ConfigData Icon path mismatch for itemId=${record.itemId}`);
  assert(record.driveFileName === source.iconPath.split("/").at(-1), `Drive filename must exactly equal ConfigData Icon basename for itemId=${record.itemId}`);
  assert(typeof record.driveFileId === "string" && record.driveFileId.length > 0, `missing Drive file id for itemId=${record.itemId}`);
  assert(!driveIds.has(record.driveFileId), `duplicate Drive file id for itemId=${record.itemId}`);
  driveIds.add(record.driveFileId);

  const expectedRepoPath = `public/images/soldier-training-materials/${record.itemId}.png`;
  assert(record.repoPngPath === expectedRepoPath, `repository PNG path mismatch for itemId=${record.itemId}`);
  assert(!repoPaths.has(record.repoPngPath), `duplicate repository PNG path for itemId=${record.itemId}`);
  repoPaths.add(record.repoPngPath);
  assert(fs.existsSync(record.repoPngPath), `missing admitted PNG for itemId=${record.itemId}`);

  const bytes = fs.readFileSync(record.repoPngPath);
  assert(bytes.length === record.byteSize, `byte size mismatch for itemId=${record.itemId}`);
  assert(sha256(bytes) === record.pngSha256, `SHA-256 mismatch for itemId=${record.itemId}`);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `not a PNG for itemId=${record.itemId}`);
  assert(bytes.toString("ascii", 12, 16) === "IHDR", `missing PNG IHDR for itemId=${record.itemId}`);
  assert(bytes.readUInt32BE(16) === 172 && bytes.readUInt32BE(20) === 172, `PNG dimensions must be 172x172 for itemId=${record.itemId}`);
  assert(bytes[24] === 8 && bytes[25] === 6, `PNG must be 8-bit RGBA for itemId=${record.itemId}`);
  assert(record.width === 172 && record.height === 172 && record.mode === "RGBA", `manifest image metadata mismatch for itemId=${record.itemId}`);
  assert(record.admissionStatus === "DELIVERED_EXACT_PNG", `admission status mismatch for itemId=${record.itemId}`);
}

assert(manifestIds.size === 24 && driveIds.size === 24 && repoPaths.size === 24, "supplemental uniqueness coverage mismatch");
for (const itemId of intakeById.keys()) assert(manifestIds.has(itemId), `Stage D itemId missing from supplemental manifest: ${itemId}`);
assert(manifest.summary.deliveredPng === 24, "deliveredPng summary mismatch");
assert(manifest.summary.dimensions172x172 === 24, "dimensions summary mismatch");
assert(manifest.summary.rgba === 24, "RGBA summary mismatch");
assert(manifest.summary.uniqueItemIds === 24, "unique item summary mismatch");
assert(manifest.summary.uniqueDriveFileIds === 24, "unique Drive id summary mismatch");
assert(manifest.summary.uniqueRepoPngPaths === 24, "unique repo path summary mismatch");
assert(manifest.summary.missing === 0 && manifest.summary.errors === 0, "manifest summary reports missing/errors");

console.log(JSON.stringify({
  status: "PASS",
  existingFrozenAssetCount: existingIds.size,
  supplementalAssetCount: manifestIds.size,
  combinedResolvableAssetCount: existingIds.size + manifestIds.size,
  semanticRecomputed: false,
  localizationPromoted: false,
}, null, 2));
