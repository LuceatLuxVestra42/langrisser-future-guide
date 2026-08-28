import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const CONTRACT_PATH = "data/contracts/equipment-image-stage3-frontend-integration.v1.json";
const PREDECESSOR_PATH = "data/validation/equipment-image-stage2-final-summary.v3.json";
const GENERAL_LIST_PATH = "data/generated/equipment_stage3_3_general_list.json";
const EXCLUSIVE_PATH = "data/generated/equipment_stage3_5_exclusive_consumer.json";
const HELPER_PATH = "src/lib/equipment-image-assets.ts";
const GENERAL_ROUTE = "src/routes/equipment.tsx";
const EXCLUSIVE_ROUTE = "src/routes/equipment_.exclusive.tsx";
const DETAIL_ROUTE = "src/routes/equipment_.$equipmentId.tsx";
const ROUTE_TREE = "src/routeTree.gen.ts";
const SUMMARY_PATH = "data/validation/equipment-image-stage3-frontend-summary.v1.json";
const CHECKPOINT_PATH = "data/checkpoints/equipment-image-stage3-frontend.v1.json";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gitBlobSha(path) {
  return execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim();
}

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function inspectPng(path) {
  const bytes = fs.readFileSync(path);
  assert(bytes.length >= 24, `${path}: PNG too small`);
  assert(bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `${path}: invalid PNG signature`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    size: bytes.length,
  };
}

const contract = readJson(CONTRACT_PATH);
const predecessor = readJson(PREDECESSOR_PATH);
const general = readJson(GENERAL_LIST_PATH);
const exclusive = readJson(EXCLUSIVE_PATH);

assert(contract.productionJoinKey === "equipmentId", "Stage 3 contract must keep equipmentId as production join key");
assert(contract.predecessor.path === PREDECESSOR_PATH, "Stage 3 predecessor path mismatch");
assert(gitBlobSha(PREDECESSOR_PATH) === contract.predecessor.gitBlobSha, "STALE_FROZEN_DEPENDENCY: Stage 2 final summary blob changed");
assert(predecessor.status === "PASS_EQUIPMENT_IMAGE_STAGE2", "Stage 2 predecessor status is not PASS");
assert(predecessor.completion === "COMPLETE", "Stage 2 predecessor is not complete");
assert(predecessor.freezeState === "EQUIPMENT_IMAGE_STAGE2_FROZEN", "Stage 2 predecessor is not frozen");
assert(predecessor.semanticStageReopened === false, "Stage 2 semantic stage was reopened");
assert(predecessor.canonicalIdentityChanged === false, "Stage 2 canonical identity changed");
assert(predecessor.productionJoinKey === "equipmentId", "Stage 2 production join key changed");
assert(predecessor.finalStage2Complete === true, "Stage 2 finalStage2Complete is false");
assert(predecessor.counts.publicEquipment === 373, "Stage 2 publicEquipment must be 373");
assert(predecessor.counts.verifiedRepositoryAssets === 373, "Stage 2 verifiedRepositoryAssets must be 373");
assert(predecessor.counts.heldResolved === 29, "Stage 2 heldResolved must be 29");
assert(predecessor.counts.existingAssetsChanged === 0, "Stage 2 existing assets changed");
assert(predecessor.counts.missing === 0, "Stage 2 missing assets must be zero");
assert(predecessor.counts.invalidPng === 0, "Stage 2 invalid PNG count must be zero");
assert(predecessor.counts.ambiguousLocator === 0, "Stage 2 ambiguous locator count must be zero");
assert(predecessor.counts.hardErrors === 0, "Stage 2 hard errors must be zero");

assert(Array.isArray(general.records), "General equipment list records missing");
assert(Array.isArray(exclusive.listRecords), "Exclusive equipment list records missing");
assert(general.records.length === 206, `General public equipment expected 206, got ${general.records.length}`);
assert(exclusive.listRecords.length === 167, `Exclusive public equipment expected 167, got ${exclusive.listRecords.length}`);

const generalIds = general.records.map((record) => record.equipmentId);
const exclusiveIds = exclusive.listRecords.map((record) => record.equipmentId);
const publicIds = [...generalIds, ...exclusiveIds];
const uniquePublicIds = new Set(publicIds);
assert(publicIds.length === 373, `Public consumer total expected 373, got ${publicIds.length}`);
assert(uniquePublicIds.size === 373, `Public consumer equipmentId must be unique; got ${uniquePublicIds.size}`);
assert(!uniquePublicIds.has(2013), "equipmentId 2013 admission HOLD must not enter public image consumer");

let verifiedAssets = 0;
let totalBytes = 0;
const invalidDimensions = [];
for (const equipmentId of [...uniquePublicIds].sort((a, b) => a - b)) {
  const path = `public/images/equipment/${equipmentId}.png`;
  assert(fs.existsSync(path), `Missing public equipment image: ${path}`);
  const png = inspectPng(path);
  if (png.width !== 172 || png.height !== 172) {
    invalidDimensions.push({ equipmentId, width: png.width, height: png.height });
  }
  totalBytes += png.size;
  verifiedAssets += 1;
}
assert(invalidDimensions.length === 0, `Equipment image dimensions must be 172x172: ${JSON.stringify(invalidDimensions)}`);

