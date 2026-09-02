import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const paths = {
  stage2: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  candidates: "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json",
  semantic: "data/evidence/soldier-training-tech-classification-stage3-semantic.v1.json",
  tech: "data/configdata/ConfigDataTrainingTechInfo.json",
  level: "data/configdata/ConfigDataTrainingTechLevelInfo.json",
  output: "data/validation/soldier-training-tech-classification-stage3.v1.json",
};

const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const gitBlobSha = (path) => {
  const bytes = readFileSync(resolve(root, path));
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
};

const stage2 = readJson(paths.stage2);
const candidates = readJson(paths.candidates);
const semantic = readJson(paths.semantic);
const techs = readJson(paths.tech);
const levels = readJson(paths.level);
const techById = new Map(techs.map((record) => [record.ID, record]));
const levelById = new Map(levels.map((record) => [record.ID, record]));
const groupByRepresentativeTechId = new Map(candidates.structuralGroups.map((group) => [group.representative.techId, group]));

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
  return Boolean(condition);
};

const checks = {};
checks.stage2FrozenPass = check(stage2.status === "PASS" && stage2.completion === "COMPLETE" && stage2.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE2_EVIDENCE_FROZEN", "Stage 2 is not frozen PASS/COMPLETE.");
checks.stage2BlobMatch = check(gitBlobSha(paths.stage2) === semantic.predecessors.stage2Validation.gitBlobSha, "Stage 2 validation blob SHA mismatch.");
checks.candidateBlobMatch = check(gitBlobSha(paths.candidates) === semantic.predecessors.candidateEvidence.gitBlobSha, "Candidate evidence blob SHA mismatch.");
checks.semanticSchema = check(semantic.schemaId === "soldier-training-tech-classification-stage3-semantic-evidence/v1", "Unexpected semantic evidence schema.");
checks.semanticFrozenPass = check(semantic.status === "PASS" && semantic.completion === "COMPLETE" && semantic.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE3_REPRESENTATIVE_EVIDENCE_FROZEN", "Semantic evidence is not frozen PASS/COMPLETE.");
checks.sourceSnapshotsMatch = check(gitBlobSha(paths.tech) === semantic.sourceSnapshots.trainingTech.gitBlobSha && gitBlobSha(paths.level) === semantic.sourceSnapshots.trainingTechLevel.gitBlobSha, "TrainingTech source snapshot mismatch.");
checks.sourcePopulationMatch = check(techs.length === 287 && levels.length === 2945, "TrainingTech source population mismatch.");
checks.candidateCoverageMatch = check(candidates.coverage.totalTrainingTech === 287 && candidates.coverage.protectedGrowthTech === 129 && candidates.coverage.nonGrowthTech === 158 && candidates.coverage.structuralGroupCount === 15 && candidates.coverage.representedNonGrowthTech === 158, "Candidate structural coverage mismatch.");
checks.candidatePolicyNoSemanticClassification = check(candidates.policy.semanticClassificationPerformed === false && candidates.policy.nameKeywordClassificationPerformed === false && candidates.policy.descriptionKeywordClassificationPerformed === false && candidates.policy.idArithmeticPerformed === false && candidates.policy.techTypeMeaningAssigned === false, "Candidate investigation performed forbidden semantic inference.");

const groupCountSum = candidates.structuralGroups.reduce((sum, group) => sum + group.count, 0);
const representativeIds = candidates.structuralGroups.map((group) => group.representative.techId);
checks.structuralGroupsPartitionNonGrowth = check(groupCountSum === 158 && new Set(representativeIds).size === 15, "Structural groups do not partition the 158 non-protected Tech records.");
checks.reviewCountMatchesGroups = check(semantic.representativeReviews.length === 15, "Expected 15 representative semantic reviews.");

const reviewIds = semantic.representativeReviews.map((review) => review.techId);
checks.everyStructuralGroupReviewedOnce = check(new Set(reviewIds).size === 15 && representativeIds.every((id) => reviewIds.includes(id)), "Representative semantic reviews do not cover every structural group exactly once.");

let sourceBindingMismatchCount = 0;
for (const review of semantic.representativeReviews) {
  const group = groupByRepresentativeTechId.get(review.techId);
  const tech = techById.get(review.techId);
  const level = levelById.get(review.evidenceLevelInfoId);
  if (!group || !tech || !level) {
    sourceBindingMismatchCount += 1;
    continue;
  }
  const candidateLevel = group.representative.levelEvidence.find((entry) => entry.ID === review.evidenceLevelInfoId);
  if (tech.TechType !== review.techTypeRaw) sourceBindingMismatchCount += 1;
  if (!candidateLevel || candidateLevel.Description !== review.evidenceDescription || level.Description !== review.evidenceDescription) sourceBindingMismatchCount += 1;
  if (review.explicitUnlockedSoldierIds) {
    const actualUnlocked = [...new Set(group.representative.levelEvidence.filter((entry) => has(entry, "SoldierIDUnlocked")).map((entry) => entry.SoldierIDUnlocked))].sort((a, b) => a - b);
    if (JSON.stringify(actualUnlocked) !== JSON.stringify(review.explicitUnlockedSoldierIds)) sourceBindingMismatchCount += 1;
  }
}
checks.representativeSourceBinding = check(sourceBindingMismatchCount === 0, `Representative source binding mismatch count: ${sourceBindingMismatchCount}`);

const statReviews = semantic.representativeReviews.filter((review) => review.semanticFinding === "COMMON_STAT_REPRESENTATIVE");
const passiveReviews = semantic.representativeReviews.filter((review) => review.semanticFinding === "COMMON_PASSIVE_REPRESENTATIVE");
const progressionReviews = semantic.representativeReviews.filter((review) => review.semanticFinding.startsWith("SOLDIER_SPECIFIC_PROGRESSION"));
checks.reviewFamilyCounts = check(statReviews.length === 8 && passiveReviews.length === 5 && progressionReviews.length === 2, "Representative semantic family counts mismatch.");
checks.reviewedRawTechTypeConsistency = check(statReviews.every((review) => review.techTypeRaw === 1) && passiveReviews.every((review) => review.techTypeRaw === 3) && progressionReviews.every((review) => review.techTypeRaw === 2), "Representative raw TechType observations are inconsistent with frozen semantic evidence.");
checks.structuralFamilyPopulation = check(semantic.coverage.commonStatStructurallyCoveredTech === 84 && semantic.coverage.commonPassiveStructurallyCoveredTech === 46 && semantic.coverage.soldierSpecificProgressionStructurallyCoveredTech === 28, "Frozen representative family structural population mismatch.");

const tech102 = techById.get(102);
const tech105 = techById.get(105);
const tech106 = techById.get(106);
const tech632 = techById.get(632);
const levels632 = tech632?.TechLevelupInfoList?.map((id) => levelById.get(id)) ?? [];
checks.prerequisiteCrossCutsFamilies = check(Array.isArray(tech102?.PreTechIDs) && Array.isArray(tech105?.PreTechIDs) && Array.isArray(tech106?.PreTechIDs), "PreTech relation does not cross the reviewed stat/passive/progression representatives as frozen.");
checks.unlockCoexistsWithProgression = check(levels632.length === 10 && levels632.every((record, index) => record?.SoldierSkillLevelup === index + 1) && levels632.every((record) => record?.SoldierIDUnlocked === 804), "Tech 632 no longer proves unlock/progression coexistence.");
checks.prerequisiteUnlockExclusiveLabelRejected = check(semantic.semanticConclusions.prerequisiteAndUnlock.exclusiveWholeTechLabel === "REJECTED_BY_REPRESENTATIVE_EVIDENCE" && semantic.semanticConclusions.prerequisiteAndUnlock.requiredModel.prerequisite === "ORTHOGONAL_RELATION_FACET" && semantic.semanticConclusions.prerequisiteAndUnlock.requiredModel.unlock === "ORTHOGONAL_RELATION_FACET", "Prerequisite/unlock facet conclusion drifted.");
checks.noNewAutomaticWholeTechRules = check(Array.isArray(semantic.stage4RuleAdmissionBoundary.newAutomaticWholeTechRulesAdmittedByStage3) && semantic.stage4RuleAdmissionBoundary.newAutomaticWholeTechRulesAdmittedByStage3.length === 0, "Stage 3 must not admit automatic whole-Tech rules.");
checks.stage4CandidateRulesRemainCandidates = check(semantic.semanticConclusions.commonStatFamily.automaticRuleAdmittedNow === false && semantic.semanticConclusions.commonPassiveFamily.automaticRuleAdmittedNow === false && semantic.semanticConclusions.soldierSpecificProgressionOutsideProtected129.automaticRuleAdmittedNow === false, "Stage 3 candidate rules were incorrectly promoted.");
checks.protectedGrowthPopulationPreserved = check(stage2.coverage.protectedNormalTier3GrowthTarget === 129 && stage2.coverage.protectedNormalTier3GrowthResolvedUnique === 129 && stage2.coverage.frozenTrainingTechMismatches === 0 && stage2.coverage.frozenAbilityTechMismatches === 0, "Protected 129 Soldier growth parity is not preserved.");
checks.forbiddenInferenceRemainsClosed = check(semantic.reviewMethod.automaticDescriptionKeywordClassifierUsed === false && semantic.reviewMethod.automaticNameKeywordClassifierUsed === false && semantic.reviewMethod.idArithmeticUsed === false && semantic.reviewMethod.idRangeUsed === false && semantic.reviewMethod.sourceOrderUsedAsMeaning === false && semantic.reviewMethod.techTypeNumericMeaningAssumedBeforeReview === false, "Stage 3 review method violates the frozen evidence boundary.");

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage3-validation/v1",
  stage: "TrainingTech Classification Stage 3 - Representative Semantic Evidence",
  status: errors.length === 0 ? "PASS" : "FAIL",
  completion: errors.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: errors.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE3_REPRESENTATIVE_EVIDENCE_FROZEN" : "OPEN",
  validationMode: "INDEPENDENT_READ_ONLY_SOURCE_BINDING_AND_BOUNDARY_VALIDATION",
  predecessors: {
    stage2Validation: paths.stage2,
    candidateEvidence: paths.candidates,
    semanticEvidence: paths.semantic
  },
  blobShas: {
    stage2Validation: gitBlobSha(paths.stage2),
    candidateEvidence: gitBlobSha(paths.candidates),
    semanticEvidence: gitBlobSha(paths.semantic),
    trainingTech: gitBlobSha(paths.tech),
    trainingTechLevel: gitBlobSha(paths.level)
  },
  checks,
  coverage: {
    trainingTech: techs.length,
    trainingTechLevel: levels.length,
    protectedCanonicalNormalTier3GrowthTech: stage2.coverage.protectedNormalTier3GrowthResolvedUnique,
    nonProtectedTrainingTech: candidates.coverage.nonGrowthTech,
    structuralGroups: candidates.coverage.structuralGroupCount,
    representativeReviews: semantic.representativeReviews.length,
    representativeSourceBindingMismatchCount: sourceBindingMismatchCount,
    commonStatRepresentativeGroups: statReviews.length,
    commonStatStructurallyCoveredTech: semantic.coverage.commonStatStructurallyCoveredTech,
    commonPassiveRepresentativeGroups: passiveReviews.length,
    commonPassiveStructurallyCoveredTech: semantic.coverage.commonPassiveStructurallyCoveredTech,
    soldierSpecificProgressionRepresentativeGroups: progressionReviews.length,
    soldierSpecificProgressionStructurallyCoveredTech: semantic.coverage.soldierSpecificProgressionStructurallyCoveredTech
  },
  semanticClassificationPerformedForAll287: false,
  newlyAdmittedAutomaticWholeTechRules: [],
  rejectedExclusiveWholeTechLabels: ["PREREQUISITE_OR_UNLOCK"],
  relationFacetsConfirmed: ["PREREQUISITE", "SOLDIER_UNLOCK"],
  reviews: semantic.reviews,
  blockers: errors,
  hardErrorCount: errors.length,
  nextOwner: "TrainingTech Stage 4 Classification Contract",
  nextStartPoint: semantic.nextStartPoint,
  reopenConditions: semantic.reopenConditions
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
  console.log(JSON.stringify({ status: output.status, coverage: output.coverage }));
}
