import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STAGE0_PATH = "data/validation/soldier-training-tech-classification-stage0.v1.json";
const TECH_PATH = "data/configdata/ConfigDataTrainingTechInfo.json";
const LEVEL_PATH = "data/configdata/ConfigDataTrainingTechLevelInfo.json";
const CENSUS_PATH = "data/generated/soldier-training-tech-classification-stage1-census.v1.json";
const VALIDATION_PATH = "data/validation/soldier-training-tech-classification-stage1.v1.json";
const PRODUCER_PATH = "scripts/finalize-soldier-training-tech-classification-stage1.mjs";
const VALIDATOR_PATH = "scripts/validate-soldier-training-tech-classification-stage1.mjs";

function readBuffer(path) {
  return readFileSync(path);
}

function readJson(path) {
  return JSON.parse(readBuffer(path).toString("utf8"));
}

function gitBlobSha(buffer) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`, "utf8"))
    .update(buffer)
    .digest("hex");
}

function valueKind(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedObjectFromMap(map, numericKeys = false) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => {
    if (numericKeys) {
      const aNumber = Number(a);
      const bNumber = Number(b);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
    }
    return String(a).localeCompare(String(b));
  }));
}

function fieldCensus(records) {
  const presence = new Map();
  const kinds = new Map();
  const signatures = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      increment(signatures, `<${valueKind(record)}>`);
      continue;
    }
    const keys = Object.keys(record);
    increment(signatures, [...keys].sort().join("|"));
    for (const key of keys) {
      increment(presence, key);
      increment(kinds, `${key}:${valueKind(record[key])}`);
    }
  }
  return {
    fieldPresence: sortedObjectFromMap(presence),
    fieldValueKinds: sortedObjectFromMap(kinds),
    fieldSignatureCounts: sortedObjectFromMap(signatures),
  };
}

function deepEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function duplicateIdGroupCount(records) {
  const counts = new Map();
  let missingIdCount = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !("ID" in record)) {
      missingIdCount += 1;
      continue;
    }
    increment(counts, JSON.stringify(record.ID));
  }
  return {
    missingIdCount,
    duplicateIdGroupCount: [...counts.values()].filter((count) => count > 1).length,
  };
}

const stage0Buffer = readBuffer(STAGE0_PATH);
const techBuffer = readBuffer(TECH_PATH);
const levelBuffer = readBuffer(LEVEL_PATH);
const censusBuffer = readBuffer(CENSUS_PATH);
const stage0 = JSON.parse(stage0Buffer.toString("utf8"));
const techRecords = JSON.parse(techBuffer.toString("utf8"));
const levelRecords = JSON.parse(levelBuffer.toString("utf8"));
const census = JSON.parse(censusBuffer.toString("utf8"));

const blockers = [];
const reviews = [];
const fail = (message) => blockers.push(message);

const stage0BlobSha = gitBlobSha(stage0Buffer);
const techBlobSha = gitBlobSha(techBuffer);
const levelBlobSha = gitBlobSha(levelBuffer);

if (stage0?.status !== "PASS" || stage0?.completion !== "COMPLETE" || stage0?.freezeState !== "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN") {
  fail("Stage 0 predecessor is not frozen PASS/COMPLETE.");
}
if (!Array.isArray(techRecords)) fail("TrainingTech source is not an array.");
if (!Array.isArray(levelRecords)) fail("TrainingTechLevel source is not an array.");
if (!Array.isArray(census?.records)) fail("Stage 1 census records is not an array.");
if (!Array.isArray(census?.levelRecords)) fail("Stage 1 census levelRecords is not an array.");

if (techBlobSha !== stage0?.sourceSnapshots?.trainingTech?.gitBlobSha) fail("TrainingTech source snapshot differs from Stage 0.");
if (levelBlobSha !== stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) fail("TrainingTechLevel source snapshot differs from Stage 0.");
if (census?.predecessor?.gitBlobSha !== stage0BlobSha) fail("Census predecessor blob does not match current Stage 0 checkpoint.");
if (census?.sourceSnapshots?.trainingTech?.gitBlobSha !== techBlobSha) fail("Census TrainingTech source blob mismatch.");
if (census?.sourceSnapshots?.trainingTechLevel?.gitBlobSha !== levelBlobSha) fail("Census TrainingTechLevel source blob mismatch.");
if (census?.population?.trainingTech !== techRecords.length || techRecords.length !== stage0?.population?.trainingTech) fail("TrainingTech population parity failed.");
if (census?.population?.trainingTechLevel !== levelRecords.length || levelRecords.length !== stage0?.population?.trainingTechLevel) fail("TrainingTechLevel population parity failed.");

const policy = census?.censusPolicy ?? {};
const forbiddenPolicyFailures = [
  ["semanticClassificationPerformed", false],
  ["nameJoinPerformed", false],
  ["idArithmeticPerformed", false],
  ["descriptionKeywordClassificationPerformed", false],
  ["sourceOrderUsedAsMeaning", false],
  ["screenOrderUsedAsMeaning", false],
  ["historicalFallbackUsed", false],
].filter(([key, expected]) => policy[key] !== expected).map(([key]) => key);
if (policy.parsedRecordLossless !== true || policy.rawSourceBytesFrozenByGitBlobSha !== true || forbiddenPolicyFailures.length > 0) {
  fail(`Census policy boundary mismatch: ${forbiddenPolicyFailures.join(",") || "lossless flags"}`);
}

let trainingTechRawMismatchCount = 0;
let trainingTechMetadataMismatchCount = 0;
for (let index = 0; index < techRecords.length; index += 1) {
  const source = techRecords[index];
  const inventory = census.records?.[index];
  if (!inventory || inventory.sourceIndex !== index || !deepEqualJson(inventory.raw, source)) trainingTechRawMismatchCount += 1;
  const expectedId = source && typeof source === "object" && !Array.isArray(source) && "ID" in source ? source.ID : null;
  const expectedFields = source && typeof source === "object" && !Array.isArray(source) ? Object.keys(source) : [];
  const expectedRefs = source && typeof source === "object" && !Array.isArray(source) && Array.isArray(source.TechLevelupInfoList) ? source.TechLevelupInfoList : null;
  if (!inventory || inventory.id !== expectedId || !deepEqualJson(inventory.fieldNames, expectedFields) || inventory.fieldCount !== expectedFields.length || !deepEqualJson(inventory.explicitLevelReferences, expectedRefs)) {
    trainingTechMetadataMismatchCount += 1;
  }
}
if (census.records?.length !== techRecords.length) trainingTechRawMismatchCount += Math.abs((census.records?.length ?? 0) - techRecords.length);

let trainingTechLevelRawMismatchCount = 0;
let trainingTechLevelMetadataMismatchCount = 0;
for (let index = 0; index < levelRecords.length; index += 1) {
  const source = levelRecords[index];
  const inventory = census.levelRecords?.[index];
  if (!inventory || inventory.sourceIndex !== index || !deepEqualJson(inventory.raw, source)) trainingTechLevelRawMismatchCount += 1;
  const expectedId = source && typeof source === "object" && !Array.isArray(source) && "ID" in source ? source.ID : null;
  const expectedFields = source && typeof source === "object" && !Array.isArray(source) ? Object.keys(source) : [];
  if (!inventory || inventory.id !== expectedId || !deepEqualJson(inventory.fieldNames, expectedFields)) trainingTechLevelMetadataMismatchCount += 1;
}
if (census.levelRecords?.length !== levelRecords.length) trainingTechLevelRawMismatchCount += Math.abs((census.levelRecords?.length ?? 0) - levelRecords.length);

if (trainingTechRawMismatchCount > 0) fail(`TrainingTech census raw mismatch count: ${trainingTechRawMismatchCount}`);
if (trainingTechMetadataMismatchCount > 0) fail(`TrainingTech census metadata mismatch count: ${trainingTechMetadataMismatchCount}`);
if (trainingTechLevelRawMismatchCount > 0) fail(`TrainingTechLevel census raw mismatch count: ${trainingTechLevelRawMismatchCount}`);
if (trainingTechLevelMetadataMismatchCount > 0) fail(`TrainingTechLevel census metadata mismatch count: ${trainingTechLevelMetadataMismatchCount}`);

const levelIdToIndexes = new Map();
for (let index = 0; index < levelRecords.length; index += 1) {
  const raw = levelRecords[index];
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("ID" in raw)) continue;
  const key = JSON.stringify(raw.ID);
  const indexes = levelIdToIndexes.get(key) ?? [];
  indexes.push(index);
  levelIdToIndexes.set(key, indexes);
}

const refsByLevelIndex = new Map();
let explicitTrainingTechLevelReferenceCount = 0;
let missingReferencedLevelIdCount = 0;
let nonArrayLevelReferenceFieldCount = 0;
let preTechLevelCardinalityMismatchCount = 0;
const levelReferenceLengthCounts = new Map();
const rawTechTypeValueCounts = new Map();
const relationFieldPresence = new Map();

for (let techSourceIndex = 0; techSourceIndex < techRecords.length; techSourceIndex += 1) {
  const raw = techRecords[techSourceIndex];
  const levelRefs = raw?.TechLevelupInfoList;
  if (!Array.isArray(levelRefs)) {
    nonArrayLevelReferenceFieldCount += 1;
    increment(levelReferenceLengthCounts, `<${valueKind(levelRefs)}>`);
  } else {
    explicitTrainingTechLevelReferenceCount += levelRefs.length;
    increment(levelReferenceLengthCounts, String(levelRefs.length));
    for (const levelId of levelRefs) {
      const indexes = levelIdToIndexes.get(JSON.stringify(levelId)) ?? [];
      if (indexes.length === 0) missingReferencedLevelIdCount += 1;
      for (const levelSourceIndex of indexes) {
        const refs = refsByLevelIndex.get(levelSourceIndex) ?? [];
        refs.push(techSourceIndex);
        refsByLevelIndex.set(levelSourceIndex, refs);
      }
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "TechType" in raw) increment(rawTechTypeValueCounts, JSON.stringify(raw.TechType));
  const hasArmy = Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && "ArmyIDRelated" in raw);
  const hasSoldier = Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && "SoldierIDRelated" in raw);
  increment(relationFieldPresence, hasArmy && hasSoldier ? "both" : hasArmy ? "armyOnly" : hasSoldier ? "soldierOnly" : "neither");
  if (Array.isArray(raw?.PreTechIDs) && Array.isArray(raw?.PreTechLevel) && raw.PreTechIDs.length !== raw.PreTechLevel.length) preTechLevelCardinalityMismatchCount += 1;
}

let unreferencedLevelRecordCount = 0;
let multiplyReferencedLevelRecordCount = 0;
let reverseReferenceMismatchCount = 0;
for (let levelSourceIndex = 0; levelSourceIndex < levelRecords.length; levelSourceIndex += 1) {
  const refs = refsByLevelIndex.get(levelSourceIndex) ?? [];
  if (refs.length === 0) unreferencedLevelRecordCount += 1;
  if (refs.length > 1) multiplyReferencedLevelRecordCount += 1;
  const inventory = census.levelRecords?.[levelSourceIndex];
  const expectedIds = refs.map((techSourceIndex) => techRecords[techSourceIndex]?.ID ?? null);
  if (!inventory || !deepEqualJson(inventory.referencedByTrainingTechSourceIndexes, refs) || !deepEqualJson(inventory.referencedByTrainingTechIds, expectedIds)) reverseReferenceMismatchCount += 1;
}
if (reverseReferenceMismatchCount > 0) fail(`Census reverse-reference mismatch count: ${reverseReferenceMismatchCount}`);

const techIds = duplicateIdGroupCount(techRecords);
const levelIds = duplicateIdGroupCount(levelRecords);
const derivedTrainingTechStructuralSummary = {
  ...fieldCensus(techRecords),
  rawTechTypeValueCounts: sortedObjectFromMap(rawTechTypeValueCounts, true),
  explicitLevelReferenceLengthCounts: sortedObjectFromMap(levelReferenceLengthCounts, true),
  relationFieldPresence: sortedObjectFromMap(relationFieldPresence),
  missingIdCount: techIds.missingIdCount,
  duplicateIdGroupCount: techIds.duplicateIdGroupCount,
  nonArrayLevelReferenceFieldCount,
  preTechLevelCardinalityMismatchCount,
};
const derivedLevelStructuralSummary = {
  ...fieldCensus(levelRecords),
  missingIdCount: levelIds.missingIdCount,
  duplicateIdGroupCount: levelIds.duplicateIdGroupCount,
  unreferencedRecordCount: unreferencedLevelRecordCount,
  multiplyReferencedRecordCount: multiplyReferencedLevelRecordCount,
};
if (!deepEqualJson(census?.structuralSummary?.trainingTech, derivedTrainingTechStructuralSummary)) fail("TrainingTech structural summary mismatch.");
if (!deepEqualJson(census?.structuralSummary?.trainingTechLevel, derivedLevelStructuralSummary)) fail("TrainingTechLevel structural summary mismatch.");

if (techIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_ID_MISSING", count: techIds.missingIdCount });
if (techIds.duplicateIdGroupCount > 0) reviews.push({ code: "TRAINING_TECH_ID_DUPLICATE", count: techIds.duplicateIdGroupCount });
if (levelIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_MISSING", count: levelIds.missingIdCount });
if (levelIds.duplicateIdGroupCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_DUPLICATE", count: levelIds.duplicateIdGroupCount });
if (nonArrayLevelReferenceFieldCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_NON_ARRAY", count: nonArrayLevelReferenceFieldCount });
if (missingReferencedLevelIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_MISSING_TARGET", count: missingReferencedLevelIdCount });
if (unreferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_UNREFERENCED", count: unreferencedLevelRecordCount });
if (multiplyReferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_MULTIPLY_REFERENCED", count: multiplyReferencedLevelRecordCount });
if (preTechLevelCardinalityMismatchCount > 0) reviews.push({ code: "TRAINING_TECH_PRETECH_LEVEL_CARDINALITY_MISMATCH", count: preTechLevelCardinalityMismatchCount });

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage1-validation/v1",
  stage: "TrainingTech Classification Stage 1 - Lossless Structural Census",
  status: blockers.length === 0 ? "PASS" : "FAIL",
  completion: blockers.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: blockers.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE1_CENSUS_FROZEN" : null,
  validationMode: "INDEPENDENT_READ_ONLY_RECOMPUTATION",
  producer: PRODUCER_PATH,
  validator: VALIDATOR_PATH,
  independentValidation: true,
  predecessor: {
    path: STAGE0_PATH,
    gitBlobSha: stage0BlobSha,
    status: stage0?.status ?? null,
    completion: stage0?.completion ?? null,
  },
  outputs: {
    census: CENSUS_PATH,
    validation: VALIDATION_PATH,
  },
  sourceSnapshots: {
    trainingTech: { path: TECH_PATH, gitBlobSha: techBlobSha },
    trainingTechLevel: { path: LEVEL_PATH, gitBlobSha: levelBlobSha },
  },
  semanticClassificationPerformed: false,
  checks: {
    stage0FrozenPass: stage0?.status === "PASS" && stage0?.completion === "COMPLETE" && stage0?.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN",
    trainingTechSourceSnapshotMatch: techBlobSha === stage0?.sourceSnapshots?.trainingTech?.gitBlobSha,
    trainingTechLevelSourceSnapshotMatch: levelBlobSha === stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha,
    censusPredecessorMatch: census?.predecessor?.gitBlobSha === stage0BlobSha,
    censusSourceSnapshotsMatch: census?.sourceSnapshots?.trainingTech?.gitBlobSha === techBlobSha && census?.sourceSnapshots?.trainingTechLevel?.gitBlobSha === levelBlobSha,
    trainingTechPopulationMatch: census?.population?.trainingTech === techRecords.length && techRecords.length === stage0?.population?.trainingTech,
    trainingTechLevelPopulationMatch: census?.population?.trainingTechLevel === levelRecords.length && levelRecords.length === stage0?.population?.trainingTechLevel,
    trainingTechRawMismatchCount,
    trainingTechMetadataMismatchCount,
    trainingTechLevelRawMismatchCount,
    trainingTechLevelMetadataMismatchCount,
    reverseReferenceMismatchCount,
    trainingTechStructuralSummaryMatch: deepEqualJson(census?.structuralSummary?.trainingTech, derivedTrainingTechStructuralSummary),
    trainingTechLevelStructuralSummaryMatch: deepEqualJson(census?.structuralSummary?.trainingTechLevel, derivedLevelStructuralSummary),
    semanticClassificationPerformed: false,
  },
  coverage: {
    trainingTechSourceRecords: techRecords.length,
    trainingTechCensusRecords: census.records?.length ?? 0,
    trainingTechLevelSourceRecords: levelRecords.length,
    trainingTechLevelCensusRecords: census.levelRecords?.length ?? 0,
    explicitTrainingTechLevelReferenceCount,
    missingReferencedLevelIdCount,
    unreferencedLevelRecordCount,
    multiplyReferencedLevelRecordCount,
    trainingTechDuplicateIdGroupCount: techIds.duplicateIdGroupCount,
    trainingTechLevelDuplicateIdGroupCount: levelIds.duplicateIdGroupCount,
    trainingTechMissingIdCount: techIds.missingIdCount,
    trainingTechLevelMissingIdCount: levelIds.missingIdCount,
    nonArrayLevelReferenceFieldCount,
    preTechLevelCardinalityMismatchCount,
  },
  reviews: reviews.map((review) => ({ ...review, classification: "REVIEW", blocking: false })),
  blockers,
  hardErrorCount: blockers.length,
  nextOwner: blockers.length === 0 ? "TrainingTech Stage 2 Evidence Contract" : null,
  nextStartPoint: blockers.length === 0
    ? "Freeze which explicit TrainingTech and TrainingTechLevel source fields may be used as semantic classification evidence. Reuse this census; do not classify by names, descriptions, ID ranges/arithmetic, source order, or screen order."
    : null,
  reopenConditions: [
    "Stage 0 authoritative contradiction affecting this census.",
    "TrainingTech or TrainingTechLevel source snapshot change.",
    "Census record-loss or raw round-trip parity damage.",
    "Project Check ownership/orchestration contract change affecting this path.",
    "Hard owning-validator failure.",
  ],
};

mkdirSync(dirname(VALIDATION_PATH), { recursive: true });
writeFileSync(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: validation.status,
  completion: validation.completion,
  validationMode: validation.validationMode,
  coverage: validation.coverage,
  reviews: validation.reviews,
  blockers: validation.blockers,
}, null, 2));
if (blockers.length > 0) process.exit(1);
