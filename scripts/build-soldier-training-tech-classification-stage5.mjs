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
  output: "data/generated/soldier-training-tech-classification-stage5.v1.json",
};
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blob = (p) => {
  const b = readFileSync(resolve(root, p));
  return createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
};
const req = (ok, message) => { if (!ok) throw new Error(message); };

const stage1 = json(paths.stage1);
const stage2 = json(paths.stage2);
const candidates = json(paths.stage3Candidates);
const semantic = json(paths.stage3Semantic);
const stage3 = json(paths.stage3Validation);
const contract = json(paths.stage4Contract);
const stage4 = json(paths.stage4Validation);
const training = json(paths.trainingConsumer);

req(contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE" && contract.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE4_CONTRACT_FROZEN", "Stage 4 contract is not frozen COMPLETE.");
req(stage4.status === "PASS" && stage4.completion === "COMPLETE", "Stage 4 validation is not PASS/COMPLETE.");
req(stage1.status === "PASS" && stage1.records?.length === 287, "Stage 1 census is not frozen at 287 records.");
req(stage2.status === "PASS" && stage2.completion === "COMPLETE", "Stage 2 validation is not PASS/COMPLETE.");
req(stage3.status === "PASS" && stage3.completion === "COMPLETE" && semantic.status === "PASS" && semantic.completion === "COMPLETE", "Stage 3 evidence is not PASS/COMPLETE.");
const predecessorChecks = [
  [paths.stage1, contract.predecessors.stage1Census.gitBlobSha],
  [paths.stage2, contract.predecessors.stage2Validation.gitBlobSha],
  [paths.stage3Candidates, contract.predecessors.stage3CandidateEvidence.gitBlobSha],
  [paths.stage3Semantic, contract.predecessors.stage3SemanticEvidence.gitBlobSha],
  [paths.stage3Validation, contract.predecessors.stage3Validation.gitBlobSha],
  [paths.trainingConsumer, contract.predecessors.frozenTrainingConsumer.gitBlobSha],
];
for (const [p, sha] of predecessorChecks) req(blob(p) === sha, `Frozen predecessor blob mismatch: ${p}`);
req(stage4.contract?.gitBlobSha === blob(paths.stage4Contract), "Stage 4 validation contract blob mismatch.");
req(stage4.coverage?.trainingTech === 287 && stage4.coverage?.ruleOverlapCount === 0 && stage4.coverage?.reviewUnclassifiedCount === 0, "Stage 4 dry-run coverage drifted.");

const rows = stage1.records ?? [];
req(new Set(rows.map((r) => r.id)).size === 287, "Stage 1 IDs are not unique.");
const growth = new Set((training.records ?? []).filter((r) => r.identity?.tier === 3 && r.identity?.isSp === false && r.training?.techId != null).map((r) => r.training.techId));
req(growth.size === 129, `Expected 129 protected growth Tech IDs, got ${growth.size}.`);

const groups = candidates.structuralGroups ?? [];
const groupByTech = new Map();
const groupRefByTech = new Map();
for (const [index, group] of groups.entries()) {
  const ref = `G${index + 1}`;
  for (const id of group.techIds ?? []) {
    req(!groupByTech.has(id), `Duplicate Stage 3 group membership: ${id}`);
    groupByTech.set(id, group);
    groupRefByTech.set(id, ref);
  }
}
req(groups.length === 15 && groupByTech.size === 158, "Stage 3 candidate partition is not 15 groups / 158 Techs.");
for (const r of rows) req(growth.has(r.id) !== groupByTech.has(r.id), `Frozen partition mismatch: ${r.id}`);

