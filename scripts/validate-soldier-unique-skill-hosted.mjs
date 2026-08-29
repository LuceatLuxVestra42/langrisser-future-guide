import fs from "node:fs";

const BASE_URL = (process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const SUMMARY_PATH = "data/validation/soldier-unique-skill-hosted-qa-summary.v1.json";
const CHECKPOINT_PATH = "data/checkpoints/soldier-unique-skill-frontend-localization.v1.json";

function assert(condition, message) { if (!condition) throw new Error(message); }
function resolveUrl(relativePath) { return new URL(relativePath.replace(/^\//, ""), BASE_URL).toString(); }
async function fetchNoStore(relativePath) {
  const url = resolveUrl(relativePath);
  const response = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache", pragma: "no-cache" } });
  return { url, response };
}

async function waitForKoreanProjection() {
  let lastError = "not requested";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const { url, response } = await fetchNoStore(`data/soldier-unique-skill-kr.v1.json?qa=${Date.now()}-${attempt}`);
      if (response.ok) {
        const payload = await response.json();
        const keys = Object.keys(payload?.bySoldierId ?? {});
        if (
          payload?.schemaId === "soldier-unique-skill-kr-public/v1" &&
          payload?.status === "PASS_WITH_REVIEW" &&
          payload?.counts?.records === 185 &&
          payload?.counts?.pass === 116 &&
          payload?.counts?.review === 69 &&
          payload?.policy?.joinKey === "soldierId" &&
          payload?.policy?.runtimeNameJoin === false &&
          payload?.policy?.canonicalChineseFallbackForTarget === false &&
          keys.length === 185
        ) return { attempt, url, payload };
        lastError = `projection contract mismatch: ${JSON.stringify({ schemaId: payload?.schemaId, status: payload?.status, counts: payload?.counts, keyCount: keys.length, policy: payload?.policy })}`;
      } else lastError = `projection HTTP ${response.status}`;
    } catch (error) { lastError = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`DEPLOYMENT_HOSTING_FAIL: Soldier Korean projection did not become current: ${lastError}`);
}

async function checkRoute(relativePath) {
  const { url, response } = await fetchNoStore(`${relativePath}?qa=${Date.now()}`);
  const text = await response.text();
  assert(response.ok, `DEPLOYMENT_HOSTING_FAIL: ${relativePath} returned HTTP ${response.status}`);
  assert(text.length > 0, `DEPLOYMENT_HOSTING_FAIL: ${relativePath} returned an empty document`);
  return { path: relativePath, requestedUrl: url, finalUrl: response.url, status: response.status, contentType: response.headers.get("content-type"), bytes: Buffer.byteLength(text) };
}

const projection = await waitForKoreanProjection();
const bySoldierId = projection.payload.bySoldierId;
const representativeIds = [250, 326, 334, 336, 410, 512, 602, 5311, 6113];
const representativeRecords = representativeIds.map((soldierId) => {
  const item = bySoldierId[String(soldierId)];
  assert(item, `Hosted Korean projection missing representative soldierId ${soldierId}`);
  assert(typeof item.descriptionKr === "string" && item.descriptionKr.trim().length > 0, `Hosted Korean projection has empty descriptionKr for ${soldierId}`);
  assert(item.translationStatus === "PASS" || String(item.translationStatus).startsWith("REVIEW_"), `Hosted Korean projection has invalid status for ${soldierId}`);
  return { soldierId, translationStatus: item.translationStatus, descriptionBytes: Buffer.byteLength(item.descriptionKr) };
});

const resolvedIds = [250, 326, 333, 334, 336, 341, 602];
for (const resolvedId of resolvedIds) assert(bySoldierId[String(resolvedId)]?.translationStatus === "PASS", `Hosted review override was not applied for soldierId ${resolvedId}`);

const routes = [];
for (const relativePath of ["soldiers", "soldiers/250", "soldiers/334", "soldiers/336", "soldiers/410", "soldiers/512", "soldiers/602", "soldiers/5311", "soldiers/6113"]) routes.push(await checkRoute(relativePath));

const summary = {
  stage: "Soldier Unique Skill Korean Hosted QA",
  version: 1,
  status: "PASS_WITH_REVIEW",
  completion: "HOSTED_QA_COMPLETE",
  hostedBaseUrl: BASE_URL,
  productionJoinKey: "soldierId",
  projection: {
    path: "data/soldier-unique-skill-kr.v1.json",
    requestedUrl: projection.url,
    attempts: projection.attempt,
    records: projection.payload.counts.records,
    pass: projection.payload.counts.pass,
    review: projection.payload.counts.review,
    keyCount: Object.keys(bySoldierId).length,
    runtimeNameJoin: projection.payload.policy.runtimeNameJoin,
    canonicalChineseFallbackForTarget: projection.payload.policy.canonicalChineseFallbackForTarget
  },
  reviewOverrides: { resolvedSoldierIds: resolvedIds, status: "PASS" },
  representativeRecords,
  routeChecks: routes,
  gates: { deploymentHosted: "PASS", publicProjectionContract: "PASS", reviewOverridesApplied: "PASS", representativeKoreanDescriptions: "PASS", hostedRouteSmoke: "PASS" },
  reviewBoundary: { reviewCount: 69, reviewItemsAreMissingTranslations: false, reviewResolutionRequired: true }
};

const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8"));
checkpoint.status = "PASS_WITH_REVIEW";
checkpoint.hostedQa = { status: "PASS", hostedBaseUrl: BASE_URL, projectionRecordCount: 185, passCount: 116, reviewCount: 69, representativeSoldierIds: representativeIds, routeCount: routes.length };
checkpoint.completion = { ...(checkpoint.completion ?? {}), frontendConsumerIntegrated: true, buildGateComplete: true, hostedQaComplete: true };
checkpoint.nextStep = "Continue evidence-based resolution or explicit acceptance of the remaining 69 review items without reopening canonical Soldier data.";

fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