const helperSource = fs.readFileSync(HELPER_PATH, "utf8");
const generalSource = fs.readFileSync(GENERAL_ROUTE, "utf8");
const exclusiveSource = fs.readFileSync(EXCLUSIVE_ROUTE, "utf8");
const detailSource = fs.readFileSync(DETAIL_ROUTE, "utf8");
const routeTreeSource = fs.readFileSync(ROUTE_TREE, "utf8");

assert(helperSource.includes("import.meta.env.BASE_URL"), "Equipment image resolver must use import.meta.env.BASE_URL");
assert(helperSource.includes("images/equipment/${equipmentId}.png"), "Equipment image resolver path template changed");
assert(!helperSource.includes('return `/images/equipment/'), "Root-relative equipment asset path is forbidden for GitHub Pages");
assert(helperSource.includes("PASS_EQUIPMENT_IMAGE_STAGE2"), "Resolver must gate on frozen Stage 2 predecessor");
assert(helperSource.includes("verifiedRepositoryAssets === 373"), "Resolver must gate on 373 verified repository assets");

for (const [label, source] of [
  ["general", generalSource],
  ["exclusive", exclusiveSource],
  ["detail", detailSource],
]) {
  assert(source.includes('getOfficialEquipmentImageUrl'), `${label} route does not consume the official Equipment image resolver`);
}
assert(generalSource.includes("src={imageUrl}"), "General equipment image card is not wired to resolved image URL");
assert(generalSource.includes('loading="lazy"'), "General equipment image list must lazy-load images");
assert(!generalSource.includes("Crown, Gem, Shield, Swords"), "Legacy general Equipment placeholder icon import remains");
assert(exclusiveSource.includes("src={getOfficialEquipmentImageUrl(record.equipmentId)}"), "Exclusive equipment cards are not wired to equipmentId images");
assert(detailSource.includes("const imageUrl = getOfficialEquipmentImageUrl(equipmentId);"), "Equipment detail header is not wired to equipmentId image");
assert(detailSource.includes("장비 이미지"), "Equipment detail image accessible alt text missing");
assert(routeTreeSource.includes('/equipment/exclusive'), "Generated route tree missing /equipment/exclusive");
assert(routeTreeSource.includes('/equipment/$equipmentId'), "Generated route tree missing /equipment/$equipmentId");

const buildGatePass = process.env.EQUIPMENT_STAGE3_BUILD_PASS === "1";
const summary = {
  stage: "Equipment Image Stage 3 Frontend Integration",
  version: 1,
  status: buildGatePass ? "PASS_EQUIPMENT_IMAGE_STAGE3_FRONTEND" : "PASS_EQUIPMENT_IMAGE_STAGE3_PREFLIGHT",
  completion: buildGatePass ? "PREDEPLOY_COMPLETE" : "PREFLIGHT_COMPLETE",
  freezeState: buildGatePass ? "EQUIPMENT_IMAGE_STAGE3_PREDEPLOY_FROZEN" : "NOT_FROZEN_BUILD_PENDING",
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: "equipmentId",
  predecessor: {
    path: PREDECESSOR_PATH,
    gitBlobSha: gitBlobSha(PREDECESSOR_PATH),
    sha256: sha256(PREDECESSOR_PATH),
    status: predecessor.status,
    freezeState: predecessor.freezeState,
  },
  counts: {
    publicEquipment: publicIds.length,
    generalEquipment: generalIds.length,
    exclusiveEquipment: exclusiveIds.length,
    uniqueEquipmentIds: uniquePublicIds.size,
    verifiedAssets,
    invalidDimensions: invalidDimensions.length,
    missingAssets: 0,
    totalAssetBytes: totalBytes,
  },
  assetContract: {
    sourceStage: "Equipment Image Stage 2",
    resolver: "equipmentId -> import.meta.env.BASE_URL + images/equipment/{equipmentId}.png",
    expectedDimensions: "172x172",
    basePathAware: true,
    rootRelativeAssetPathForbidden: true,
  },
  routes: ["/equipment", "/equipment/exclusive", "/equipment/$equipmentId"],
  gates: {
    preflight: "PASS",
    build: buildGatePass ? "PASS" : "PENDING",
    deploymentHosted: "PENDING_MAIN_DEPLOYMENT",
    browserUi: "PENDING_HOSTED_SMOKE",
  },
  excludedAdmissionHoldEquipmentId: 2013,
  nextStage: "STAGE3_HOSTED_QA",
};

fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(
  CHECKPOINT_PATH,
  `${JSON.stringify(
    {
      checkpoint: "equipment-image-stage3-frontend-v1",
      status: summary.status,
      completion: summary.completion,
      freezeState: summary.freezeState,
      predecessorGitBlobSha: summary.predecessor.gitBlobSha,
      productionJoinKey: "equipmentId",
      verifiedAssets,
      publicEquipment: publicIds.length,
      routes: summary.routes,
      hostedQaRequired: true,
      nextStart: "GitHub Pages deployment freshness -> hosted route/direct-entry/asset smoke -> final Stage 3 freeze",
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify(summary, null, 2));
