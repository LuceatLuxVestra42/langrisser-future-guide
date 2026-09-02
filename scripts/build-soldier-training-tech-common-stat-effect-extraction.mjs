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
const sourceCarrier = { commit: "172d836e59fbdd84bca5e44a9b2e26d8812a927f", logicalPath: "data/configdata/ConfigDataTrainingTechLevelInfo.json" };
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blob = (p) => blobBytes(readFileSync(resolve(root, p)));
const req = (ok, msg) => { if (!ok) throw new Error(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

req(sourcePath, "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
req(existsSync(sourcePath), `TrainingTechLevel source file does not exist: ${sourcePath}`);
const boundary = json(P.boundary), stage5 = json(P.stage5), stage5Validation = json(P.stage5Validation), stage1 = json(P.stage1);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

req(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Effect extraction boundary is not frozen COMPLETE.");
req(boundary.nextOwner === "TrainingTech COMMON_STAT Effect Extraction", "Boundary does not assign COMMON_STAT extraction as next owner.");
req(blob(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
req(blob(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) req(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
req(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
req(stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 is not a lossless TrainingTech projection.");
req(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity drifted.");
req(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "TrainingTechLevel source identity drifted in Stage 1.");
req(blobBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel source blob does not match the frozen boundary.");
req(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

const targetIds = stage5.classificationByLabel?.COMMON_STAT ?? [];
req(targetIds.length === 84 && new Set(targetIds).size === 84, "Frozen COMMON_STAT membership is not 84 unique Tech IDs.");
req(boundary.frozenPopulationBoundary?.extractionTargets?.COMMON_STAT === 84, "Boundary COMMON_STAT population drifted.");
const excluded = new Set([...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []), ...(stage5.classificationByLabel?.COMMON_PASSIVE ?? []), ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []), ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? [])]);
for (const id of targetIds) req(!excluded.has(id), `COMMON_STAT target overlaps excluded label: ${id}`);

const censusById = new Map();
for (const row of stage1.records ?? []) {
  req(Number.isInteger(row.id), "Stage 1 census contains a non-integer Tech ID.");
  req(!censusById.has(row.id), `Duplicate Stage 1 Tech ID: ${row.id}`);
  censusById.set(row.id, row);
}
req(censusById.size === 287, "Stage 1 census unique Tech count is not 287.");
const levelById = new Map();
for (const row of levelRows) {
  req(Number.isInteger(row?.ID), "TrainingTechLevel source contains a non-integer ID.");
  req(!levelById.has(row.ID), `Duplicate TrainingTechLevel source ID: ${row.ID}`);
  levelById.set(row.ID, row);
}
req(levelById.size === 2945, "TrainingTechLevel unique ID count is not 2945.");

const referencedLevelIds = [];
const records = targetIds.map((techId) => {
  const census = censusById.get(techId);
  req(census, `Missing Stage 1 TrainingTech row: ${techId}`);
  const raw = census.raw ?? {};
  req(raw.ID === techId && raw.TechType === 1, `COMMON_STAT Tech ${techId} explicit locator fields drifted.`);
  req(Array.isArray(raw.ArmyIDRelated) && raw.ArmyIDRelated.length > 0, `COMMON_STAT Tech ${techId} lacks explicit ArmyIDRelated.`);
  req(!Array.isArray(raw.SoldierIDRelated) || raw.SoldierIDRelated.length === 0, `COMMON_STAT Tech ${techId} unexpectedly has SoldierIDRelated.`);
  const refs = raw.TechLevelupInfoList;
  req(Array.isArray(refs) && refs.length > 0, `COMMON_STAT Tech ${techId} lacks TechLevelupInfoList.`);
  req(same(refs, census.explicitLevelReferences), `Stage 1 explicit level reference projection drifted for Tech ${techId}.`);
  const levels = refs.map((levelId) => {
    req(Number.isInteger(levelId), `Tech ${techId} has a non-integer level reference.`);
    const source = levelById.get(levelId);
    req(source, `Unresolved TrainingTechLevel ID ${levelId} referenced by Tech ${techId}.`);
    req(typeof source.Description === "string", `TrainingTechLevel ${levelId} lacks source Description.`);
    referencedLevelIds.push(levelId);
    return { levelId, effectTextRaw: source.Description };
  });
  return { techId, sourceLabel: "COMMON_STAT", trainingTechLocator: { ID: raw.ID, ArmyIDRelated: raw.ArmyIDRelated, TechType: raw.TechType, TechLevelupInfoList: refs }, levels };
});

req(records.length === 84, "Materialized Tech record count is not 84.");
req(referencedLevelIds.length === 1050, `COMMON_STAT referenced level row count ${referencedLevelIds.length}, expected 1050.`);
req(new Set(referencedLevelIds).size === 1050, "COMMON_STAT level references are not globally unique.");

const output = {
  version: 1,
  schemaId: "soldier-training-tech-common-stat-effect-extraction/v1",
  stage: "TrainingTech COMMON_STAT Effect Extraction",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN",
  purpose: "Materialize raw effect text for the frozen 84 COMMON_STAT TrainingTech records through exact explicit TechLevelupInfoList joins, without reclassification, effect normalization, or unrelated raw-source duplication.",
  authority: {
    boundary: { path: P.boundary, gitBlobSha: blob(P.boundary), requiredFreezeState: boundary.freezeState },
    stage5Classification: { path: P.stage5, gitBlobSha: blob(P.stage5), requiredFreezeState: stage5.freezeState },
    stage5Validation: { path: P.stage5Validation, gitBlobSha: blob(P.stage5Validation), requiredFreezeState: stage5Validation.freezeState },
    trainingTechLocatorProjection: { path: P.stage1, gitBlobSha: blob(P.stage1), projection: stage1.censusPolicy.trainingTechRecordProjection },
  },
  sourceSnapshots: {
    trainingTech: { logicalPath: stage1.sourceSnapshots.trainingTech.path, gitBlobSha: stage1.sourceSnapshots.trainingTech.gitBlobSha, sourceProjectionPath: P.stage1 },
    trainingTechLevel: { logicalPath: sourceCarrier.logicalPath, gitBlobSha: blobBytes(sourceBytes), sourceCarrierCommit: sourceCarrier.commit },
  },
  policy: {
    inputLabel: "COMMON_STAT",
    classificationAuthority: "STAGE5_FROZEN_MEMBERSHIP_ONLY",
    explicitTechLevelupInfoListJoinOnly: true,
    descriptionsMaterializedAsRawEffectText: true,
    unrelatedTrainingTechLevelFieldsDuplicated: false,
    sourceRowsReadByValidatorForExactResolution: true,
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
    materializedTechCount: 84,
    referencedLevelRowCount: 1050,
    uniqueReferencedLevelRowCount: 1050,
    rawEffectTextRowCount: 1050,
    unresolvedLevelReferenceCount: 0,
    duplicateReferencedLevelIdCount: 0,
    sourceLevelPopulation: 2945,
    excludedLabelTechMaterializedCount: 0,
  },
  records,
  blockers: [],
  reviews: [],
  nextOwner: boundary.parallelOwner,
  nextStartPoint: "COMMON_STAT raw effect extraction is frozen. Start the separately owned 46 COMMON_PASSIVE Techs from the same frozen boundary; do not reuse COMMON_STAT descriptions or infer passive semantics by analogy.",
  reopenConditions: [
    "Effect extraction boundary or Stage 5 frozen predecessor blob identity changes.",
    "TrainingTech or TrainingTechLevel frozen source snapshot identity changes.",
    "The frozen COMMON_STAT membership is no longer exactly 84 Tech IDs.",
    "Any explicit TechLevelupInfoList reference fails exact resolution.",
    "Independent validator fails or Project Check reports a hard owning-validator failure."
  ],
};
const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) { writeFileSync(resolve(root, P.out), serialized); console.log(`Wrote ${P.out}`); }
if (checkMode) {
  req(existsSync(resolve(root, P.out)), `${P.out} is missing. Run with --write.`);
  if (text(P.out) !== serialized) { console.error(`${P.out} is stale. Run with --write.`); process.exit(1); }
  console.log(JSON.stringify({ status: output.status, completion: output.completion, coverage: output.coverage }));
}
