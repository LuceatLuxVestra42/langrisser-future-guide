import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { resolveConfigDataFile } from "./configdata-source-pack-maintenance-root.mjs";

const root = process.cwd();
const contractPath = "data/contracts/soldier-training-tech-classification-stage2-evidence.v1.json";
const outputPath = "data/validation/soldier-training-tech-classification-stage2.v1.json";

function physicalPath(path) {
  if (path.startsWith('data/configdata/')) return resolveConfigDataFile(path.slice('data/configdata/'.length));
  return resolve(root, path);
}

function text(path) {
  return readFileSync(physicalPath(path), "utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

function gitBlobSha(content) {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

function fileBlobSha(path) {
  return gitBlobSha(text(path));
}

const contract = json(contractPath);
const stage1Validation = json(contract.predecessors.stage1Validation.path);
const census = json(contract.predecessors.stage1Census.path);
const stage5 = json(contract.predecessors.frozenTrainingConsumer.path);
const stage5Validation = json(contract.predecessors.frozenTrainingConsumer.validationPath);
const soldierAuthority = json(contract.predecessors.soldierCanonicalAuthority.path);
const trainingTechLevel = json(contract.sourceSnapshots.trainingTechLevel.path);

const checks = {};
const blockers = [];

function check(name, condition, detail) {
  checks[name] = Boolean(condition);
  if (!condition) blockers.push({ check: name, detail });
}

check("contractSchema", contract.schemaId === "soldier-training-tech-classification-stage2-evidence-contract/v1", contract.schemaId);
check("contractFrozen", contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE", `${contract.status}/${contract.completion}`);
check("stage1ValidationBlobMatch", fileBlobSha(contract.predecessors.stage1Validation.path) === contract.predecessors.stage1Validation.gitBlobSha, contract.predecessors.stage1Validation.path);
check("stage1CensusBlobMatch", fileBlobSha(contract.predecessors.stage1Census.path) === contract.predecessors.stage1Census.gitBlobSha, contract.predecessors.stage1Census.path);
check("stage1FrozenPass", stage1Validation.status === contract.predecessors.stage1Validation.requiredStatus && stage1Validation.completion === contract.predecessors.stage1Validation.requiredCompletion && stage1Validation.freezeState === contract.predecessors.stage1Validation.requiredFreezeState, `${stage1Validation.status}/${stage1Validation.completion}/${stage1Validation.freezeState}`);
check("stage5ConsumerBlobMatch", fileBlobSha(contract.predecessors.frozenTrainingConsumer.path) === contract.predecessors.frozenTrainingConsumer.gitBlobSha, contract.predecessors.frozenTrainingConsumer.path);
check("stage5ValidationBlobMatch", fileBlobSha(contract.predecessors.frozenTrainingConsumer.validationPath) === contract.predecessors.frozenTrainingConsumer.validationGitBlobSha, contract.predecessors.frozenTrainingConsumer.validationPath);
check("stage5ValidationPass", stage5Validation.status === "PASS" && stage5Validation.coverage?.normalTier3 === 129 && stage5Validation.coverage?.trainingPopulated === 129, stage5Validation.status);
check("soldierAuthorityBlobMatch", fileBlobSha(contract.predecessors.soldierCanonicalAuthority.path) === contract.predecessors.soldierCanonicalAuthority.gitBlobSha, contract.predecessors.soldierCanonicalAuthority.path);
check("soldierAuthorityPass", soldierAuthority.status === contract.predecessors.soldierCanonicalAuthority.requiredStatus && soldierAuthority.coverage?.canonicalSoldiers === contract.predecessors.soldierCanonicalAuthority.requiredCanonicalSoldiers && soldierAuthority.coverage?.normalTier3 === contract.predecessors.soldierCanonicalAuthority.requiredNormalTier3, soldierAuthority.status);
check("trainingTechSourceBlobMatch", fileBlobSha(contract.sourceSnapshots.trainingTech.path) === contract.sourceSnapshots.trainingTech.gitBlobSha, contract.sourceSnapshots.trainingTech.path);
check("trainingTechLevelSourceBlobMatch", fileBlobSha(contract.sourceSnapshots.trainingTechLevel.path) === contract.sourceSnapshots.trainingTechLevel.gitBlobSha, contract.sourceSnapshots.trainingTechLevel.path);
check("trainingTechPopulation", census.population?.trainingTech === contract.sourceSnapshots.trainingTech.recordCount && census.records?.length === contract.sourceSnapshots.trainingTech.recordCount, census.population?.trainingTech);
check("trainingTechLevelPopulation", Array.isArray(trainingTechLevel) && trainingTechLevel.length === contract.sourceSnapshots.trainingTechLevel.recordCount && census.population?.trainingTechLevel === contract.sourceSnapshots.trainingTechLevel.recordCount, trainingTechLevel.length);
check("semanticClassificationNotPerformed", contract.scope?.semanticClassificationPerformed === false && stage1Validation.semanticClassificationPerformed === false, contract.scope?.semanticClassificationPerformed);

const techFields = new Set(Object.keys(census.structuralSummary?.trainingTech?.fieldPresence ?? {}));
const levelFields = new Set(Object.keys(census.structuralSummary?.trainingTechLevel?.fieldPresence ?? {}));
const requiredTechFields = ["ID", "Name", "Resource", "ArmyIDRelated", "SoldierIDRelated", "TechType", "TechLevelupInfoList", "PreTechIDs", "PreTechLevel", "RoomLevelRequired"];
const requiredLevelFields = ["ID", "Description", "SpSoidlierDescription", "SoldierIDUnlocked", "SoldierSkillID", "SoldierSkillLevelup", "PreTechIDs", "LevelupGoldCost", "LevelupMaterialsCost", "RoomExp"];
check("contractTechEvidenceFieldsExist", requiredTechFields.every((field) => techFields.has(field)), requiredTechFields.filter((field) => !techFields.has(field)));
check("contractLevelEvidenceFieldsExist", requiredLevelFields.every((field) => levelFields.has(field)), requiredLevelFields.filter((field) => !levelFields.has(field)));

const forbiddenKeys = [
  "nameJoin",
  "nameKeywordClassification",
  "descriptionKeywordClassification",
  "idArithmetic",
  "idRangeClassification",
  "filenameSimilarity",
  "resourcePathKeywordClassification",
  "globalSourceOrder",
  "screenOrder",
  "listLengthAsCategory",
  "TechTypeNumericMeaningWithoutSeparateConfirmedMapping",
  "SoldierIDRelatedAsGrowthByItself",
  "GetSoldierTechIdAsAbsoluteJoin",
  "missingValueImputation",
  "historicalOutputSilentFallback"
];
check("forbiddenInferenceClosed", forbiddenKeys.every((key) => contract.forbiddenAutomaticInference?.[key] === true), forbiddenKeys.filter((key) => contract.forbiddenAutomaticInference?.[key] !== true));
check("orderedListExceptionNarrow", contract.orderedListException?.field === "TrainingTechInfo.TechLevelupInfoList" && contract.orderedListException?.allowed === true, contract.orderedListException);
check("unresolvedLabelsReviewOnly", JSON.stringify(contract.unresolvedClassificationBoundary?.wholeTechLabelsNotYetAdmitted) === JSON.stringify(["COMMON_STAT", "COMMON_PASSIVE", "PREREQUISITE_OR_UNLOCK"]) && contract.unresolvedClassificationBoundary?.requiredFallback === "REVIEW_UNCLASSIFIED", contract.unresolvedClassificationBoundary);
check("onlyGrowthAutomaticLabelAdmitted", JSON.stringify(contract.evidenceRoles?.automaticClassification?.admittedWholeTechLabels) === JSON.stringify(["SOLDIER_GROWTH"]), contract.evidenceRoles?.automaticClassification?.admittedWholeTechLabels);

const levelById = new Map(trainingTechLevel.map((record) => [record.ID, record]));
const techRecords = census.records.map((record) => record.raw);
const targetSoldiers = stage5.records.filter((record) => record.identity?.isSp === false && record.identity?.tier === 3 && record.training?.techId != null);

const zeroCandidateSoldiers = [];
const multipleCandidateSoldiers = [];
const trainingTechMismatches = [];
const abilityTechMismatches = [];
const resolvedTechIds = [];

function hasExactGrowthSignature(tech) {
  if (!Array.isArray(tech.TechLevelupInfoList) || tech.TechLevelupInfoList.length !== 10) return false;
  const resolved = tech.TechLevelupInfoList.map((id) => levelById.get(id));
  if (resolved.some((record) => !record)) return false;
  return resolved.every((record, index) => record.SoldierSkillLevelup === index + 1);
}

for (const soldier of targetSoldiers) {
  const candidates = techRecords.filter((tech) => Array.isArray(tech.SoldierIDRelated) && tech.SoldierIDRelated.includes(soldier.soldierId) && hasExactGrowthSignature(tech));
  if (candidates.length === 0) {
    zeroCandidateSoldiers.push(soldier.soldierId);
    continue;
  }
  if (candidates.length !== 1) {
    multipleCandidateSoldiers.push({ soldierId: soldier.soldierId, techIds: candidates.map((tech) => tech.ID) });
    continue;
  }
  const techId = candidates[0].ID;
  resolvedTechIds.push(techId);
  if (techId !== soldier.training.techId) trainingTechMismatches.push({ soldierId: soldier.soldierId, expected: soldier.training.techId, actual: techId });
  if (techId !== soldier.ability?.techId) abilityTechMismatches.push({ soldierId: soldier.soldierId, expected: soldier.ability?.techId, actual: techId });
}

const expectedGrowthCount = contract.preservationGates.normalTier3GrowthPopulation;
const uniqueResolvedTechIds = new Set(resolvedTechIds);
check("protectedGrowthTargetPopulation", targetSoldiers.length === expectedGrowthCount, targetSoldiers.length);
check("protectedGrowthExactlyOneCandidate", zeroCandidateSoldiers.length === 0 && multipleCandidateSoldiers.length === 0 && resolvedTechIds.length === expectedGrowthCount, { zeroCandidateSoldiers, multipleCandidateSoldiers, resolved: resolvedTechIds.length });
check("protectedGrowthDistinctTechParity", uniqueResolvedTechIds.size === expectedGrowthCount, uniqueResolvedTechIds.size);
check("protectedGrowthTrainingTechParity", trainingTechMismatches.length === 0, trainingTechMismatches);
check("protectedGrowthAbilityTechParity", abilityTechMismatches.length === 0, abilityTechMismatches);

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage2-validation/v1",
  stage: "TrainingTech Classification Stage 2 - Evidence Contract",
  status: blockers.length === 0 ? "PASS" : "FAIL",
  completion: blockers.length === 0 ? "COMPLETE" : "BLOCKED",
  freezeState: blockers.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE2_EVIDENCE_FROZEN" : "NOT_FROZEN",
  validationMode: "INDEPENDENT_READ_ONLY_RECOMPUTATION",
  contract: {
    path: contractPath,
    gitBlobSha: fileBlobSha(contractPath)
  },
  predecessors: {
    stage1Validation: contract.predecessors.stage1Validation.path,
    stage1Census: contract.predecessors.stage1Census.path,
    frozenTrainingConsumer: contract.predecessors.frozenTrainingConsumer.path,
    soldierCanonicalAuthority: contract.predecessors.soldierCanonicalAuthority.path
  },
  sourceSnapshots: contract.sourceSnapshots,
  semanticClassificationPerformed: false,
  checks,
  coverage: {
    trainingTech: census.records.length,
    trainingTechLevel: trainingTechLevel.length,
    protectedNormalTier3GrowthTarget: targetSoldiers.length,
    protectedNormalTier3GrowthResolvedUnique: resolvedTechIds.length,
    protectedNormalTier3DistinctTechIds: uniqueResolvedTechIds.size,
    zeroGrowthCandidateSoldiers: zeroCandidateSoldiers.length,
    multipleGrowthCandidateSoldiers: multipleCandidateSoldiers.length,
    frozenTrainingTechMismatches: trainingTechMismatches.length,
    frozenAbilityTechMismatches: abilityTechMismatches.length
  },
  admittedAutomaticWholeTechLabels: contract.evidenceRoles.automaticClassification.admittedWholeTechLabels,
  unresolvedWholeTechLabels: contract.unresolvedClassificationBoundary.wholeTechLabelsNotYetAdmitted,
  requiredFallback: contract.unresolvedClassificationBoundary.requiredFallback,
  boundaryNotes: [
    "COMMON_STAT, COMMON_PASSIVE, and PREREQUISITE_OR_UNLOCK remain intentionally unclassified until representative semantic evidence is frozen.",
    "TrainingTechInfo.TechType is preserved only as a raw structural value; no numeric meaning is admitted by this contract.",
    "Description and Name fields may support later human review but are not automatic classification evidence in Stage 2."
  ],
  blockers,
  hardErrorCount: blockers.length,
  nextOwner: contract.nextOwner,
  nextStartPoint: contract.nextStartPoint,
  reopenConditions: contract.reopenConditions
};

const rendered = `${JSON.stringify(validation, null, 2)}\n`;
const write = process.argv.includes("--write");
const checkOnly = process.argv.includes("--check");

if (write) {
  mkdirSync(dirname(resolve(root, outputPath)), { recursive: true });
  writeFileSync(resolve(root, outputPath), rendered, "utf8");
}

if (checkOnly) {
  let existing;
  try {
    existing = text(outputPath);
  } catch {
    console.error(`Missing ${outputPath}. Run with --write first.`);
    process.exit(1);
  }
  if (existing !== rendered) {
    console.error(`${outputPath} is stale or does not match independent recomputation.`);
    process.exit(1);
  }
}

console.log(`TrainingTech Stage 2 evidence validation: ${validation.status}`);
console.log(JSON.stringify(validation.coverage));
if (blockers.length > 0) {
  console.error(JSON.stringify(blockers, null, 2));
  process.exit(1);
}
