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

const EXPECTED_TECHNICAL_CHRONOLOGY_IDS = [
  265, 266, 267, 268,
  299, 400, 401, 402,
  599, 600, 601, 602,
  607, 608, 609, 610,
  615, 616, 617, 618,
  623, 624, 625, 626,
  630, 631, 632, 633,
  639, 640, 641, 642,
];
const EXPECTED_PUBLIC_EXCLUDED_TECHNICAL3_IDS = [265, 266, 267, 268];
const EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS = [299, 400, 401, 402];
const EXPECTED_NON_CHRONOLOGY_PUBLIC_EXCLUDED_IDS = [288, 289, 290, 291];
const EXPECTED_PASS_IDS = [
  599, 600, 601, 602,
  607, 608, 609, 610,
  615, 616, 617, 618,
  623, 624, 625, 626,
  630, 631, 632, 633,
  639, 640, 641, 642,
];

const p3AuditV2 = readJson("data/validation/equipment-p3-0-release-chronology-presentation-audit.v2.json");
const p3AuditV3 = readJson("data/validation/equipment-p3-0-release-chronology-presentation-audit.v3.json");
const releaseV1 = readJson("data/presentation/equipment-p3-1-release-metadata.v1.json");
const releaseV2 = readJson("data/presentation/equipment-p3-1-release-metadata.v2.json");
const displayContract = readJson("data/presentation/equipment-display-collection.v1.json");
const admissionContract = readJson("data/presentation/equipment-public-admission-correction.v1.json");
const stage3General = readJson("data/generated/equipment_stage3_3_general_list.json");

assert(
  p3AuditV2.classificationCorrection.presentationMeaning === "장비패스",
  "Historical P3-0 V2 must remain preserved so the superseded interpretation is auditable.",
);
assert(
  p3AuditV3.supersedesActiveInterpretation ===
    "data/validation/equipment-p3-0-release-chronology-presentation-audit.v2.json",
  "P3-0 V3 must explicitly supersede V2 active interpretation.",
);
assert(
  p3AuditV3.classificationCorrection.chronologyDefinesDisplayMembership === false,
  "P3-0 V3 chronology must not define display membership.",
);
assert(
  p3AuditV3.classificationCorrection.displayMembershipSource ===
    "data/presentation/equipment-display-collection.v1.json",
  "P3-0 V3 must delegate display membership to the frozen display contract.",
);
assert(
  p3AuditV3.chronologyEvidenceDisposition.v2ReleaseEvidenceChanged === false &&
    p3AuditV3.chronologyEvidenceDisposition.releaseDatesRecomputed === false &&
    p3AuditV3.chronologyEvidenceDisposition.identityContinuityReopened === false,
  "P3-0 V3 must preserve existing chronology evidence without recomputation.",
);

assert(releaseV2.status === "FROZEN", "P3-1 V2 must be FROZEN.");
assert(
  releaseV2.completion === "EQUIPMENT_P3_1_RELEASE_CHRONOLOGY_V2_FROZEN",
  "Unexpected P3-1 V2 completion marker.",
);
assert(
  releaseV2.supersedesActiveInterpretation ===
    "data/presentation/equipment-p3-1-release-metadata.v1.json",
  "P3-1 V2 must supersede V1 active interpretation.",
);
assert(
  releaseV2.predecessor.chronologyDataSource ===
    "data/presentation/equipment-p3-1-release-metadata.v1.json",
  "P3-1 V2 must reuse V1 as frozen chronology data source.",
);
assert(
  releaseV2.scope.chronologyDefinesDisplayMembership === false,
  "P3-1 V2 chronology must not define display membership.",
);
assert(
  releaseV2.scope.displayMembershipSource ===
    "data/presentation/equipment-display-collection.v1.json",
  "P3-1 V2 must delegate display membership to the frozen display contract.",
);
assert(
  !Object.prototype.hasOwnProperty.call(releaseV2.scope, "presentationLabel"),
  "P3-1 V2 scope must not carry a presentation label such as 장비패스.",
);
assert(
  releaseV2.dataReuse.mode === "REUSE_FROZEN_V1_CHRONOLOGY_RECORDS",
  "P3-1 V2 must reuse V1 chronology records.",
);
for (const field of [
  "defaultOrderRecomputed",
  "releaseDatesRecomputed",
  "evidenceStatusesRecomputed",
  "sourceIdsRecomputed",
  "releaseFamiliesRecomputed",
  "identityContinuityRecomputed",
]) {
  assert(releaseV2.dataReuse[field] === false, `P3-1 V2 ${field} must remain false.`);
}
assert(
  releaseV2.consumerPolicy.displayCollectionMustNotBeDerivedFromChronology === true &&
    releaseV2.consumerPolicy.releaseFamilyMustNotBeUsedAsMembershipRule === true,
  "P3-1 V2 consumer policy must forbid chronology-derived membership.",
);

