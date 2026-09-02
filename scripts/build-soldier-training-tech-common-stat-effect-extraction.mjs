import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const checkMode = args.has("--check") || !writeMode;
const P = {
  boundary: "data/contracts/soldier-training-tech-effect-extraction-boundary.v1.json",
  stage5: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  stage5Validation: "data/validation/soldier-training-tech-classification-stage5.v1.json",
  stage1: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
  out: "data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json",
};
const sourceCarrier = {
  commit: "172d836e59fbdd84bca5e44a9b2e26d8812a927f",
  logicalPath: "data/configdata/ConfigDataTrainingTechLevelInfo.json",
};
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const readText = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(readText(p));
const gitBlobShaBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const gitBlobShaFile = (p) => gitBlobShaBytes(readFileSync(resolve(root, p)));
const req = (ok, message) => { if (!ok) throw new Error(message); };

req(sourcePath, "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
req(existsSync(sourcePath), `TrainingTechLevel source file does not exist: ${sourcePath}`);

const boundary = readJson(P.boundary);
const stage5 = readJson(P.stage5);
const stage5Validation = readJson(P.stage5Validation);
const stage1 = readJson(P.stage1);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

req(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Effect extraction boundary is not frozen COMPLETE.");
req(boundary.nextOwner === "TrainingTech COMMON_STAT Effect Extraction", "Boundary does not assign COMMON_STAT extraction as next owner.");
req(gitBlobShaFile(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
req(gitBlobShaFile(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) req(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
req(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
req(stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 is not a lossless TrainingTech projection.");
req(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity drifted.");
req(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "TrainingTechLevel source identity drifted in Stage 1.");
req(gitBlobShaBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel source blob does not match the frozen boundary.");
req(Array.isArray(levelRows) && levelRows.length === 2945, `TrainingTechLevel source population ${Array.isArray(levelRows) ? levelRows.length : "non-array"}, expected 2945.`);

const targetIds = stage5.classificationByLabel?.COMMON_STAT ?? [];
req(targetIds.length === 84 && new Set(targetIds).size === 84, "Frozen COMMON_STAT membership is not 84 unique Tech IDs.");
req(boundary.frozenPopulationBoundary?.extractionTargets?.COMMON_STAT === 84, "Boundary COMMON_STAT population drifted.");
const excluded = new Set([
  ...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []),
  ...(stage5.classificationByLabel?.COMMON_PASSIVE ?? []),
  ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []),
  ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? []),
]);
for (const id of targetIds) req(!excluded.has(id), `COMMON_STAT target overlaps excluded label: ${id}`);

const censusById = new Map();
for (const row of stage1.records ?? []) {
  req(Number.isInteger(row.id), "Stage 1 census contains a non-integer Tech ID.");
  req(!censusById.has(row.id), `Duplicate Stage 1 Tech ID: ${row.id}`);
  censusById.set(row.id, row);
}
req(censusById.size === 287, `Stage 1 census unique Tech count ${censusById.size}, expected 287.`);

const levelById = new Map();
for (const row of levelRows) {
  req(Number.isInteger(row?.ID), "TrainingTechLevel source contains a non-integer ID.");
  req(!levelById.has(row.ID), `Duplicate TrainingTechLevel source ID: ${row.ID}`);
  levelById.set(row.ID, row);
}
req(levelById.size === 2945, `TrainingTechLevel unique ID count ${levelById.size}, expected 2945.`);

const referencedLevelIds = [];
const records = targetIds.map((techId) => {
  const census = censusById.get(techId);
  req(census, `Missing Stage 1 TrainingTech row: ${techId}`);
  const raw = census.raw;
  req(raw?.ID === techId, `Stage 1 raw ID mismatch: ${techId}`);
  req(raw?.TechType === 1, `COMMON_STAT Tech ${techId} does not have explicit TechType 1.`);
  req(Array.isArray(raw?.ArmyIDRelated) && raw.ArmyIDRelated.length > 0, `COMMON_STAT Tech ${techId} lacks explicit ArmyIDRelated.`);
  req(!Array.isArray(raw?.SoldierIDRelated) || raw.SoldierIDRelated.length === 0, `COMMON_STAT Tech ${techId} unexpectedly has SoldierIDRelated.`);
  const levelIds = raw?.TechLevelupInfoList;
  req(Array.isArray(levelIds) && levelIds.length > 0, `COMMON_STAT Tech ${techId} lacks TechLevelupInfoList.`);
  req(JSON.stringify(levelIds) === JSON.stringify(census.explicitLevelReferences), `Stage 1 explicit level reference projection drifted for Tech ${techId}.`);
  const levels = levelIds.map((levelId) => {
    req(Number.isInteger(levelId), `Tech ${techId} has a non-integer level reference.`);
    const source = levelById.get(levelId);
    req(source, `Unresolved TrainingTechLevel ID ${levelId} referenced by Tech ${techId}.`);
    req(typeof source.Description === "string", `TrainingTechLevel ${levelId} lacks source Description.`);
    referencedLevelIds.push(levelId);
    return { levelId, effectTextRaw: source.Description, sourceLevelRecord: source };
  });
  return {
    techId,
    sourceLabel: "COMMON_STAT",
    trainingTechLocator: {
      ID: raw.ID,
      ArmyIDRelated: raw.ArmyIDRelated,
      TechType: raw.TechType,
      TechLevelupInfoList: levelIds,
    },
    levels,
  };
});

req(referencedLevelIds.length === 1050, `COMMON_STAT referenced level row count ${referencedLevelIds.length}, expected 1050.`);
req(new Set(referencedLevelIds).size === referencedLevelIds.length, "COMMON_STAT level references are not globally unique.");
req(records.length === 84, `Materialized Tech record count ${records.length}, expected 84.`);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-common-stat-effect-extraction/v1",
  stage: "TrainingTech COMMON_STAT Effect Extraction",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN",
  purpose: "Materialize the frozen 84 COMMON_STAT TrainingTech records and every explicitly referenced TrainingTechLevel source row without reclassification or inferred effect normalization.",
  authority: {
    boundary: { path: P.boundary, gitBlobSha: gitBlobShaFile(P.boundary), requiredFreezeState: boundary.freezeState },
    stage5Classification: { path: P.stage5, gitBlobSha: gitBlobShaFile(P.stage5), requiredFreezeState: stage5.freezeState },
    stage5Validation: { path: P.stage5Validation, gitBlobSha: gitBlobShaFile(P.stage5Validation), requiredFreezeState: stage5Validation.freezeState },
    trainingTechLocatorProjection: { path: P.stage1, gitBlobSha: gitBlobShaFile(P.stage1), projection: stage1.censusPolicy.trainingTechRecordProjection },
  },
  sourceSnapshots: {
    trainingTech: { logicalPath: stage1.sourceSnapshots.trainingTech.path, gitBlobSha: stage1.sourceSnapshots.trainingTech.gitBlobSha, sourceProjectionPath: P.stage1 },
    trainingTechLevel: { logicalPath: sourceCarrier.logicalPath, gitBlobSha: gitBlobShaBytes(sourceBytes), sourceCarrierCommit: sourceCarrier.commit },
  },
  policy: {
    inputLabel: "COMMON_STAT",
    classificationAuthority: "STAGE5_FROZEN_MEMBERSHIP_ONLY",
    explicitTechLevelupInfoListJoinOnly: true,
    descriptionsMaterializedAsRawEffectText: true,
    fullReferencedLevelRowsMaterialized: true,
    descriptionUsedForClassification: false,
    normalizedStatMeaningParsed: false,
    numericEffectParsed: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    sourceOrderUsedAsMeaning: false,
    missingValueImputationPerformed: false,
    historicalOutputFallbackUsed: false,
    stage5MembershipMutationAllowed: false,
  },
  coverage: {
    targetTechCount: 84,
    materializedTechCount: records.length,
    referencedLevelRowCount: referencedLevelIds.length,
    uniqueReferencedLevelRowCount: new Set(referencedLevelIds).size,
    unresolvedLevelReferenceCount: 0,
    duplicateReferencedLevelIdCount: 0,
    sourceLevelPopulation: levelRows.length,
    excludedLabelTechMaterializedCount: 0,
  },
  records,
  blockers: [],
  reviews: [],
  nextOwner: boundary.parallelOwner,
  nextStartPoint: "COMMON_STAT extraction is frozen. Start the separately owned 46 COMMON_PASSIVE Techs from the same frozen boundary; do not reuse COMMON_STAT descriptions or infer passive semantics by analogy.",
  reopenConditions: [
    "Effect extraction boundary or Stage 5 frozen predecessor blob identity changes.",
    "TrainingTech or TrainingTechLevel frozen source snapshot identity changes.",
    "The frozen COMMON_STAT membership is no longer exactly 84 Tech IDs.",
    "Any explicit TechLevelupInfoList reference fails exact resolution.",
    "Independent validator fails or Project Check reports a hard owning-validator failure.",
  ],
};

const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) {
  writeFileSync(resolve(root, P.out), serialized);
  console.log(`Wrote ${P.out}`);
}
if (checkMode) {
  req(existsSync(resolve(root, P.out)), `${P.out} is missing. Run with --write.`);
  if (readText(P.out) !== serialized) {
    console.error(`${P.out} is stale. Run with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: output.status, completion: output.completion, coverage: output.coverage }));
}
