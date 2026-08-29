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

const EXPECTED_EXCLUDED_IDS = [265, 266, 267, 268, 288, 289, 290, 291];
const EXPECTED_NON_PASS_CURRENT_ADDITIONAL_IDS = [299, 400, 401, 402];
const EXPECTED_PASS_IDS = [
  599, 600, 601, 602,
  607, 608, 609, 610,
  615, 616, 617, 618,
  623, 624, 625, 626,
  630, 631, 632, 633,
  639, 640, 641, 642,
];

const stage4 = readJson("data/validation/equipment-stage4-final.v1.json");
const finalCheckpoint = readJson("data/validation/equipment-public-presentation-correction-final.v1.json");
const admission = readJson("data/presentation/equipment-public-admission-correction.v1.json");
const display = readJson("data/presentation/equipment-display-collection.v1.json");
const chronologyAudit = readJson("data/validation/equipment-p3-0-release-chronology-presentation-audit.v3.json");
const chronologyContract = readJson("data/presentation/equipment-p3-1-release-metadata.v2.json");
const projection = readJson("data/checkpoints/equipment-public-presentation-correction-projection.v1.json");

assert(stage4.population.canonical === 390, "Stage4 canonical predecessor changed.");
assert(stage4.population.public === 373, "Stage4 public predecessor changed.");
assert(stage4.population.general === 206, "Stage4 general predecessor changed.");
assert(stage4.population.exclusive === 167, "Stage4 exclusive predecessor changed.");

assert(finalCheckpoint.status === "PASS_WITH_REVIEW", "Final checkpoint status must be PASS_WITH_REVIEW.");
assert(finalCheckpoint.completion === "COMPLETE", "Final checkpoint completion must be COMPLETE.");
assert(finalCheckpoint.pipelineStatus === "FINAL_FROZEN", "Final checkpoint must be FINAL_FROZEN.");
assert(finalCheckpoint.predecessor === "data/validation/equipment-stage4-final.v1.json", "Final checkpoint predecessor mismatch.");
assert(finalCheckpoint.hardErrorCount === 0, "Final checkpoint hardErrorCount must be zero.");
assert(Array.isArray(finalCheckpoint.blockers) && finalCheckpoint.blockers.length === 0, "Final checkpoint blockers must be empty.");

const population = finalCheckpoint.population;
assert(population.canonical === 390, "Final canonical count must remain 390.");
assert(population.public === 365, "Final public count must be 365.");
assert(population.general === 198, "Final general count must be 198.");
assert(population.exclusive === 167, "Final exclusive count must remain 167.");
assert(population.hiddenSpecial === 16, "Hidden special count must remain 16.");
assert(population.implementationExcludedDuplicate === 8, "Implementation-excluded duplicate count must be 8.");
assert(population.hold === 1, "HOLD count must remain 1.");
assert(population.public === population.general + population.exclusive, "Public count must equal general + exclusive.");
assert(
  population.canonical ===
    population.public + population.hiddenSpecial + population.implementationExcludedDuplicate + population.hold,
  "Canonical population partition does not balance.",
);
assert(finalCheckpoint.populationParity.balanced === true, "Population parity must be marked balanced.");

assert(admission.status === "FROZEN", "Public admission correction must be FROZEN.");
assert(admission.expectedPublicProjection.generalEquipmentCount === 198, "Admission general count must be 198.");
assert(admission.expectedPublicProjection.excludedCount === 8, "Admission excluded count must be 8.");
assertSameIds(admission.excludedEquipmentIds, EXPECTED_EXCLUDED_IDS, "Admission excluded IDs");
assertSameIds(finalCheckpoint.publicAdmission.excludedEquipmentIds, EXPECTED_EXCLUDED_IDS, "Final excluded IDs");
assert(finalCheckpoint.publicAdmission.excludedPublicListResolved === 0, "Excluded list leak count must be zero.");
assert(finalCheckpoint.publicAdmission.excludedPublicDetailResolved === 0, "Excluded detail leak count must be zero.");
assert(finalCheckpoint.publicAdmission.duplicateCounterpartsPublicResolved === 8, "All duplicate counterparts must remain public.");

assert(display.status === "FROZEN", "Display collection contract must be FROZEN.");
assert(display.expectedPresentationCounts.initial === 94, "Initial display count must be 94.");
assert(display.expectedPresentationCounts.previousAdditional === 80, "Previous-additional display count must be 80.");
assert(display.expectedPresentationCounts.equipmentPass === 24, "Equipment Pass display count must be 24.");
assert(display.expectedPresentationCounts.total === 198, "Display total must be 198.");
assertSameIds(
  display.displayCollections.previousAdditional.explicitCurrentAdditionalNonPassEquipmentIds,
  EXPECTED_NON_PASS_CURRENT_ADDITIONAL_IDS,
  "Display current-additional non-Pass IDs",
);
assertSameIds(display.displayCollections.equipmentPass.equipmentIds, EXPECTED_PASS_IDS, "Display Equipment Pass IDs");
assertSameIds(finalCheckpoint.generalPresentation.currentAdditionalNonPassEquipmentIds, EXPECTED_NON_PASS_CURRENT_ADDITIONAL_IDS, "Final non-Pass current-additional IDs");
assertSameIds(finalCheckpoint.generalPresentation.equipmentPassEquipmentIds, EXPECTED_PASS_IDS, "Final Equipment Pass IDs");

