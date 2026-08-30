import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort((left, right) => left - right);
}

function assertSameIds(actual, expected, label) {
  const left = JSON.stringify(sorted(actual));
  const right = JSON.stringify(sorted(expected));
  assert(left === right, `${label} mismatch: ${left} !== ${right}`);
}

const EXPECTED_EQUIPMENT_PASS_IDS = [
  599, 600, 601, 602,
  607, 608, 609, 610,
  615, 616, 617, 618,
  623, 624, 625, 626,
  630, 631, 632, 633,
  639, 640, 641, 642,
];
const EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS = [299, 400, 401, 402];
const EXPECTED_PUBLIC_EXCLUDED_IDS = [265, 266, 267, 268, 288, 289, 290, 291];
const EXPECTED_PRESENTATION_COUNTS = { 1: 94, 2: 80, 3: 24 };
const EXPECTED_TECHNICAL_COUNTS_AFTER_ADMISSION = { 1: 94, 2: 76, 3: 28 };

const displayContract = readJson("data/presentation/equipment-display-collection.v1.json");
const admissionContract = readJson("data/presentation/equipment-public-admission-correction.v1.json");
const stage3General = readJson("data/generated/equipment_stage3_3_general_list.json");
const releaseMetadata = readJson("data/presentation/equipment-p3-1-release-metadata.v1.json");

assert(displayContract.status === "FROZEN", "Display collection contract must be FROZEN.");
assert(
  displayContract.completion === "EQUIPMENT_DISPLAY_COLLECTION_V1_FROZEN",
  "Unexpected display collection completion marker.",
);
assert(
  displayContract.scope.technicalSiteTabIsPresentationMembership === false,
  "technical siteTab must not be presentation membership.",
);
assert(
  displayContract.scope.equipmentPassMembershipMode === "EXPLICIT_EQUIPMENT_ID",
  "Equipment Pass membership must be explicit equipmentId.",
);
assertSameIds(
  displayContract.displayCollections.equipmentPass.equipmentIds,
  EXPECTED_EQUIPMENT_PASS_IDS,
  "Explicit Equipment Pass IDs",
);
assertSameIds(
  displayContract.displayCollections.previousAdditional.explicitCurrentAdditionalNonPassEquipmentIds,
  EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS,
  "Explicit current-additional non-pass IDs",
);
assertSameIds(
  admissionContract.excludedEquipmentIds,
  EXPECTED_PUBLIC_EXCLUDED_IDS,
  "Public excluded duplicate IDs",
);

for (const [tab, expected] of Object.entries(EXPECTED_PRESENTATION_COUNTS)) {
  assert(
    displayContract.expectedPresentationCounts[
      tab === "1" ? "initial" : tab === "2" ? "previousAdditional" : "equipmentPass"
    ] === expected,
    `Display contract count ${tab} mismatch.`,
  );
}
assert(displayContract.expectedPresentationCounts.total === 198, "Display total must be 198.");

const stage3Records = stage3General.records;
assert(Array.isArray(stage3Records), "Stage 3-3 general list records are missing.");
const stage3ById = new Map(stage3Records.map((record) => [record.equipmentId, record]));

const releaseById = new Map(
  Object.values(releaseMetadata.byEquipmentId).map((record) => [record.equipmentId, record]),
);
for (const equipmentId of [
  ...EXPECTED_EQUIPMENT_PASS_IDS,
  ...EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS,
]) {
  assert(releaseById.has(equipmentId), `Release chronology metadata missing Equipment ${equipmentId}.`);
}

const {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} = await import("../src/lib/equipment-page.localized.server.ts");

const general = readGeneralEquipmentPageData();
const exclusive = readExclusiveEquipmentPageData();

assert(general.records.length === 198, `Runtime public general count ${general.records.length} !== 198.`);
assert(exclusive.records.length === 167, `Runtime exclusive count ${exclusive.records.length} !== 167.`);

for (const [tab, expected] of Object.entries(EXPECTED_PRESENTATION_COUNTS)) {
  assert(Number(general.tabs[tab]) === expected, `Runtime display tab ${tab}: ${general.tabs[tab]} !== ${expected}.`);
}
for (const [tab, expected] of Object.entries(EXPECTED_TECHNICAL_COUNTS_AFTER_ADMISSION)) {
  assert(
    Number(general.technicalTabs[tab]) === expected,
    `Runtime technical tab ${tab}: ${general.technicalTabs[tab]} !== ${expected}.`,
  );
}

