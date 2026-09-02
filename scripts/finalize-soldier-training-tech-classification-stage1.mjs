import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STAGE0_PATH = "data/validation/soldier-training-tech-classification-stage0.v1.json";
const TECH_PATH = "data/configdata/ConfigDataTrainingTechInfo.json";
const LEVEL_PATH = "data/configdata/ConfigDataTrainingTechLevelInfo.json";
const OUTPUT_PATH = "data/generated/soldier-training-tech-classification-stage1-census.v1.json";
const VALIDATION_PATH = "data/validation/soldier-training-tech-classification-stage1.v1.json";

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
  const entries = [...map.entries()].sort(([a], [b]) => {
    if (numericKeys) return Number(a) - Number(b);
    return String(a).localeCompare(String(b));
  });
  return Object.fromEntries(entries);
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
      const kindKey = `${key}:${valueKind(record[key])}`;
      increment(kinds, kindKey);
    }
  }

  return {
    fieldPresence: sortedObjectFromMap(presence),
    fieldValueKinds: sortedObjectFromMap(kinds),
    fieldSignatureCounts: sortedObjectFromMap(signatures),
  };
}

function duplicateIdSummary(records) {
  const occurrences = new Map();
  let missingIdCount = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record !== "object" || Array.isArray(record) || !("ID" in record)) {
      missingIdCount += 1;
      continue;
    }
    const key = JSON.stringify(record.ID);
    const list = occurrences.get(key) ?? [];
    list.push(index);
    occurrences.set(key, list);
  }
  const duplicateGroups = [...occurrences.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([serializedId, indexes]) => ({
      id: JSON.parse(serializedId),
      sourceIndexes: indexes,
    }));
  return { missingIdCount, duplicateGroups };
}

function rawRoundTripMismatchCount(sourceRecords, inventoryRecords) {
  let mismatches = 0;
  if (sourceRecords.length !== inventoryRecords.length) return Math.max(sourceRecords.length, inventoryRecords.length);
  for (let index = 0; index < sourceRecords.length; index += 1) {
    if (JSON.stringify(sourceRecords[index]) !== JSON.stringify(inventoryRecords[index]?.raw)) mismatches += 1;
  }
  return mismatches;
}

const stage0Buffer = readBuffer(STAGE0_PATH);
const techBuffer = readBuffer(TECH_PATH);
const levelBuffer = readBuffer(LEVEL_PATH);
const stage0 = JSON.parse(stage0Buffer.toString("utf8"));
const techRecords = JSON.parse(techBuffer.toString("utf8"));
const levelRecords = JSON.parse(levelBuffer.toString("utf8"));

const hardErrors = [];
const reviews = [];

if (stage0?.status !== "PASS" || stage0?.completion !== "COMPLETE" || stage0?.freezeState !== "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN") {
  hardErrors.push("Stage 0 predecessor is not frozen PASS/COMPLETE.");
}
if (!Array.isArray(techRecords)) hardErrors.push("TrainingTech source is not a JSON array.");
if (!Array.isArray(levelRecords)) hardErrors.push("TrainingTechLevel source is not a JSON array.");

const techBlobSha = gitBlobSha(techBuffer);
const levelBlobSha = gitBlobSha(levelBuffer);
if (techBlobSha !== stage0?.sourceSnapshots?.trainingTech?.gitBlobSha) {
  hardErrors.push(`TrainingTech source snapshot mismatch: ${techBlobSha}`);
}
if (levelBlobSha !== stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) {
  hardErrors.push(`TrainingTechLevel source snapshot mismatch: ${levelBlobSha}`);
}
if (techRecords.length !== stage0?.population?.trainingTech) {
  hardErrors.push(`TrainingTech population mismatch: ${techRecords.length}`);
}
if (levelRecords.length !== stage0?.population?.trainingTechLevel) {
  hardErrors.push(`TrainingTechLevel population mismatch: ${levelRecords.length}`);
}

