import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ids(records) {
  return records.map((record) => record.equipmentId);
}

function countTabs(records) {
  return Object.fromEntries(
    [1, 2, 3].map((tab) => [String(tab), records.filter((record) => record.siteTab === tab).length]),
  );
}

function assertExactSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  assert(actual.size === actualValues.length, `${label} actual values contain duplicates.`);
  assert(expected.size === expectedValues.length, `${label} expected values contain duplicates.`);
  assert(actual.size === expected.size, `${label} size ${actual.size} !== ${expected.size}.`);
  for (const value of expected) {
    assert(actual.has(value), `${label} missing ${value}.`);
  }
}

const correction = readJson("data/presentation/equipment-public-admission-correction.v1.json");
const generalList = readJson("data/generated/equipment_stage3_3_general_list.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const releaseProjection = readJson("data/presentation/equipment-p3-1-release-metadata.v1.json");
const localizedServerSource = readText("src/lib/equipment-page.localized.server.ts");

const EXPECTED_EXCLUDED_IDS = [265, 266, 267, 268, 288, 289, 290, 291];
const EXPECTED_DUPLICATE_TARGET_IDS = [282, 283, 284, 285, 299, 400, 401, 402];

assert(correction.status === "FROZEN", "Public admission correction must remain FROZEN.");
assert(correction.policy.joinKey === "equipmentId", "Public admission correction joinKey must be equipmentId.");
assert(correction.policy.stage2AcquisitionClassificationChanged === false, "Step 1 must not mutate Stage 2 acquisition classification.");
assert(correction.policy.canonicalIdentityChanged === false, "Step 1 must not mutate canonical identity.");
assert(correction.policy.exclusiveEquipmentChanged === false, "Step 1 must not mutate exclusive equipment.");
assertExactSet(correction.excludedEquipmentIds, EXPECTED_EXCLUDED_IDS, "Excluded Equipment IDs");
assert(correction.records.length === EXPECTED_EXCLUDED_IDS.length, "Correction record count must remain 8.");
assertExactSet(
  correction.records.map((record) => record.duplicateOfEquipmentId),
  EXPECTED_DUPLICATE_TARGET_IDS,
  "Duplicate counterpart IDs",
);

const technicalListById = new Map(generalList.records.map((record) => [record.equipmentId, record]));
const technicalDetailById = new Map(generalDetail.records.map((record) => [record.equipmentId, record]));

assert(generalList.records.length === 206, `Technical General List predecessor changed: ${generalList.records.length} !== 206.`);
assert(generalDetail.records.length === 206, `Technical General Detail predecessor changed: ${generalDetail.records.length} !== 206.`);
assert(exclusive.listRecords.length === 167, `Exclusive technical population changed: ${exclusive.listRecords.length} !== 167.`);
assert(exclusive.detailRecords.length === 167, `Exclusive technical detail population changed: ${exclusive.detailRecords.length} !== 167.`);

for (const record of correction.records) {
  const sourceList = technicalListById.get(record.equipmentId);
  const sourceDetail = technicalDetailById.get(record.equipmentId);
  const counterpartList = technicalListById.get(record.duplicateOfEquipmentId);
  const counterpartDetail = technicalDetailById.get(record.duplicateOfEquipmentId);

  assert(sourceList, `Excluded Equipment ${record.equipmentId} is missing from technical General List predecessor.`);
  assert(sourceDetail, `Excluded Equipment ${record.equipmentId} is missing from technical General Detail predecessor.`);
  assert(sourceList.nameCn === record.nameCn, `Excluded Equipment ${record.equipmentId} list identity mismatch.`);
  assert(sourceDetail.identity.nameCn === record.nameCn, `Excluded Equipment ${record.equipmentId} detail identity mismatch.`);
  assert(record.reason === "IMPLEMENTATION_EXCLUDED_DUPLICATE", `Excluded Equipment ${record.equipmentId} reason mismatch.`);

  assert(counterpartList, `Duplicate counterpart ${record.duplicateOfEquipmentId} is missing from technical General List.`);
  assert(counterpartDetail, `Duplicate counterpart ${record.duplicateOfEquipmentId} is missing from technical General Detail.`);
  assert(counterpartList.nameCn === record.duplicateOfNameCn, `Duplicate counterpart ${record.duplicateOfEquipmentId} list identity mismatch.`);
  assert(counterpartDetail.identity.nameCn === record.duplicateOfNameCn, `Duplicate counterpart ${record.duplicateOfEquipmentId} detail identity mismatch.`);
  assert(!correction.excludedEquipmentIds.includes(record.duplicateOfEquipmentId), `Duplicate counterpart ${record.duplicateOfEquipmentId} must remain public in Step 1.`);
}

const excludedSet = new Set(correction.excludedEquipmentIds);
const expectedPublicTechnicalRecords = generalList.records.filter((record) => !excludedSet.has(record.equipmentId));
assert(
  expectedPublicTechnicalRecords.length === correction.expectedPublicProjection.generalEquipmentCount,
  `Expected public General count ${expectedPublicTechnicalRecords.length} !== ${correction.expectedPublicProjection.generalEquipmentCount}.`,
);
const expectedTabs = countTabs(expectedPublicTechnicalRecords);
for (const [tab, expected] of Object.entries(correction.expectedPublicProjection.technicalTabCountsAfterAdmissionOnly)) {
  assert(expectedTabs[tab] === expected, `Admission-only tab ${tab} count ${expectedTabs[tab]} !== ${expected}.`);
}

assert(releaseProjection.scope.siteTab === 3, "Existing P3-1 technical release projection target must remain siteTab 3 during Step 1.");
assert(releaseProjection.scope.targetCount === 32, "Existing P3-1 technical release projection count must remain 32 during Step 1.");
const releaseProjectionIds = new Set(releaseProjection.defaultOrderEquipmentIds);
const excludedReleaseProjectionIds = correction.excludedEquipmentIds.filter((equipmentId) => releaseProjectionIds.has(equipmentId));
assertExactSet(excludedReleaseProjectionIds, [265, 266, 267, 268], "Excluded P3-1 technical target IDs");
assert(
  releaseProjection.scope.targetCount - excludedReleaseProjectionIds.length === 28,
  "Admission-only public subset of the current P3-1 technical target must be 28 before pass-membership correction.",
);

assert(
  localizedServerSource.includes('equipment-public-admission-correction.v1.json'),
  "Public consumer must import the frozen public admission correction artifact.",
);
assert(
  localizedServerSource.includes("publicExcludedEquipmentIds.has(equipmentId)"),
  "Public detail consumer must guard excluded equipment IDs.",
);
assert(
  !localizedServerSource.includes("ConfigDataEquipmentInfo"),
  "Public admission correction must not introduce raw ConfigData reads.",
);

const localizedModule = await import(
  pathToFileURL(path.join(ROOT, "src/lib/equipment-page.localized.server.ts")).href
);
const runtimeGeneral = localizedModule.readGeneralEquipmentPageData();
const runtimeExclusive = localizedModule.readExclusiveEquipmentPageData();

assert(runtimeGeneral.records.length === 198, `Runtime public General count ${runtimeGeneral.records.length} !== 198.`);
assert(runtimeExclusive.records.length === 167, `Runtime Exclusive count ${runtimeExclusive.records.length} !== 167.`);
assertExactSet(
  runtimeGeneral.records.filter((record) => excludedSet.has(record.equipmentId)).map((record) => record.equipmentId),
  [],
  "Excluded IDs leaked into runtime General List",
);

const runtimeTabs = countTabs(runtimeGeneral.records);
for (const [tab, expected] of Object.entries(correction.expectedPublicProjection.technicalTabCountsAfterAdmissionOnly)) {
  assert(runtimeTabs[tab] === expected, `Runtime admission-only tab ${tab} count ${runtimeTabs[tab]} !== ${expected}.`);
}

for (const equipmentId of EXPECTED_EXCLUDED_IDS) {
  assert(
    localizedModule.readEquipmentDetailPageData(equipmentId) === null,
    `Excluded Equipment ${equipmentId} still resolves through the public detail consumer.`,
  );
}
for (const equipmentId of EXPECTED_DUPLICATE_TARGET_IDS) {
  const detail = localizedModule.readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Public duplicate counterpart ${equipmentId} no longer resolves as General Equipment.`);
}

console.log(JSON.stringify({
  status: "PASS",
  stage: "equipment-public-admission-correction",
  predecessorTechnicalGeneral: 206,
  excludedCount: EXPECTED_EXCLUDED_IDS.length,
  runtimePublicGeneral: runtimeGeneral.records.length,
  runtimeExclusive: runtimeExclusive.records.length,
  admissionOnlyTechnicalTabs: runtimeTabs,
  excludedPublicDetailResolved: 0,
  duplicateCounterpartsPublicResolved: EXPECTED_DUPLICATE_TARGET_IDS.length,
  stage2AcquisitionClassificationChanged: false,
  canonicalIdentityChanged: false,
  exclusiveEquipmentChanged: false,
  nextStartPoint: "Explicit displayCollection/equipment-pass membership correction",
}, null, 2));
