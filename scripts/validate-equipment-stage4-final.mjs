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
const imageStage3 = readJson("data/validation/equipment-image-stage3-hosted-qa-summary.v1.json");
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
assert(imageStage3.status === required.imageStage3Hosted, "Equipment Image Stage 3 Hosted QA checkpoint mismatch.");

const hard = contract.hardGates;
assert(stage47.population.canonical === hard.canonicalPopulation, "Canonical population drifted.");
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
assert(stage47.consumerChain.runtimeGeneralResolved === hard.runtimeGeneralResolved, "Runtime general resolve count drifted.");
assert(stage47.consumerChain.runtimeExclusiveResolved === hard.runtimeExclusiveResolved, "Runtime exclusive resolve count drifted.");

assert(stage47.ownership.keys === hard.exclusivePopulation, "Exclusive ownership key count drifted.");
assert(stage47.ownership.cardinalityMismatch === hard.ownershipCardinalityMismatch, "Exclusive ownership cardinality mismatch detected.");
assert(stage47.ownership.ownerHeroMissing === hard.ownerHeroMissing, "Exclusive owner Hero missing.");
assert(stage47.ownership.rederived === false, "Ownership must not be re-derived.");

assert(stage47.admission.hiddenResolved === hard.hiddenResolved, "Hidden special equipment became public.");
assert(stage47.admission.holdResolved === hard.holdResolved, "HOLD equipment became public.");
assert(stage47.admission.unknownResolved === hard.unknownResolved, "Unknown positive equipmentId resolved publicly.");
assert(stage46.sourceDiscipline.hiddenHoldImportedByPublicServer === false, "Public server imports hidden/HOLD data.");

assert(stage45.state.isolatedKeys === hard.stateKeysIsolated, "General/exclusive state keys are no longer isolated.");
assert(stage47.statePolicy.generalStorageKey === stage45.state.general.key, "General state key drifted between Stage 4-5 and 4-7.");
assert(stage47.statePolicy.exclusiveStorageKey === stage45.state.exclusive.key, "Exclusive state key drifted between Stage 4-5 and 4-7.");
assert(stage47.statePolicy.generalStorageKey !== stage47.statePolicy.exclusiveStorageKey, "General/exclusive state keys must differ.");
assert(stage47.statePolicy.restoreAndSanitizeMarkersPresent === true, "State restore/sanitize policy drifted.");

assert(stage43.naming.reviewPromoted === false, "General REVIEW names were promoted without verification.");
assert(stage44.naming.reviewPromoted === false, "Exclusive REVIEW names were promoted without verification.");
assert(stage45.sourceDiscipline.generalGeneratedOrderPreserved === true, "General generated order is not preserved.");
assert(stage45.sourceDiscipline.exclusiveGeneratedOrderPreserved === true, "Exclusive generated order is not preserved.");
assert(stage45.sourceDiscipline.frontendSortAdded === false, "Frontend sort was added.");
assert(stage43.route.generalDetailCount === hard.generalPopulation, "General detail integrity coverage is incomplete.");
assert(stage44.population.exclusiveDetail === hard.exclusivePopulation, "Exclusive detail integrity coverage is incomplete.");

assert(stage47.routes.generalList === "/equipment", "General route drifted.");
assert(stage47.routes.exclusiveList === "/equipment/exclusive", "Exclusive route drifted.");
assert(stage47.routes.detail === "/equipment/$equipmentId", "Detail route drifted.");
assert(stage47.routes.generatedRouteTreeVerified === hard.generatedRouteTreeVerified, "Generated route tree verification failed.");
assert(stage46.routeGuards.missingPublicDataToNotFound === hard.notFoundBoundaryVerified, "Public detail notFound boundary is missing.");
assert(stage46.routeGuards.explicitNotFoundComponent === true, "Explicit Equipment notFound component is missing.");

assert(stage47.localizationBoundary.localizedPresentationAdapter === true, "Equipment localization adapter is not active.");
assert(stage47.localizationBoundary.baseServerDelegationPreserved === true, "Localization adapter no longer delegates to the frozen base server.");
assert(stage47.localizationBoundary.identityKey === "equipmentId", "Localization boundary changed Equipment identity.");
assert(stage47.sourceDiscipline.rawConfigDataReads === false, "Stage 4 closeout must not reopen raw ConfigData.");
assert(stage47.sourceDiscipline.exclusiveOwnershipRederived === false, "Stage 4 closeout must not rederive ownership.");
assert(stage47.sourceDiscipline.publicAdmissionReclassified === false, "Stage 4 closeout must not reclassify admission.");