const runtimeById = new Map(general.records.map((record) => [record.equipmentId, record]));
const display3Ids = [];
const technical3Ids = [];

for (const record of general.records) {
  const frozen = stage3ById.get(record.equipmentId);
  assert(frozen, `Runtime public Equipment ${record.equipmentId} missing from frozen Stage 3-3 source.`);
  assert(
    record.technicalSiteTab === frozen.siteTab,
    `Equipment ${record.equipmentId} technical siteTab changed: ${record.technicalSiteTab} !== ${frozen.siteTab}.`,
  );
  assert(
    record.siteTab === record.displayCollection,
    `Equipment ${record.equipmentId} UI siteTab compatibility alias diverges from displayCollection.`,
  );

  if (record.siteTab === 3) display3Ids.push(record.equipmentId);
  if (record.technicalSiteTab === 3) technical3Ids.push(record.equipmentId);
}

assertSameIds(display3Ids, EXPECTED_EQUIPMENT_PASS_IDS, "Runtime Equipment Pass IDs");
assertSameIds(
  technical3Ids,
  [...EXPECTED_EQUIPMENT_PASS_IDS, ...EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS],
  "Runtime public technical siteTab 3 partition",
);

for (const equipmentId of EXPECTED_EQUIPMENT_PASS_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record, `Equipment Pass ${equipmentId} is not public.`);
  assert(record.technicalSiteTab === 3, `Equipment Pass ${equipmentId} technical siteTab must remain 3.`);
  assert(record.displayCollection === 3, `Equipment Pass ${equipmentId} displayCollection must be 3.`);

  const detail = readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Equipment Pass ${equipmentId} detail must resolve as general.`);
  assert(
    detail.detail.classification.siteTab === 3,
    `Equipment Pass ${equipmentId} detail presentation tab must be 3.`,
  );
}

for (const equipmentId of EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record, `Current-additional non-pass ${equipmentId} is not public.`);
  assert(
    record.technicalSiteTab === 3,
    `Current-additional non-pass ${equipmentId} technical siteTab must remain 3.`,
  );
  assert(
    record.displayCollection === 2 && record.siteTab === 2,
    `Current-additional non-pass ${equipmentId} must display under previous additional.`,
  );
  assert(
    typeof record.releaseGroupDate === "string" && record.releaseGroupDate.length > 0,
    `Current-additional non-pass ${equipmentId} must retain release chronology metadata.`,
  );

  const detail = readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Current-additional non-pass ${equipmentId} detail must resolve.`);
  assert(
    detail.detail.classification.siteTab === 2,
    `Current-additional non-pass ${equipmentId} detail presentation tab must be 2.`,
  );
  assert(
    detail.detail.classification.technicalSiteTab === 3,
    `Current-additional non-pass ${equipmentId} detail technical siteTab must remain 3.`,
  );
  assert(
    detail.detail.classification.displayCollection === 2,
    `Current-additional non-pass ${equipmentId} detail displayCollection must be 2.`,
  );
}

for (const equipmentId of EXPECTED_PUBLIC_EXCLUDED_IDS) {
  assert(!runtimeById.has(equipmentId), `Excluded Equipment ${equipmentId} leaked into public list.`);
  assert(readEquipmentDetailPageData(equipmentId) === null, `Excluded Equipment ${equipmentId} direct detail resolved.`);
}

console.log(JSON.stringify({
  status: "PASS",
  stage: "equipment-display-collection",
  runtimePublicGeneral: general.records.length,
  runtimeExclusive: exclusive.records.length,
  technicalTabs: general.technicalTabs,
  displayCollections: general.tabs,
  explicitEquipmentPassCount: display3Ids.length,
  explicitCurrentAdditionalNonPassCount: EXPECTED_CURRENT_ADDITIONAL_NON_PASS_IDS.length,
  publicExcludedCount: EXPECTED_PUBLIC_EXCLUDED_IDS.length,
  stage2AcquisitionClassificationChanged: false,
  technicalSiteTabChanged: false,
  releaseChronologyRecomputed: false,
  nextStartPoint: displayContract.nextStartPoint,
}, null, 2));
