import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;
const P = {
  s1: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
  s2: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  c3: "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json",
  e3: "data/evidence/soldier-training-tech-classification-stage3-semantic.v1.json",
  v3: "data/validation/soldier-training-tech-classification-stage3.v1.json",
  c4: "data/contracts/soldier-training-tech-classification-stage4-contract.v1.json",
  v4: "data/validation/soldier-training-tech-classification-stage4.v1.json",
  training: "data/generated/soldier-detail-stage5-4.v1.json",
  artifact: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  out: "data/validation/soldier-training-tech-classification-stage5.v1.json",
};
const read = (p) => readFileSync(resolve(root, p), "utf8");
const J = (p) => JSON.parse(read(p));
const sha = (p) => { const b = readFileSync(resolve(root, p)); return createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex"); };
const s1 = J(P.s1), s2 = J(P.s2), c3 = J(P.c3), e3 = J(P.e3), v3 = J(P.v3), c4 = J(P.c4), v4 = J(P.v4), training = J(P.training), artifact = J(P.artifact);
const errors = [], checks = {};
const ck = (name, ok, msg) => { checks[name] = Boolean(ok); if (!ok) errors.push(msg); };

ck("stage4Frozen", c4.status === "DESIGN_FROZEN" && c4.completion === "COMPLETE" && c4.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract not frozen COMPLETE.");
ck("stage4ValidationPass", v4.status === "PASS" && v4.completion === "COMPLETE" && v4.coverage?.trainingTech === 287 && v4.coverage?.ruleOverlapCount === 0 && v4.coverage?.reviewUnclassifiedCount === 0, "Stage 4 validation drifted.");
ck("predecessorStatus", s1.status === "PASS" && s1.records?.length === 287 && s2.status === "PASS" && s2.completion === "COMPLETE" && v3.status === "PASS" && v3.completion === "COMPLETE" && e3.status === "PASS" && e3.completion === "COMPLETE", "Frozen predecessor status mismatch.");
ck("predecessorBlobs", sha(P.s1) === c4.predecessors.stage1Census.gitBlobSha && sha(P.s2) === c4.predecessors.stage2Validation.gitBlobSha && sha(P.c3) === c4.predecessors.stage3CandidateEvidence.gitBlobSha && sha(P.e3) === c4.predecessors.stage3SemanticEvidence.gitBlobSha && sha(P.v3) === c4.predecessors.stage3Validation.gitBlobSha && sha(P.training) === c4.predecessors.frozenTrainingConsumer.gitBlobSha && v4.contract?.gitBlobSha === sha(P.c4), "Frozen predecessor blob mismatch.");

const rows = s1.records ?? [], stage1Ids = rows.map((r) => r.id), stage1Set = new Set(stage1Ids);
const growth = new Set((training.records ?? []).filter((r) => r.identity?.tier === 3 && r.identity?.isSp === false && r.training?.techId != null).map((r) => r.training.techId));
ck("protectedGrowthPopulation", growth.size === 129, `Protected growth population ${growth.size}, expected 129.`);
const groups = c3.structuralGroups ?? [], groupById = new Map();
let duplicateGroupMembership = 0;
for (const g of groups) for (const id of g.techIds ?? []) { if (groupById.has(id)) duplicateGroupMembership++; groupById.set(id, g); }
ck("candidatePartition", groups.length === 15 && groupById.size === 158 && duplicateGroupMembership === 0, `Stage 3 partition mismatch: ${groups.length}/${groupById.size}/${duplicateGroupMembership}.`);
ck("fullFrozenPartition", rows.every((r) => growth.has(r.id) !== groupById.has(r.id)), "Protected growth plus Stage 3 candidates do not partition Stage 1 IDs exactly once.");

const classCatalog = {
  SOLDIER_GROWTH: { ruleId: "protected-normal-tier3-soldier-growth-v1" },
  COMMON_STAT: { ruleId: "common-stat-techtype-v1" },
  COMMON_PASSIVE: { ruleId: "common-passive-techtype-v1" },
  SOLDIER_SPECIFIC_PROGRESSION: { ruleId: "nonprotected-soldier-specific-progression-v1" },
};
const labelOfGroup = (g) => g?.signature?.techTypeRaw === 1 ? "COMMON_STAT" : g?.signature?.techTypeRaw === 3 ? "COMMON_PASSIVE" : (g?.signature?.techTypeRaw === 2 && g?.signature?.relationShape === "SOLDIER_ONLY" && ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(g?.signature?.skillLevelupShape)) ? "SOLDIER_SPECIFIC_PROGRESSION" : null;
const expected = { SOLDIER_GROWTH: [], COMMON_STAT: [], COMMON_PASSIVE: [], SOLDIER_SPECIFIC_PROGRESSION: [], REVIEW_UNCLASSIFIED: [] };
let ruleOverlapCount = 0;
for (const r of rows) {
  const g = groupById.get(r.id) ?? null, m = [];
  if (growth.has(r.id)) m.push("SOLDIER_GROWTH");
  if (!growth.has(r.id) && r.raw?.TechType === 1 && labelOfGroup(g) === "COMMON_STAT") m.push("COMMON_STAT");
  if (!growth.has(r.id) && r.raw?.TechType === 3 && labelOfGroup(g) === "COMMON_PASSIVE") m.push("COMMON_PASSIVE");
  if (!growth.has(r.id) && r.raw?.TechType === 2 && labelOfGroup(g) === "SOLDIER_SPECIFIC_PROGRESSION") m.push("SOLDIER_SPECIFIC_PROGRESSION");
  if (m.length > 1) ruleOverlapCount++;
  expected[m.length === 1 ? m[0] : "REVIEW_UNCLASSIFIED"].push(r.id);
}

ck("artifactFrozen", artifact.status === "PASS" && artifact.completion === "COMPLETE" && artifact.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 artifact not frozen PASS/COMPLETE.");
ck("artifactSchema", artifact.version === 1 && artifact.schemaId === "soldier-training-tech-classification-stage5/v1", "Stage 5 schema/version mismatch.");
ck("artifactPredecessors", artifact.predecessors?.stage1Census?.[0] === P.s1 && artifact.predecessors?.stage1Census?.[1] === sha(P.s1) && artifact.predecessors?.stage2Validation?.[1] === sha(P.s2) && artifact.predecessors?.stage3Candidates?.[1] === sha(P.c3) && artifact.predecessors?.stage3Semantic?.[1] === sha(P.e3) && artifact.predecessors?.stage3Validation?.[1] === sha(P.v3) && artifact.predecessors?.stage4Contract?.[1] === sha(P.c4) && artifact.predecessors?.stage4Validation?.[1] === sha(P.v4) && artifact.predecessors?.frozenTrainingConsumer?.[1] === sha(P.training), "Stage 5 predecessor binding mismatch.");
ck("policyBoundary", artifact.policy?.classificationAuthority === "STAGE4_FROZEN_CONTRACT_ONLY" && artifact.policy?.descriptionsReadForClassification === false && artifact.policy?.namesReadForClassification === false && artifact.policy?.nameJoinPerformed === false && artifact.policy?.idArithmeticPerformed === false && artifact.policy?.sourceOrderUsedAsMeaning === false && artifact.policy?.prerequisiteUsedAsWholeTechCategory === false && artifact.policy?.soldierUnlockUsedAsWholeTechCategory === false && artifact.policy?.soldierUnlockValuesMaterializedInStage5 === false && artifact.policy?.historicalFallbackUsed === false, "Stage 5 forbidden-inference boundary drifted.");
ck("classCatalog", JSON.stringify(artifact.classCatalog) === JSON.stringify(classCatalog), "Stage 5 class catalog mismatch.");

const actual = artifact.classificationByLabel ?? {};
let classificationMismatchCount = 0;
for (const label of Object.keys(expected)) if (JSON.stringify(actual[label] ?? []) !== JSON.stringify(expected[label])) classificationMismatchCount++;
const actualAll = Object.values(actual).flatMap((ids) => Array.isArray(ids) ? ids : []);
ck("classificationByLabel", classificationMismatchCount === 0, `Classification label-set mismatches: ${classificationMismatchCount}.`);
ck("recordCoverageExactlyOnce", actualAll.length === 287 && new Set(actualAll).size === 287 && actualAll.every((id) => stage1Set.has(id)), `Classification coverage/uniqueness ${actualAll.length}/${new Set(actualAll).size}.`);
ck("ruleOverlapZero", ruleOverlapCount === 0, `Rule overlap count: ${ruleOverlapCount}.`);
ck("fallbackZero", expected.REVIEW_UNCLASSIFIED.length === 0, `REVIEW_UNCLASSIFIED count: ${expected.REVIEW_UNCLASSIFIED.length}.`);
const protectedGrowthRelabelCount = expected.SOLDIER_GROWTH.filter((id) => !growth.has(id)).length + [...growth].filter((id) => !expected.SOLDIER_GROWTH.includes(id)).length;
ck("protectedGrowthNeverRelabeled", protectedGrowthRelabelCount === 0, `Protected growth relabel count: ${protectedGrowthRelabelCount}.`);

const reviewByTech = new Map((e3.representativeReviews ?? []).map((r) => [r.techId, r])), evidence = artifact.evidenceCatalog ?? {};
ck("evidenceCatalogSize", Object.keys(evidence).length === 16, `Evidence catalog size ${Object.keys(evidence).length}, expected 16.`);
ck("protectedEvidence", evidence.PROTECTED_GROWTH?.label === "SOLDIER_GROWTH" && JSON.stringify(evidence.PROTECTED_GROWTH?.techIds ?? []) === JSON.stringify(expected.SOLDIER_GROWTH) && JSON.stringify(evidence.PROTECTED_GROWTH?.sources ?? []) === JSON.stringify([P.s1, P.s2, P.training, P.c4]), "Protected growth evidence mismatch.");
let groupEvidenceMismatchCount = 0;
for (const [i, g] of groups.entries()) {
  const e = evidence[`STAGE3_GROUP_${i + 1}`], rep = g.representative?.techId ?? null;
  if (e?.label !== labelOfGroup(g) || JSON.stringify(e?.techIds ?? []) !== JSON.stringify(g.techIds ?? []) || e?.signatureKey !== g.signatureKey || e?.representativeTechId !== rep || e?.semanticFinding !== (reviewByTech.get(rep)?.semanticFinding ?? null) || JSON.stringify(e?.sources ?? []) !== JSON.stringify([P.c3, P.e3, P.c4])) groupEvidenceMismatchCount++;
}
ck("groupEvidenceCatalog", groupEvidenceMismatchCount === 0, `Group evidence mismatches: ${groupEvidenceMismatchCount}.`);
const evidenceIds = Object.values(evidence).flatMap((e) => e?.techIds ?? []);
const evidenceRefMismatchCount = evidenceIds.length === 287 && new Set(evidenceIds).size === 287 && evidenceIds.every((id) => stage1Set.has(id)) ? 0 : 1;
ck("recordEvidenceProvenance", evidenceRefMismatchCount === 0, "Evidence catalog does not cover all 287 IDs exactly once.");

const prerequisiteExpected = rows.filter((r) => Array.isArray(r.raw?.PreTechIDs) && r.raw.PreTechIDs.length > 0).map((r) => r.id);
const unlockExpected = groups.filter((g) => g.signature?.hasLevelUnlockField === true).flatMap((g) => g.techIds ?? []);
const prerequisiteFacetMismatchCount = JSON.stringify(artifact.facets?.prerequisite?.techIdsWithFacet ?? []) === JSON.stringify(prerequisiteExpected) && artifact.facets?.prerequisite?.model === "ORTHOGONAL_RELATION_FACET" && artifact.facets?.prerequisite?.sourcePath === P.s1 && artifact.facets?.prerequisite?.classificationRole === "NONE" ? 0 : 1;
const unlockFacetMismatchCount = JSON.stringify(artifact.facets?.soldierUnlock?.candidateSignatureHasFieldTechIds ?? []) === JSON.stringify(unlockExpected) && artifact.facets?.soldierUnlock?.model === "ORTHOGONAL_RELATION_FACET" && artifact.facets?.soldierUnlock?.levelReferenceSourcePath === P.s1 && artifact.facets?.soldierUnlock?.levelSourceLogicalPath === c4.sourceSnapshots.trainingTechLevel.logicalPath && artifact.facets?.soldierUnlock?.materializedValues === false && artifact.facets?.soldierUnlock?.classificationRole === "NONE" && artifact.facets?.rejectedExclusiveWholeTechLabel === "PREREQUISITE_OR_UNLOCK" ? 0 : 1;
ck("prerequisiteFacetParity", prerequisiteFacetMismatchCount === 0, "Prerequisite facet projection mismatch.");
ck("soldierUnlockFacetBoundary", unlockFacetMismatchCount === 0, "Soldier unlock facet boundary mismatch.");

const labelCounts = Object.fromEntries(Object.entries(expected).map(([label, ids]) => [label, ids.length]));
ck("labelCounts", Object.entries(labelCounts).every(([label, n]) => n === c4.wholeTechClassification.currentSnapshotExpectedCoverage?.[label]), `Label counts mismatch: ${JSON.stringify(labelCounts)}`);
ck("coverageSummary", artifact.coverage?.trainingTech === 287 && JSON.stringify(artifact.coverage?.labelCounts) === JSON.stringify(labelCounts) && artifact.coverage?.ruleOverlapCount === 0 && artifact.coverage?.reviewUnclassifiedCount === 0 && artifact.coverage?.protectedGrowthRelabelCount === 0, "Stage 5 coverage summary mismatch.");

const output = {
  version: 1, schemaId: "soldier-training-tech-classification-stage5-validation/v1", stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: errors.length ? "FAIL" : "PASS", completion: errors.length ? "INCOMPLETE" : "COMPLETE", freezeState: errors.length ? "OPEN" : "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN",
  validationMode: "INDEPENDENT_READ_ONLY_FROZEN_PREDECESSOR_RECORD_RECOMPUTATION", classification: [P.artifact, sha(P.artifact)],
  predecessorBlobs: { stage1Census: sha(P.s1), stage2Validation: sha(P.s2), stage3Candidates: sha(P.c3), stage3Semantic: sha(P.e3), stage3Validation: sha(P.v3), stage4Contract: sha(P.c4), stage4Validation: sha(P.v4), frozenTrainingConsumer: sha(P.training) },
  checks,
  coverage: { trainingTech: actualAll.length, uniqueTechIds: new Set(actualAll).size, labelCounts, classificationMismatchCount, prerequisiteFacetMismatchCount, unlockFacetMismatchCount, evidenceRefMismatchCount, groupEvidenceMismatchCount, ruleOverlapCount, reviewUnclassifiedCount: expected.REVIEW_UNCLASSIFIED.length, protectedGrowthRelabelCount },
  reviews: [], blockers: errors, hardErrorCount: errors.length, nextOwner: artifact.nextOwner, nextStartPoint: artifact.nextStartPoint, reopenConditions: artifact.reopenConditions,
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (writeMode) { writeFileSync(resolve(root, P.out), serialized); console.log(`Wrote ${P.out}`); }
if (checkMode) { if (errors.length) { console.error(JSON.stringify(output, null, 2)); process.exit(1); } if (read(P.out) !== serialized) { console.error(`${P.out} is stale. Run with --write.`); process.exit(1); } console.log(JSON.stringify({ status: output.status, coverage: output.coverage })); }
