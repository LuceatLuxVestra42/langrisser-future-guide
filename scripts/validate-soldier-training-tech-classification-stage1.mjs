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
      .map(([serializedId, sourceIndexes]) => ({ id: JSON.parse(serializedId), sourceIndexes })),
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

if (
  stage0?.status !== "PASS" ||
  stage0?.completion !== "COMPLETE" ||
  stage0?.freezeState !== "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN"
) {
  fail("Stage 0 predecessor is not frozen PASS/COMPLETE.");
}
if (!Array.isArray(techRecords)) fail("TrainingTech source is not a JSON array.");
if (!Array.isArray(levelRecords)) fail("TrainingTechLevel source is not a JSON array.");
if (!Array.isArray(census?.records)) fail("Stage 1 census records is not an array.");
if ("levelRecords" in (census ?? {})) fail("Stage 1 census must not duplicate raw TrainingTechLevel records.");

if (techBlobSha !== stage0?.sourceSnapshots?.trainingTech?.gitBlobSha) fail("TrainingTech source snapshot differs from Stage 0.");
if (levelBlobSha !== stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha) fail("TrainingTechLevel source snapshot differs from Stage 0.");
if (census?.predecessor?.gitBlobSha !== stage0BlobSha) fail("Census predecessor blob does not match current Stage 0 checkpoint.");
if (census?.sourceSnapshots?.trainingTech?.gitBlobSha !== techBlobSha) fail("Census TrainingTech source blob mismatch.");
if (census?.sourceSnapshots?.trainingTechLevel?.gitBlobSha !== levelBlobSha) fail("Census TrainingTechLevel source blob mismatch.");
if (census?.population?.trainingTech !== techRecords.length || techRecords.length !== stage0?.population?.trainingTech) fail("TrainingTech population parity failed.");
if (census?.population?.trainingTechLevel !== levelRecords.length || levelRecords.length !== stage0?.population?.trainingTechLevel) fail("TrainingTechLevel population parity failed.");

const policy = census?.censusPolicy ?? {};
const requiredFalsePolicy = [
  "semanticClassificationPerformed",
  "nameJoinPerformed",
  "idArithmeticPerformed",
  "descriptionKeywordClassificationPerformed",
  "sourceOrderUsedAsMeaning",
  "screenOrderUsedAsMeaning",
  "historicalFallbackUsed",
];
const policyFailures = requiredFalsePolicy.filter((key) => policy[key] !== false);
if (policy.trainingTechRecordProjection !== "LOSSLESS_PARSED_RECORD") policyFailures.push("trainingTechRecordProjection");
if (policy.trainingTechLevelProjection !== "FROZEN_SOURCE_STRUCTURAL_SUMMARY") policyFailures.push("trainingTechLevelProjection");
if (policy.trainingTechRawRoundTripRequired !== true) policyFailures.push("trainingTechRawRoundTripRequired");
if (policy.rawSourceBytesFrozenByGitBlobSha !== true) policyFailures.push("rawSourceBytesFrozenByGitBlobSha");
if (policyFailures.length > 0) fail(`Census policy boundary mismatch: ${policyFailures.join(", ")}`);

let trainingTechRawMismatchCount = 0;
let trainingTechMetadataMismatchCount = 0;
for (let sourceIndex = 0; sourceIndex < techRecords.length; sourceIndex += 1) {
  const raw = techRecords[sourceIndex];
  const inventory = census.records?.[sourceIndex];
  const isObject = raw && typeof raw === "object" && !Array.isArray(raw);
  const expectedFields = isObject ? Object.keys(raw) : [];
  const expectedRefs = isObject && Array.isArray(raw.TechLevelupInfoList) ? raw.TechLevelupInfoList : null;
  const expectedId = isObject && "ID" in raw ? raw.ID : null;

  if (!inventory || inventory.sourceIndex !== sourceIndex || !sameJson(inventory.raw, raw)) {
    trainingTechRawMismatchCount += 1;
  }
  if (
    !inventory ||
    inventory.id !== expectedId ||
    !sameJson(inventory.fieldNames, expectedFields) ||
    inventory.fieldCount !== expectedFields.length ||
    !sameJson(inventory.explicitLevelReferences, expectedRefs)
  ) {
    trainingTechMetadataMismatchCount += 1;
  }
}
if ((census.records?.length ?? 0) !== techRecords.length) {
  trainingTechRawMismatchCount += Math.abs((census.records?.length ?? 0) - techRecords.length);
}
if (trainingTechRawMismatchCount > 0) fail(`TrainingTech raw census mismatch count: ${trainingTechRawMismatchCount}`);
if (trainingTechMetadataMismatchCount > 0) fail(`TrainingTech census metadata mismatch count: ${trainingTechMetadataMismatchCount}`);

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

