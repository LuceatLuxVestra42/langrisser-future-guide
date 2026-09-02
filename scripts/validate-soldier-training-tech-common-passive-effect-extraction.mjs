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
  subject: "data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json",
  out: "data/validation/soldier-training-tech-common-passive-effect-extraction.v1.json",
};
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blob = (p) => blobBytes(readFileSync(resolve(root, p)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const fail = () => { console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2)); process.exit(1); };

const parseToken = (rawToken, context) => {
  const compact = rawToken.trim();
  const match = compact.match(/^([+-]?\d+(?:\.\d+)?)(%)?$/);
  if (!match) { errors.push(`${context} contains a non-numeric highlighted token: ${rawToken}`); return null; }
  return { raw: rawToken, value: Number(match[1]), lexicalUnit: match[2] ? "PERCENT" : "NUMBER" };
};
const tokenizeDescription = (description, levelId) => {
  if (typeof description !== "string" || !description.length) { errors.push(`TrainingTechLevel ${levelId} lacks Description.`); return null; }
  const tokens = [];
  let index = 0;
  const templateRichTextRaw = description.replace(/(<color=[^>]+>)([^<]*)(<\/color>)/g, (_full, open, content, close) => {
    const parsed = parseToken(content, `TrainingTechLevel ${levelId}`);
    if (parsed) tokens.push(parsed);
    return `${open}{P${index++}}${close}`;
  });
  check(tokens.length === index && tokens.length > 0, `TrainingTechLevel ${levelId} does not contain only admitted highlighted numeric parameters.`);
  const outside = description.replace(/<color=[^>]+>[\s\S]*?<\/color>/g, " ").replace(/<[^>]+>/g, " ");
  const outsideNumbers = [...outside.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
  check(outsideNumbers.length === 0, `TrainingTechLevel ${levelId} contains numeric text outside highlighted spans: ${outsideNumbers.join(",")}`);
  let reconstructed = templateRichTextRaw;
  tokens.forEach((token, i) => { reconstructed = reconstructed.replace(`{P${i}}`, token.raw); });
  check(reconstructed === description, `TrainingTechLevel ${levelId} template reconstruction is not lossless.`);
  return { templateRichTextRaw, tokens };
};

check(Boolean(sourcePath), "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
check(Boolean(sourcePath && existsSync(sourcePath)), `TrainingTechLevel source file does not exist: ${sourcePath ?? "<unset>"}`);
check(existsSync(resolve(root, P.subject)), `${P.subject} is missing.`);
if (errors.length) fail();

const boundary = json(P.boundary), stage5 = json(P.stage5), stage5Validation = json(P.stage5Validation), stage1 = json(P.stage1), subject = json(P.subject);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

check(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Boundary is not frozen COMPLETE.");
check(boundary.parallelOwner === "TrainingTech COMMON_PASSIVE Effect Extraction", "Boundary COMMON_PASSIVE owner drifted.");
check(blob(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
check(blob(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) check(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
check(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
check(stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 locator is not lossless.");
check(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity mismatch.");
check(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Stage 1 TrainingTechLevel identity mismatch.");
check(blobBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel blob mismatch.");
check(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

check(subject.schemaId === "soldier-training-tech-common-passive-effect-extraction/v1" && subject.stage === "TrainingTech COMMON_PASSIVE Effect Extraction", "Unexpected extraction schema/stage.");
check(subject.status === "PASS" && subject.completion === "COMPLETE" && subject.freezeState === "TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN", "Extraction artifact is not PASS/COMPLETE/FROZEN.");
check(subject.authority?.boundary?.gitBlobSha === blob(P.boundary), "Boundary provenance mismatch.");
check(subject.authority?.stage5Classification?.gitBlobSha === blob(P.stage5), "Stage 5 provenance mismatch.");
check(subject.authority?.stage5Validation?.gitBlobSha === blob(P.stage5Validation), "Stage 5 validation provenance mismatch.");
check(subject.authority?.trainingTechLocatorProjection?.gitBlobSha === blob(P.stage1), "Stage 1 locator provenance mismatch.");
check(subject.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "Subject TrainingTech snapshot mismatch.");
check(subject.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Subject TrainingTechLevel snapshot mismatch.");

const targetIds = stage5.classificationByLabel?.COMMON_PASSIVE ?? [];
check(targetIds.length === 46 && new Set(targetIds).size === 46, "Frozen COMMON_PASSIVE membership is not 46 unique IDs.");
const target = new Set(targetIds);
const foreign = new Set([...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []), ...(stage5.classificationByLabel?.COMMON_STAT ?? []), ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []), ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? [])]);
const censusById = new Map((stage1.records ?? []).map((row) => [row.id, row]));
check(censusById.size === 287, "Stage 1 census unique Tech count is not 287.");
const levelById = new Map();
for (const row of levelRows) {
  check(Number.isInteger(row?.ID), "TrainingTechLevel source contains non-integer ID.");
  if (!Number.isInteger(row?.ID)) continue;
  check(!levelById.has(row.ID), `Duplicate TrainingTechLevel source ID ${row.ID}.`);
  if (!levelById.has(row.ID)) levelById.set(row.ID, row);
}
check(levelById.size === 2945, "TrainingTechLevel unique ID count is not 2945.");

const records = subject.records ?? [];
check(Array.isArray(records) && records.length === 46, "Subject does not contain 46 Tech records.");
check(same(records.map((record) => record.techId), targetIds), "Subject Tech order/membership differs from Stage 5 COMMON_PASSIVE.");
check(new Set(records.map((record) => record.techId)).size === records.length, "Subject has duplicate Tech IDs.");
const templates = new Set();
const levelIds = [];
let parameterCount = 0;
let foreignCount = 0;
for (const record of records) {
  const techId = record?.techId;
  if (!target.has(techId) || foreign.has(techId)) foreignCount++;
  const census = censusById.get(techId);
  if (!census) { errors.push(`Missing Stage 1 row for Tech ${techId}.`); continue; }
  const refs = census.raw?.TechLevelupInfoList ?? [];
  check(Array.isArray(refs) && refs.length === 10, `Tech ${techId} explicit level reference count is not 10.`);
  check(same(refs, census.explicitLevelReferences), `Tech ${techId} level reference projection drifted.`);
  const expectedRows = [];
  let expectedTemplate = null;
  let expectedPattern = null;
  refs.forEach((levelId) => {
    const source = levelById.get(levelId);
    check(Boolean(source), `Unresolved TrainingTechLevel ID ${levelId}.`);
    if (!source) return;
    const tokenized = tokenizeDescription(source.Description, levelId);
    if (!tokenized) return;
    const pattern = tokenized.tokens.map((token) => token.lexicalUnit);
    if (expectedTemplate == null) { expectedTemplate = tokenized.templateRichTextRaw; expectedPattern = pattern; }
    check(tokenized.templateRichTextRaw === expectedTemplate, `Tech ${techId} source template changes across levels.`);
    check(same(pattern, expectedPattern), `Tech ${techId} lexical-unit pattern changes across levels.`);
    expectedRows.push(tokenized.tokens);
    levelIds.push(levelId);
    parameterCount += tokenized.tokens.length;
  });
  templates.add(expectedTemplate);
  check(record?.templateRichTextRaw === expectedTemplate, `Tech ${techId} template mismatch.`);
  check(record?.parameterCount === expectedPattern?.length, `Tech ${techId} parameterCount mismatch.`);
  check(same(record?.lexicalUnitPattern, expectedPattern), `Tech ${techId} lexicalUnitPattern mismatch.`);
  check(same(record?.levelParameterRows, expectedRows), `Tech ${techId} parameter rows do not reproduce from pinned source descriptions.`);
}

check(levelIds.length === 460 && new Set(levelIds).size === 460, "COMMON_PASSIVE materialized level coverage is not 460 unique IDs.");
check(parameterCount === 590, `COMMON_PASSIVE highlighted parameter coverage is ${parameterCount}, expected 590.`);
check(templates.size === 46, `COMMON_PASSIVE unique source template count is ${templates.size}, expected 46.`);
check(foreignCount === 0, `Subject contains ${foreignCount} foreign-label Tech records.`);
check(subject.coverage?.targetTechCount === 46 && subject.coverage?.materializedTechCount === 46 && subject.coverage?.levelRowsPerTech === 10, "Subject Tech coverage counters drifted.");
check(subject.coverage?.referencedLevelRowCount === 460 && subject.coverage?.uniqueReferencedLevelRowCount === 460, "Subject level coverage counters drifted.");
check(subject.coverage?.highlightedParameterCount === 590 && subject.coverage?.uniqueTemplateCount === 46, "Subject parameter/template coverage counters drifted.");
check(subject.coverage?.templateDriftTechCount === 0 && subject.coverage?.lexicalUnitPatternDriftTechCount === 0 && subject.coverage?.numericTokensOutsideHighlightedSpans === 0 && subject.coverage?.nonNumericHighlightedParameterCount === 0, "Subject zero-drift token/template counters drifted.");
check(subject.coverage?.unresolvedLevelReferenceCount === 0 && subject.coverage?.duplicateReferencedLevelIdCount === 0 && subject.coverage?.excludedLabelTechMaterializedCount === 0, "Subject zero-error coverage counters drifted.");
check(subject.effectSemantics?.model === "LOSSLESS_PARAMETERIZED_RICH_TEXT_TEMPLATE" && subject.effectSemantics?.semanticDepth === "PARAMETERIZED_TEMPLATE_ONLY", "Subject passive semantic depth drifted.");
const policy = subject.policy ?? {};
check(policy.classificationAuthority === "STAGE5_FROZEN_MEMBERSHIP_ONLY" && policy.explicitTechLevelupInfoListJoinOnly === true, "Subject authority/join policy drifted.");
check(policy.sourceDescriptionTemplatePreserved === true && policy.highlightedNumericParametersStructured === true && policy.explicitLevelIdsRecoveredFromStage1 === true, "Subject extraction policy drifted.");
check(policy.parameterRoleInferencePerformed === false && policy.conditionAstInferencePerformed === false && policy.effectTargetNormalizationPerformed === false, "Subject inferred passive semantics beyond the frozen template boundary.");
check(policy.nameJoinPerformed === false && policy.idArithmeticPerformed === false && policy.missingValueImputationPerformed === false && policy.historicalOutputFallbackUsed === false && policy.stage5MembershipMutationAllowed === false, "Forbidden inference/mutation policy drifted.");
check((subject.blockers ?? []).length === 0 && (subject.reviews ?? []).length === 0, "Subject has blockers/reviews.");
check(subject.nextOwner === "MANUAL_REVIEW", "Subject invents a downstream owner not defined by the current boundary.");
if (errors.length) fail();

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-common-passive-effect-extraction-validation/v1",
  stage: "TrainingTech COMMON_PASSIVE Effect Extraction Validation",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN",
  subject: { path: P.subject, gitBlobSha: blob(P.subject) },
  authority: {
    boundary: { path: P.boundary, gitBlobSha: blob(P.boundary) },
    stage5Classification: { path: P.stage5, gitBlobSha: blob(P.stage5) },
    stage5Validation: { path: P.stage5Validation, gitBlobSha: blob(P.stage5Validation) },
    trainingTechLocatorProjection: { path: P.stage1, gitBlobSha: blob(P.stage1) },
    trainingTechLevelSource: { logicalPath: stage1.sourceSnapshots.trainingTechLevel.path, gitBlobSha: blobBytes(sourceBytes) },
  },
  coverage: {
    commonPassiveTechs: 46,
    materializedTechs: 46,
    levelRowsPerTech: 10,
    referencedLevelRows: 460,
    uniqueReferencedLevelRows: 460,
    highlightedParameters: 590,
    uniqueTemplates: 46,
    unresolvedLevelReferences: 0,
    duplicateLevelReferences: 0,
    foreignLabelTechs: 0,
  },
  gates: {
    boundaryFrozenComplete: true,
    stage5FrozenExact: true,
    sourceSnapshotsExact: true,
    commonPassiveMembershipExact: true,
    explicitLevelJoinOnly: true,
    everyReferenceResolvedExactlyOnce: true,
    tenExplicitLevelRowsPerTech: true,
    sourceTemplateStableWithinEachTech: true,
    frozenUniqueTemplateCount46: true,
    frozenHighlightedParameterCount590: true,
    everyHighlightedParameterNumeric: true,
    noNumericTokensOutsideHighlightedSpans: true,
    lexicalUnitPatternStableWithinEachTech: true,
    losslessDescriptionReconstructionExact: true,
    noParameterRoleInference: true,
    noConditionAstInference: true,
    noEffectTargetNormalization: true,
    noClassificationMutation: true,
    noNameJoin: true,
    noIdArithmetic: true,
    noMissingValueImputation: true,
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
  if (errors.length) fail();
  if (text(P.out) !== serialized) {
    console.error(`${P.out} is stale. Run validator with --write.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: validation.status, completion: validation.completion, coverage: validation.coverage }));
}
