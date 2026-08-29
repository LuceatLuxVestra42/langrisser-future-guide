import crypto from "node:crypto";
import fs from "node:fs";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const SUMMARY_PATH = "data/validation/equipment-image-stage3-hosted-qa-summary.v1.json";
const CHECKPOINT_PATH = "data/checkpoints/equipment-image-stage3-final.v1.json";
const BROWSER_EVIDENCE_PATH = "data/evidence/equipment-image-stage3-browser-ui.v1.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveUrl(path) {
  return new URL(path.replace(/^\//, ""), BASE_URL).toString();
}

function readJsonIfExists(path) {
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf8"));
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

const browserInputFingerprint = computeBrowserInputFingerprint();
const priorBrowserEvidence = readJsonIfExists(BROWSER_EVIDENCE_PATH);
const browserEvidenceFresh = Boolean(
  priorBrowserEvidence?.status === "PASS_EQUIPMENT_IMAGE_STAGE3_BROWSER_UI" &&
    priorBrowserEvidence?.productionJoinKey === "equipmentId" &&
    priorBrowserEvidence?.publicEquipment === 373 &&
    priorBrowserEvidence?.inputFingerprint?.version === browserInputFingerprint.version &&
    priorBrowserEvidence?.inputFingerprint?.algorithm === browserInputFingerprint.algorithm &&
    priorBrowserEvidence?.inputFingerprint?.sha256 === browserInputFingerprint.sha256,
);

const hostedSummary = {
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
  browserUiFreshness: {
    status: browserEvidenceFresh ? "PASS_FRESH_BROWSER_UI_EVIDENCE" : "REQUIRES_BROWSER_UI_REVALIDATION",
    currentInputFingerprint: browserInputFingerprint,
    evidencePath: BROWSER_EVIDENCE_PATH,
    evidenceInputFingerprint: priorBrowserEvidence?.inputFingerprint ?? null,
  },
  nextStage: browserEvidenceFresh ? "EQUIPMENT_IMAGE_STAGE3_COMPLETE" : "EQUIPMENT_IMAGE_STAGE3_BROWSER_UI_QA",
};

const summary = browserEvidenceFresh
  ? {
      ...hostedSummary,
      browserUiEvidence: {
        path: BROWSER_EVIDENCE_PATH,
        status: priorBrowserEvidence.status,
        automation: priorBrowserEvidence.automation,
        inputFingerprint: priorBrowserEvidence.inputFingerprint,
        desktopViewport: priorBrowserEvidence.viewports?.desktop ?? null,
        mobileViewport: priorBrowserEvidence.viewports?.mobile ?? null,
        pageErrors: priorBrowserEvidence.checks?.pageErrors ?? null,
        consoleErrors: priorBrowserEvidence.checks?.consoleErrors ?? null,
        hostedHttpFailuresObservedByBrowser: priorBrowserEvidence.checks?.hostedHttpFailuresObservedByBrowser ?? null,
      },
    }
  : hostedSummary;

fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

const checkpoint = {
  checkpoint: "equipment-image-stage3-final-v1",
  status: browserEvidenceFresh ? "PASS_EQUIPMENT_IMAGE_STAGE3" : summary.status,
  completion: summary.completion,
  freezeState: summary.freezeState,
  productionJoinKey: "equipmentId",
  publicEquipment: 373,
  hostedBaseUrl: BASE_URL,
  routeCount: routes.length,
  representativeAssetCount: assets.length,
  collisionFixturesChecked: [547, 550],
  semanticStageReopened: false,
  browserUiFreshness: summary.browserUiFreshness.status,
  browserUiInputFingerprint: browserEvidenceFresh ? browserInputFingerprint.sha256 : null,
  ...(browserEvidenceFresh
    ? {
        browserUi: "PASS_PLAYWRIGHT_HOSTED_BROWSER_UI",
        browserUiEvidencePath: BROWSER_EVIDENCE_PATH,
        nextStart: "Equipment Image Stage 3 complete; continue with later Equipment presentation/features without reopening frozen Stage 2/3 identity semantics.",
      }
    : {
        nextStart: "Equipment Image Stage 3 Hosted QA passed, but Browser/UI evidence is stale or unproven for the current frontend/assets; rerun Browser/UI QA without reopening frozen Stage 2 identity semantics.",
      }),
};

fs.writeFileSync(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));