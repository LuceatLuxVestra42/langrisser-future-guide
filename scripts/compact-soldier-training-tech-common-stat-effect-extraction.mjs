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

const compactRecords = (subject.records ?? []).map((record) => {
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
  req(same(levelIds, raw.TechLevelupInfoList), `Tech ${techId} level IDs do not reproduce the explicit source references.`);
  req(levelIds.length === values.length, `Tech ${techId} compact level/value cardinality mismatch.`);
  return { techId, levelIds, values };
});
req(compactRecords.length === 84 && new Set(compactRecords.map((r) => r.techId)).size === 84, "Compact projection does not contain 84 unique Techs.");
req(compactRecords.reduce((n, r) => n + r.levelIds.length, 0) === 1050, "Compact projection does not contain 1050 explicit level IDs.");

const compactSubject = {
  ...subject,
  purpose: "Freeze a compact COMMON_STAT stat-effect consumer for 84 TrainingTech records. Exact source Description parsing remains independently reproduced before this projection; repeated locators and shape definitions are recoverable from frozen predecessors/catalogs and are not duplicated per Tech.",
  policy: {
    ...subject.policy,
    compactConsumerProjection: true,
    repeatedLocatorMaterializedPerTech: false,
    repeatedEffectShapeMaterializedPerTech: false,
  },
  records: compactRecords,
};
const compactSubjectText = `${JSON.stringify(compactSubject)}\n`;
const compactSubjectBlob = blobText(compactSubjectText);
const compactValidation = {
  ...validation,
  subject: { path: P.subject, gitBlobSha: compactSubjectBlob },
  reproduction: {
    expandedValidatedSubjectGitBlobSha: expandedBlob,
    compactProjection: "TECH_ID_PLUS_EXPLICIT_LEVEL_IDS_PLUS_NUMERIC_VALUES",
    recoverableRepeatedFields: ["sourceLabel", "trainingTechLocator", "effectShape"],
    recoveryAuthorities: [P.stage1, "subject.effectSemantics.effectShapeCatalog"],
  },
  gates: {
    ...validation.gates,
    compactConsumerProjectionExact: true,
    repeatedLocatorRecoverableFromStage1: true,
    repeatedEffectShapeRecoverableFromFrozenCatalog: true,
  },
};
const compactValidationText = `${JSON.stringify(compactValidation)}\n`;
writeFileSync(resolve(root, P.subject), compactSubjectText);
writeFileSync(resolve(root, P.validation), compactValidationText);
console.log(JSON.stringify({ status: "PASS", subjectBlob: compactSubjectBlob, expandedValidatedSubjectBlob: expandedBlob, techs: 84, levelRows: 1050 }));
