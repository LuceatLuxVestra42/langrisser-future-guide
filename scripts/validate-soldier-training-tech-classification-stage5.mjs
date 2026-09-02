import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;

const paths = {
  stage1Census: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
  stage2Validation: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  stage3Candidates: "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json",
  stage3Semantic: "data/evidence/soldier-training-tech-classification-stage3-semantic.v1.json",
  stage3Validation: "data/validation/soldier-training-tech-classification-stage3.v1.json",
  stage4Contract: "data/contracts/soldier-training-tech-classification-stage4-contract.v1.json",
  stage4Validation: "data/validation/soldier-training-tech-classification-stage4.v1.json",
  frozenTrainingConsumer: "data/generated/soldier-detail-stage5-4.v1.json",
  classification: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  output: "data/validation/soldier-training-tech-classification-stage5.v1.json",
};

const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const gitBlobSha = (path) => {
  const bytes = readFileSync(resolve(root, path));
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
};

const stage1 = readJson(paths.stage1Census);
const stage2 = readJson(paths.stage2Validation);
const candidates = readJson(paths.stage3Candidates);
const semantic = readJson(paths.stage3Semantic);
const stage3 = readJson(paths.stage3Validation);
const contract = readJson(paths.stage4Contract);
const stage4 = readJson(paths.stage4Validation);
const soldierDetail = readJson(paths.frozenTrainingConsumer);
const classification = readJson(paths.classification);

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
  return Boolean(condition);
};
const checks = {};