const techDuplicateSummary = duplicateIdSummary(techRecords);
const levelDuplicateSummary = duplicateIdSummary(levelRecords);

const levelIdToIndexes = new Map();
for (let index = 0; index < levelRecords.length; index += 1) {
  const record = levelRecords[index];
  if (!record || typeof record !== "object" || Array.isArray(record) || !("ID" in record)) continue;
  const key = JSON.stringify(record.ID);
  const indexes = levelIdToIndexes.get(key) ?? [];
  indexes.push(index);
  levelIdToIndexes.set(key, indexes);
}

const referencedByLevelIndex = new Map();
let nonArrayLevelReferenceFieldCount = 0;
let missingReferencedLevelIdCount = 0;
const missingReferencedLevelIds = [];
const techLevelReferenceLengthCounts = new Map();
const rawTechTypeValueCounts = new Map();
const relationFieldPresence = new Map();
let preTechLevelCardinalityMismatchCount = 0;

const inventoryTechRecords = techRecords.map((raw, sourceIndex) => {
  const fieldNames = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [];
  const levelRefs = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.TechLevelupInfoList : undefined;
  const refs = Array.isArray(levelRefs) ? [...levelRefs] : null;

  if (Array.isArray(levelRefs)) {
    increment(techLevelReferenceLengthCounts, String(levelRefs.length));
    for (const levelId of levelRefs) {
      const matches = levelIdToIndexes.get(JSON.stringify(levelId)) ?? [];
      if (matches.length === 0) {
        missingReferencedLevelIdCount += 1;
        missingReferencedLevelIds.push({ techSourceIndex: sourceIndex, techId: raw?.ID ?? null, levelId });
      }
      for (const levelSourceIndex of matches) {
        const refsForLevel = referencedByLevelIndex.get(levelSourceIndex) ?? [];
        refsForLevel.push(sourceIndex);
        referencedByLevelIndex.set(levelSourceIndex, refsForLevel);
      }
    }
  } else {
    nonArrayLevelReferenceFieldCount += 1;
    increment(techLevelReferenceLengthCounts, `<${valueKind(levelRefs)}>`);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw) && "TechType" in raw) {
    increment(rawTechTypeValueCounts, JSON.stringify(raw.TechType));
  }

  const hasArmy = Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && "ArmyIDRelated" in raw);
  const hasSoldier = Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && "SoldierIDRelated" in raw);
  increment(relationFieldPresence, hasArmy && hasSoldier ? "both" : hasArmy ? "armyOnly" : hasSoldier ? "soldierOnly" : "neither");

  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.PreTechIDs) && Array.isArray(raw.PreTechLevel) && raw.PreTechIDs.length !== raw.PreTechLevel.length) {
    preTechLevelCardinalityMismatchCount += 1;
  }

  return {
    sourceIndex,
    id: raw && typeof raw === "object" && !Array.isArray(raw) && "ID" in raw ? raw.ID : null,
    fieldNames,
    fieldCount: fieldNames.length,
    explicitLevelReferences: refs,
    raw,
  };
});

let unreferencedLevelRecordCount = 0;
let multiplyReferencedLevelRecordCount = 0;
const inventoryLevelRecords = levelRecords.map((raw, sourceIndex) => {
  const techSourceIndexes = referencedByLevelIndex.get(sourceIndex) ?? [];
  if (techSourceIndexes.length === 0) unreferencedLevelRecordCount += 1;
  if (techSourceIndexes.length > 1) multiplyReferencedLevelRecordCount += 1;
  return {
    sourceIndex,
    id: raw && typeof raw === "object" && !Array.isArray(raw) && "ID" in raw ? raw.ID : null,
    fieldNames: raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [],
    referencedByTrainingTechSourceIndexes: techSourceIndexes,
    referencedByTrainingTechIds: techSourceIndexes.map((techSourceIndex) => techRecords[techSourceIndex]?.ID ?? null),
    raw,
  };
});

