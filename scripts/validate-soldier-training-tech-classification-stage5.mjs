import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;
const paths = {
  stage1: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
  stage2: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  stage3Candidates: "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json",
  stage3Semantic: "data/evidence/soldier-training-tech-classification-stage3-semantic.v1.json",
  stage3Validation: "data/validation/soldier-training-tech-classification-stage3.v1.json",
  stage4Contract: "data/contracts/soldier-training-tech-classification-stage4-contract.v1.json",
  stage4Validation: "data/validation/soldier-training-tech-classification-stage4.v1.json",
  trainingConsumer: "data/generated/soldier-detail-stage5-4.v1.json",
  classification: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  output: "data/validation/soldier-training-tech-classification-stage5.v1.json",
};
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blob = (p) => {
  const b = readFileSync(resolve(root, p));
  return createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
};
const stage1 = json(paths.stage1);
const stage2 = json(paths.stage2);
const candidates = json(paths.stage3Candidates);
const semantic = json(paths.stage3Semantic);
const stage3 = json(paths.stage3Validation);
const contract = json(paths.stage4Contract);
const stage4 = json(paths.stage4Validation);
const training = json(paths.trainingConsumer);
const artifact = json(paths.classification);
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); return Boolean(ok); };
const checks = {};

checks.stage4ContractFrozen = check(contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE" && contract.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract not frozen COMPLETE.");
checks.stage4ValidationPass = check(stage4.status === "PASS" && stage4.completion === "COMPLETE", "Stage 4 validation not PASS/COMPLETE.");
checks.stage1Population = check(stage1.status === "PASS" && stage1.records?.length === 287, "Stage 1 census not 287 PASS records.");
checks.stage2Pass = check(stage2.status === "PASS" && stage2.completion === "COMPLETE", "Stage 2 validation not PASS/COMPLETE.");
checks.stage3Pass = check(stage3.status === "PASS" && stage3.completion === "COMPLETE" && semantic.status === "PASS" && semantic.completion === "COMPLETE", "Stage 3 evidence not PASS/COMPLETE.");
checks.predecessorBlobs = check(
  blob(paths.stage1) === contract.predecessors.stage1Census.gitBlobSha &&
  blob(paths.stage2) === contract.predecessors.stage2Validation.gitBlobSha &&
  blob(paths.stage3Candidates) === contract.predecessors.stage3CandidateEvidence.gitBlobSha &&
  blob(paths.stage3Semantic) === contract.predecessors.stage3SemanticEvidence.gitBlobSha &&
  blob(paths.stage3Validation) === contract.predecessors.stage3Validation.gitBlobSha &&
  blob(paths.trainingConsumer) === contract.predecessors.frozenTrainingConsumer.gitBlobSha &&
  stage4.contract?.gitBlobSha === blob(paths.stage4Contract),
  "Frozen predecessor blob binding mismatch.",
);
checks.stage4DryRunPass = check(stage4.coverage?.trainingTech === 287 && stage4.coverage?.ruleOverlapCount === 0 && stage4.coverage?.reviewUnclassifiedCount === 0, "Stage 4 dry-run coverage drifted.");

const rows = stage1.records ?? [];
const byId = new Map(rows.map((r) => [r.id, r]));
const growth = new Set((training.records ?? []).filter((r) => r.identity?.tier === 3 && r.identity?.isSp === false && r.training?.techId != null).map((r) => r.training.techId));
checks.protectedGrowthPopulation = check(growth.size === 129, `Protected growth population ${growth.size}, expected 129.`);
const groups = candidates.structuralGroups ?? [];
const groupByTech = new Map();
const groupRefByTech = new Map();
let duplicateGroupMembership = 0;
for (const [index, g] of groups.entries()) {
  for (const id of g.techIds ?? []) {
    if (groupByTech.has(id)) duplicateGroupMembership += 1;
    groupByTech.set(id, g);
    groupRefByTech.set(id, `G${index + 1}`);
  }
}
checks.candidatePartition = check(groups.length === 15 && groupByTech.size === 158 && duplicateGroupMembership === 0, `Stage 3 partition mismatch: groups=${groups.length}, techs=${groupByTech.size}, duplicates=${duplicateGroupMembership}.`);
checks.fullFrozenPartition = check(rows.every((r) => growth.has(r.id) !== groupByTech.has(r.id)), "Protected growth and Stage 3 groups do not partition Stage 1 IDs exactly once.");

