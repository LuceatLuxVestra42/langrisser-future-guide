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
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blob = (p) => blobBytes(readFileSync(resolve(root, p)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const fail = () => { console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2)); process.exit(1); };
const statKey = { "生命": "HP", "攻击": "ATK", "防御": "DEF", "魔防": "MDEF" };
const frozenShapeSnapshot = [
  { shapeKey: "ATK:FLAT", techIds: [118,217,317,420,517,618], levelRowCount: 90 },
  { shapeKey: "ATK:PERCENT", techIds: [109,119,127,209,218,225,309,318,326,411,421,430,509,525,533,610,626,635], levelRowCount: 240 },
  { shapeKey: "DEF:FLAT|MDEF:FLAT", techIds: [102,111,202,211,302,311,402,413,502,518,602,619], levelRowCount: 120 },
  { shapeKey: "DEF:PERCENT|MDEF:PERCENT", techIds: [104,121,128,204,220,226,304,320,327,404,423,431,504,526,534,604,628,636], levelRowCount: 240 },
  { shapeKey: "HP:FLAT", techIds: [110,210,310,412,510,611], levelRowCount: 90 },
  { shapeKey: "HP:FLAT|ATK:FLAT", techIds: [101,201,301,401,501,601], levelRowCount: 30 },
  { shapeKey: "HP:PERCENT", techIds: [103,120,129,203,219,227,303,319,328,403,422,432,503,527,535,603,627,637], levelRowCount: 240 },
];

