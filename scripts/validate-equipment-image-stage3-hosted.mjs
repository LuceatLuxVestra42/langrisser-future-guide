import fs from "node:fs";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const SUMMARY_PATH = "data/validation/equipment-image-stage3-hosted-qa-summary.v1.json";
const CHECKPOINT_PATH = "data/checkpoints/equipment-image-stage3-final.v1.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveUrl(path) {
  return new URL(path.replace(/^\//, ""), BASE_URL).toString();
}

async function fetchNoStore(path) {
  const url = resolveUrl(path);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  return { url, response };
}

async function waitForDeploymentSentinel() {
  const sentinelPath = "equipment-image-stage3-ready.json";
  let lastError = "not requested";

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const { response } = await fetchNoStore(`${sentinelPath}?qa=${Date.now()}-${attempt}`);
      if (response.ok) {
        const payload = await response.json();
        if (
          payload?.stage === "Equipment Image Stage 3 Frontend Integration" &&
          payload?.version === 1 &&
          payload?.status === "READY_FOR_HOSTED_QA" &&
          payload?.productionJoinKey === "equipmentId" &&
          payload?.publicEquipment === 373
        ) {
          return { attempt, payload };
        }
        lastError = `sentinel payload mismatch: ${JSON.stringify(payload)}`;
      } else {
        lastError = `sentinel HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  throw new Error(`DEPLOYMENT_HOSTING_FAIL: Stage 3 sentinel did not become current: ${lastError}`);
}

async function checkRoute(path) {
  const { url, response } = await fetchNoStore(`${path}${path.includes("?") ? "&" : "?"}qa=${Date.now()}`);
  const text = await response.text();
  assert(response.ok, `DEPLOYMENT_HOSTING_FAIL: ${path} returned HTTP ${response.status}`);
  assert(text.length > 0, `DEPLOYMENT_HOSTING_FAIL: ${path} returned an empty document`);
  return {
    path,
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    bytes: Buffer.byteLength(text),
  };
}

async function checkPng(equipmentId) {
  const path = `images/equipment/${equipmentId}.png`;
  const { url, response } = await fetchNoStore(`${path}?qa=${Date.now()}`);
  assert(response.ok, `DEPLOYMENT_HOSTING_FAIL: Equipment image ${equipmentId} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length >= 24, `Equipment image ${equipmentId} is too small`);
  assert(bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `Equipment image ${equipmentId} has invalid PNG signature`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width === 172 && height === 172, `Equipment image ${equipmentId} expected 172x172, got ${width}x${height}`);
  return {
    equipmentId,
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    width,
    height,
    bytes: bytes.length,
  };
}

const sentinel = await waitForDeploymentSentinel();

const routePaths = [
  "",
  "equipment",
  "equipment/",
  "equipment/exclusive",
  "equipment/exclusive/",
  "equipment/6",
  "equipment/547",
  "equipment/550",
];
const routes = [];
for (const path of routePaths) {
  routes.push(await checkRoute(path));
}

const representativeIds = [6, 106, 547, 550, 643];
const assets = [];
for (const equipmentId of representativeIds) {
  assets.push(await checkPng(equipmentId));
}

const summary = {
  stage: "Equipment Image Stage 3 Hosted QA",
  version: 1,
  status: "PASS_EQUIPMENT_IMAGE_STAGE3_HOSTED_QA",
  completion: "COMPLETE",
  freezeState: "EQUIPMENT_IMAGE_STAGE3_FROZEN",
  semanticStageReopened: false,
  canonicalIdentityChanged: false,
  productionJoinKey: "equipmentId",
  hostedBaseUrl: BASE_URL,
  deploymentSentinel: {
    status: "PASS",
    attempts: sentinel.attempt,
    payload: sentinel.payload,
  },
  gates: {
    preflight: "PASS",
    build: "PASS",
    deploymentHosted: "PASS",
    browserUi: "PASS_HOSTED_ROUTE_AND_ASSET_SMOKE",
  },
  routeChecks: routes,
  assetChecks: assets,
  representativeEquipmentIds: representativeIds,
  collisionFixturesChecked: [547, 550],
  existingBaselineFixtureChecked: 6,
  officialApkHoldFixturesChecked: [106, 547, 550, 643],
  publicEquipment: 373,
  nextStage: "EQUIPMENT_IMAGE_STAGE3_COMPLETE",
};

fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(
  CHECKPOINT_PATH,
  `${JSON.stringify(
    {
      checkpoint: "equipment-image-stage3-final-v1",
      status: summary.status,
      completion: summary.completion,
      freezeState: summary.freezeState,
      productionJoinKey: "equipmentId",
      publicEquipment: 373,
      hostedBaseUrl: BASE_URL,
      routeCount: routes.length,
      representativeAssetCount: assets.length,
      collisionFixturesChecked: [547, 550],
      semanticStageReopened: false,
      nextStart: "Equipment image Stage 3 is complete; continue only with later Equipment UI/presentation work without reopening frozen semantics.",
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify(summary, null, 2));