assert(releaseV1.scope.siteTab === 3, "Historical V1 technical siteTab must remain 3.");
assert(releaseV1.scope.targetCount === 32, "Historical V1 targetCount must remain 32.");
assert(releaseV1.scope.releaseDateCoverage === 32, "Historical V1 coverage must remain 32.");
assert(releaseV2.scope.technicalSiteTab === releaseV1.scope.siteTab, "V2 technical siteTab diverged from V1.");
assert(releaseV2.scope.technicalTargetCount === releaseV1.scope.targetCount, "V2 technical target diverged from V1.");
assert(releaseV2.scope.releaseDateCoverage === releaseV1.scope.releaseDateCoverage, "V2 coverage diverged from V1.");
assert(releaseV2.scope.publicChronologyCount === 28, "P3-1 V2 public chronology count must be 28.");
assert(releaseV2.scope.equipmentPassCount === 24, "P3-1 V2 Equipment Pass count must be 24.");

const v1Ids = Object.values(releaseV1.byEquipmentId).map((record) => record.equipmentId);
assertSameIds(v1Ids, EXPECTED_TECHNICAL_CHRONOLOGY_IDS, "Frozen V1 chronology IDs");
assert(releaseV1.defaultOrderEquipmentIds.length === 32, "Frozen V1 chronology order must contain 32 IDs.");
assertSameIds(releaseV1.defaultOrderEquipmentIds, EXPECTED_TECHNICAL_CHRONOLOGY_IDS, "Frozen V1 chronology order population");
assertSameIds(
  releaseV2.scope.publicExcludedTechnicalEquipmentIds,
  EXPECTED_PUBLIC_EXCLUDED_TECHNICAL3_IDS,
  "P3-1 V2 public-excluded technical siteTab 3 IDs",
);
assertSameIds(
  releaseV2.partition.publicCurrentAdditionalNonPass,
  EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS,
  "P3-1 V2 public current-additional non-Pass IDs",
);
assertSameIds(releaseV2.partition.publicEquipmentPass, EXPECTED_PASS_IDS, "P3-1 V2 Equipment Pass IDs");
assertSameIds(
  displayContract.displayCollections.previousAdditional.explicitCurrentAdditionalNonPassEquipmentIds,
  EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS,
  "Display contract current-additional non-Pass IDs",
);
assertSameIds(displayContract.displayCollections.equipmentPass.equipmentIds, EXPECTED_PASS_IDS, "Display contract Equipment Pass IDs");

assert(
  EXPECTED_PUBLIC_EXCLUDED_TECHNICAL3_IDS.length +
      EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS.length +
      EXPECTED_PASS_IDS.length ===
    releaseV2.scope.technicalTargetCount,
  "Technical chronology partition must balance to 32.",
);