const census = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage1-census/v1",
  stage: "TrainingTech Classification Stage 1 - Lossless Structural Census",
  predecessor: {
    path: STAGE0_PATH,
    gitBlobSha: gitBlobSha(stage0Buffer),
    status: stage0?.status ?? null,
    completion: stage0?.completion ?? null,
    freezeState: stage0?.freezeState ?? null,
  },
  sourceSnapshots: {
    trainingTech: { path: TECH_PATH, gitBlobSha: techBlobSha },
    trainingTechLevel: { path: LEVEL_PATH, gitBlobSha: levelBlobSha },
  },
  censusPolicy: {
    parsedRecordLossless: true,
    rawSourceBytesFrozenByGitBlobSha: true,
    semanticClassificationPerformed: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    descriptionKeywordClassificationPerformed: false,
    sourceOrderUsedAsMeaning: false,
    screenOrderUsedAsMeaning: false,
    historicalFallbackUsed: false,
    note: "Derived metadata is limited to structural presence, explicit source references, counts, and source-index locators. Raw parsed source records are retained verbatim by JSON value for lossless census replay.",
  },
  population: {
    trainingTech: techRecords.length,
    trainingTechLevel: levelRecords.length,
  },
  structuralSummary: {
    trainingTech: {
      ...fieldCensus(techRecords),
      rawTechTypeValueCounts: sortedObjectFromMap(rawTechTypeValueCounts, true),
      explicitLevelReferenceLengthCounts: sortedObjectFromMap(techLevelReferenceLengthCounts, true),
      relationFieldPresence: sortedObjectFromMap(relationFieldPresence),
      missingIdCount: techDuplicateSummary.missingIdCount,
      duplicateIdGroupCount: techDuplicateSummary.duplicateGroups.length,
      nonArrayLevelReferenceFieldCount,
      preTechLevelCardinalityMismatchCount,
    },
    trainingTechLevel: {
      ...fieldCensus(levelRecords),
      missingIdCount: levelDuplicateSummary.missingIdCount,
      duplicateIdGroupCount: levelDuplicateSummary.duplicateGroups.length,
      unreferencedRecordCount: unreferencedLevelRecordCount,
      multiplyReferencedRecordCount: multiplyReferencedLevelRecordCount,
    },
  },
  diagnostics: {
    trainingTechDuplicateIdGroups: techDuplicateSummary.duplicateGroups,
    trainingTechLevelDuplicateIdGroups: levelDuplicateSummary.duplicateGroups,
    missingReferencedLevelIds,
  },
  records: inventoryTechRecords,
  levelRecords: inventoryLevelRecords,
};

const techRawRoundTripMismatchCount = rawRoundTripMismatchCount(techRecords, inventoryTechRecords);
const levelRawRoundTripMismatchCount = rawRoundTripMismatchCount(levelRecords, inventoryLevelRecords);
if (techRawRoundTripMismatchCount !== 0) hardErrors.push(`TrainingTech raw census round-trip mismatch count: ${techRawRoundTripMismatchCount}`);
if (levelRawRoundTripMismatchCount !== 0) hardErrors.push(`TrainingTechLevel raw census round-trip mismatch count: ${levelRawRoundTripMismatchCount}`);