assert(imageStage3.status === hard.imageStage3Status, "Equipment Image Stage 3 Hosted QA status drifted.");
assert(imageStage3.completion === "COMPLETE", "Equipment Image Stage 3 Hosted QA is incomplete.");
assert(imageStage3.freezeState === hard.imageStage3FreezeState, "Equipment Image Stage 3 freeze state drifted.");
assert(imageStage3.semanticStageReopened === false, "Image integration reopened semantic stages.");
assert(imageStage3.canonicalIdentityChanged === false, "Image integration changed canonical identity.");
assert(imageStage3.productionJoinKey === "equipmentId", "Image integration changed the production join key.");
assert(imageStage3.publicEquipment === hard.publicPopulation, "Hosted QA public Equipment count drifted.");
assert(imageStage3.gates.preflight === "PASS", "Hosted QA preflight failed.");
assert(imageStage3.gates.build === "PASS", "Hosted QA build failed.");
assert(imageStage3.gates.deploymentHosted === "PASS", "Hosted QA deployment failed.");
assert(imageStage3.gates.browserUi === hard.imageStage3BrowserUi, "Hosted Browser/UI QA failed.");
assert(imageStage3.routeChecks.every((check) => check.status === 200), "Hosted route smoke contains a non-200 response.");
assert(imageStage3.assetChecks.every((check) => check.status === 200 && check.width === 172 && check.height === 172), "Hosted Equipment asset smoke failed.");

const equipmentCategoryPattern = /\{\s*title:\s*"장비",\s*image:\s*cardEquip,\s*to:\s*"\/equipment"\s*\}/;
assert(equipmentCategoryPattern.test(indexSource), "Homepage Equipment category must link directly to /equipment.");

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const nonBlockingReviews = [
  {
    code: "KR_NAME_FALLBACK_REVIEW",
    count: null,
    blocking: false,
    rule: "Any Equipment name still unresolved by the current localization adapter must remain fallback-only and must not change equipmentId membership or route identity.",
  },
  {
    code: "RELEASE_CHRONOLOGY_REVIEW",
    count: null,
    blocking: false,
    rule: "Do not interpret generated order as exact release chronology where Stage 4 display policy marks chronology unverified.",
    evidence: {
      generalTab1ChronologyClaimed: stage45.display.generalTab1ChronologyClaimed,
      generalTab3ChronologyReviewExplicit: stage45.display.generalTab3ChronologyReviewExplicit,
      exclusiveChronologyReviewExplicit: stage45.display.exclusiveChronologyReviewExplicit,
    },
  },
  {
    code: "MOBILE_PIXEL_POLISH_FOLLOWUP",
    count: null,
    blocking: false,
    rule: "Hosted route and Equipment asset smoke QA is frozen as PASS; remaining pixel-polish and mobile interaction review is non-blocking UI follow-up.",
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
    imageStage3Hosted: imageStage3.status,
  },
  population: stage47.population,
  finalConsumerBoundary: {
    publicEquipment: hard.publicPopulation,
    generalList: stage47.routes.generalList,
    exclusiveList: stage47.routes.exclusiveList,
    detail: stage47.routes.detail,
    homepageEquipmentTarget: hard.homepageEquipmentTarget,
    homepageEntryVerified: true,
    generalListDetailExact: stage47.consumerChain.generalListDetailExact,
    exclusiveListDetailExact: stage47.consumerChain.exclusiveListDetailExact,
    runtimeGeneralResolved: stage47.consumerChain.runtimeGeneralResolved,
    runtimeExclusiveResolved: stage47.consumerChain.runtimeExclusiveResolved,
    notFoundBoundaryVerified: stage46.routeGuards.missingPublicDataToNotFound,
  },
  finalAdmissionBoundary: {
    hiddenSpecial: hard.hiddenSpecial,
    hold: hard.hold,
    holdEquipmentIds: hard.holdEquipmentIds,
    hiddenResolved: stage47.admission.hiddenResolved,
    holdResolved: stage47.admission.holdResolved,
    unknownResolved: stage47.admission.unknownResolved,
  },
  statePolicy: {
    ...stage47.statePolicy,
    isolatedKeys: stage45.state.isolatedKeys,
  },
  ownership: stage47.ownership,
  imageIntegration: {
    status: imageStage3.status,
    completion: imageStage3.completion,
    freezeState: imageStage3.freezeState,
    productionJoinKey: imageStage3.productionJoinKey,
    publicEquipment: imageStage3.publicEquipment,
    hostedBaseUrl: imageStage3.hostedBaseUrl,
    gates: imageStage3.gates,
    representativeAssetChecks: imageStage3.assetChecks.length,
  },
  sourceDiscipline: {
    finalCloseoutReadsFrozenStage4Checkpoints: true,
    finalCloseoutReadsFrozenImageStage3HostedQa: true,
    rawConfigDataReads: false,
    stage3SemanticRecomputation: false,
    ownershipRederivation: false,
    admissionReclassification: false,
  },
  build: {
    command: "bun run build",
    pass: hard.buildMustPass,
  },
  hardErrors: [],
  hardErrorCount: 0,
  nonBlockingReviews,
  nonBlockingReviewCount: nonBlockingReviews.length,
  decision: "Equipment Stage 4 closes as PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN. Public consumer, ownership, state, route, admission, homepage-entry, production-build, and frozen Hosted Equipment image QA hard gates pass. Remaining items are presentation/review follow-ups and do not block PC-first review.",
  nextStartPoint: "PC-first review and UI polish follow-up. Equipment Stage 4 and Equipment Image Stage 3 are frozen; do not reopen Stage 2/3 semantics or Stage B ownership unless a concrete regression contradicts a frozen checkpoint.",
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
  hostedImageQa: summary.imageIntegration.gates,
  build: summary.build,
}, null, 2));
