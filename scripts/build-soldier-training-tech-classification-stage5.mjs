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
  out: "data/generated/soldier-training-tech-classification-stage5.v1.json",
};
const read = (p) => readFileSync(resolve(root, p), "utf8");
const J = (p) => JSON.parse(read(p));
const sha = (p) => { const b = readFileSync(resolve(root, p)); return createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex"); };
const req = (ok, msg) => { if (!ok) throw new Error(msg); };
const s1 = J(P.s1), s2 = J(P.s2), c3 = J(P.c3), e3 = J(P.e3), v3 = J(P.v3), c4 = J(P.c4), v4 = J(P.v4), training = J(P.training);

req(c4.status === "DESIGN_FROZEN" && c4.completion === "COMPLETE" && c4.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract not frozen COMPLETE.");
req(v4.status === "PASS" && v4.completion === "COMPLETE" && v4.coverage?.trainingTech === 287 && v4.coverage?.ruleOverlapCount === 0 && v4.coverage?.reviewUnclassifiedCount === 0, "Stage 4 validation drifted.");
req(s1.status === "PASS" && s1.records?.length === 287 && s2.status === "PASS" && s2.completion === "COMPLETE" && v3.status === "PASS" && v3.completion === "COMPLETE" && e3.status === "PASS" && e3.completion === "COMPLETE", "Frozen predecessor status mismatch.");
req(sha(P.s1) === c4.predecessors.stage1Census.gitBlobSha && sha(P.s2) === c4.predecessors.stage2Validation.gitBlobSha && sha(P.c3) === c4.predecessors.stage3CandidateEvidence.gitBlobSha && sha(P.e3) === c4.predecessors.stage3SemanticEvidence.gitBlobSha && sha(P.v3) === c4.predecessors.stage3Validation.gitBlobSha && sha(P.training) === c4.predecessors.frozenTrainingConsumer.gitBlobSha && v4.contract?.gitBlobSha === sha(P.c4), "Frozen predecessor blob mismatch.");

const rows = s1.records ?? [], stage1Ids = rows.map((r) => r.id);
req(new Set(stage1Ids).size === 287, "Stage 1 IDs are not unique.");
const growth = new Set((training.records ?? []).filter((r) => r.identity?.tier === 3 && r.identity?.isSp === false && r.training?.techId != null).map((r) => r.training.techId));
req(growth.size === 129, `Protected growth population ${growth.size}, expected 129.`);
const groups = c3.structuralGroups ?? [], groupById = new Map();
for (const g of groups) for (const id of g.techIds ?? []) { req(!groupById.has(id), `Duplicate Stage 3 group membership: ${id}`); groupById.set(id, g); }
req(groups.length === 15 && groupById.size === 158, "Stage 3 candidate partition is not 15/158.");
for (const id of stage1Ids) req(growth.has(id) !== groupById.has(id), `Frozen partition mismatch: ${id}`);

const classCatalog = {
  SOLDIER_GROWTH: { ruleId: "protected-normal-tier3-soldier-growth-v1" },
  COMMON_STAT: { ruleId: "common-stat-techtype-v1" },
  COMMON_PASSIVE: { ruleId: "common-passive-techtype-v1" },
  SOLDIER_SPECIFIC_PROGRESSION: { ruleId: "nonprotected-soldier-specific-progression-v1" },
};
const labelOfGroup = (g) => g?.signature?.techTypeRaw === 1 ? "COMMON_STAT" : g?.signature?.techTypeRaw === 3 ? "COMMON_PASSIVE" : (g?.signature?.techTypeRaw === 2 && g?.signature?.relationShape === "SOLDIER_ONLY" && ["EXACT_1_TO_5", "EXACT_1_TO_10"].includes(g?.signature?.skillLevelupShape)) ? "SOLDIER_SPECIFIC_PROGRESSION" : null;
const classification = { SOLDIER_GROWTH: [], COMMON_STAT: [], COMMON_PASSIVE: [], SOLDIER_SPECIFIC_PROGRESSION: [], REVIEW_UNCLASSIFIED: [] };
let overlap = 0;
for (const r of rows) {
  const g = groupById.get(r.id) ?? null, matches = [];
  if (growth.has(r.id)) matches.push("SOLDIER_GROWTH");
  if (!growth.has(r.id) && r.raw?.TechType === 1 && labelOfGroup(g) === "COMMON_STAT") matches.push("COMMON_STAT");
  if (!growth.has(r.id) && r.raw?.TechType === 3 && labelOfGroup(g) === "COMMON_PASSIVE") matches.push("COMMON_PASSIVE");
  if (!growth.has(r.id) && r.raw?.TechType === 2 && labelOfGroup(g) === "SOLDIER_SPECIFIC_PROGRESSION") matches.push("SOLDIER_SPECIFIC_PROGRESSION");
  if (matches.length > 1) overlap++;
  classification[matches.length === 1 ? matches[0] : "REVIEW_UNCLASSIFIED"].push(r.id);
}
for (const [label, ids] of Object.entries(classification)) req(ids.length === c4.wholeTechClassification.currentSnapshotExpectedCoverage?.[label], `${label} count mismatch: ${ids.length}`);
req(overlap === 0, `Rule overlap count ${overlap}.`);

const reviewByTech = new Map((e3.representativeReviews ?? []).map((r) => [r.techId, r]));
const evidenceCatalog = {
  PROTECTED_GROWTH: { label: "SOLDIER_GROWTH", techIds: classification.SOLDIER_GROWTH, sources: [P.s1, P.s2, P.training, P.c4] },
};
for (const [i, g] of groups.entries()) {
  const label = labelOfGroup(g); req(label, `Unadmitted Stage 3 group ${i + 1}.`);
  const rep = g.representative?.techId ?? null;
  evidenceCatalog[`STAGE3_GROUP_${i + 1}`] = { label, techIds: g.techIds ?? [], signatureKey: g.signatureKey, representativeTechId: rep, semanticFinding: reviewByTech.get(rep)?.semanticFinding ?? null, sources: [P.c3, P.e3, P.c4] };
}
const evidenceIds = Object.values(evidenceCatalog).flatMap((e) => e.techIds ?? []);
req(evidenceIds.length === 287 && new Set(evidenceIds).size === 287 && stage1Ids.every((id) => evidenceIds.includes(id)), "Evidence catalog does not cover all 287 Tech IDs exactly once.");

const prerequisiteTechIds = rows.filter((r) => Array.isArray(r.raw?.PreTechIDs) && r.raw.PreTechIDs.length > 0).map((r) => r.id);
const unlockSignatureTechIds = groups.filter((g) => g.signature?.hasLevelUnlockField === true).flatMap((g) => g.techIds ?? []);
const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage5/v1",
  stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN",
  purpose: "Freeze explicit classification membership for all 287 TrainingTech IDs using only the Stage 4 contract and frozen predecessors.",
  predecessors: {
    stage1Census: [P.s1, sha(P.s1)], stage2Validation: [P.s2, sha(P.s2)], stage3Candidates: [P.c3, sha(P.c3)], stage3Semantic: [P.e3, sha(P.e3)], stage3Validation: [P.v3, sha(P.v3)], stage4Contract: [P.c4, sha(P.c4)], stage4Validation: [P.v4, sha(P.v4)], frozenTrainingConsumer: [P.training, sha(P.training)],
  },
  sourceSnapshots: c4.sourceSnapshots,
  policy: { classificationAuthority: "STAGE4_FROZEN_CONTRACT_ONLY", descriptionsReadForClassification: false, namesReadForClassification: false, nameJoinPerformed: false, idArithmeticPerformed: false, sourceOrderUsedAsMeaning: false, prerequisiteUsedAsWholeTechCategory: false, soldierUnlockUsedAsWholeTechCategory: false, soldierUnlockValuesMaterializedInStage5: false, historicalFallbackUsed: false },
  coverage: { trainingTech: 287, labelCounts: Object.fromEntries(Object.entries(classification).map(([k, v]) => [k, v.length])), ruleOverlapCount: 0, reviewUnclassifiedCount: 0, protectedGrowthRelabelCount: 0 },
  classCatalog,
  classificationByLabel: classification,
  evidenceCatalog,
  facets: {
    prerequisite: { model: "ORTHOGONAL_RELATION_FACET", sourcePath: P.s1, sourceFields: ["TrainingTechInfo.PreTechIDs", "TrainingTechInfo.PreTechLevel"], techIdsWithFacet: prerequisiteTechIds, classificationRole: "NONE" },
    soldierUnlock: { model: "ORTHOGONAL_RELATION_FACET", levelReferenceSourcePath: P.s1, levelSourceLogicalPath: c4.sourceSnapshots.trainingTechLevel.logicalPath, sourceField: "TrainingTechLevelInfo.SoldierIDUnlocked", materializedValues: false, candidateSignatureHasFieldTechIds: unlockSignatureTechIds, classificationRole: "NONE" },
    rejectedExclusiveWholeTechLabel: c4.relationFacets.rejectedExclusiveLabel,
  },
  blockers: [], reviews: [], nextOwner: "UNASSIGNED_AFTER_STAGE5", nextStartPoint: "Choose one downstream owner from the Stage 4 non-scope and reuse this frozen classification without reclassifying from names or descriptions.", reopenConditions: c4.reopenConditions,
};
const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) { writeFileSync(resolve(root, P.out), serialized); console.log(`Wrote ${P.out}`); }
if (checkMode) { if (read(P.out) !== serialized) { console.error(`${P.out} is stale. Run with --write.`); process.exit(1); } console.log(JSON.stringify({ status: output.status, coverage: output.coverage })); }
