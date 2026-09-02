import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STAGE0_PATH = "data/validation/soldier-training-tech-classification-stage0.v1.json";
const TECH_PATH = "data/configdata/ConfigDataTrainingTechInfo.json";
const LEVEL_PATH = "data/configdata/ConfigDataTrainingTechLevelInfo.json";
const OUTPUT_PATH = "data/generated/soldier-training-tech-classification-stage1-census.v1.json";

function readBuffer(path) {
  return readFileSync(path);
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
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => {
      if (numericKeys) {
        const aNumber = Number(a);
        const bNumber = Number(b);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
      }
      return String(a).localeCompare(String(b));
    }),
  );
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

function duplicateIdSummary(records) {
  const occurrences = new Map();
  let missingIdCount = 0;

  records.forEach((record, sourceIndex) => {
    if (!record || typeof record !== "object" || Array.isArray(record) || !("ID" in record)) {
      missingIdCount += 1;
      return;
    }
    const key = JSON.stringify(record.ID);
    const indexes = occurrences.get(key) ?? [];
    indexes.push(sourceIndex);
    occurrences.set(key, indexes);
  });

  return {
    missingIdCount,
    duplicateGroups: [...occurrences.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .map(([serializedId, sourceIndexes]) => ({
        id: JSON.parse(serializedId),
        sourceIndexes,
      })),
  };
}

const stage0Buffer = readBuffer(STAGE0_PATH);
const techBuffer = readBuffer(TECH_PATH);
const levelBuffer = readBuffer(LEVEL_PATH);
const stage0 = JSON.parse(stage0Buffer.toString("utf8"));
const techRecords = JSON.parse(techBuffer.toString("utf8"));
const levelRecords = JSON.parse(levelBuffer.toString("utf8"));

const blockers = [];
const reviews = [];
const fail = (message) => blockers.push(message);

const stage0BlobSha = gitBlobSha(stage0Buffer);
const techBlobSha = gitBlobSha(techBuffer);
const levelBlobSha = gitBlobSha(levelBuffer);

if (
  stage0?.status !== "PASS" ||
  stage0?.completion !== "COMPLETE" ||
  stage0?.freezeState !== "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN"
) {
  fail("Stage 0 predecessor is not frozen PASS/COMPLETE.");
}
if (!Array.isArray(techRecords)) fail("TrainingTech source is not a JSON array.");
if (!Array.isArray(levelRecords)) fail("TrainingTechLevel source is not a JSON array.");
if (techBlobSha !== stage0?.sourceSnapshots?.trainingTech?.gitBlobSha) {
  fail(`TrainingTech source snapshot mismatch: ${techBlobSha}`);
}
if (levelBlobSha !== stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) {
  fail(`TrainingTechLevel source snapshot mismatch: ${levelBlobSha}`);
}
if (Array.isArray(techRecords) && techRecords.length !== stage0?.population?.trainingTech) {
  fail(`TrainingTech population mismatch: ${techRecords.length}`);
}
if (Array.isArray(levelRecords) && levelRecords.length !== stage0?.population?.trainingTechLevel) {
  fail(`TrainingTechLevel population mismatch: ${levelRecords.length}`);
}

if (blockers.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", blockers }, null, 2));
  process.exit(1);
}

const techIds = duplicateIdSummary(techRecords);
const levelIds = duplicateIdSummary(levelRecords);

const levelIdToIndexes = new Map();
levelRecords.forEach((record, sourceIndex) => {
  if (!record || typeof record !== "object" || Array.isArray(record) || !("ID" in record)) return;
  const key = JSON.stringify(record.ID);
  const indexes = levelIdToIndexes.get(key) ?? [];
  indexes.push(sourceIndex);
  levelIdToIndexes.set(key, indexes);
});

const referencedByLevelIndex = new Map();
const levelReferenceLengthCounts = new Map();
const rawTechTypeValueCounts = new Map();
const relationFieldPresence = new Map();
const missingReferencedLevelIds = [];
let explicitLevelReferenceCount = 0;
let nonArrayLevelReferenceFieldCount = 0;
let preTechLevelCardinalityMismatchCount = 0;

const inventoryRecords = techRecords.map((raw, sourceIndex) => {
  const isObject = raw && typeof raw === "object" && !Array.isArray(raw);
  const fieldNames = isObject ? Object.keys(raw) : [];
  const levelRefs = isObject ? raw.TechLevelupInfoList : undefined;
  const explicitLevelReferences = Array.isArray(levelRefs) ? [...levelRefs] : null;

  if (Array.isArray(levelRefs)) {
    explicitLevelReferenceCount += levelRefs.length;
    increment(levelReferenceLengthCounts, String(levelRefs.length));
    for (const levelId of levelRefs) {
      const levelIndexes = levelIdToIndexes.get(JSON.stringify(levelId)) ?? [];
      if (levelIndexes.length === 0) {
        missingReferencedLevelIds.push({
          techSourceIndex: sourceIndex,
          techId: isObject && "ID" in raw ? raw.ID : null,
          levelId,
        });
      }
      for (const levelSourceIndex of levelIndexes) {
        const references = referencedByLevelIndex.get(levelSourceIndex) ?? [];
        references.push(sourceIndex);
        referencedByLevelIndex.set(levelSourceIndex, references);
      }
    }
  } else {
    nonArrayLevelReferenceFieldCount += 1;
    increment(levelReferenceLengthCounts, `<${valueKind(levelRefs)}>`);
  }

  if (isObject && "TechType" in raw) increment(rawTechTypeValueCounts, JSON.stringify(raw.TechType));

  const hasArmy = Boolean(isObject && "ArmyIDRelated" in raw);
  const hasSoldier = Boolean(isObject && "SoldierIDRelated" in raw);
  increment(
    relationFieldPresence,
    hasArmy && hasSoldier ? "both" : hasArmy ? "armyOnly" : hasSoldier ? "soldierOnly" : "neither",
  );

  if (
    isObject &&
    Array.isArray(raw.PreTechIDs) &&
    Array.isArray(raw.PreTechLevel) &&
    raw.PreTechIDs.length !== raw.PreTechLevel.length
  ) {
    preTechLevelCardinalityMismatchCount += 1;
  }

  return {
    sourceIndex,
    id: isObject && "ID" in raw ? raw.ID : null,
    fieldNames,
    fieldCount: fieldNames.length,
    explicitLevelReferences,
    raw,
  };
});

let unreferencedLevelRecordCount = 0;
let multiplyReferencedLevelRecordCount = 0;
for (let sourceIndex = 0; sourceIndex < levelRecords.length; sourceIndex += 1) {
  const references = referencedByLevelIndex.get(sourceIndex) ?? [];
  if (references.length === 0) unreferencedLevelRecordCount += 1;
  if (references.length > 1) multiplyReferencedLevelRecordCount += 1;
}

let trainingTechRawRoundTripMismatchCount = 0;
for (let sourceIndex = 0; sourceIndex < techRecords.length; sourceIndex += 1) {
  if (JSON.stringify(techRecords[sourceIndex]) !== JSON.stringify(inventoryRecords[sourceIndex]?.raw)) {
    trainingTechRawRoundTripMismatchCount += 1;
  }
}
if (trainingTechRawRoundTripMismatchCount > 0) {
  fail(`TrainingTech raw census round-trip mismatch count: ${trainingTechRawRoundTripMismatchCount}`);
}

if (techIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_ID_MISSING", count: techIds.missingIdCount });
if (techIds.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_ID_DUPLICATE", count: techIds.duplicateGroups.length });
if (levelIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_MISSING", count: levelIds.missingIdCount });
if (levelIds.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_DUPLICATE", count: levelIds.duplicateGroups.length });
if (nonArrayLevelReferenceFieldCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_NON_ARRAY", count: nonArrayLevelReferenceFieldCount });
if (missingReferencedLevelIds.length > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_MISSING_TARGET", count: missingReferencedLevelIds.length });
if (unreferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_UNREFERENCED", count: unreferencedLevelRecordCount });
if (multiplyReferencedLevelRecordCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_MULTIPLY_REFERENCED", count: multiplyReferencedLevelRecordCount });
if (preTechLevelCardinalityMismatchCount > 0) reviews.push({ code: "TRAINING_TECH_PRETECH_LEVEL_CARDINALITY_MISMATCH", count: preTechLevelCardinalityMismatchCount });

const census = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage1-census/v1",
  stage: "TrainingTech Classification Stage 1 - Lossless Structural Census",
  status: blockers.length === 0 ? "PASS" : "FAIL",
  predecessor: {
    path: STAGE0_PATH,
    gitBlobSha: stage0BlobSha,
    status: stage0.status,
    completion: stage0.completion,
    freezeState: stage0.freezeState,
  },
  sourceSnapshots: {
    trainingTech: { path: TECH_PATH, gitBlobSha: techBlobSha },
    trainingTechLevel: { path: LEVEL_PATH, gitBlobSha: levelBlobSha },
  },
  censusPolicy: {
    trainingTechRecordProjection: "LOSSLESS_PARSED_RECORD",
    trainingTechLevelProjection: "FROZEN_SOURCE_STRUCTURAL_SUMMARY",
    trainingTechRawRoundTripRequired: true,
    rawSourceBytesFrozenByGitBlobSha: true,
    semanticClassificationPerformed: false,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    descriptionKeywordClassificationPerformed: false,
    sourceOrderUsedAsMeaning: false,
    screenOrderUsedAsMeaning: false,
    historicalFallbackUsed: false,
    note: "All 287 TrainingTech parsed records are retained losslessly. The 2945 TrainingTechLevel records remain authoritative in the frozen source snapshot and are represented only by structural summary and explicit-reference coverage, avoiding raw-source duplication.",
  },
  population: {
    trainingTech: techRecords.length,
    trainingTechLevel: levelRecords.length,
  },
  structuralSummary: {
    trainingTech: {
      ...fieldCensus(techRecords),
      rawTechTypeValueCounts: sortedObjectFromMap(rawTechTypeValueCounts, true),
      explicitLevelReferenceLengthCounts: sortedObjectFromMap(levelReferenceLengthCounts, true),
      relationFieldPresence: sortedObjectFromMap(relationFieldPresence),
      missingIdCount: techIds.missingIdCount,
      duplicateIdGroupCount: techIds.duplicateGroups.length,
      nonArrayLevelReferenceFieldCount,
      preTechLevelCardinalityMismatchCount,
    },
    trainingTechLevel: {
      ...fieldCensus(levelRecords),
      missingIdCount: levelIds.missingIdCount,
      duplicateIdGroupCount: levelIds.duplicateGroups.length,
    },
  },
  levelReferenceCoverage: {
    explicitReferenceCount: explicitLevelReferenceCount,
    sourceRecordCount: levelRecords.length,
    missingReferencedLevelIdCount: missingReferencedLevelIds.length,
    unreferencedRecordCount: unreferencedLevelRecordCount,
    multiplyReferencedRecordCount: multiplyReferencedLevelRecordCount,
  },
  diagnostics: {
    trainingTechDuplicateIdGroups: techIds.duplicateGroups,
    trainingTechLevelDuplicateIdGroups: levelIds.duplicateGroups,
    missingReferencedLevelIds,
  },
  reviews: reviews.map((review) => ({ ...review, classification: "REVIEW", blocking: false })),
  blockers,
  records: inventoryRecords,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(census, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      status: census.status,
      sourceSnapshots: census.sourceSnapshots,
      population: census.population,
      levelReferenceCoverage: census.levelReferenceCoverage,
      reviews: census.reviews,
      blockers: census.blockers,
      output: OUTPUT_PATH,
    },
    null,
    2,
  ),
);

if (blockers.length > 0) process.exit(1);
