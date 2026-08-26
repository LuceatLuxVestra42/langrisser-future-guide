import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "data/validation/equipment-stage4-final.v1.json";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const contract = readJson("data/contracts/equipment-stage4-final-closeout.v1.json");
const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stage41 = readJson("data/validation/equipment-stage4-1-route-loader-summary.v1.json");
const stage42 = readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json");
const stage43 = readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
const stage44 = readJson("data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json");
const stage45 = readJson("data/validation/equipment-stage4-5-display-state-policy-summary.v1.json");
const stage46 = readJson("data/validation/equipment-stage4-6-admission-route-qa-summary.v1.json");
const stage47 = readJson("data/validation/equipment-stage4-7-whole-consumer-regression-summary.v1.json");
const indexSource = readText("src/routes/index.tsx");

const required = contract.requiredUpstream;
assert(stage40.status === required.stage40, "Stage 4-0 is not frozen.");
assert(stage41.status === "PASS" && stage41.finalStageStatus === required.stage41, "Stage 4-1 checkpoint mismatch.");
assert(stage42.status === "PASS" && stage42.finalStageStatus === required.stage42, "Stage 4-2 checkpoint mismatch.");
assert(stage43.status === "PASS" && stage43.finalStageStatus === required.stage43, "Stage 4-3 checkpoint mismatch.");
assert(stage44.status === "PASS" && stage44.finalStageStatus === required.stage44, "Stage 4-4 checkpoint mismatch.");
assert(stage45.status === "PASS" && stage45.finalStageStatus === required.stage45, "Stage 4-5 checkpoint mismatch.");
assert(stage46.status === "PASS" && stage46.finalStageStatus === required.stage46, "Stage 4-6 checkpoint mismatch.");
assert(stage47.status === "PASS" && stage47.finalStageStatus === required.stage47, "Stage 4-7 checkpoint mismatch.");

const hard = contract.hardGates;
assert(stage47.population.canonical === 390, "Canonical population must remain 390.");
assert(stage47.population.public === hard.publicPopulation, "Public population drifted.");
assert(stage47.population.general === hard.generalPopulation, "General population drifted.");
assert(stage47.population.exclusive === hard.exclusivePopulation, "Exclusive population drifted.");
assert(stage47.population.hiddenSpecial === hard.hiddenSpecial, "Hidden special population drifted.");
assert(stage47.population.hold === hard.hold, "HOLD population drifted.");
assert(JSON.stringify(stage47.population.holdEquipmentIds) === JSON.stringify(hard.holdEquipmentIds), "HOLD equipment IDs drifted.");
assert(JSON.stringify(stage47.population.generalTabs) === JSON.stringify(hard.generalTabs), "General tab population drifted.");

assert(stage47.consumerChain.generalListDetailExact === true, "General list/detail parity failed.");
assert(stage47.consumerChain.exclusiveListDetailExact === true, "Exclusive list/detail parity failed.");
assert(stage47.consumerChain.exactEquipmentIdNavigation === true, "Exact equipmentId navigation failed.");
assert(stage47.consumerChain.runtimeGeneralResolved === hard.generalPopulation, "Runtime general resolve count drifted.");
assert(stage47.consumerChain.runtimeExclusiveResolved === hard.exclusivePopulation, "Runtime exclusive resolve count drifted.");
assert(stage47.consumerChain.runtimeKindMismatch === hard.runtimeKindMismatch, "Runtime kind mismatch detected.");
assert(stage47.consumerChain.runtimeEquipmentIdMismatch === hard.runtimeEquipmentIdMismatch, "Runtime equipmentId mismatch detected.");
assert(stage47.consumerChain.exclusiveOwnerPayloadMismatch === hard.exclusiveOwnerPayloadMismatch, "Exclusive owner payload mismatch detected.");

assert(stage47.ownership.keys === hard.exclusivePopulation, "Exclusive ownership key count drifted.");
assert(stage47.ownership.cardinalityMismatch === hard.ownershipCardinalityMismatch, "Exclusive ownership cardinality mismatch detected.");
assert(stage47.ownership.ownerHeroMissing === hard.ownerHeroMissing, "Exclusive owner Hero missing.");
assert(stage47.ownership.rederived === false, "Ownership must not be re-derived.");

assert(stage47.admission.hiddenResolved === hard.hiddenResolved, "Hidden special equipment became public.");
assert(stage47.admission.holdResolved === hard.holdResolved, "HOLD equipment became public.");
assert(stage47.admission.unknownResolved === hard.unknownResolved, "Unknown positive equipmentId resolved publicly.");
assert(stage47.admission.publicServerImportsHiddenHold === false, "Public server imports hidden/HOLD data.");

assert(stage47.statePolicy.isolatedKeys === true, "General/exclusive state keys are no longer isolated.");
assert(stage47.statePolicy.restoreAndSanitizeMarkersPresent === true, "State restore/sanitize policy drifted.");
assert(stage47.displayPolicy.reviewPromoted === false, "REVIEW names were promoted without verification.");
assert(stage47.displayPolicy.generatedOrderPreserved === true, "Generated order is not preserved.");
assert(stage47.displayPolicy.frontendSortAdded === false, "Frontend sort was added.");
assert(stage47.displayPolicy.detailIntegrityChecked === hard.publicPopulation, "Detail integrity coverage is incomplete.");
assert(stage47.routes.generatedRouteTreeVerified === true, "Generated route tree verification failed.");
assert(stage47.routes.notFoundBoundaryPresent === true, "Public detail notFound boundary is missing.");
assert(stage47.sourceDiscipline.rawConfigDataReads === false, "Stage 4 closeout must not reopen raw ConfigData.");
assert(stage47.sourceDiscipline.exclusiveOwnershipRederived === false, "Stage 4 closeout must not rederive ownership.");
assert(stage47.sourceDiscipline.publicAdmissionReclassified === false, "Stage 4 closeout must not reclassify admission.");