assert(chronologyAudit.status === "PASS_WITH_REVIEW", "P3-0 V3 audit must remain PASS_WITH_REVIEW.");
assert(chronologyAudit.classificationCorrection.chronologyDefinesDisplayMembership === false, "P3-0 chronology must not define display membership.");
assert(chronologyContract.status === "FROZEN", "P3-1 V2 chronology contract must remain FROZEN.");
assert(chronologyContract.scope.technicalTargetCount === 32, "Chronology technical target must remain 32.");
assert(chronologyContract.scope.publicChronologyCount === 28, "Chronology public subset must be 28.");
assert(chronologyContract.scope.equipmentPassCount === 24, "Chronology contract Pass count must be 24.");
assert(chronologyContract.scope.chronologyDefinesDisplayMembership === false, "P3-1 chronology must not define display membership.");
assert(finalCheckpoint.chronology.releaseEvidenceRecomputed === false, "Final checkpoint must not claim chronology recomputation.");

for (const [key, expected] of Object.entries({ canonical: 390, public: 365, general: 198, exclusive: 167 })) {
  assert(projection.expected[key] === expected, `Project Doctor projection expected.${key} mismatch.`);
}
const supplementalPaths = projection.supplementalSources.map((source) => source.path);
for (const required of Object.values(finalCheckpoint.correctionSources)) {
  assert(supplementalPaths.includes(required), `Project Doctor supplemental source missing: ${required}`);
}

const {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} = await import("../src/lib/equipment-page.localized.server.ts");

const general = readGeneralEquipmentPageData();
const exclusive = readExclusiveEquipmentPageData();
assert(general.records.length === 198, `Runtime general ${general.records.length} !== 198.`);
assert(exclusive.records.length === 167, `Runtime exclusive ${exclusive.records.length} !== 167.`);
assert(general.records.length + exclusive.records.length === 365, "Runtime public population must be 365.");
assert(JSON.stringify(general.technicalTabs) === JSON.stringify({1:94,2:76,3:28}), "Runtime technical tabs must remain 94/76/28.");
assert(JSON.stringify(general.tabs) === JSON.stringify({1:94,2:80,3:24}), "Runtime display collections must remain 94/80/24.");

const runtimeById = new Map(general.records.map((record) => [record.equipmentId, record]));
for (const equipmentId of EXPECTED_EXCLUDED_IDS) {
  assert(!runtimeById.has(equipmentId), `Excluded Equipment ${equipmentId} leaked into the public list.`);
  assert(readEquipmentDetailPageData(equipmentId) === null, `Excluded Equipment ${equipmentId} direct detail resolved.`);
}
for (const equipmentId of EXPECTED_NON_PASS_CURRENT_ADDITIONAL_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record?.technicalSiteTab === 3, `Equipment ${equipmentId} technical siteTab changed.`);
  assert(record?.displayCollection === 2, `Equipment ${equipmentId} must display as previous additional.`);
}
for (const equipmentId of EXPECTED_PASS_IDS) {
  const record = runtimeById.get(equipmentId);
  assert(record?.technicalSiteTab === 3, `Equipment Pass ${equipmentId} technical siteTab changed.`);
  assert(record?.displayCollection === 3, `Equipment Pass ${equipmentId} displayCollection must be 3.`);
}

for (const field of [
  "canonicalIdentityChanged",
  "stage2AcquisitionClassificationChanged",
  "technicalSiteTabChanged",
  "exclusiveEquipmentChanged",
  "statsEffectsRestrictionsChanged",
  "releaseChronologyRecomputed",
  "rawConfigDataReadsAdded",
  "nameJoinAdded",
  "idArithmeticAdded",
]) {
  assert(finalCheckpoint.sourceDiscipline[field] === false, `Final checkpoint sourceDiscipline.${field} must be false.`);
}

console.log(JSON.stringify({
  status: "PASS",
  stage: "equipment-public-presentation-correction-final",
  population: finalCheckpoint.population,
  technicalTabs: general.technicalTabs,
  displayCollections: general.tabs,
  excludedPublicListResolved: 0,
  excludedPublicDetailResolved: 0,
  equipmentPassCount: EXPECTED_PASS_IDS.length,
  projectDoctorExpected: {
    canonical: projection.expected.canonical,
    public: projection.expected.public,
    general: projection.expected.general,
    exclusive: projection.expected.exclusive,
  },
  hardErrorCount: 0,
  nextStartPoint: finalCheckpoint.nextStartPoint,
}, null, 2));
