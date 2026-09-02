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
  out: "data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json",
};
const sourceCarrier = { commit: "172d836e59fbdd84bca5e44a9b2e26d8812a927f", logicalPath: "data/configdata/ConfigDataTrainingTechLevelInfo.json" };
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blob = (p) => blobBytes(readFileSync(resolve(root, p)));
const req = (ok, msg) => { if (!ok) throw new Error(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const parseToken = (rawToken, context) => {
  const compact = rawToken.trim();
  const match = compact.match(/^([+-]?\d+(?:\.\d+)?)(%)?$/);
  req(match, `${context} contains a non-numeric highlighted token: ${rawToken}`);
  return {
    raw: rawToken,
    value: Number(match[1]),
    lexicalUnit: match[2] ? "PERCENT" : "NUMBER",
  };
};

const tokenizeDescription = (description, levelId) => {
  req(typeof description === "string" && description.length > 0, `TrainingTechLevel ${levelId} lacks Description.`);
  const tokens = [];
  let index = 0;
  const templateRichTextRaw = description.replace(/(<color=[^>]+>)([^<]*)(<\/color>)/g, (_full, open, content, close) => {
    const parsed = parseToken(content, `TrainingTechLevel ${levelId}`);
    tokens.push(parsed);
    const placeholder = `{P${index}}`;
    index++;
    return `${open}${placeholder}${close}`;
  });
  req(tokens.length > 0, `TrainingTechLevel ${levelId} has no highlighted numeric parameter.`);
  const outside = description.replace(/<color=[^>]+>[\s\S]*?<\/color>/g, " ").replace(/<[^>]+>/g, " ");
  const outsideNumbers = [...outside.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
  req(outsideNumbers.length === 0, `TrainingTechLevel ${levelId} contains numeric text outside highlighted parameter spans: ${outsideNumbers.join(",")}`);
  let reconstructed = templateRichTextRaw;
  tokens.forEach((token, i) => { reconstructed = reconstructed.replace(`{P${i}}`, token.raw); });
  req(reconstructed === description, `TrainingTechLevel ${levelId} template reconstruction is not lossless.`);
  return { templateRichTextRaw, tokens };
};

req(sourcePath, "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
req(existsSync(sourcePath), `TrainingTechLevel source file does not exist: ${sourcePath}`);
const boundary = json(P.boundary), stage5 = json(P.stage5), stage5Validation = json(P.stage5Validation), stage1 = json(P.stage1);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

req(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Effect extraction boundary is not frozen COMPLETE.");
req(boundary.parallelOwner === "TrainingTech COMMON_PASSIVE Effect Extraction", "Boundary does not assign COMMON_PASSIVE as the separate extraction owner.");
req(blob(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
req(blob(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) req(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
req(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
req(stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 is not a lossless TrainingTech projection.");
req(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity drifted.");
req(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "TrainingTechLevel source identity drifted in Stage 1.");
req(blobBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel source blob does not match the frozen boundary.");
req(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

const targetIds = stage5.classificationByLabel?.COMMON_PASSIVE ?? [];
req(targetIds.length === 46 && new Set(targetIds).size === 46, "Frozen COMMON_PASSIVE membership is not 46 unique Tech IDs.");
req(boundary.frozenPopulationBoundary?.extractionTargets?.COMMON_PASSIVE === 46, "Boundary COMMON_PASSIVE population drifted.");
const excluded = new Set([...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []), ...(stage5.classificationByLabel?.COMMON_STAT ?? []), ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []), ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? [])]);
for (const id of targetIds) req(!excluded.has(id), `COMMON_PASSIVE target overlaps excluded label: ${id}`);

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
let highlightedParameterCount = 0;
const templates = new Set();
const records = targetIds.map((techId) => {
  const census = censusById.get(techId);
  req(census, `Missing Stage 1 TrainingTech row: ${techId}`);
  const raw = census.raw ?? {};
  req(raw.ID === techId, `COMMON_PASSIVE Tech ${techId} explicit ID drifted.`);
  const refs = raw.TechLevelupInfoList;
  req(Array.isArray(refs) && refs.length === 10, `COMMON_PASSIVE Tech ${techId} explicit level reference count is not 10.`);
  req(same(refs, census.explicitLevelReferences), `Stage 1 explicit level reference projection drifted for Tech ${techId}.`);
  let templateRichTextRaw = null;
  let lexicalUnitPattern = null;
  const parameterRows = refs.map((levelId) => {
    req(Number.isInteger(levelId), `Tech ${techId} has a non-integer level reference.`);
    const source = levelById.get(levelId);
    req(source, `Unresolved TrainingTechLevel ID ${levelId} referenced by Tech ${techId}.`);
    const tokenized = tokenizeDescription(source.Description, levelId);
    const pattern = tokenized.tokens.map((token) => token.lexicalUnit);
    if (templateRichTextRaw == null) {
      templateRichTextRaw = tokenized.templateRichTextRaw;
      lexicalUnitPattern = pattern;
    }
    req(tokenized.templateRichTextRaw === templateRichTextRaw, `COMMON_PASSIVE Tech ${techId} changes Description template across levels.`);
    req(same(pattern, lexicalUnitPattern), `COMMON_PASSIVE Tech ${techId} changes parameter lexical-unit pattern across levels.`);
    referencedLevelIds.push(levelId);
    highlightedParameterCount += tokenized.tokens.length;
    return tokenized.tokens;
  });
  req(templateRichTextRaw && lexicalUnitPattern?.length > 0, `COMMON_PASSIVE Tech ${techId} did not yield a template.`);
  templates.add(templateRichTextRaw);
  return {
    techId,
    templateRichTextRaw,
    parameterCount: lexicalUnitPattern.length,
    lexicalUnitPattern,
    levelParameterRows: parameterRows,
  };
});

req(records.length === 46, "Materialized COMMON_PASSIVE Tech count is not 46.");
req(referencedLevelIds.length === 460, `COMMON_PASSIVE referenced level row count ${referencedLevelIds.length}, expected 460.`);
req(new Set(referencedLevelIds).size === 460, "COMMON_PASSIVE level references are not globally unique.");
req(highlightedParameterCount === 590, `COMMON_PASSIVE highlighted parameter count ${highlightedParameterCount}, expected 590.`);
req(templates.size === 46, `COMMON_PASSIVE unique template count ${templates.size}, expected 46.`);

const output = {
  version: 1,
  schemaId: "soldier-training-tech-common-passive-effect-extraction/v1",
  stage: "TrainingTech COMMON_PASSIVE Effect Extraction",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN",
  purpose: "Freeze a lossless parameterized source-Description representation for the frozen 46 COMMON_PASSIVE TrainingTech records. Conditional/passive meaning is preserved in the exact rich-text template while numeric highlighted parameters are structured without inferring parameter roles or a condition AST.",
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
  effectSemantics: {
    model: "LOSSLESS_PARAMETERIZED_RICH_TEXT_TEMPLATE",
    placeholderRule: "Each explicit <color=...>...</color> numeric span is replaced in-place by {P0}, {P1}, ... while preserving the surrounding rich-text tags exactly.",
    lexicalUnitRule: "A highlighted token carrying '%' is PERCENT; otherwise it is NUMBER. NUMBER is intentionally lexical and does not imply distance, count, flat stat, or another semantic unit.",
    reconstructionRule: "For each explicit Stage 1 TechLevelupInfoList row, substituting parameter.raw values into the Tech template in placeholder order must reproduce the pinned source Description byte-for-byte.",
    semanticDepth: "PARAMETERIZED_TEMPLATE_ONLY",
  },
  policy: {
    inputLabel: "COMMON_PASSIVE",
    classificationAuthority: "STAGE5_FROZEN_MEMBERSHIP_ONLY",
    explicitTechLevelupInfoListJoinOnly: true,
    sourceDescriptionTemplatePreserved: true,
    highlightedNumericParametersStructured: true,
    explicitLevelIdsMaterializedPerTech: false,
    explicitLevelIdsRecoveredFromStage1: true,
    levelParameterRowOrderAlignedToExplicitTechLevelupInfoList: true,
    parameterRoleInferencePerformed: false,
    conditionAstInferencePerformed: false,
    effectTargetNormalizationPerformed: false,
    descriptionUsedForClassification: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    sourceOrderUsedForClassificationMeaning: false,
    missingValueImputationPerformed: false,
    historicalOutputFallbackUsed: false,
    stage5MembershipMutationAllowed: false,
  },
  coverage: {
    targetTechCount: 46,
    materializedTechCount: 46,
    levelRowsPerTech: 10,
    referencedLevelRowCount: 460,
    uniqueReferencedLevelRowCount: 460,
    highlightedParameterCount: 590,
    uniqueTemplateCount: 46,
    templateDriftTechCount: 0,
    lexicalUnitPatternDriftTechCount: 0,
    numericTokensOutsideHighlightedSpans: 0,
    nonNumericHighlightedParameterCount: 0,
    unresolvedLevelReferenceCount: 0,
    duplicateReferencedLevelIdCount: 0,
    excludedLabelTechMaterializedCount: 0,
    sourceLevelPopulation: 2945,
  },
  records,
  blockers: [],
  reviews: [],
  nextOwner: "MANUAL_REVIEW",
  nextStartPoint: "COMMON_STAT and COMMON_PASSIVE extraction are both frozen. The current boundary does not define a downstream owner after the two extraction owners; route any localization, aggregation, or frontend consumer work through the current Project Check/orchestration contract instead of inventing a semantic successor.",
  reopenConditions: [
    "Effect extraction boundary or Stage 5 frozen predecessor blob identity changes.",
    "TrainingTech or TrainingTechLevel frozen source snapshot identity changes.",
    "The frozen COMMON_PASSIVE membership is no longer exactly 46 Tech IDs.",
    "Any explicit TechLevelupInfoList reference fails exact resolution.",
    "Any COMMON_PASSIVE Description changes template across its explicit level rows.",
    "Any numeric source token exists outside admitted highlighted spans or any highlighted parameter is non-numeric.",
    "Lossless template reconstruction no longer reproduces the pinned source Description exactly.",
    "Independent validator fails or Project Check reports a hard owning-validator failure."
  ],
};
const serialized = `${JSON.stringify(output)}\n`;
if (writeMode) {
  writeFileSync(resolve(root, P.out), serialized);
  console.log(`Wrote ${P.out}`);
}
if (checkMode) {
  req(existsSync(resolve(root, P.out)), `${P.out} is missing. Run with --write.`);
  if (text(P.out) !== serialized) {
    console.error(`${P.out} is stale. Run with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: output.status, completion: output.completion, coverage: output.coverage }));
}
