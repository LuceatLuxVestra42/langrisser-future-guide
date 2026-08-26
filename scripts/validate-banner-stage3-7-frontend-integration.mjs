import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const contract = readJson("data/contracts/banner-stage3-7-frontend-integration.v1.json");
const basic = readJson("data/generated/banner-stage3-3-basic-table-consumer.v1.json");
const wish = readJson("data/generated/banner-stage3-4-wish-consumer.v1.json");
const cp = readJson("data/generated/banner-stage3-5-cp-event-consumer.v1.json");
const recurrence = readJson("data/generated/banner-stage3-6-recurrence-pickup-log-consumer.v1.json");
const indexSource = readText("src/routes/index.tsx");
const routeSource = readText("src/routes/banners.tsx");
const serverSource = readText("src/lib/banner-page.server.ts");

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const expected = contract.expected;
const pickupRows = basic.rows.filter((row) => row.mechanicFamily === "PICKUP");
const wishRows = basic.rows.filter((row) => row.mechanicFamily === "WISH");
const renderableRows = basic.rows.filter((row) => row.image?.canRenderImage === true);
const repeatedPickupDefinitions = recurrence.definitionHistoryRecords.filter(
  (history) => history.mechanicFamily === "PICKUP" && history.isRepeatedInCurrentDataset === true,
);
const verifiedWishDefinitions = wish.definitionCandidateSets.filter(
  (record) => record.candidateState === "VERIFIED_EXPLICIT_CANDIDATES",
);
const reviewWishDefinitions = wish.definitionCandidateSets.filter(
  (record) => record.candidateState !== "VERIFIED_EXPLICIT_CANDIDATES",
);
const canonicalEventRelations = cp.occurrenceRecords.filter(
  (record) => record.canonicalEventId !== null,
);

assert(basic.rowCount === expected.bannerRows, `basic rowCount ${basic.rowCount} != ${expected.bannerRows}`);
assert(basic.dateGroupCount === expected.dateGroups, `dateGroupCount ${basic.dateGroupCount} != ${expected.dateGroups}`);
assert(pickupRows.length === expected.pickupRows, `pickup rows ${pickupRows.length} != ${expected.pickupRows}`);
assert(wishRows.length === expected.wishRows, `wish rows ${wishRows.length} != ${expected.wishRows}`);
assert(renderableRows.length === expected.renderableRows, `renderable rows ${renderableRows.length} != ${expected.renderableRows}`);
assert(wish.definitionCandidateSetCount === expected.wishDefinitions, `wish defs ${wish.definitionCandidateSetCount} != ${expected.wishDefinitions}`);
assert(wish.candidateEdgeCount === expected.wishCandidateEdges, `wish candidate edges ${wish.candidateEdgeCount} != ${expected.wishCandidateEdges}`);
assert(cp.occurrenceRecordCount === expected.cpOccurrences, `CP occurrences ${cp.occurrenceRecordCount} != ${expected.cpOccurrences}`);
assert(canonicalEventRelations.length === expected.canonicalEventRelations, `canonical Event relations ${canonicalEventRelations.length} != ${expected.canonicalEventRelations}`);
assert(recurrence.recurrenceLinkCount === expected.recurrenceLinks, `recurrence links ${recurrence.recurrenceLinkCount} != ${expected.recurrenceLinks}`);
assert(repeatedPickupDefinitions.length === expected.repeatedPickupDefinitions, `repeated PICKUP defs ${repeatedPickupDefinitions.length} != ${expected.repeatedPickupDefinitions}`);

assert(indexSource.includes('{ title: "가챠 배너", image: cardGacha, to: "/banners" }'), "main gacha card is not linked to /banners");
assert(routeSource.includes('createFileRoute("/banners")'), "frontend route /banners is missing");
for (const section of contract.sections) {
  assert(routeSource.includes(`label: "${section}"`), `frontend section missing: ${section}`);
}
assert(routeSource.includes('candidateState === "VERIFIED_EXPLICIT_CANDIDATES"'), "Wish verified-candidate gate is missing");
assert(routeSource.includes("canonical Event ID 미확정"), "Event unresolved-state copy is missing");
assert(routeSource.includes("고정 복각 주기나 다음 등장일 예측"), "recurrence no-prediction disclosure is missing");