const stage3ById = new Map(stage3General.records.map((record) => [record.equipmentId, record]));
for (const equipmentId of EXPECTED_PUBLIC_EXCLUDED_TECHNICAL3_IDS) {
  assert(stage3ById.get(equipmentId)?.siteTab === 3, `Equipment ${equipmentId} must remain frozen technical siteTab 3.`);
}
for (const equipmentId of EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS) {
  assert(stage3ById.get(equipmentId)?.siteTab === 3, `Equipment ${equipmentId} must remain frozen technical siteTab 3.`);
}
for (const equipmentId of EXPECTED_PASS_IDS) {
  assert(stage3ById.get(equipmentId)?.siteTab === 3, `Equipment Pass ${equipmentId} must remain frozen technical siteTab 3.`);
}
for (const equipmentId of EXPECTED_NON_CHRONOLOGY_PUBLIC_EXCLUDED_IDS) {
  assert(stage3ById.get(equipmentId)?.siteTab === 2, `Equipment ${equipmentId} must remain frozen technical siteTab 2.`);
  assert(!v1Ids.includes(equipmentId), `Equipment ${equipmentId} must stay outside the 32-record chronology population.`);
}

assertSameIds(
  admissionContract.excludedEquipmentIds,
  [...EXPECTED_PUBLIC_EXCLUDED_TECHNICAL3_IDS, ...EXPECTED_NON_CHRONOLOGY_PUBLIC_EXCLUDED_IDS],
  "Public admission exclusions",
);

const {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} = await import("../src/lib/equipment-page.localized.server.ts");

const general = readGeneralEquipmentPageData();
const exclusive = readExclusiveEquipmentPageData();
assert(general.records.length === 198, `Runtime public general ${general.records.length} !== 198.`);
assert(exclusive.records.length === 167, `Runtime exclusive ${exclusive.records.length} !== 167.`);
assert(JSON.stringify(general.technicalTabs) === JSON.stringify({1:94,2:76,3:28}), "Runtime technical tabs must remain 94/76/28.");
assert(JSON.stringify(general.tabs) === JSON.stringify({1:94,2:80,3:24}), "Runtime display collections must remain 94/80/24.");

const runtimeById = new Map(general.records.map((record) => [record.equipmentId, record]));
for (const equipmentId of EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record?.technicalSiteTab === 3, `Equipment ${equipmentId} technical siteTab changed.`);
  assert(record?.displayCollection === 2, `Equipment ${equipmentId} must display as previous additional.`);
  assert(typeof record?.releaseGroupDate === "string" && record.releaseGroupDate.length > 0, `Equipment ${equipmentId} lost chronology date.`);
  const detail = readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Equipment ${equipmentId} detail must remain public.`);
  assert(detail.detail.classification.technicalSiteTab === 3, `Equipment ${equipmentId} detail technical siteTab changed.`);
  assert(detail.detail.classification.displayCollection === 2, `Equipment ${equipmentId} detail display collection must be 2.`);
}
for (const equipmentId of EXPECTED_PASS_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record?.technicalSiteTab === 3, `Equipment Pass ${equipmentId} technical siteTab changed.`);
  assert(record?.displayCollection === 3, `Equipment Pass ${equipmentId} display collection must be 3.`);
}
for (const equipmentId of admissionContract.excludedEquipmentIds) {
  assert(!runtimeById.has(equipmentId), `Excluded Equipment ${equipmentId} leaked into public runtime.`);
  assert(readEquipmentDetailPageData(equipmentId) === null, `Excluded Equipment ${equipmentId} direct detail resolved.`);
}

console.log(JSON.stringify({
  status: "PASS",
  stage: "equipment-p3-chronology-supersede",
  frozenChronologyRecords: v1Ids.length,
  publicChronologyRecords: general.technicalTabs[3],
  publicCurrentAdditionalNonPass: EXPECTED_PUBLIC_CURRENT_ADDITIONAL_NON_PASS_IDS.length,
  explicitEquipmentPass: EXPECTED_PASS_IDS.length,
  publicGeneral: general.records.length,
  exclusive: exclusive.records.length,
  technicalTabs: general.technicalTabs,
  displayCollections: general.tabs,
  chronologyEvidenceRecomputed: false,
  chronologyDefinesDisplayMembership: false,
  nextStartPoint: releaseV2.nextStartPoint,
}, null, 2));