const classCatalogExpected = {
  GROWTH: { label: "SOLDIER_GROWTH", ruleId: "protected-normal-tier3-soldier-growth-v1" },
  STAT: { label: "COMMON_STAT", ruleId: "common-stat-techtype-v1" },
  PASSIVE: { label: "COMMON_PASSIVE", ruleId: "common-passive-techtype-v1" },
  PROGRESSION: { label: "SOLDIER_SPECIFIC_PROGRESSION", ruleId: "nonprotected-soldier-specific-progression-v1" },
};
const classForGroup = (g) => {
  if (g?.signature?.techTypeRaw === 1) return "STAT";
  if (g?.signature?.techTypeRaw === 3) return "PASSIVE";
  if (g?.signature?.techTypeRaw === 2 && g?.signature?.relationShape === "SOLDIER_ONLY" && ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(g?.signature?.skillLevelupShape)) return "PROGRESSION";
  return null;
};
checks.artifactFrozen = check(artifact.status === "PASS" && artifact.completion === "COMPLETE" && artifact.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 artifact not frozen PASS/COMPLETE.");
checks.artifactSchema = check(artifact.version === 1 && artifact.schemaId === "soldier-training-tech-classification-stage5/v1", "Stage 5 schema/version mismatch.");
checks.artifactPredecessors = check(
  artifact.predecessors?.stage1Census?.[1] === blob(paths.stage1) && artifact.predecessors?.stage1Census?.[0] === paths.stage1 &&
  artifact.predecessors?.stage2Validation?.[1] === blob(paths.stage2) &&
  artifact.predecessors?.stage3Candidates?.[1] === blob(paths.stage3Candidates) &&
  artifact.predecessors?.stage3Semantic?.[1] === blob(paths.stage3Semantic) &&
  artifact.predecessors?.stage3Validation?.[1] === blob(paths.stage3Validation) &&
  artifact.predecessors?.stage4Contract?.[1] === blob(paths.stage4Contract) &&
  artifact.predecessors?.stage4Validation?.[1] === blob(paths.stage4Validation) &&
  artifact.predecessors?.frozenTrainingConsumer?.[1] === blob(paths.trainingConsumer),
  "Stage 5 predecessor binding mismatch.",
);
checks.policyBoundary = check(
  artifact.policy?.classificationAuthority === "STAGE4_FROZEN_CONTRACT_ONLY" &&
  artifact.policy?.descriptionsReadForClassification === false && artifact.policy?.namesReadForClassification === false &&
  artifact.policy?.nameJoinPerformed === false && artifact.policy?.idArithmeticPerformed === false && artifact.policy?.sourceOrderUsedAsMeaning === false &&
  artifact.policy?.prerequisiteUsedAsWholeTechCategory === false && artifact.policy?.soldierUnlockUsedAsWholeTechCategory === false &&
  artifact.policy?.soldierUnlockValuesMaterializedInStage5 === false && artifact.policy?.historicalFallbackUsed === false,
  "Stage 5 policy boundary permits forbidden inference.",
);
checks.classCatalog = check(JSON.stringify(artifact.classCatalog) === JSON.stringify(classCatalogExpected), "Stage 5 class catalog mismatch.");
checks.recordColumns = check(JSON.stringify(artifact.recordColumns) === JSON.stringify(["sourceIndex", "techId", "rawTechType", "classCode", "evidenceRef", "prerequisitePresent", "candidateSignatureHasLevelUnlockField"]), "Stage 5 record columns mismatch.");
checks.facetBoundary = check(
  artifact.facetCatalog?.PREREQUISITE?.model === "ORTHOGONAL_RELATION_FACET" && artifact.facetCatalog?.PREREQUISITE?.sourcePath === paths.stage1 && artifact.facetCatalog?.PREREQUISITE?.classificationRole === "NONE" &&
  artifact.facetCatalog?.SOLDIER_UNLOCK?.model === "ORTHOGONAL_RELATION_FACET" && artifact.facetCatalog?.SOLDIER_UNLOCK?.levelReferenceSourcePath === paths.stage1 &&
  artifact.facetCatalog?.SOLDIER_UNLOCK?.levelSourceLogicalPath === contract.sourceSnapshots.trainingTechLevel.logicalPath && artifact.facetCatalog?.SOLDIER_UNLOCK?.materializedValues === false && artifact.facetCatalog?.SOLDIER_UNLOCK?.classificationRole === "NONE" &&
  artifact.facetCatalog?.rejectedExclusiveWholeTechLabel === "PREREQUISITE_OR_UNLOCK",
  "Stage 5 facet boundary drifted.",
);

const reviewByTech = new Map((semantic.representativeReviews ?? []).map((r) => [r.techId, r]));
const evidence = artifact.evidenceCatalog ?? {};
checks.evidenceCatalogSize = check(Object.keys(evidence).length === 16, `Evidence catalog size ${Object.keys(evidence).length}, expected 16.`);
checks.protectedEvidence = check(
  evidence.PG?.classCode === "GROWTH" && JSON.stringify(evidence.PG?.sources ?? []) === JSON.stringify([paths.stage1, paths.stage2, paths.trainingConsumer, paths.stage4Contract]),
  "Protected growth evidence catalog mismatch.",
);
let groupEvidenceMismatchCount = 0;
for (const [index, g] of groups.entries()) {
  const e = evidence[`G${index + 1}`];
  const rep = g.representative?.techId ?? null;
  if (e?.classCode !== classForGroup(g) || e?.signatureKey !== g.signatureKey || e?.representativeTechId !== rep || e?.semanticFinding !== (reviewByTech.get(rep)?.semanticFinding ?? null) || JSON.stringify(e?.sources ?? []) !== JSON.stringify([paths.stage3Candidates, paths.stage3Semantic, paths.stage4Contract])) groupEvidenceMismatchCount += 1;
}
checks.groupEvidenceCatalog = check(groupEvidenceMismatchCount === 0, `Stage 3 evidence catalog mismatches: ${groupEvidenceMismatchCount}.`);

const matrix = artifact.records ?? [];
const matrixById = new Map(matrix.map((r) => [r?.[1], r]));
checks.recordPopulation = check(matrix.length === 287 && matrixById.size === 287, `Stage 5 record population/uniqueness ${matrix.length}/${matrixById.size}.`);
checks.stage1Coverage = check(rows.every((r) => matrixById.has(r.id)) && matrix.every((r) => byId.has(r?.[1])), "Stage 5 records do not exactly cover Stage 1 IDs.");
checks.sourceOrderParity = check(matrix.every((r, i) => r?.[0] === rows[i]?.sourceIndex && r?.[1] === rows[i]?.id), "Stage 5 matrix order does not match Stage 1 source order.");

let perRecordMismatchCount = 0;
let prerequisiteFacetMismatchCount = 0;
let unlockFacetMismatchCount = 0;
let evidenceRefMismatchCount = 0;
let overlap = 0;
let protectedRelabelCount = 0;
const labelCounts = { SOLDIER_GROWTH: 0, COMMON_STAT: 0, COMMON_PASSIVE: 0, SOLDIER_SPECIFIC_PROGRESSION: 0, REVIEW_UNCLASSIFIED: 0 };
for (const source of rows) {
  const actual = matrixById.get(source.id);
  if (!actual) continue;
  const group = groupByTech.get(source.id) ?? null;
  const matches = [];
  if (growth.has(source.id)) matches.push("GROWTH");
  if (!growth.has(source.id) && source.raw?.TechType === 1 && classForGroup(group) === "STAT") matches.push("STAT");
  if (!growth.has(source.id) && source.raw?.TechType === 3 && classForGroup(group) === "PASSIVE") matches.push("PASSIVE");
  if (!growth.has(source.id) && source.raw?.TechType === 2 && classForGroup(group) === "PROGRESSION") matches.push("PROGRESSION");
  if (matches.length > 1) overlap += 1;
  const expectedCode = matches.length === 1 ? matches[0] : null;
  if (expectedCode) labelCounts[classCatalogExpected[expectedCode].label] += 1; else labelCounts.REVIEW_UNCLASSIFIED += 1;
  const expectedEvidence = expectedCode === "GROWTH" ? "PG" : groupRefByTech.get(source.id);
  const prePresent = Array.isArray(source.raw?.PreTechIDs) && source.raw.PreTechIDs.length > 0;
  const unlockSignature = group?.signature?.hasLevelUnlockField ?? null;
  if (actual?.[0] !== source.sourceIndex || actual?.[1] !== source.id || actual?.[2] !== (source.raw?.TechType ?? null) || actual?.[3] !== expectedCode) perRecordMismatchCount += 1;
  if (actual?.[4] !== expectedEvidence || !evidence[actual?.[4]]) evidenceRefMismatchCount += 1;
  if (actual?.[5] !== prePresent) prerequisiteFacetMismatchCount += 1;
  if (actual?.[6] !== unlockSignature) unlockFacetMismatchCount += 1;
  if (growth.has(source.id) && actual?.[3] !== "GROWTH") protectedRelabelCount += 1;
}
checks.perRecordClassificationParity = check(perRecordMismatchCount === 0, `Per-record classification mismatches: ${perRecordMismatchCount}.`);
checks.recordEvidenceProvenance = check(evidenceRefMismatchCount === 0, `Record evidence mismatches: ${evidenceRefMismatchCount}.`);
checks.prerequisiteFacetParity = check(prerequisiteFacetMismatchCount === 0, `Prerequisite facet mismatches: ${prerequisiteFacetMismatchCount}.`);
checks.soldierUnlockFacetBoundary = check(unlockFacetMismatchCount === 0, `Soldier unlock facet mismatches: ${unlockFacetMismatchCount}.`);
checks.ruleOverlapZero = check(overlap === 0, `Rule overlap count: ${overlap}.`);
checks.fallbackZero = check(labelCounts.REVIEW_UNCLASSIFIED === 0, `REVIEW_UNCLASSIFIED count: ${labelCounts.REVIEW_UNCLASSIFIED}.`);
checks.protectedGrowthNeverRelabeled = check(protectedRelabelCount === 0, `Protected growth relabel count: ${protectedRelabelCount}.`);
checks.labelCounts = check(Object.entries(labelCounts).every(([label, n]) => n === contract.wholeTechClassification.currentSnapshotExpectedCoverage?.[label]), `Label counts mismatch: ${JSON.stringify(labelCounts)}`);
checks.coverageSummary = check(
  artifact.coverage?.trainingTech === 287 && JSON.stringify(artifact.coverage?.labelCounts) === JSON.stringify(labelCounts) && artifact.coverage?.ruleOverlapCount === 0 && artifact.coverage?.reviewUnclassifiedCount === 0 && artifact.coverage?.protectedGrowthRelabelCount === 0,
  "Stage 5 coverage summary mismatch.",
);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage5-validation/v1",
  stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: errors.length === 0 ? "PASS" : "FAIL",
  completion: errors.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: errors.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN" : "OPEN",
  validationMode: "INDEPENDENT_READ_ONLY_FROZEN_PREDECESSOR_RECORD_RECOMPUTATION",
  classification: [paths.classification, blob(paths.classification)],
  predecessorBlobs: {
    stage1Census: blob(paths.stage1), stage2Validation: blob(paths.stage2), stage3Candidates: blob(paths.stage3Candidates), stage3Semantic: blob(paths.stage3Semantic), stage3Validation: blob(paths.stage3Validation), stage4Contract: blob(paths.stage4Contract), stage4Validation: blob(paths.stage4Validation), frozenTrainingConsumer: blob(paths.trainingConsumer),
  },
  checks,
  coverage: { trainingTech: matrix.length, uniqueTechIds: matrixById.size, labelCounts, perRecordMismatchCount, prerequisiteFacetMismatchCount, unlockFacetMismatchCount, evidenceRefMismatchCount, groupEvidenceMismatchCount, ruleOverlapCount: overlap, reviewUnclassifiedCount: labelCounts.REVIEW_UNCLASSIFIED, protectedGrowthRelabelCount },
  reviews: [], blockers: errors, hardErrorCount: errors.length,
  nextOwner: artifact.nextOwner, nextStartPoint: artifact.nextStartPoint, reopenConditions: artifact.reopenConditions,
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (writeMode) { writeFileSync(resolve(root, paths.output), serialized); console.log(`Wrote ${paths.output}`); }
if (checkMode) {
  if (errors.length) { console.error(JSON.stringify(output, null, 2)); process.exit(1); }
  if (text(paths.output) !== serialized) { console.error(`${paths.output} is stale. Run with --write.`); process.exit(1); }
  console.log(JSON.stringify({ status: output.status, coverage: output.coverage }));
}