const independentlyParseDescription = (rawText, levelId) => {
  if (typeof rawText !== "string" || rawText.length === 0) { errors.push(`TrainingTechLevel ${levelId} lacks Description.`); return null; }
  const highlightedRaw = [...rawText.matchAll(/<color=[^>]+>\s*([^<]+?)\s*<\/color>/g)].map((m) => m[1].replace(/\s+/g, ""));
  if (!highlightedRaw.length) { errors.push(`TrainingTechLevel ${levelId} has no highlighted effect token.`); return null; }
  const highlighted = [];
  for (const token of highlightedRaw) {
    const m = token.match(/^([+-]?\d+(?:\.\d+)?)(%)?$/);
    if (!m) { errors.push(`TrainingTechLevel ${levelId} has non-numeric highlighted token ${token}.`); return null; }
    highlighted.push({ value: Number(m[1]), unit: m[2] ? "PERCENT" : "FLAT" });
  }
  const plain = rawText.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
  const everyNumber = [...plain.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
  if (everyNumber.length !== highlighted.length) { errors.push(`TrainingTechLevel ${levelId} has numeric text outside admitted highlighted effects.`); return null; }
  const rx = /(生命|攻击|防御|魔防)(?:提升|提高|增加)?\s*([+-]?\d+(?:\.\d+)?)(%?)/g;
  const matches = [...plain.matchAll(rx)];
  if (matches.length !== highlighted.length) { errors.push(`TrainingTechLevel ${levelId} stat/value count differs from highlighted effect count.`); return null; }
  const effects = matches.map((m, i) => {
    const unit = m[3] ? "PERCENT" : "FLAT";
    const value = Number(m[2]);
    if (value !== highlighted[i].value || unit !== highlighted[i].unit) errors.push(`TrainingTechLevel ${levelId} highlighted value/stat alignment mismatch.`);
    return { statTokenRaw: m[1], statKey: statKey[m[1]], unit, value, valueTextRaw: `${m[2]}${m[3]}` };
  });
  if (effects.some((e) => !e.statKey)) errors.push(`TrainingTechLevel ${levelId} has an unrecognized stat token.`);
  return { effects, shapeKey: effects.map((e) => `${e.statKey}:${e.unit}`).join("|") };
};

check(Boolean(sourcePath), "TRAINING_TECH_LEVEL_SOURCE is required; no source fallback is allowed.");
check(Boolean(sourcePath && existsSync(sourcePath)), `TrainingTechLevel source file does not exist: ${sourcePath ?? "<unset>"}`);
check(existsSync(resolve(root, P.subject)), `${P.subject} is missing.`);
if (errors.length) fail();

const boundary = json(P.boundary), stage5 = json(P.stage5), stage5Validation = json(P.stage5Validation), stage1 = json(P.stage1), subject = json(P.subject);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

check(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Boundary is not frozen COMPLETE.");
check(boundary.nextOwner === "TrainingTech COMMON_STAT Effect Extraction", "Boundary next owner drifted.");
check(blob(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
check(blob(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const s of [stage5, stage5Validation]) check(s.status === "PASS" && s.completion === "COMPLETE" && s.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
check(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
check(stage1.censusPolicy?.trainingTechRecordProjection === "LOSSLESS_PARSED_RECORD" && stage1.censusPolicy?.trainingTechRawRoundTripRequired === true, "Stage 1 locator is not lossless.");
check(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity mismatch.");
check(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Stage 1 TrainingTechLevel identity mismatch.");
check(blobBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel blob mismatch.");
check(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

check(subject.schemaId === "soldier-training-tech-common-stat-effect-extraction/v1" && subject.stage === "TrainingTech COMMON_STAT Effect Extraction", "Unexpected extraction schema/stage.");
check(subject.status === "PASS" && subject.completion === "COMPLETE" && subject.freezeState === "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN", "Extraction artifact is not PASS/COMPLETE/FROZEN.");
check(subject.authority?.boundary?.gitBlobSha === blob(P.boundary), "Boundary provenance mismatch.");
check(subject.authority?.stage5Classification?.gitBlobSha === blob(P.stage5), "Stage 5 provenance mismatch.");
check(subject.authority?.stage5Validation?.gitBlobSha === blob(P.stage5Validation), "Stage 5 validation provenance mismatch.");
check(subject.authority?.trainingTechLocatorProjection?.gitBlobSha === blob(P.stage1), "Stage 1 locator provenance mismatch.");
check(subject.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "Subject TrainingTech snapshot mismatch.");
check(subject.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Subject TrainingTechLevel snapshot mismatch.");
check(same(subject.effectSemantics?.statTokenMap, statKey), "Subject stat-token map drifted.");
check(subject.effectSemantics?.model === "DIRECT_DESCRIPTION_STAT_VALUE_TOKENS", "Subject effect semantics model drifted.");

const targetIds = stage5.classificationByLabel?.COMMON_STAT ?? [];
check(targetIds.length === 84 && new Set(targetIds).size === 84, "Frozen COMMON_STAT membership is not 84 unique IDs.");
const target = new Set(targetIds);
const foreign = new Set([...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []), ...(stage5.classificationByLabel?.COMMON_PASSIVE ?? []), ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []), ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? [])]);
const censusById = new Map((stage1.records ?? []).map((r) => [r.id, r]));
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
check(Array.isArray(records) && records.length === 84, "Subject does not contain 84 Tech records.");
check(same(records.map((r) => r.techId), targetIds), "Subject Tech order/membership differs from Stage 5 COMMON_STAT.");
check(new Set(records.map((r) => r.techId)).size === records.length, "Subject has duplicate Tech IDs.");
const levelIds = [];
let rawEffectTextRows = 0;
let structuredEffectRows = 0;
let structuredEffectEntries = 0;
const independentShapeCatalog = new Map();
for (const record of records) {
  const techId = record?.techId;
  check(target.has(techId) && !foreign.has(techId), `Foreign or excluded Tech materialized: ${techId}.`);
  check(record?.sourceLabel === "COMMON_STAT", `Tech ${techId} sourceLabel drifted.`);
  const census = censusById.get(techId);
  if (!census) { errors.push(`Missing Stage 1 row for Tech ${techId}.`); continue; }
  const raw = census.raw ?? {}, refs = raw.TechLevelupInfoList ?? [];
  check(raw.ID === techId && raw.TechType === 1, `Tech ${techId} explicit locator fields drifted.`);
  check(Array.isArray(raw.ArmyIDRelated) && raw.ArmyIDRelated.length > 0, `Tech ${techId} lacks ArmyIDRelated.`);
  check(!Array.isArray(raw.SoldierIDRelated) || raw.SoldierIDRelated.length === 0, `Tech ${techId} has SoldierIDRelated.`);
  check(same(refs, census.explicitLevelReferences), `Tech ${techId} level reference projection drifted.`);
  check(same(record?.trainingTechLocator, { ID: raw.ID, ArmyIDRelated: raw.ArmyIDRelated, TechType: raw.TechType, TechLevelupInfoList: refs }), `Tech ${techId} locator materialization mismatch.`);
  const levels = record?.levels ?? [];
  check(levels.length === refs.length, `Tech ${techId} materialized level count mismatch.`);
  let expectedShapeKey = null;
  let expectedShape = null;
  refs.forEach((levelId, i) => {
    const source = levelById.get(levelId);
    check(Boolean(source), `Unresolved TrainingTechLevel ID ${levelId}.`);
    if (!source) return;
    const expected = independentlyParseDescription(source.Description, levelId);
    if (!expected) return;
    if (expectedShapeKey == null) {
      expectedShapeKey = expected.shapeKey;
      expectedShape = expected.effects.map(({ statTokenRaw, statKey: key, unit }) => ({ statTokenRaw, statKey: key, unit }));
    }
    check(expected.shapeKey === expectedShapeKey, `Tech ${techId} changes effect shape across source levels.`);
    const level = levels[i];
    check(level?.levelId === levelId, `Tech ${techId} level reference/order mismatch at ${levelId}.`);
    check(level?.effectTextRaw === source.Description, `TrainingTechLevel ${levelId} effectTextRaw mismatch.`);
    check(same(level?.effects, expected.effects), `TrainingTechLevel ${levelId} structured effects do not exactly match source Description.`);
    check(Object.keys(level ?? {}).sort().join("|") === "effectTextRaw|effects|levelId", `TrainingTechLevel ${levelId} generated row contains fields outside the admitted effect projection.`);
    if (level?.effectTextRaw === source.Description) rawEffectTextRows++;
    if (same(level?.effects, expected.effects)) structuredEffectRows++;
    structuredEffectEntries += expected.effects.length;
    levelIds.push(levelId);
  });
  check(record?.effectShape?.shapeKey === expectedShapeKey && same(record?.effectShape?.effects, expectedShape), `Tech ${techId} effectShape differs from independently parsed source shape.`);
  if (expectedShapeKey && expectedShape) {
    const current = independentShapeCatalog.get(expectedShapeKey) ?? { shapeKey: expectedShapeKey, effects: expectedShape, techIds: [], levelRowCount: 0 };
    current.techIds.push(techId);
    current.levelRowCount += refs.length;
    independentShapeCatalog.set(expectedShapeKey, current);
  }
}

const independentCatalog = [...independentShapeCatalog.values()].sort((a, b) => a.shapeKey.localeCompare(b.shapeKey));
check(levelIds.length === 1050 && new Set(levelIds).size === 1050, "COMMON_STAT materialized level coverage is not 1050 unique IDs.");
check(rawEffectTextRows === 1050, "COMMON_STAT raw Description effect coverage is not 1050 rows.");
check(structuredEffectRows === 1050, "COMMON_STAT structured effect coverage is not 1050 rows.");
check(same(subject.effectSemantics?.effectShapeCatalog, independentCatalog), "Subject effect shape catalog differs from independently parsed source shapes.");
const compactShapeSnapshot = independentCatalog.map(({ shapeKey, techIds, levelRowCount }) => ({ shapeKey, techIds, levelRowCount }));
check(same(compactShapeSnapshot, frozenShapeSnapshot), "COMMON_STAT frozen effect-shape membership snapshot drifted.");
check(structuredEffectEntries === 1440 && independentCatalog.length === 7, "COMMON_STAT frozen structured-effect totals drifted from 1440 entries / 7 shapes.");
check(subject.coverage?.targetTechCount === 84 && subject.coverage?.materializedTechCount === 84, "Subject Tech coverage counters drifted.");
check(subject.coverage?.referencedLevelRowCount === 1050 && subject.coverage?.uniqueReferencedLevelRowCount === 1050 && subject.coverage?.rawEffectTextRowCount === 1050 && subject.coverage?.structuredEffectRowCount === 1050, "Subject level/effect coverage counters drifted.");
check(subject.coverage?.structuredEffectEntryCount === structuredEffectEntries && subject.coverage?.effectShapeCount === independentCatalog.length, "Subject structured effect counters drifted.");
check(subject.coverage?.unresolvedLevelReferenceCount === 0 && subject.coverage?.duplicateReferencedLevelIdCount === 0 && subject.coverage?.excludedLabelTechMaterializedCount === 0, "Subject zero-error counters drifted.");
const pol = subject.policy ?? {};
check(pol.classificationAuthority === "STAGE5_FROZEN_MEMBERSHIP_ONLY" && pol.explicitTechLevelupInfoListJoinOnly === true, "Subject authority/join policy drifted.");
check(pol.descriptionsMaterializedAsRawEffectText === true && pol.directStatTokensStructured === true && pol.numericEffectParsed === true, "Structured effect materialization policy drifted.");
check(pol.conditionalEffectInferencePerformed === false && pol.unrelatedTrainingTechLevelFieldsDuplicated === false && pol.sourceRowsReadByValidatorForExactResolution === true, "Effect scope policy drifted.");
check(pol.descriptionUsedForClassification === false && pol.nameJoinPerformed === false && pol.idArithmeticPerformed === false && pol.missingValueImputationPerformed === false && pol.historicalOutputFallbackUsed === false && pol.stage5MembershipMutationAllowed === false, "Forbidden inference/mutation policy drifted.");
check((subject.blockers ?? []).length === 0 && (subject.reviews ?? []).length === 0, "Subject has blockers/reviews.");
check(subject.nextOwner === boundary.parallelOwner, "Subject handoff does not match frozen parallel owner.");
if (errors.length) fail();

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-common-stat-effect-extraction-validation/v1",
  stage: "TrainingTech COMMON_STAT Effect Extraction Validation",
  status: "PASS",
  completion: "COMPLETE",
  freezeState: "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN",
  subject: { path: P.subject, gitBlobSha: blob(P.subject) },
  authority: {
    boundary: { path: P.boundary, gitBlobSha: blob(P.boundary) },
    stage5Classification: { path: P.stage5, gitBlobSha: blob(P.stage5) },
    stage5Validation: { path: P.stage5Validation, gitBlobSha: blob(P.stage5Validation) },
    trainingTechLocatorProjection: { path: P.stage1, gitBlobSha: blob(P.stage1) },
    trainingTechLevelSource: { logicalPath: stage1.sourceSnapshots.trainingTechLevel.path, gitBlobSha: blobBytes(sourceBytes) },
  },
  coverage: {
    commonStatTechs: 84,
    materializedTechs: 84,
    referencedLevelRows: 1050,
    uniqueReferencedLevelRows: 1050,
    rawEffectTextRows: 1050,
    structuredEffectRows: 1050,
    structuredEffectEntries,
    effectShapes: independentCatalog.length,
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
    rawDescriptionEffectsExact: true,
    everyNumericTokenAdmittedByExplicitStatValueAlignment: true,
    structuredStatValuesExact: true,
    effectShapeStableWithinEachTech: true,
    frozenShapeSnapshotExact: true,
    frozenStructuredEffectEntries1440: true,
    frozenEffectShapes7: true,
    noConditionalInference: true,
    noUnrelatedSourceRowDuplication: true,
    noClassificationMutation: true,
    noNameJoin: true,
    noIdArithmetic: true,
    noMissingValueImputation: true,
    noHistoricalFallback: true,
  },
  effectShapeCatalog: independentCatalog,
  blockers: [],
  reviews: [],
  nextOwner: subject.nextOwner,
  nextStartPoint: subject.nextStartPoint,
  reopenConditions: subject.reopenConditions,
};
const serialized = `${JSON.stringify(validation)}\n`;
if (writeMode) { writeFileSync(resolve(root, P.out), serialized); console.log(`Wrote ${P.out}`); }
if (checkMode) {
  check(existsSync(resolve(root, P.out)), `${P.out} is missing. Run validator with --write.`);
  if (errors.length) fail();
  if (text(P.out) !== serialized) { console.error(`${P.out} is stale. Run validator with --write.`); process.exit(1); }
  console.log(JSON.stringify({ status: validation.status, completion: validation.completion, coverage: validation.coverage }));
}