for (const sourcePath of [
  "banner-stage3-3-basic-table-consumer.v1.json",
  "banner-stage3-4-wish-consumer.v1.json",
  "banner-stage3-5-cp-event-consumer.v1.json",
  "banner-stage3-6-recurrence-pickup-log-consumer.v1.json",
]) {
  assert(serverSource.includes(sourcePath), `server adapter missing frozen consumer: ${sourcePath}`);
}
assert(!serverSource.includes("ConfigData"), "frontend server adapter must not read ConfigData directly");
assert(!routeSource.includes('to="/hero'), "Hero route must not be invented in Stage 3-7");
assert(!routeSource.includes('to="/event'), "Event route must not be invented in Stage 3-7");
assert(reviewWishDefinitions.every((record) => record.candidates.length === 0), "manual/review Wish definitions must have zero synthetic candidates");
assert(cp.occurrenceRecords.every((record) => record.eventNavigationAvailable === false), "CP Event navigation must remain unavailable");
assert(recurrence.policy?.futureRecurrencePredictionAllowed === false, "recurrence future prediction policy changed");
assert(recurrence.policy?.fixedCadenceInferenceAllowed === false, "recurrence cadence inference policy changed");

const summary = {
  stage: "3-7",
  status: errors.length === 0 ? "PASS_BANNER_STAGE3_7_FRONTEND_INTEGRATION" : "FAIL_BANNER_STAGE3_7_FRONTEND_INTEGRATION",
  route: {
    path: "/banners",
    mainCategoryLinked: indexSource.includes('{ title: "가챠 배너", image: cardGacha, to: "/banners" }'),
    sections: contract.sections,
  },
  integratedConsumers: {
    basicTable: {
      rows: basic.rowCount,
      dateGroups: basic.dateGroupCount,
      pickupRows: pickupRows.length,
      wishRows: wishRows.length,
      renderableRows: renderableRows.length,
    },
    wish: {
      definitions: wish.definitionCandidateSetCount,
      occurrences: wish.occurrenceWishRecordCount,
      candidateEdges: wish.candidateEdgeCount,
      verifiedDefinitions: verifiedWishDefinitions.length,
      reviewDefinitions: reviewWishDefinitions.length,
    },
    cpEvent: {
      definitions: cp.definitionRecordCount,
      occurrences: cp.occurrenceRecordCount,
      canonicalEventRelations: canonicalEventRelations.length,
      eventNavigationOccurrences: cp.occurrenceRecords.filter((record) => record.eventNavigationAvailable).length,
    },
    recurrence: {
      definitionHistories: recurrence.definitionHistoryRecordCount,
      occurrenceLogs: recurrence.occurrenceLogRecordCount,
      recurrenceLinks: recurrence.recurrenceLinkCount,
      repeatedPickupDefinitions: repeatedPickupDefinitions.length,
    },
  },
  semanticFreeze: {
    sourceConfigDataReadByFrontend: false,
    wishManualCandidatesSynthesized: false,
    canonicalEventIdInvented: false,
    eventRouteInvented: false,
    heroRouteInvented: false,
    observedGapPromotedToCadence: false,
    futureRecurrencePredicted: false,
  },
  build: {
    productionBuildRequired: true,
    routeTreeCheckpointRequired: true,
  },
  errors,
  nextStage: "Banner Stage 3-8 regression/freeze",
};

fs.mkdirSync(path.join(root, "data/validation"), { recursive: true });
fs.writeFileSync(
  path.join(root, "data/validation/banner-stage3-7-frontend-integration-summary.v1.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

if (errors.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