checks.stage4ContractFrozen = check(contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE" && contract.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract is not frozen COMPLETE.");
checks.stage4ValidationPass = check(stage4.status === "PASS" && stage4.completion === "COMPLETE" && stage4.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 validation is not frozen PASS/COMPLETE.");
checks.stage1BlobMatch = check(gitBlobSha(paths.stage1Census) === contract.predecessors.stage1Census.gitBlobSha, "Stage 1 census blob mismatch.");
checks.stage2BlobMatch = check(gitBlobSha(paths.stage2Validation) === contract.predecessors.stage2Validation.gitBlobSha, "Stage 2 validation blob mismatch.");
checks.stage3CandidateBlobMatch = check(gitBlobSha(paths.stage3Candidates) === contract.predecessors.stage3CandidateEvidence.gitBlobSha, "Stage 3 candidate evidence blob mismatch.");
checks.stage3SemanticBlobMatch = check(gitBlobSha(paths.stage3Semantic) === contract.predecessors.stage3SemanticEvidence.gitBlobSha, "Stage 3 semantic evidence blob mismatch.");
checks.stage3ValidationBlobMatch = check(gitBlobSha(paths.stage3Validation) === contract.predecessors.stage3Validation.gitBlobSha, "Stage 3 validation blob mismatch.");
checks.frozenTrainingConsumerBlobMatch = check(gitBlobSha(paths.frozenTrainingConsumer) === contract.predecessors.frozenTrainingConsumer.gitBlobSha, "Frozen training consumer blob mismatch.");
checks.stage4ContractBlobBound = check(stage4.contract?.gitBlobSha === gitBlobSha(paths.stage4Contract), "Stage 4 validation does not bind the current contract blob.");
checks.stage1Population = check(stage1.status === "PASS" && stage1.records?.length === 287 && stage1.population?.trainingTech === 287, "Stage 1 census is not frozen at 287 records.");
checks.stage2Pass = check(stage2.status === "PASS" && stage2.completion === "COMPLETE", "Stage 2 validation is not PASS/COMPLETE.");
checks.stage3Pass = check(stage3.status === "PASS" && stage3.completion === "COMPLETE" && semantic.status === "PASS" && semantic.completion === "COMPLETE", "Stage 3 evidence is not PASS/COMPLETE.");
checks.stage4DryRunPass = check(stage4.coverage?.trainingTech === 287 && stage4.coverage?.ruleOverlapCount === 0 && stage4.coverage?.reviewUnclassifiedCount === 0, "Stage 4 dry-run is not the frozen 287/0/0 state.");

const stage1Records = stage1.records ?? [];
const stage1ById = new Map(stage1Records.map((record) => [record.id, record]));
const protectedGrowthTechIds = new Set(
  (soldierDetail.records ?? [])
    .filter((record) => record.identity?.tier === 3 && record.identity?.isSp === false && record.training?.techId != null)
    .map((record) => record.training.techId),
);
checks.protectedGrowthPopulation = check(protectedGrowthTechIds.size === 129, `Expected 129 protected growth Tech IDs, got ${protectedGrowthTechIds.size}.`);

const groupByTechId = new Map();
let duplicateCandidateMembership = 0;
for (const group of candidates.structuralGroups ?? []) {
  for (const techId of group.techIds ?? []) {
    if (groupByTechId.has(techId)) duplicateCandidateMembership += 1;
    groupByTechId.set(techId, group);
  }
}
checks.candidatePartition = check(groupByTechId.size === 158 && duplicateCandidateMembership === 0, `Stage 3 candidate partition is not unique 158/158; duplicates=${duplicateCandidateMembership}.`);
checks.fullFrozenPartition = check(stage1Records.every((record) => protectedGrowthTechIds.has(record.id) !== groupByTechId.has(record.id)), "Protected growth plus Stage 3 candidates do not partition all Stage 1 IDs exactly once.");

const reviewByTechId = new Map((semantic.representativeReviews ?? []).map((review) => [review.techId, review]));
const expectedRuleIdByLabel = {
  SOLDIER_GROWTH: "protected-normal-tier3-soldier-growth-v1",
  COMMON_STAT: "common-stat-techtype-v1",
  COMMON_PASSIVE: "common-passive-techtype-v1",
  SOLDIER_SPECIFIC_PROGRESSION: "nonprotected-soldier-specific-progression-v1",
  REVIEW_UNCLASSIFIED: null,
};
const expectedFor = (record) => {
  const id = record.id;
  const type = record.raw?.TechType;
  const group = groupByTechId.get(id) ?? null;
  const matches = [];
  if (protectedGrowthTechIds.has(id)) matches.push("SOLDIER_GROWTH");
  if (!protectedGrowthTechIds.has(id) && type === 1 && group?.signature?.techTypeRaw === 1) matches.push("COMMON_STAT");
  if (!protectedGrowthTechIds.has(id) && type === 3 && group?.signature?.techTypeRaw === 3) matches.push("COMMON_PASSIVE");
  if (!protectedGrowthTechIds.has(id) && type === 2 && group?.signature?.techTypeRaw === 2 && group?.signature?.relationShape === "SOLDIER_ONLY" && ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(group?.signature?.skillLevelupShape)) matches.push("SOLDIER_SPECIFIC_PROGRESSION");
  const label = matches.length === 1 ? matches[0] : "REVIEW_UNCLASSIFIED";
  return { label, ruleId: expectedRuleIdByLabel[label], matchCount: matches.length, group };
};

checks.classificationFrozen = check(classification.status === "PASS" && classification.completion === "COMPLETE" && classification.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 classification artifact is not frozen PASS/COMPLETE.");
checks.classificationSchema = check(classification.schemaId === "soldier-training-tech-classification-stage5/v1" && classification.version === 1, "Stage 5 classification schema/version mismatch.");
checks.classificationPredecessorBlobs = check(
  classification.predecessors?.stage1Census?.gitBlobSha === gitBlobSha(paths.stage1Census) &&
  classification.predecessors?.stage2Validation?.gitBlobSha === gitBlobSha(paths.stage2Validation) &&
  classification.predecessors?.stage3Candidates?.gitBlobSha === gitBlobSha(paths.stage3Candidates) &&
  classification.predecessors?.stage3Semantic?.gitBlobSha === gitBlobSha(paths.stage3Semantic) &&
  classification.predecessors?.stage3Validation?.gitBlobSha === gitBlobSha(paths.stage3Validation) &&
  classification.predecessors?.stage4Contract?.gitBlobSha === gitBlobSha(paths.stage4Contract) &&
  classification.predecessors?.stage4Validation?.gitBlobSha === gitBlobSha(paths.stage4Validation) &&
  classification.predecessors?.frozenTrainingConsumer?.gitBlobSha === gitBlobSha(paths.frozenTrainingConsumer),
  "Stage 5 predecessor blob binding mismatch.",
);
checks.policyBoundary = check(
  classification.policy?.classificationAuthority === "STAGE4_FROZEN_CONTRACT_ONLY" &&
  classification.policy?.descriptionsReadForClassification === false &&
  classification.policy?.namesReadForClassification === false &&
  classification.policy?.idArithmeticPerformed === false &&
  classification.policy?.nameJoinPerformed === false &&
  classification.policy?.sourceOrderUsedAsMeaning === false &&
  classification.policy?.prerequisiteUsedAsWholeTechCategory === false &&
  classification.policy?.soldierUnlockUsedAsWholeTechCategory === false &&
  classification.policy?.soldierUnlockValuesMaterializedInStage5 === false,
  "Stage 5 policy boundary permits forbidden inference or facet/category collapse.",
);

const actualRecords = classification.records ?? [];
const actualById = new Map(actualRecords.map((record) => [record.techId, record]));
checks.recordPopulation = check(actualRecords.length === 287 && actualById.size === 287, `Stage 5 record population/uniqueness is ${actualRecords.length}/${actualById.size}, expected 287/287.`);
checks.stage1CoverageExactlyOnce = check(stage1Records.every((record) => actualById.has(record.id)) && actualRecords.every((record) => stage1ById.has(record.techId)), "Stage 5 record IDs do not exactly cover the frozen Stage 1 population.");
checks.sourceOrderParity = check(actualRecords.every((record, index) => record.techId === stage1Records[index]?.id && record.sourceIndex === stage1Records[index]?.sourceIndex), "Stage 5 deterministic record order does not match Stage 1 source-index order.");

let perRecordMismatchCount = 0;
let prerequisiteMismatchCount = 0;
let unlockFacetMismatchCount = 0;
let evidenceMismatchCount = 0;
let protectedRelabelCount = 0;
let ruleOverlapCount = 0;
const fallbackIds = [];
for (const sourceRecord of stage1Records) {
  const actual = actualById.get(sourceRecord.id);
  if (!actual) continue;
  const expected = expectedFor(sourceRecord);
  if (expected.matchCount > 1) ruleOverlapCount += 1;
  if (expected.label === "REVIEW_UNCLASSIFIED") fallbackIds.push(sourceRecord.id);
  if (protectedGrowthTechIds.has(sourceRecord.id) && actual.label !== "SOLDIER_GROWTH") protectedRelabelCount += 1;
  if (
    actual.sourceIndex !== sourceRecord.sourceIndex ||
    actual.rawTechType !== sourceRecord.raw?.TechType ||
    actual.label !== expected.label ||
    actual.ruleId !== expected.ruleId ||
    actual.ruleMatchCount !== expected.matchCount
  ) perRecordMismatchCount += 1;

  const preTechIds = Array.isArray(sourceRecord.raw?.PreTechIDs) ? sourceRecord.raw.PreTechIDs : [];
  const preTechLevels = Array.isArray(sourceRecord.raw?.PreTechLevel) ? sourceRecord.raw.PreTechLevel : [];
  const prerequisite = actual.facets?.prerequisite;
  if (
    prerequisite?.model !== "ORTHOGONAL_RELATION_FACET" ||
    prerequisite?.classificationRole !== "NONE" ||
    prerequisite?.present !== (preTechIds.length > 0) ||
    JSON.stringify(prerequisite?.preTechIds ?? []) !== JSON.stringify(preTechIds) ||
    JSON.stringify(prerequisite?.preTechLevels ?? []) !== JSON.stringify(preTechLevels)
  ) prerequisiteMismatchCount += 1;

  const unlock = actual.facets?.soldierUnlock;
  if (
    unlock?.model !== "ORTHOGONAL_RELATION_FACET" ||
    unlock?.classificationRole !== "NONE" ||
    unlock?.materializedValues !== false ||
    JSON.stringify(unlock?.levelIds ?? []) !== JSON.stringify(sourceRecord.explicitLevelReferences ?? []) ||
    unlock?.stage3CandidateSignatureHasLevelUnlockField !== (expected.group?.signature?.hasLevelUnlockField ?? null)
  ) unlockFacetMismatchCount += 1;

  const stage1Evidence = actual.evidence?.stage1Record;
  const contractEvidence = actual.evidence?.stage4Contract;
  if (stage1Evidence?.path !== paths.stage1Census || stage1Evidence?.techId !== sourceRecord.id || stage1Evidence?.sourceIndex !== sourceRecord.sourceIndex || contractEvidence?.path !== paths.stage4Contract || contractEvidence?.ruleId !== expected.ruleId) {
    evidenceMismatchCount += 1;
    continue;
  }
  if (expected.label === "SOLDIER_GROWTH") {
    if (
      actual.evidence?.protectedGrowth?.path !== paths.frozenTrainingConsumer ||
      actual.evidence?.protectedGrowth?.stage2ValidationPath !== paths.stage2Validation ||
      actual.evidence?.protectedGrowth?.techId !== sourceRecord.id
    ) evidenceMismatchCount += 1;
  } else {
    const group = expected.group;
    const representativeReview = group ? reviewByTechId.get(group.representative?.techId) ?? null : null;
    if (
      actual.evidence?.stage3Representative?.candidatePath !== paths.stage3Candidates ||
      actual.evidence?.stage3Representative?.signatureKey !== group?.signatureKey ||
      actual.evidence?.stage3Representative?.representativeTechId !== (group?.representative?.techId ?? null) ||
      actual.evidence?.stage3Representative?.semanticPath !== paths.stage3Semantic ||
      actual.evidence?.stage3Representative?.semanticFinding !== (representativeReview?.semanticFinding ?? null)
    ) evidenceMismatchCount += 1;
  }
}
checks.perRecordClassificationParity = check(perRecordMismatchCount === 0, `Stage 5 per-record classification mismatches: ${perRecordMismatchCount}.`);
checks.prerequisiteFacetParity = check(prerequisiteMismatchCount === 0, `Stage 5 prerequisite facet mismatches: ${prerequisiteMismatchCount}.`);
checks.soldierUnlockFacetBoundary = check(unlockFacetMismatchCount === 0, `Stage 5 Soldier unlock facet boundary mismatches: ${unlockFacetMismatchCount}.`);
checks.recordEvidenceProvenance = check(evidenceMismatchCount === 0, `Stage 5 record evidence provenance mismatches: ${evidenceMismatchCount}.`);
checks.ruleOverlapZero = check(ruleOverlapCount === 0, `Stage 5 recomputed rule overlap count is ${ruleOverlapCount}.`);
checks.fallbackZero = check(fallbackIds.length === 0, `Stage 5 recomputed REVIEW_UNCLASSIFIED IDs: ${fallbackIds.join(",")}`);
checks.protectedGrowthNeverRelabeled = check(protectedRelabelCount === 0, `Stage 5 protected growth relabel count is ${protectedRelabelCount}.`);

const labelCounts = {
  SOLDIER_GROWTH: actualRecords.filter((record) => record.label === "SOLDIER_GROWTH").length,
  COMMON_STAT: actualRecords.filter((record) => record.label === "COMMON_STAT").length,
  COMMON_PASSIVE: actualRecords.filter((record) => record.label === "COMMON_PASSIVE").length,
  SOLDIER_SPECIFIC_PROGRESSION: actualRecords.filter((record) => record.label === "SOLDIER_SPECIFIC_PROGRESSION").length,
  REVIEW_UNCLASSIFIED: actualRecords.filter((record) => record.label === "REVIEW_UNCLASSIFIED").length,
};
checks.labelCountsMatchContract = check(
  Object.entries(labelCounts).every(([label, count]) => count === contract.wholeTechClassification.currentSnapshotExpectedCoverage?.[label]),
  `Stage 5 label counts do not match Stage 4 contract: ${JSON.stringify(labelCounts)}`,
);
checks.coverageSummaryMatches = check(
  classification.coverage?.trainingTech === 287 &&
  JSON.stringify(classification.coverage?.labelCounts) === JSON.stringify(labelCounts) &&
  classification.coverage?.ruleOverlapCount === 0 &&
  classification.coverage?.reviewUnclassifiedCount === 0 &&
  classification.coverage?.protectedGrowthRelabelCount === 0,
  "Stage 5 artifact coverage summary does not match independently recomputed coverage.",
);
checks.facetCatalogBoundary = check(
  classification.facetBoundary?.prerequisite?.model === "ORTHOGONAL_RELATION_FACET" &&
  classification.facetBoundary?.soldierUnlock?.model === "ORTHOGONAL_RELATION_FACET" &&
  classification.facetBoundary?.rejectedExclusiveWholeTechLabel === "PREREQUISITE_OR_UNLOCK",
  "Stage 5 facet catalog boundary drifted from Stage 4 contract.",
);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage5-validation/v1",
  stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: errors.length === 0 ? "PASS" : "FAIL",
  completion: errors.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: errors.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN" : "OPEN",
  validationMode: "INDEPENDENT_READ_ONLY_FROZEN_PREDECESSOR_RECORD_RECOMPUTATION",
  classification: { path: paths.classification, gitBlobSha: gitBlobSha(paths.classification) },
  predecessorBlobs: {
    stage1Census: gitBlobSha(paths.stage1Census),
    stage2Validation: gitBlobSha(paths.stage2Validation),
    stage3Candidates: gitBlobSha(paths.stage3Candidates),
    stage3Semantic: gitBlobSha(paths.stage3Semantic),
    stage3Validation: gitBlobSha(paths.stage3Validation),
    stage4Contract: gitBlobSha(paths.stage4Contract),
    stage4Validation: gitBlobSha(paths.stage4Validation),
    frozenTrainingConsumer: gitBlobSha(paths.frozenTrainingConsumer),
  },
  checks,
  coverage: {
    trainingTech: actualRecords.length,
    uniqueTechIds: actualById.size,
    labelCounts,
    perRecordMismatchCount,
    prerequisiteMismatchCount,
    unlockFacetMismatchCount,
    evidenceMismatchCount,
    ruleOverlapCount,
    reviewUnclassifiedCount: fallbackIds.length,
    protectedGrowthRelabelCount: protectedRelabelCount,
  },
  reviews: [],
  blockers: errors,
  hardErrorCount: errors.length,
  nextOwner: classification.nextOwner,
  nextStartPoint: classification.nextStartPoint,
  reopenConditions: classification.reopenConditions,
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