if (techDuplicateSummary.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_ID_MISSING", count: techDuplicateSummary.missingIdCount });
if (techDuplicateSummary.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_ID_DUPLICATE", count: techDuplicateSummary.duplicateGroups.length });
if (levelDuplicateSummary.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_MISSING", count: levelDuplicateSummary.missingIdCount });
if (levelDuplicateSummary.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_DUPLICATE", count: levelDuplicateSummary.duplicateGroups.length });
if (nonArrayLevelReferenceFieldCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_NON_ARRAY", count: nonArrayLevelReferenceFieldCount });
if (missingReferencedLevelIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_MISSING_TARGET", count: missingReferencedLevelIdCount });
if (unreferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_UNREFERENCED", count: unreferencedLevelRecordCount });
if (multiplyReferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_MULTIPLY_REFERENCED", count: multiplyReferencedLevelRecordCount });
if (preTechLevelCardinalityMismatchCount > 0) reviews.push({ code: "TRAINING_TECH_PRETECH_LEVEL_CARDINALITY_MISMATCH", count: preTechLevelCardinalityMismatchCount });

const validation = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage1-validation/v1",
  stage: "TrainingTech Classification Stage 1 - Lossless Structural Census",
  status: hardErrors.length === 0 ? "PASS" : "FAIL",
  completion: hardErrors.length === 0 ? "COMPLETE" : "INCOMPLETE",
  freezeState: hardErrors.length === 0 ? "TRAINING_TECH_CLASSIFICATION_STAGE1_CENSUS_FROZEN" : null,
  predecessor: {
    path: STAGE0_PATH,
    gitBlobSha: gitBlobSha(stage0Buffer),
    status: stage0?.status ?? null,
    completion: stage0?.completion ?? null,
  },
  outputs: {
    census: OUTPUT_PATH,
    validation: VALIDATION_PATH,
  },
  sourceSnapshots: census.sourceSnapshots,
  semanticClassificationPerformed: false,
  checks: {
    stage0FrozenPass: stage0?.status === "PASS" && stage0?.completion === "COMPLETE" && stage0?.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN",
    trainingTechSourceSnapshotMatch: techBlobSha === stage0?.sourceSnapshots?.trainingTech?.gitBlobSha,
    trainingTechLevelSourceSnapshotMatch: levelBlobSha === stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha,
    trainingTechPopulationMatch: techRecords.length === stage0?.population?.trainingTech,
    trainingTechLevelPopulationMatch: levelRecords.length === stage0?.population?.trainingTechLevel,
    trainingTechRawRoundTripMismatchCount: techRawRoundTripMismatchCount,
    trainingTechLevelRawRoundTripMismatchCount: levelRawRoundTripMismatchCount,
    semanticClassificationPerformed: false,
  },
  coverage: {
    trainingTechSourceRecords: techRecords.length,
    trainingTechCensusRecords: inventoryTechRecords.length,
    trainingTechLevelSourceRecords: levelRecords.length,
    trainingTechLevelCensusRecords: inventoryLevelRecords.length,
    explicitTrainingTechLevelReferenceCount: inventoryTechRecords.reduce((sum, record) => sum + (record.explicitLevelReferences?.length ?? 0), 0),
    missingReferencedLevelIdCount,
    unreferencedLevelRecordCount,
    multiplyReferencedLevelRecordCount,
    trainingTechDuplicateIdGroupCount: techDuplicateSummary.duplicateGroups.length,
    trainingTechLevelDuplicateIdGroupCount: levelDuplicateSummary.duplicateGroups.length,
    trainingTechMissingIdCount: techDuplicateSummary.missingIdCount,
    trainingTechLevelMissingIdCount: levelDuplicateSummary.missingIdCount,
    nonArrayLevelReferenceFieldCount,
    preTechLevelCardinalityMismatchCount,
  },
  reviews: reviews.map((review) => ({ ...review, classification: "REVIEW", blocking: false })),
  blockers: hardErrors,
  hardErrorCount: hardErrors.length,
  nextOwner: hardErrors.length === 0 ? "TrainingTech Stage 2 Evidence Contract" : null,
  nextStartPoint: hardErrors.length === 0
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

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
mkdirSync(dirname(VALIDATION_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(census, null, 2)}\n`, "utf8");
writeFileSync(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: validation.status,
  completion: validation.completion,
  sourceSnapshots: validation.sourceSnapshots,
  coverage: validation.coverage,
  reviews: validation.reviews,
  blockers: validation.blockers,
  outputs: validation.outputs,
}, null, 2));

if (hardErrors.length > 0) process.exit(1);
