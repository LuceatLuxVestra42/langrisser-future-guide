import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const P = {
  subject: "data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json",
  validation: "data/validation/soldier-training-tech-common-stat-effect-extraction.v1.json",
  stage1: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
};
const readText = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(readText(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blobText = (s) => blobBytes(Buffer.from(s));
const req = (ok, msg) => { if (!ok) throw new Error(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const subject = readJson(P.subject);
const validation = readJson(P.validation);
const stage1 = readJson(P.stage1);
const expandedText = readText(P.subject);
const expandedBlob = blobText(expandedText);
req(validation.subject?.gitBlobSha === expandedBlob, "Validation does not point to the expanded validated subject blob.");
req(subject.status === "PASS" && subject.completion === "COMPLETE" && subject.freezeState === "TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN", "Expanded subject is not frozen COMPLETE.");
req(validation.status === "PASS" && validation.completion === "COMPLETE" && validation.freezeState === subject.freezeState, "Validation is not frozen COMPLETE.");

const censusById = new Map((stage1.records ?? []).map((row) => [row.id, row]));
req(censusById.size === 287, "Stage 1 census unique Tech population drifted.");
const shapeByTech = new Map();
for (const shape of subject.effectSemantics?.effectShapeCatalog ?? []) {
  for (const techId of shape.techIds ?? []) {
    req(!shapeByTech.has(techId), `Effect-shape catalog duplicates Tech ${techId}.`);
    shapeByTech.set(techId, { shapeKey: shape.shapeKey, effects: shape.effects });
  }
}
req(shapeByTech.size === 84, `Effect-shape catalog covers ${shapeByTech.size} Techs, expected 84.`);

const sequenceMap = new Map();
let totalLevelRows = 0;
for (const record of subject.records ?? []) {
  const techId = record.techId;
  const census = censusById.get(techId);
  req(census, `Missing Stage 1 row for Tech ${techId}.`);
  const raw = census.raw ?? {};
  const expectedLocator = { ID: raw.ID, ArmyIDRelated: raw.ArmyIDRelated, TechType: raw.TechType, TechLevelupInfoList: raw.TechLevelupInfoList };
  req(record.sourceLabel === "COMMON_STAT", `Tech ${techId} source label drifted.`);
  req(same(record.trainingTechLocator, expectedLocator), `Tech ${techId} repeated locator does not reproduce from Stage 1.`);
  req(same(record.effectShape, shapeByTech.get(techId)), `Tech ${techId} repeated effect shape does not reproduce from the frozen shape catalog.`);
  const levelIds = (record.levels ?? []).map((level) => level.levelId);
  const values = (record.levels ?? []).map((level) => level.values);
  req(same(levelIds, raw.TechLevelupInfoList), `Tech ${techId} level IDs do not reproduce the explicit Stage 1 references.`);
  req(levelIds.length === values.length, `Tech ${techId} level/value cardinality mismatch.`);
  totalLevelRows += levelIds.length;
  const sequenceKey = JSON.stringify(values);
  const entry = sequenceMap.get(sequenceKey) ?? { techIds: [], values };
  entry.techIds.push(techId);
  sequenceMap.set(sequenceKey, entry);
}
req(totalLevelRows === 1050, `Validated expanded level row count ${totalLevelRows}, expected 1050.`);
const valueSequenceCatalog = [...sequenceMap.values()].map((entry, index) => ({
  sequenceId: `VALUE_SEQUENCE_${index + 1}`,
  techIds: entry.techIds,
  levelCount: entry.values.length,
  values: entry.values,
}));
req(valueSequenceCatalog.length === 10, `COMMON_STAT value-sequence catalog has ${valueSequenceCatalog.length} entries, expected 10.`);
const catalogTechIds = valueSequenceCatalog.flatMap((entry) => entry.techIds);
req(catalogTechIds.length === 84 && new Set(catalogTechIds).size === 84, "Value-sequence catalog does not cover 84 Techs exactly once.");
for (const entry of valueSequenceCatalog) {
  for (const techId of entry.techIds) {
    const refs = censusById.get(techId)?.raw?.TechLevelupInfoList ?? [];
    req(refs.length === entry.levelCount, `Tech ${techId} Stage 1 level count differs from ${entry.sequenceId}.`);
  }
}

const { records: _expandedRecords, ...subjectWithoutRecords } = subject;
const compactSubject = {
  ...subjectWithoutRecords,
  purpose: "Freeze a compact COMMON_STAT stat-effect consumer for 84 TrainingTech records. Exact source Description parsing is independently reproduced before this projection; exact level IDs remain frozen in Stage 1 and repeated value progressions are represented once in a 10-sequence catalog.",
  policy: {
    ...subject.policy,
    compactConsumerProjection: true,
    repeatedLocatorMaterializedPerTech: false,
    repeatedEffectShapeMaterializedPerTech: false,
    explicitLevelIdsMaterializedPerTech: false,
    explicitLevelIdsRecoveredFromStage1: true,
    valueSequencesCataloged: true,
  },
  valueSequenceCatalog,
};
const compactSubjectText = `${JSON.stringify(compactSubject)}\n`;
const compactSubjectBlob = blobText(compactSubjectText);
const compactValidation = {
  ...validation,
  subject: { path: P.subject, gitBlobSha: compactSubjectBlob },
  reproduction: {
    expandedValidatedSubjectGitBlobSha: expandedBlob,
    compactProjection: "FROZEN_EFFECT_SHAPES_PLUS_VALUE_SEQUENCE_CATALOG_PLUS_STAGE1_LEVEL_REFERENCES",
    valueSequenceCount: 10,
    recoverableRepeatedFields: ["sourceLabel", "trainingTechLocator", "effectShape", "explicit level IDs"],
    recoveryAuthorities: [P.stage1, "subject.effectSemantics.effectShapeCatalog", "subject.valueSequenceCatalog"],
  },
  gates: {
    ...validation.gates,
    compactConsumerProjectionExact: true,
    repeatedLocatorRecoverableFromStage1: true,
    repeatedEffectShapeRecoverableFromFrozenCatalog: true,
    explicitLevelIdsRecoverableFromStage1: true,
    frozenValueSequenceCatalog10: true,
    valueSequenceTechCoverage84Exact: true,
  },
};
const compactValidationText = `${JSON.stringify(compactValidation)}\n`;
writeFileSync(resolve(root, P.subject), compactSubjectText);
writeFileSync(resolve(root, P.validation), compactValidationText);
console.log(JSON.stringify({ status: "PASS", subjectBlob: compactSubjectBlob, expandedValidatedSubjectBlob: expandedBlob, techs: 84, levelRows: 1050, valueSequences: 10 }));