techRecords.forEach((raw, techSourceIndex) => {
  const isObject = raw && typeof raw === "object" && !Array.isArray(raw);
  const levelRefs = isObject ? raw.TechLevelupInfoList : undefined;

  if (Array.isArray(levelRefs)) {
    explicitLevelReferenceCount += levelRefs.length;
    increment(levelReferenceLengthCounts, String(levelRefs.length));
    for (const levelId of levelRefs) {
      const levelIndexes = levelIdToIndexes.get(JSON.stringify(levelId)) ?? [];
      if (levelIndexes.length === 0) {
        missingReferencedLevelIds.push({
          techSourceIndex,
          techId: isObject && "ID" in raw ? raw.ID : null,
          levelId,
        });
      }
      for (const levelSourceIndex of levelIndexes) {
        const references = referencedByLevelIndex.get(levelSourceIndex) ?? [];
        references.push(techSourceIndex);
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
});

let unreferencedLevelRecordCount = 0;
let multiplyReferencedLevelRecordCount = 0;
for (let sourceIndex = 0; sourceIndex < levelRecords.length; sourceIndex += 1) {
  const references = referencedByLevelIndex.get(sourceIndex) ?? [];
  if (references.length === 0) unreferencedLevelRecordCount += 1;
  if (references.length > 1) multiplyReferencedLevelRecordCount += 1;
}

const expectedTechSummary = {
  ...fieldCensus(techRecords),
  rawTechTypeValueCounts: sortedObjectFromMap(rawTechTypeValueCounts, true),
  explicitLevelReferenceLengthCounts: sortedObjectFromMap(levelReferenceLengthCounts, true),
  relationFieldPresence: sortedObjectFromMap(relationFieldPresence),
  missingIdCount: techIds.missingIdCount,
  duplicateIdGroupCount: techIds.duplicateGroups.length,
  nonArrayLevelReferenceFieldCount,
  preTechLevelCardinalityMismatchCount,
};
const expectedLevelSummary = {
  ...fieldCensus(levelRecords),
  missingIdCount: levelIds.missingIdCount,
  duplicateIdGroupCount: levelIds.duplicateGroups.length,
};
const expectedLevelCoverage = {
  explicitReferenceCount: explicitLevelReferenceCount,
  sourceRecordCount: levelRecords.length,
  missingReferencedLevelIdCount: missingReferencedLevelIds.length,
  unreferencedRecordCount: unreferencedLevelRecordCount,
  multiplyReferencedRecordCount: multiplyReferencedLevelRecordCount,
};
const expectedDiagnostics = {
  trainingTechDuplicateIdGroups: techIds.duplicateGroups,
  trainingTechLevelDuplicateIdGroups: levelIds.duplicateGroups,
  missingReferencedLevelIds,
};

const trainingTechStructuralSummaryMatch = sameJson(census?.structuralSummary?.trainingTech, expectedTechSummary);
const trainingTechLevelStructuralSummaryMatch = sameJson(census?.structuralSummary?.trainingTechLevel, expectedLevelSummary);
const levelReferenceCoverageMatch = sameJson(census?.levelReferenceCoverage, expectedLevelCoverage);
const diagnosticsMatch = sameJson(census?.diagnostics, expectedDiagnostics);

if (!trainingTechStructuralSummaryMatch) fail("TrainingTech structural summary mismatch.");
if (!trainingTechLevelStructuralSummaryMatch) fail("TrainingTechLevel structural summary mismatch.");
if (!levelReferenceCoverageMatch) fail("TrainingTechLevel explicit-reference coverage mismatch.");
if (!diagnosticsMatch) fail("Stage 1 structural diagnostics mismatch.");

if (techIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_ID_MISSING", count: techIds.missingIdCount });
if (techIds.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_ID_DUPLICATE", count: techIds.duplicateGroups.length });
if (levelIds.missingIdCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_MISSING", count: levelIds.missingIdCount });
if (levelIds.duplicateGroups.length > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_ID_DUPLICATE", count: levelIds.duplicateGroups.length });
if (nonArrayLevelReferenceFieldCount > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_NON_ARRAY", count: nonArrayLevelReferenceFieldCount });
if (missingReferencedLevelIds.length > 0) reviews.push({ code: "TRAINING_TECH_LEVEL_REFERENCE_MISSING_TARGET", count: missingReferencedLevelIds.length });
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
    stage0FrozenPass:
      stage0?.status === "PASS" &&
      stage0?.completion === "COMPLETE" &&
      stage0?.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE0_FROZEN",
    trainingTechSourceSnapshotMatch: techBlobSha === stage0?.sourceSnapshots?.trainingTech?.gitBlobSha,
    trainingTechLevelSourceSnapshotMatch: levelBlobSha === stage0?.sourceSnapshots?.trainingTechLevel?.gitBlobSha,
    censusPredecessorMatch: census?.predecessor?.gitBlobSha === stage0BlobSha,
    censusSourceSnapshotsMatch:
      census?.sourceSnapshots?.trainingTech?.gitBlobSha === techBlobSha &&
      census?.sourceSnapshots?.trainingTechLevel?.gitBlobSha === levelBlobSha,
    trainingTechPopulationMatch:
      census?.population?.trainingTech === techRecords.length && techRecords.length === stage0?.population?.trainingTech,
    trainingTechLevelPopulationMatch:
      census?.population?.trainingTechLevel === levelRecords.length && levelRecords.length === stage0?.population?.trainingTechLevel,
    trainingTechRawMismatchCount,
    trainingTechMetadataMismatchCount,
    rawTrainingTechLevelDuplicatedInCensus: "levelRecords" in (census ?? {}),
    trainingTechStructuralSummaryMatch,
    trainingTechLevelStructuralSummaryMatch,
    levelReferenceCoverageMatch,
    diagnosticsMatch,
    semanticClassificationPerformed: false,
  },
  coverage: {
    trainingTechSourceRecords: techRecords.length,
    trainingTechLosslessCensusRecords: census.records?.length ?? 0,
    trainingTechLevelSourceRecords: levelRecords.length,
    trainingTechLevelStructurallyAccountedRecords: levelRecords.length,
    explicitTrainingTechLevelReferenceCount: explicitLevelReferenceCount,
    missingReferencedLevelIdCount: missingReferencedLevelIds.length,
    unreferencedLevelRecordCount,
    multiplyReferencedLevelRecordCount,
    trainingTechDuplicateIdGroupCount: techIds.duplicateGroups.length,
    trainingTechLevelDuplicateIdGroupCount: levelIds.duplicateGroups.length,
    trainingTechMissingIdCount: techIds.missingIdCount,
    trainingTechLevelMissingIdCount: levelIds.missingIdCount,
    nonArrayLevelReferenceFieldCount,
    preTechLevelCardinalityMismatchCount,
  },
  reviews: reviews.map((review) => ({ ...review, classification: "REVIEW", blocking: false })),
  blockers,
  hardErrorCount: blockers.length,
  nextOwner: blockers.length === 0 ? "TrainingTech Stage 2 Evidence Contract" : null,
  nextStartPoint:
    blockers.length === 0
      ? "Freeze which explicit TrainingTech and TrainingTechLevel source fields may be used as semantic classification evidence. Reuse this census; do not classify by names, descriptions, ID ranges/arithmetic, source order, or screen order."
      : null,
  reopenConditions: [
    "Stage 0 authoritative contradiction affecting this census.",
    "TrainingTech or TrainingTechLevel source snapshot change.",
    "Census record-loss or TrainingTech raw round-trip parity damage.",
    "Project Check ownership/orchestration contract change affecting this path.",
    "Hard owning-validator failure.",
  ],
};

mkdirSync(dirname(VALIDATION_PATH), { recursive: true });
writeFileSync(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      status: validation.status,
      completion: validation.completion,
      validationMode: validation.validationMode,
      coverage: validation.coverage,
      reviews: validation.reviews,
      blockers: validation.blockers,
    },
    null,
    2,
  ),
);

if (blockers.length > 0) process.exit(1);
