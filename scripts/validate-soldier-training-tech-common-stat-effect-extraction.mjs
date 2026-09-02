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
  subject: "data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json",
  out: "data/validation/soldier-training-tech-common-stat-effect-extraction.v1.json",
};
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const readText = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(readText(p));
const gitBlobShaBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const gitBlobShaFile = (p) => gitBlobShaBytes(readFileSync(resolve(root, p)));
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check(Boolean(sourcePath), "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
check(Boolean(sourcePath && existsSync(sourcePath)), `TrainingTechLevel source file does not exist: ${sourcePath ?? "<unset>"}`);
check(existsSync(resolve(root, P.subject)), `${P.subject} is missing.`);
if (errors.length) {
  console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2));
  process.exit(1);
}

const boundary = readJson(P.boundary);
const stage5 = readJson(P.stage5);
const stage5Validation = readJson(P.stage5Validation);
const stage1 = readJson(P.stage1);
const subject = readJson(P.subject);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

check(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Boundary is not DESIGN_FROZEN/COMPLETE.");
check(boundary.nextOwner === "TrainingTech COMMON_STAT Effect Extraction", "Boundary next owner drifted.");
check(gitBlobShaFile(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
check(gitBlobShaFile(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) check(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
check(stage1.status === "PASS" && stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 lossless locator projection drifted.");
check(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity mismatch.");
check(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Stage 1 TrainingTechLevel source identity mismatch.");
check(gitBlobShaBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel source blob mismatch.");
check(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

check(subject.schemaId === "soldier-training-tech-common-stat-effect-extraction/v1", "Unexpected extraction schema.");
check(subject.stage === "TrainingTech COMMON_STAT Effect Extraction", "Unexpected extraction stage.");
check(subject.status === "PASS" && subject.completion === "COMPLETE" && subject.freezeState === "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN", "Extraction artifact is not PASS/COMPLETE/FROZEN.");
check(subject.authority?.boundary?.gitBlobSha === gitBlobShaFile(P.boundary), "Extraction boundary provenance mismatch.");
check(subject.authority?.stage5Classification?.gitBlobSha === gitBlobShaFile(P.stage5), "Extraction Stage 5 provenance mismatch.");
check(subject.authority?.stage5Validation?.gitBlobSha === gitBlobShaFile(P.stage5Validation), "Extraction Stage 5 validation provenance mismatch.");
check(subject.authority?.trainingTechLocatorProjection?.gitBlobSha === gitBlobShaFile(P.stage1), "Extraction Stage 1 locator provenance mismatch.");
check(subject.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "Extraction TrainingTech snapshot mismatch.");
check(subject.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Extraction TrainingTechLevel snapshot mismatch.");

const targetIds = stage5.classificationByLabel?.COMMON_STAT ?? [];
check(targetIds.length === 84 && new Set(targetIds).size === 84, "Frozen COMMON_STAT membership is not 84 unique IDs.");
const targetSet = new Set(targetIds);
const foreignSet = new Set([
  ...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []),
  ...(stage5.classificationByLabel?.COMMON_PASSIVE ?? []),
  ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []),
  ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? []),
]);
const censusById = new Map((stage1.records ?? []).map((row) => [row.id, row]));
check(censusById.size === 287, "Stage 1 census does not contain 287 unique Tech IDs.");
const levelById = new Map();
for (const row of levelRows) {
  if (!Number.isInteger(row?.ID)) errors.push("TrainingTechLevel source contains a non-integer ID.");
  else if (levelById.has(row.ID)) errors.push(`Duplicate TrainingTechLevel source ID: ${row.ID}`);
  else levelById.set(row.ID, row);
}
check(levelById.size === 2945, "TrainingTechLevel source does not contain 2945 unique IDs.");

const records = subject.records ?? [];
check(Array.isArray(records) && records.length === 84, "Extraction artifact does not contain exactly 84 Tech records.");
check(same(records.map((r) => r.techId), targetIds), "Extraction Tech order/membership differs from frozen Stage 5 COMMON_STAT membership.");
check(new Set(records.map((r) => r.techId)).size === records.length, "Extraction artifact has duplicate Tech IDs.");

const materializedLevelIds = [];
let materializedDescriptions = 0;
for (const record of records) {
  const techId = record?.techId;
  check(targetSet.has(techId), `Extraction contains non-COMMON_STAT Tech ${techId}.`);
  check(!foreignSet.has(techId), `Extraction contains excluded-label Tech ${techId}.`);
  check(record?.sourceLabel === "COMMON_STAT", `Tech ${techId} sourceLabel drifted.`);
  const census = censusById.get(techId);
  if (!census) { errors.push(`Missing Stage 1 census row for Tech ${techId}.`); continue; }
  const raw = census.raw ?? {};
  check(raw.ID === techId && raw.TechType === 1, `Tech ${techId} does not match explicit COMMON_STAT locator fields.`);
  check(Array.isArray(raw.ArmyIDRelated) && raw.ArmyIDRelated.length > 0, `Tech ${techId} lacks ArmyIDRelated.`);
  check(!Array.isArray(raw.SoldierIDRelated) || raw.SoldierIDRelated.length === 0, `Tech ${techId} has SoldierIDRelated.`);
  const refs = raw.TechLevelupInfoList ?? [];
  check(same(refs, census.explicitLevelReferences), `Tech ${techId} explicit reference projection drifted.`);
  check(same(record?.trainingTechLocator, { ID: raw.ID, ArmyIDRelated: raw.ArmyIDRelated, TechType: raw.TechType, TechLevelupInfoList: refs }), `Tech ${techId} locator materialization mismatch.`);
  const levels = record?.levels ?? [];
  check(levels.length === refs.length, `Tech ${techId} materialized level count mismatch.`);
  for (let i = 0; i < refs.length; i++) {
    const levelId = refs[i];
    const source = levelById.get(levelId);
    const level = levels[i];
    check(Boolean(source), `Unresolved source level ID ${levelId} for Tech ${techId}.`);
    if (!source) continue;
    check(level?.levelId === levelId, `Tech ${techId} level order/reference mismatch at ${levelId}.`);
    check(level?.effectTextRaw === source.Description, `TrainingTechLevel ${levelId} raw effect text mismatch.`);
    check(same(level?.sourceLevelRecord, source), `TrainingTechLevel ${levelId} full source row mismatch.`);
    if (typeof source.Description === "string" && level?.effectTextRaw === source.Description) materializedDescriptions++;
    materializedLevelIds.push(levelId);
  }
}

check(materializedLevelIds.length === 1050, `Materialized referenced level count ${materializedLevelIds.length}, expected 1050.`);
check(new Set(materializedLevelIds).size === 1050, "Materialized COMMON_STAT level IDs are not globally unique.");
check(materializedDescriptions === 1050, `Raw effect Description materialization count ${materializedDescriptions}, expected 1050.`);
check(subject.coverage?.targetTechCount === 84 && subject.coverage?.materializedTechCount === 84, "Extraction Tech coverage counters drifted.");
check(subject.coverage?.referencedLevelRowCount === 1050 && subject.coverage?.uniqueReferencedLevelRowCount === 1050, "Extraction level coverage counters drifted.");
check(subject.coverage?.unresolvedLevelReferenceCount === 0 && subject.coverage?.duplicateReferencedLevelIdCount === 0 && subject.coverage?.excludedLabelTechMaterializedCount === 0, "Extraction zero-error counters drifted.");
check(subject.policy?.classificationAuthority === "STAGE5_FROZEN_MEMBERSHIP_ONLY" && subject.policy?.explicitTechLevelupInfoListJoinOnly === true, "Extraction authority/join policy drifted.");
check(subject.policy?.descriptionsMaterializedAsRawEffectText === true && subject.policy?.descriptionUsedForClassification === false, "Description use policy drifted.");
check(subject.policy?.normalizedStatMeaningParsed === false && subject.policy?.numericEffectParsed === false, "This owner must not invent normalized/numeric effect semantics.");
check(subject.policy?.nameJoinPerformed === false && subject.policy?.idArithmeticPerformed === false && subject.policy?.missingValueImputationPerformed === false && subject.policy?.historicalOutputFallbackUsed === false && subject.policy?.stage5MembershipMutationAllowed === false, "Forbidden inference/mutation policy drifted.");
check((subject.blockers ?? []).length === 0 && (subject.reviews ?? []).length === 0, "Extraction artifact contains blocker/review entries.");
check(subject.nextOwner === boundary.parallelOwner, "Extraction handoff does not point to the separately frozen COMMON_PASSIVE owner.");

if (errors.length) {
  console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2));
  process.exit(1);
}

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-common-stat-effect-extraction-validation/v1",
  stage: "TrainingTech COMMON_STAT Effect Extraction Validation",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN",
  subject: { path: P.subject, gitBlobSha: gitBlobShaFile(P.subject) },
  authority: {
    boundary: { path: P.boundary, gitBlobSha: gitBlobShaFile(P.boundary) },
    stage5Classification: { path: P.stage5, gitBlobSha: gitBlobShaFile(P.stage5) },
    stage5Validation: { path: P.stage5Validation, gitBlobSha: gitBlobShaFile(P.stage5Validation) },
    trainingTechLocatorProjection: { path: P.stage1, gitBlobSha: gitBlobShaFile(P.stage1) },
    trainingTechLevelSource: { logicalPath: boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, gitBlobSha: gitBlobShaBytes(sourceBytes) },
  },
  coverage: {
    commonStatTechs: 84,
    materializedTechs: 84,
    referencedLevelRows: 1050,
    uniqueReferencedLevelRows: 1050,
    rawEffectTextRows: 1050,
    unresolvedLevelReferences: 0,
    duplicateLevelReferences: 0,
    foreignLabelTechs: 0,
  },
  gates: {
    boundaryFrozenComplete: true,
    stage5FrozenExact: true,
    sourceSnapshotsExact: true,
    commonStatMembershipExact: true,
    explicitLevelJoinOnly: true,
    everyReferenceResolvedExactlyOnce: true,
    fullSourceLevelRowsExact: true,
    rawDescriptionEffectsExact: true,
    noClassificationMutation: true,
    noNameJoin: true,
    noIdArithmetic: true,
    noMissingValueImputation: true,
    noSemanticNormalization: true,
    noHistoricalFallback: true,
  },
  blockers: [],
  reviews: [],
  nextOwner: subject.nextOwner,
  nextStartPoint: subject.nextStartPoint,
  reopenConditions: subject.reopenConditions,
};
const serialized = `${JSON.stringify(validation)}\n`;
if (writeMode) {
  writeFileSync(resolve(root, P.out), serialized);
  console.log(`Wrote ${P.out}`);
}
if (checkMode) {
  check(existsSync(resolve(root, P.out)), `${P.out} is missing. Run validator with --write.`);
  if (errors.length) {
    console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2));
    process.exit(1);
  }
  if (readText(P.out) !== serialized) {
    console.error(`${P.out} is stale. Run validator with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: validation.status, completion: validation.completion, coverage: validation.coverage }));
}
