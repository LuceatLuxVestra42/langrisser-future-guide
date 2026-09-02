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
  output: "data/generated/soldier-training-tech-classification-stage5.v1.json",
};

const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const gitBlobSha = (path) => {
  const bytes = readFileSync(resolve(root, path));
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const stage1 = readJson(paths.stage1Census);
const stage2 = readJson(paths.stage2Validation);
const candidates = readJson(paths.stage3Candidates);
const semantic = readJson(paths.stage3Semantic);
const stage3 = readJson(paths.stage3Validation);
const contract = readJson(paths.stage4Contract);
const stage4 = readJson(paths.stage4Validation);
const soldierDetail = readJson(paths.frozenTrainingConsumer);

assert(contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE" && contract.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract is not frozen COMPLETE.");
assert(stage4.status === "PASS" && stage4.completion === "COMPLETE" && stage4.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 validation is not frozen PASS/COMPLETE.");
assert(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.records?.length === 287, "Stage 1 census is not frozen at 287 records.");
assert(stage2.status === "PASS" && stage2.completion === "COMPLETE", "Stage 2 validation is not frozen PASS/COMPLETE.");
assert(stage3.status === "PASS" && stage3.completion === "COMPLETE" && semantic.status === "PASS" && semantic.completion === "COMPLETE", "Stage 3 evidence is not frozen PASS/COMPLETE.");
assert(gitBlobSha(paths.stage1Census) === contract.predecessors.stage1Census.gitBlobSha, "Stage 1 census blob mismatch against Stage 4 contract.");
assert(gitBlobSha(paths.stage2Validation) === contract.predecessors.stage2Validation.gitBlobSha, "Stage 2 validation blob mismatch against Stage 4 contract.");
assert(gitBlobSha(paths.stage3Candidates) === contract.predecessors.stage3CandidateEvidence.gitBlobSha, "Stage 3 candidate blob mismatch against Stage 4 contract.");
assert(gitBlobSha(paths.stage3Semantic) === contract.predecessors.stage3SemanticEvidence.gitBlobSha, "Stage 3 semantic blob mismatch against Stage 4 contract.");
assert(gitBlobSha(paths.stage3Validation) === contract.predecessors.stage3Validation.gitBlobSha, "Stage 3 validation blob mismatch against Stage 4 contract.");
assert(gitBlobSha(paths.frozenTrainingConsumer) === contract.predecessors.frozenTrainingConsumer.gitBlobSha, "Frozen training consumer blob mismatch against Stage 4 contract.");
assert(stage4.contract?.gitBlobSha === gitBlobSha(paths.stage4Contract), "Stage 4 validation does not bind the current Stage 4 contract blob.");
assert(stage4.coverage?.trainingTech === 287 && stage4.coverage?.reviewUnclassifiedCount === 0 && stage4.coverage?.ruleOverlapCount === 0, "Stage 4 validation coverage is not the frozen 287/0/0 state.");

const stage1Records = stage1.records ?? [];
const stage1Ids = stage1Records.map((record) => record.id);
assert(new Set(stage1Ids).size === 287, "Stage 1 TrainingTech IDs are not unique 287/287.");

const protectedGrowthTechIds = new Set(
  (soldierDetail.records ?? [])
    .filter((record) => record.identity?.tier === 3 && record.identity?.isSp === false && record.training?.techId != null)
    .map((record) => record.training.techId),
);
assert(protectedGrowthTechIds.size === 129, `Expected 129 protected growth Tech IDs, got ${protectedGrowthTechIds.size}.`);

const structuralGroups = candidates.structuralGroups ?? [];
const groupByTechId = new Map();
const groupRefByTechId = new Map();
for (const [index, group] of structuralGroups.entries()) {
  const ref = `STAGE3_GROUP_${index + 1}`;
  for (const techId of group.techIds ?? []) {
    assert(!groupByTechId.has(techId), `Stage 3 candidate Tech ${techId} belongs to more than one structural group.`);
    groupByTechId.set(techId, group);
    groupRefByTechId.set(techId, ref);
  }
}
assert(groupByTechId.size === 158, `Expected 158 non-protected candidate Tech IDs, got ${groupByTechId.size}.`);
for (const id of stage1Ids) {
  assert(protectedGrowthTechIds.has(id) !== groupByTechId.has(id), `Tech ${id} is not in exactly one frozen Stage 4 partition.`);
}

const reviewByTechId = new Map((semantic.representativeReviews ?? []).map((review) => [review.techId, review]));
const ruleIdByLabel = {
  SOLDIER_GROWTH: "protected-normal-tier3-soldier-growth-v1",
  COMMON_STAT: "common-stat-techtype-v1",
  COMMON_PASSIVE: "common-passive-techtype-v1",
  SOLDIER_SPECIFIC_PROGRESSION: "nonprotected-soldier-specific-progression-v1",
  REVIEW_UNCLASSIFIED: null,
};
const labelForGroup = (group) => {
  if (group?.signature?.techTypeRaw === 1) return "COMMON_STAT";
  if (group?.signature?.techTypeRaw === 3) return "COMMON_PASSIVE";
  if (group?.signature?.techTypeRaw === 2 && group?.signature?.relationShape === "SOLDIER_ONLY" && ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(group?.signature?.skillLevelupShape)) return "SOLDIER_SPECIFIC_PROGRESSION";
  return "REVIEW_UNCLASSIFIED";
};
const classify = (record) => {
  const id = record.id;
  const type = record.raw?.TechType;
  const group = groupByTechId.get(id) ?? null;
  const matches = [];
  if (protectedGrowthTechIds.has(id)) matches.push("SOLDIER_GROWTH");
  if (!protectedGrowthTechIds.has(id) && type === 1 && labelForGroup(group) === "COMMON_STAT") matches.push("COMMON_STAT");
  if (!protectedGrowthTechIds.has(id) && type === 3 && labelForGroup(group) === "COMMON_PASSIVE") matches.push("COMMON_PASSIVE");
  if (!protectedGrowthTechIds.has(id) && type === 2 && labelForGroup(group) === "SOLDIER_SPECIFIC_PROGRESSION") matches.push("SOLDIER_SPECIFIC_PROGRESSION");
  return { label: matches.length === 1 ? matches[0] : "REVIEW_UNCLASSIFIED", matchCount: matches.length, group };
};

const evidenceCatalog = [
  {
    ref: "PROTECTED_GROWTH",
    label: "SOLDIER_GROWTH",
    ruleId: ruleIdByLabel.SOLDIER_GROWTH,
    sources: [paths.stage1Census, paths.stage2Validation, paths.frozenTrainingConsumer, paths.stage4Contract],
  },
  ...structuralGroups.map((group, index) => {
    const label = labelForGroup(group);
    const representativeReview = reviewByTechId.get(group.representative?.techId) ?? null;
    return {
      ref: `STAGE3_GROUP_${index + 1}`,
      label,
      ruleId: ruleIdByLabel[label],
      candidatePath: paths.stage3Candidates,
      signatureKey: group.signatureKey,
      representativeTechId: group.representative?.techId ?? null,
      semanticPath: paths.stage3Semantic,
      semanticFinding: representativeReview?.semanticFinding ?? null,
      stage4ContractPath: paths.stage4Contract,
    };
  }),
];
assert(evidenceCatalog.length === 16, `Expected 16 evidence catalog entries, got ${evidenceCatalog.length}.`);

const records = stage1Records.map((record) => {
  const { label, matchCount, group } = classify(record);
  const preTechIds = Array.isArray(record.raw?.PreTechIDs) ? record.raw.PreTechIDs : [];
  const preTechLevels = Array.isArray(record.raw?.PreTechLevel) ? record.raw.PreTechLevel : [];
  assert(preTechIds.length === preTechLevels.length, `Tech ${record.id} prerequisite cardinality mismatch in frozen Stage 1 census.`);
  return {
    sourceIndex: record.sourceIndex,
    techId: record.id,
    rawTechType: record.raw?.TechType ?? null,
    label,
    ruleId: ruleIdByLabel[label],
    ruleMatchCount: matchCount,
    evidenceRef: label === "SOLDIER_GROWTH" ? "PROTECTED_GROWTH" : (groupRefByTechId.get(record.id) ?? null),
    prerequisiteFacetRef: "PREREQUISITE",
    prerequisitePresent: preTechIds.length > 0,
    soldierUnlockFacetRef: "SOLDIER_UNLOCK",
    candidateSignatureHasLevelUnlockField: group?.signature?.hasLevelUnlockField ?? null,
  };
});

const count = (label) => records.filter((record) => record.label === label).length;
const labelCounts = {
  SOLDIER_GROWTH: count("SOLDIER_GROWTH"),
  COMMON_STAT: count("COMMON_STAT"),
  COMMON_PASSIVE: count("COMMON_PASSIVE"),
  SOLDIER_SPECIFIC_PROGRESSION: count("SOLDIER_SPECIFIC_PROGRESSION"),
  REVIEW_UNCLASSIFIED: count("REVIEW_UNCLASSIFIED"),
};
const overlapCount = records.filter((record) => record.ruleMatchCount > 1).length;
const fallbackIds = records.filter((record) => record.label === "REVIEW_UNCLASSIFIED").map((record) => record.techId);
for (const [label, actual] of Object.entries(labelCounts)) {
  assert(actual === contract.wholeTechClassification.currentSnapshotExpectedCoverage?.[label], `Stage 5 ${label} count ${actual} does not match the Stage 4 contract.`);
}
assert(records.length === 287, `Expected 287 Stage 5 records, got ${records.length}.`);
assert(overlapCount === 0, `Stage 5 rule overlap count is ${overlapCount}.`);
assert(fallbackIds.length === 0, `Stage 5 REVIEW_UNCLASSIFIED IDs: ${fallbackIds.join(",")}`);
assert(records.every((record) => record.evidenceRef != null), "A Stage 5 record has no evidenceRef.");

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage5/v1",
  stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN",
  purpose: "Materialize the Stage 4 frozen classification contract as an explicit record-by-record classification for all 287 TrainingTech records without re-reading descriptions or introducing new semantic inference.",
  predecessors: {
    stage1Census: { path: paths.stage1Census, gitBlobSha: gitBlobSha(paths.stage1Census) },
    stage2Validation: { path: paths.stage2Validation, gitBlobSha: gitBlobSha(paths.stage2Validation) },
    stage3Candidates: { path: paths.stage3Candidates, gitBlobSha: gitBlobSha(paths.stage3Candidates) },
    stage3Semantic: { path: paths.stage3Semantic, gitBlobSha: gitBlobSha(paths.stage3Semantic) },
    stage3Validation: { path: paths.stage3Validation, gitBlobSha: gitBlobSha(paths.stage3Validation) },
    stage4Contract: { path: paths.stage4Contract, gitBlobSha: gitBlobSha(paths.stage4Contract) },
    stage4Validation: { path: paths.stage4Validation, gitBlobSha: gitBlobSha(paths.stage4Validation) },
    frozenTrainingConsumer: { path: paths.frozenTrainingConsumer, gitBlobSha: gitBlobSha(paths.frozenTrainingConsumer) },
  },
  sourceSnapshots: contract.sourceSnapshots,
  policy: {
    classificationAuthority: "STAGE4_FROZEN_CONTRACT_ONLY",
    descriptionsReadForClassification: false,
    namesReadForClassification: false,
    idArithmeticPerformed: false,
    nameJoinPerformed: false,
    sourceOrderUsedAsMeaning: false,
    sourceOrderRole: "deterministic record order inherited from Stage 1 census only",
    prerequisiteUsedAsWholeTechCategory: false,
    soldierUnlockUsedAsWholeTechCategory: false,
    soldierUnlockValuesMaterializedInStage5: false,
    historicalFallbackUsed: false,
  },
  coverage: {
    trainingTech: records.length,
    labelCounts,
    ruleOverlapCount: overlapCount,
    reviewUnclassifiedCount: fallbackIds.length,
    protectedGrowthRelabelCount: records.filter((record) => protectedGrowthTechIds.has(record.techId) && record.label !== "SOLDIER_GROWTH").length,
  },
  ruleCatalog: (contract.wholeTechClassification.rules ?? []).map((rule) => ({ id: rule.id, label: rule.label, status: rule.status })),
  evidenceCatalog,
  facetCatalog: {
    PREREQUISITE: {
      model: "ORTHOGONAL_RELATION_FACET",
      sourcePath: paths.stage1Census,
      sourceFields: ["TrainingTechInfo.PreTechIDs", "TrainingTechInfo.PreTechLevel"],
      recordProjection: "present-only; exact values remain in the frozen Stage 1 record",
      classificationRole: "NONE",
    },
    SOLDIER_UNLOCK: {
      model: "ORTHOGONAL_RELATION_FACET",
      levelReferenceSourcePath: paths.stage1Census,
      levelSourceLogicalPath: contract.sourceSnapshots.trainingTechLevel.logicalPath,
      sourceField: "TrainingTechLevelInfo.SoldierIDUnlocked",
      materializedValues: false,
      candidateSignaturePresenceProjected: true,
      classificationRole: "NONE",
    },
    rejectedExclusiveWholeTechLabel: contract.relationFacets.rejectedExclusiveLabel,
  },
  fallback: contract.wholeTechClassification.fallback,
  records,
  blockers: [],
  reviews: [],
  nextOwner: "UNASSIGNED_AFTER_STAGE5",
  nextStartPoint: "Choose one downstream owner from the Stage 4 non-scope (effect extraction, localization/presentation, or frontend consumption) and open only that scope. Reuse this frozen 287-record classification; do not reclassify from names/descriptions.",
  reopenConditions: contract.reopenConditions,
};

const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) {
  writeFileSync(resolve(root, paths.output), serialized);
  console.log(`Wrote ${paths.output}`);
}
if (checkMode) {
  const existing = readText(paths.output);
  if (existing !== serialized) {
    console.error(`${paths.output} is stale. Run with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: output.status, coverage: output.coverage }));
}