const equipmentCategoryPattern = /\{\s*title:\s*"장비",\s*image:\s*cardEquip,\s*to:\s*"\/equipment"\s*\}/;
assert(equipmentCategoryPattern.test(indexSource), "Homepage Equipment category must link directly to /equipment.");

assert(stage42.display.iconAssetsBound === false, "Stage 4-2 icon policy unexpectedly changed; re-review asset binding before final closeout.");

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const nonBlockingReviews = [
  {
    code: "GENERAL_KR_NAME_REVIEW",
    count: stage47.displayPolicy.generalNameReview,
    blocking: false,
    rule: "Keep nameKr ?? nameCn fallback and REVIEW labeling until Korean names are verified.",
  },
  {
    code: "EXCLUSIVE_KR_NAME_REVIEW",
    count: stage47.displayPolicy.exclusiveNameReview,
    blocking: false,
    rule: "Keep nameKr ?? nameCn fallback and REVIEW labeling until Korean names are verified.",
  },
  {
    code: "RELEASE_CHRONOLOGY_REVIEW",
    count: null,
    blocking: false,
    rule: "Do not interpret generated order as exact release chronology where Stage 4 display policy marks chronology unverified.",
    evidence: {
      generalReleaseDatesByTab: stage47.displayPolicy.generalReleaseDatesByTab,
      exclusiveReleaseDates: stage47.displayPolicy.exclusiveReleaseDates,
    },
  },
  {
    code: "EQUIPMENT_ICON_BINDING_DEFERRED",
    count: hard.publicPopulation,
    blocking: false,
    rule: stage42.display.iconAssetReason,
  },
  {
    code: "BROWSER_PIXEL_MOBILE_QA_FOLLOWUP",
    count: null,
    blocking: false,
    rule: "Stage 4 validates data/consumer/build boundaries; browser screenshot, pixel polish, and mobile interaction QA remain follow-up review work.",
  },
];

const summary = {
  version: 1,
  stage: "4-FINAL",
  status: "PASS_WITH_REVIEW",
  completion: "COMPLETE",
  pipelineStatus: "FINAL_FROZEN",
  finalStageStatus: "STAGE4_FINAL_PC_FIRST_REVIEW_READY",
  reviewReadiness: "PC_FIRST_REVIEW_READY",
  upstream: {
    stage40: stage40.status,
    stage41: stage41.finalStageStatus,
    stage42: stage42.finalStageStatus,
    stage43: stage43.finalStageStatus,
    stage44: stage44.finalStageStatus,
    stage45: stage45.finalStageStatus,
    stage46: stage46.finalStageStatus,
    stage47: stage47.finalStageStatus,
  },
  population: stage47.population,
  finalConsumerBoundary: {
    publicEquipment: hard.publicPopulation,
    generalList: "/equipment",
    exclusiveList: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    homepageEquipmentTarget: hard.homepageEquipmentTarget,
    homepageEntryVerified: true,
    generalListDetailExact: true,
    exclusiveListDetailExact: true,
    runtimeKindMismatch: 0,
    runtimeEquipmentIdMismatch: 0,
    exclusiveOwnerPayloadMismatch: 0,
  },
  finalAdmissionBoundary: {
    hiddenSpecial: hard.hiddenSpecial,
    hold: hard.hold,
    holdEquipmentIds: hard.holdEquipmentIds,
    hiddenResolved: 0,
    holdResolved: 0,
    unknownResolved: 0,
  },
  statePolicy: stage47.statePolicy,
  ownership: stage47.ownership,
  sourceDiscipline: {
    finalCloseoutReadsFrozenStage4Checkpoints: true,
    rawConfigDataReads: false,
    stage3SemanticRecomputation: false,
    ownershipRederivation: false,
    admissionReclassification: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  hardErrors: [],
  hardErrorCount: 0,
  nonBlockingReviews,
  nonBlockingReviewCount: nonBlockingReviews.length,
  decision: "Equipment Stage 4 closes as PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN. All public consumer, ownership, state, route, admission, homepage-entry, and production-build hard gates pass. Remaining items are presentation/review follow-ups and do not block PC-first review.",
  nextStartPoint: "PC-first review and UI polish follow-up. Do not reopen Stage 2/3 semantics or Stage B ownership unless a concrete regression contradicts a frozen checkpoint.",
};

fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  status: summary.status,
  completion: summary.completion,
  pipelineStatus: summary.pipelineStatus,
  finalStageStatus: summary.finalStageStatus,
  reviewReadiness: summary.reviewReadiness,
  hardErrorCount: summary.hardErrorCount,
  nonBlockingReviewCount: summary.nonBlockingReviewCount,
  homepageEntryVerified: summary.finalConsumerBoundary.homepageEntryVerified,
  build: summary.build,
}, null, 2));