const classCatalog = {
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
const reviewByTech = new Map((semantic.representativeReviews ?? []).map((r) => [r.techId, r]));
const evidenceCatalog = {
  PG: { classCode: "GROWTH", sources: [paths.stage1, paths.stage2, paths.trainingConsumer, paths.stage4Contract] },
};
for (const [index, g] of groups.entries()) {
  const code = classForGroup(g);
  req(code, `Stage 3 group ${index + 1} is not admitted by Stage 4.`);
  const rep = g.representative?.techId ?? null;
  evidenceCatalog[`G${index + 1}`] = {
    classCode: code,
    signatureKey: g.signatureKey,
    representativeTechId: rep,
    semanticFinding: reviewByTech.get(rep)?.semanticFinding ?? null,
    sources: [paths.stage3Candidates, paths.stage3Semantic, paths.stage4Contract],
  };
}

let overlap = 0;
const matrix = rows.map((r) => {
  const group = groupByTech.get(r.id) ?? null;
  const matches = [];
  if (growth.has(r.id)) matches.push("GROWTH");
  if (!growth.has(r.id) && r.raw?.TechType === 1 && classForGroup(group) === "STAT") matches.push("STAT");
  if (!growth.has(r.id) && r.raw?.TechType === 3 && classForGroup(group) === "PASSIVE") matches.push("PASSIVE");
  if (!growth.has(r.id) && r.raw?.TechType === 2 && classForGroup(group) === "PROGRESSION") matches.push("PROGRESSION");
  if (matches.length > 1) overlap += 1;
  req(matches.length === 1, `Tech ${r.id} classified ${matches.length} times.`);
  const pre = Array.isArray(r.raw?.PreTechIDs) ? r.raw.PreTechIDs : [];
  const preLv = Array.isArray(r.raw?.PreTechLevel) ? r.raw.PreTechLevel : [];
  req(pre.length === preLv.length, `Prerequisite cardinality mismatch: ${r.id}`);
  const code = matches[0];
  return [r.sourceIndex, r.id, r.raw?.TechType ?? null, code, code === "GROWTH" ? "PG" : groupRefByTech.get(r.id), pre.length > 0, group?.signature?.hasLevelUnlockField ?? null];
});
const count = (code) => matrix.filter((r) => r[3] === code).length;
const labelCounts = {
  SOLDIER_GROWTH: count("GROWTH"),
  COMMON_STAT: count("STAT"),
  COMMON_PASSIVE: count("PASSIVE"),
  SOLDIER_SPECIFIC_PROGRESSION: count("PROGRESSION"),
  REVIEW_UNCLASSIFIED: 0,
};
for (const [label, n] of Object.entries(labelCounts)) req(n === contract.wholeTechClassification.currentSnapshotExpectedCoverage?.[label], `${label} count mismatch: ${n}`);
req(overlap === 0, `Rule overlap count: ${overlap}`);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage5/v1",
  stage: "TrainingTech Classification Stage 5 - Full Record Classification",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN",
  purpose: "Materialize the Stage 4 frozen contract as an explicit 287-record classification without new semantic inference.",
  predecessors: {
    stage1Census: [paths.stage1, blob(paths.stage1)],
    stage2Validation: [paths.stage2, blob(paths.stage2)],
    stage3Candidates: [paths.stage3Candidates, blob(paths.stage3Candidates)],
    stage3Semantic: [paths.stage3Semantic, blob(paths.stage3Semantic)],
    stage3Validation: [paths.stage3Validation, blob(paths.stage3Validation)],
    stage4Contract: [paths.stage4Contract, blob(paths.stage4Contract)],
    stage4Validation: [paths.stage4Validation, blob(paths.stage4Validation)],
    frozenTrainingConsumer: [paths.trainingConsumer, blob(paths.trainingConsumer)],
  },
  sourceSnapshots: contract.sourceSnapshots,
  policy: {
    classificationAuthority: "STAGE4_FROZEN_CONTRACT_ONLY",
    descriptionsReadForClassification: false,
    namesReadForClassification: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    sourceOrderUsedAsMeaning: false,
    prerequisiteUsedAsWholeTechCategory: false,
    soldierUnlockUsedAsWholeTechCategory: false,
    soldierUnlockValuesMaterializedInStage5: false,
    historicalFallbackUsed: false,
  },
  coverage: { trainingTech: 287, labelCounts, ruleOverlapCount: 0, reviewUnclassifiedCount: 0, protectedGrowthRelabelCount: 0 },
  classCatalog,
  evidenceCatalog,
  facetCatalog: {
    PREREQUISITE: { model: "ORTHOGONAL_RELATION_FACET", sourcePath: paths.stage1, sourceFields: ["TrainingTechInfo.PreTechIDs", "TrainingTechInfo.PreTechLevel"], recordProjection: "present-only", classificationRole: "NONE" },
    SOLDIER_UNLOCK: { model: "ORTHOGONAL_RELATION_FACET", levelReferenceSourcePath: paths.stage1, levelSourceLogicalPath: contract.sourceSnapshots.trainingTechLevel.logicalPath, sourceField: "TrainingTechLevelInfo.SoldierIDUnlocked", materializedValues: false, candidateSignaturePresenceProjected: true, classificationRole: "NONE" },
    rejectedExclusiveWholeTechLabel: contract.relationFacets.rejectedExclusiveLabel,
  },
  recordColumns: ["sourceIndex", "techId", "rawTechType", "classCode", "evidenceRef", "prerequisitePresent", "candidateSignatureHasLevelUnlockField"],
  records: matrix,
  blockers: [],
  reviews: [],
  nextOwner: "UNASSIGNED_AFTER_STAGE5",
  nextStartPoint: "Choose one downstream owner from the Stage 4 non-scope and reuse this frozen classification without reclassifying from names or descriptions.",
  reopenConditions: contract.reopenConditions,
};
const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) { writeFileSync(resolve(root, paths.output), serialized); console.log(`Wrote ${paths.output}`); }
if (checkMode) {
  if (text(paths.output) !== serialized) { console.error(`${paths.output} is stale. Run with --write.`); process.exit(1); }
  console.log(JSON.stringify({ status: output.status, coverage: output.coverage }));
}
