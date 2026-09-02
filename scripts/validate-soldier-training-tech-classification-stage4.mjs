import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;

const paths = {
  contract: "data/contracts/soldier-training-tech-classification-stage4-contract.v1.json",
  stage1Census: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
  stage2Validation: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  stage3Candidates: "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json",
  stage3Semantic: "data/evidence/soldier-training-tech-classification-stage3-semantic.v1.json",
  stage3Validation: "data/validation/soldier-training-tech-classification-stage3.v1.json",
  frozenTrainingConsumer: "data/generated/soldier-detail-stage5-4.v1.json",
  output: "data/validation/soldier-training-tech-classification-stage4.v1.json",
};

const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const gitBlobSha = (path) => {
  const bytes = readFileSync(resolve(root, path));
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
};

const contract = readJson(paths.contract);
const stage1 = readJson(paths.stage1Census);
const stage2 = readJson(paths.stage2Validation);
const candidates = readJson(paths.stage3Candidates);
const semantic = readJson(paths.stage3Semantic);
const stage3 = readJson(paths.stage3Validation);
const soldierDetail = readJson(paths.frozenTrainingConsumer);

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
  return Boolean(condition);
};

const checks = {};
checks.contractFrozen = check(
  contract.status === "DESIGN_FROZEN" &&
  contract.completion === "COMPLETE" &&
  contract.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN",
  "Stage 4 contract is not frozen COMPLETE.",
);
checks.stage1BlobMatch = check(gitBlobSha(paths.stage1Census) === contract.predecessors.stage1Census.gitBlobSha, "Stage 1 census blob mismatch.");
checks.stage2BlobMatch = check(gitBlobSha(paths.stage2Validation) === contract.predecessors.stage2Validation.gitBlobSha, "Stage 2 validation blob mismatch.");
checks.stage3CandidateBlobMatch = check(gitBlobSha(paths.stage3Candidates) === contract.predecessors.stage3CandidateEvidence.gitBlobSha, "Stage 3 candidate evidence blob mismatch.");
checks.stage3SemanticBlobMatch = check(gitBlobSha(paths.stage3Semantic) === contract.predecessors.stage3SemanticEvidence.gitBlobSha, "Stage 3 semantic evidence blob mismatch.");
checks.stage3ValidationBlobMatch = check(gitBlobSha(paths.stage3Validation) === contract.predecessors.stage3Validation.gitBlobSha, "Stage 3 validation blob mismatch.");
checks.frozenTrainingConsumerBlobMatch = check(gitBlobSha(paths.frozenTrainingConsumer) === contract.predecessors.frozenTrainingConsumer.gitBlobSha, "Frozen Stage 5-4 training consumer blob mismatch.");
checks.stage1FrozenPopulation = check(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.records?.length === 287, "Stage 1 census is not frozen at 287 TrainingTech records.");
checks.stage2FrozenPass = check(stage2.status === "PASS" && stage2.completion === "COMPLETE" && stage2.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE2_EVIDENCE_FROZEN", "Stage 2 validation is not frozen PASS/COMPLETE.");
checks.stage3FrozenPass = check(stage3.status === "PASS" && stage3.completion === "COMPLETE" && stage3.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE3_REPRESENTATIVE_EVIDENCE_FROZEN" && semantic.status === "PASS" && semantic.completion === "COMPLETE", "Stage 3 evidence is not frozen PASS/COMPLETE.");
checks.sourceSnapshotsPreserved = check(
  stage1.sourceSnapshots?.trainingTech?.gitBlobSha === contract.sourceSnapshots.trainingTech.gitBlobSha &&
  stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === contract.sourceSnapshots.trainingTechLevel.gitBlobSha &&
  semantic.sourceSnapshots?.trainingTech?.gitBlobSha === contract.sourceSnapshots.trainingTech.gitBlobSha &&
  semantic.sourceSnapshots?.trainingTechLevel?.gitBlobSha === contract.sourceSnapshots.trainingTechLevel.gitBlobSha,
  "TrainingTech source snapshot identity drifted across frozen predecessors.",
);

const stage1Records = stage1.records ?? [];
const stage1ById = new Map(stage1Records.map((record) => [record.id, record]));
const stage1Ids = stage1Records.map((record) => record.id);
checks.stage1IdsUnique = check(stage1ById.size === 287 && new Set(stage1Ids).size === 287, "Stage 1 TrainingTech IDs are not unique 287/287.");
checks.stage1TechTypePopulation = check(
  stage1.structuralSummary?.trainingTech?.rawTechTypeValueCounts?.["1"] === 84 &&
  stage1.structuralSummary?.trainingTech?.rawTechTypeValueCounts?.["2"] === 157 &&
  stage1.structuralSummary?.trainingTech?.rawTechTypeValueCounts?.["3"] === 46,
  "Frozen Stage 1 TechType population is not 84/157/46.",
);

const protectedGrowthTechIds = new Set(
  (soldierDetail.records ?? [])
    .filter((record) => record.identity?.tier === 3 && record.identity?.isSp === false && record.training?.techId != null)
    .map((record) => record.training.techId),
);
checks.protectedGrowthPopulation = check(protectedGrowthTechIds.size === 129, `Expected 129 protected growth Tech IDs, got ${protectedGrowthTechIds.size}.`);
checks.protectedGrowthStage2Parity = check(
  stage2.coverage?.protectedNormalTier3GrowthResolvedUnique === 129 &&
  stage2.coverage?.protectedNormalTier3DistinctTechIds === 129 &&
  stage2.coverage?.frozenTrainingTechMismatches === 0 &&
  stage2.coverage?.frozenAbilityTechMismatches === 0,
  "Stage 2 protected growth parity is not intact.",
);
checks.protectedGrowthStillTechType2 = check(
  [...protectedGrowthTechIds].every((id) => stage1ById.get(id)?.raw?.TechType === 2),
  "A protected SOLDIER_GROWTH Tech is no longer raw TechType 2 in the frozen census.",
);

const structuralGroups = candidates.structuralGroups ?? [];
const candidateTechIds = structuralGroups.flatMap((group) => group.techIds ?? []);
const candidateTechIdSet = new Set(candidateTechIds);
checks.stage3CandidateCoverage = check(
  candidates.coverage?.nonGrowthTech === 158 &&
  candidates.coverage?.structuralGroupCount === 15 &&
  candidateTechIds.length === 158 &&
  candidateTechIdSet.size === 158,
  "Stage 3 candidate groups do not partition 158 non-protected Techs.",
);
checks.protectedAndCandidatesDisjoint = check(
  [...protectedGrowthTechIds].every((id) => !candidateTechIdSet.has(id)),
  "Protected growth and non-protected Stage 3 candidate sets overlap.",
);
checks.fullPopulationPartition = check(
  protectedGrowthTechIds.size + candidateTechIdSet.size === 287 &&
  stage1Ids.every((id) => protectedGrowthTechIds.has(id) || candidateTechIdSet.has(id)),
  "Protected plus candidate sets do not cover all 287 Stage 1 Tech IDs.",
);
checks.candidateTechTypeBinding = check(
  structuralGroups.every((group) => (group.techIds ?? []).every((id) => stage1ById.get(id)?.raw?.TechType === group.signature?.techTypeRaw)),
  "A Stage 3 candidate group TechType signature does not match the frozen Stage 1 record.",
);

const reviewByTechId = new Map((semantic.representativeReviews ?? []).map((review) => [review.techId, review]));
const type1Groups = structuralGroups.filter((group) => group.signature?.techTypeRaw === 1);
const type2Groups = structuralGroups.filter((group) => group.signature?.techTypeRaw === 2);
const type3Groups = structuralGroups.filter((group) => group.signature?.techTypeRaw === 3);
const type1Ids = new Set(type1Groups.flatMap((group) => group.techIds ?? []));
const type2Ids = new Set(type2Groups.flatMap((group) => group.techIds ?? []));
const type3Ids = new Set(type3Groups.flatMap((group) => group.techIds ?? []));
checks.commonStatRepresentativeAdmission = check(
  type1Groups.length === 8 && type1Ids.size === 84 && type1Groups.every((group) => reviewByTechId.get(group.representative?.techId)?.semanticFinding === "COMMON_STAT_REPRESENTATIVE"),
  "TechType 1 is not fully supported by all 8 frozen COMMON_STAT representative signatures.",
);
checks.commonPassiveRepresentativeAdmission = check(
  type3Groups.length === 5 && type3Ids.size === 46 && type3Groups.every((group) => reviewByTechId.get(group.representative?.techId)?.semanticFinding === "COMMON_PASSIVE_REPRESENTATIVE"),
  "TechType 3 is not fully supported by all 5 frozen COMMON_PASSIVE representative signatures.",
);
const progressionFiveCount = type2Groups.filter((group) => group.signature?.skillLevelupShape === "EXACT_1_TO_5").reduce((sum, group) => sum + group.count, 0);
const progressionTenCount = type2Groups.filter((group) => group.signature?.skillLevelupShape === "EXACT_1_TO_10").reduce((sum, group) => sum + group.count, 0);
checks.nonProtectedProgressionRepresentativeAdmission = check(
  type2Groups.length === 2 &&
  type2Ids.size === 28 &&
  progressionFiveCount === 27 &&
  progressionTenCount === 1 &&
  type2Groups.every((group) => group.signature?.relationShape === "SOLDIER_ONLY") &&
  type2Groups.every((group) => ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(group.signature?.skillLevelupShape)) &&
  type2Groups.every((group) => reviewByTechId.get(group.representative?.techId)?.semanticFinding?.startsWith("SOLDIER_SPECIFIC_PROGRESSION")),
  "The remaining 28 TechType 2 records are not fully supported by the two frozen Soldier-specific progression signatures.",
);
checks.prerequisiteUnlockRemainFacets = check(
  semantic.semanticConclusions?.prerequisiteAndUnlock?.exclusiveWholeTechLabel === "REJECTED_BY_REPRESENTATIVE_EVIDENCE" &&
  semantic.semanticConclusions?.prerequisiteAndUnlock?.requiredModel?.prerequisite === "ORTHOGONAL_RELATION_FACET" &&
  semantic.semanticConclusions?.prerequisiteAndUnlock?.requiredModel?.unlock === "ORTHOGONAL_RELATION_FACET" &&
  contract.relationFacets?.rejectedExclusiveLabel === "PREREQUISITE_OR_UNLOCK" &&
  contract.relationFacets?.wholeTechLabel === "NONE",
  "Prerequisite/unlock facet boundary is not preserved.",
);

const rulesById = new Map((contract.wholeTechClassification?.rules ?? []).map((rule) => [rule.id, rule]));
checks.contractRuleSet = check(
  rulesById.get("protected-normal-tier3-soldier-growth-v1")?.status === "PRESERVED_FROM_STAGE2" &&
  rulesById.get("common-stat-techtype-v1")?.status === "NEWLY_ADMITTED_BY_STAGE4" &&
  rulesById.get("common-passive-techtype-v1")?.status === "NEWLY_ADMITTED_BY_STAGE4" &&
  rulesById.get("nonprotected-soldier-specific-progression-v1")?.status === "NEWLY_ADMITTED_BY_STAGE4",
  "Stage 4 rule set is incomplete or has unexpected admission status.",
);
checks.contractPriority = check(
  JSON.stringify(contract.wholeTechClassification?.priority) === JSON.stringify(["SOLDIER_GROWTH", "COMMON_STAT", "COMMON_PASSIVE", "SOLDIER_SPECIFIC_PROGRESSION", "REVIEW_UNCLASSIFIED"]),
  "Stage 4 whole-Tech classification priority drifted.",
);
checks.forbiddenInferenceClosed = check(
  Object.values(contract.forbiddenAutomaticInference ?? {}).every((value) => value === true) &&
  rulesById.get("common-stat-techtype-v1")?.textClassifierRequired === false &&
  rulesById.get("common-passive-techtype-v1")?.textClassifierRequired === false &&
  rulesById.get("nonprotected-soldier-specific-progression-v1")?.textClassifierRequired === false,
  "Forbidden automatic inference boundary is not fully closed.",
);
checks.noFullClassificationArtifactYet = check(contract.scope?.fullClassificationArtifactEmitted === false, "Stage 4 must not emit the full 287-record classification artifact.");

const dryRun = [];
let ruleOverlapCount = 0;
for (const record of stage1Records) {
  const id = record.id;
  const type = record.raw?.TechType;
  const matches = [];
  if (protectedGrowthTechIds.has(id)) matches.push("SOLDIER_GROWTH");
  if (!protectedGrowthTechIds.has(id) && type === 1) matches.push("COMMON_STAT");
  if (!protectedGrowthTechIds.has(id) && type === 3) matches.push("COMMON_PASSIVE");
  if (!protectedGrowthTechIds.has(id) && type === 2 && type2Ids.has(id)) matches.push("SOLDIER_SPECIFIC_PROGRESSION");
  if (matches.length > 1) ruleOverlapCount += 1;
  dryRun.push({ id, label: matches.length === 1 ? matches[0] : "REVIEW_UNCLASSIFIED", matchCount: matches.length });
}

const countLabel = (label) => dryRun.filter((entry) => entry.label === label).length;
const dryRunCounts = {
  SOLDIER_GROWTH: countLabel("SOLDIER_GROWTH"),
  COMMON_STAT: countLabel("COMMON_STAT"),
  COMMON_PASSIVE: countLabel("COMMON_PASSIVE"),
  SOLDIER_SPECIFIC_PROGRESSION: countLabel("SOLDIER_SPECIFIC_PROGRESSION"),
  REVIEW_UNCLASSIFIED: countLabel("REVIEW_UNCLASSIFIED"),
};
const fallbackIds = dryRun.filter((entry) => entry.label === "REVIEW_UNCLASSIFIED").map((entry) => entry.id);
checks.currentDryRunCoverage = check(
  dryRun.length === 287 &&
  dryRunCounts.SOLDIER_GROWTH === 129 &&
  dryRunCounts.COMMON_STAT === 84 &&
  dryRunCounts.COMMON_PASSIVE === 46 &&
  dryRunCounts.SOLDIER_SPECIFIC_PROGRESSION === 28 &&
  dryRunCounts.REVIEW_UNCLASSIFIED === 0,
  `Stage 4 dry-run coverage mismatch: ${JSON.stringify(dryRunCounts)}`,
);
checks.ruleOverlapZero = check(ruleOverlapCount === 0, `Stage 4 dry-run rule overlap count is ${ruleOverlapCount}.`);
checks.fallbackZeroForFrozenSnapshot = check(fallbackIds.length === 0, `Frozen snapshot has REVIEW_UNCLASSIFIED IDs: ${fallbackIds.join(",")}`);
checks.protectedGrowthNeverRelabeled = check(
  dryRun.filter((entry) => protectedGrowthTechIds.has(entry.id)).every((entry) => entry.label === "SOLDIER_GROWTH"),
  "A protected SOLDIER_GROWTH Tech was relabeled by Stage 4.",
);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage4-validation/v1",
  stage: "TrainingTech Classification Stage 4 - Classification Contract",
  status: errors.length === 0 ? "PASS" : "FAIL",
  completion: errors.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: errors.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN" : "OPEN",
  validationMode: "INDEPENDENT_READ_ONLY_FROZEN_PREDECESSOR_RULE_ADMISSION_DRY_RUN",
  contract: {
    path: paths.contract,
    gitBlobSha: gitBlobSha(paths.contract),
  },
  predecessorBlobs: {
    stage1Census: gitBlobSha(paths.stage1Census),
    stage2Validation: gitBlobSha(paths.stage2Validation),
    stage3CandidateEvidence: gitBlobSha(paths.stage3Candidates),
    stage3SemanticEvidence: gitBlobSha(paths.stage3Semantic),
    stage3Validation: gitBlobSha(paths.stage3Validation),
    frozenTrainingConsumer: gitBlobSha(paths.frozenTrainingConsumer),
  },
  checks,
  coverage: {
    trainingTech: stage1Records.length,
    protectedSoldierGrowth: protectedGrowthTechIds.size,
    commonStat: type1Ids.size,
    commonPassive: type3Ids.size,
    nonProtectedSoldierSpecificProgression: type2Ids.size,
    nonProtectedProgressionExact1To5: progressionFiveCount,
    nonProtectedProgressionExact1To10: progressionTenCount,
    ruleOverlapCount,
    reviewUnclassifiedCount: fallbackIds.length,
  },
  dryRunCounts,
  newlyAdmittedAutomaticRules: [
    "common-stat-techtype-v1",
    "common-passive-techtype-v1",
    "nonprotected-soldier-specific-progression-v1",
  ],
  preservedAutomaticRule: "protected-normal-tier3-soldier-growth-v1",
  rejectedExclusiveWholeTechLabels: ["PREREQUISITE_OR_UNLOCK"],
  relationFacets: ["PREREQUISITE", "SOLDIER_UNLOCK"],
  fullClassificationArtifactEmitted: false,
  reviews: [],
  blockers: errors,
  hardErrorCount: errors.length,
  nextOwner: contract.nextOwner,
  nextStartPoint: contract.nextStartPoint,
  reopenConditions: contract.reopenConditions,
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (writeMode) {
  writeFileSync(resolve(root, paths.output), serialized);
  console.log(`Wrote ${paths.output}`);
}
if (checkMode) {
  if (errors.length > 0) {
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
  }
  const existing = readText(paths.output);
  if (existing !== serialized) {
    console.error(`${paths.output} is stale. Run with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: output.status, coverage: output.coverage, dryRunCounts: output.dryRunCounts }));
}
