import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const presentationPath = path.join(root, "data/presentation/soldier-ability-kr.v1.json");
const soldierListPath = path.join(root, "data/generated/soldier-list-stage5-8.v1.json");

function fail(message) {
  console.error(`[soldier-ability-presentation] FAIL: ${message}`);
  process.exit(1);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`missing ${label}: ${path.relative(root, filePath)}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const presentation = readJson(presentationPath, "Soldier Korean ability presentation");
const soldierList = readJson(soldierListPath, "frozen Soldier list");

if (presentation.version !== 1 || presentation.schemaId !== "soldier-ability-kr-presentation/v1") {
  fail("presentation schema contract mismatch");
}
if (presentation.status !== "PASS" || presentation.scope !== "frontend-presentation-only") {
  fail("presentation status/scope contract mismatch");
}
if (presentation.source?.identityMutation !== false) {
  fail("presentation must not mutate Soldier identity");
}
if (
  presentation.source?.mappingMethod !==
  "Direct ID projection from the supplied confirmed source. No name JOIN, ID arithmetic, or semantic recomputation."
) {
  fail("presentation mapping policy mismatch");
}
if (
  presentation.source?.spAbilityPolicy !==
  "Use the SP row's directly supplied SP ability text; never patch NORMAL ability numbers to derive SP text."
) {
  fail("SP ability policy mismatch");
}

if (soldierList.status !== "PASS") fail(`frozen Soldier list status is ${soldierList.status}`);
const canonicalRecords = soldierList.records ?? [];
if (
  soldierList.summary?.recordCount !== 224 ||
  soldierList.summary?.normalCount !== 168 ||
  soldierList.summary?.spCount !== 56 ||
  canonicalRecords.length !== 224
) {
  fail("frozen Soldier population contract mismatch");
}

const normalEntries = Object.entries(presentation.normalBySoldierId ?? {});
const spEntries = Object.entries(presentation.spBySoldierId ?? {});
if (normalEntries.length !== 168) fail(`NORMAL presentation count must be 168; got ${normalEntries.length}`);
if (spEntries.length !== 56) fail(`SP presentation count must be 56; got ${spEntries.length}`);

const canonicalById = new Map();
for (const record of canonicalRecords) {
  if (!Number.isSafeInteger(record.soldierId) || record.soldierId <= 0) {
    fail(`invalid canonical Soldier ID: ${record.soldierId}`);
  }
  if (canonicalById.has(record.soldierId)) fail(`duplicate canonical Soldier ID: ${record.soldierId}`);
  canonicalById.set(record.soldierId, record);
}

const seenPresentationIds = new Set();
let localizedAbilityCount = 0;
let noAbilityCount = 0;
let cjkAbilityCount = 0;
const cjkPattern = /[\u3400-\u4dbf\u4e00-\u9fff]/u;

function parseId(rawId, kind) {
  if (!/^[1-9]\d*$/u.test(rawId)) fail(`invalid ${kind} presentation Soldier ID key: ${rawId}`);
  const soldierId = Number(rawId);
  if (!Number.isSafeInteger(soldierId)) fail(`unsafe ${kind} presentation Soldier ID: ${rawId}`);
  if (seenPresentationIds.has(soldierId)) fail(`duplicate presentation Soldier ID: ${soldierId}`);
  seenPresentationIds.add(soldierId);
  return soldierId;
}

for (const [rawId, abilityKr] of normalEntries) {
  const soldierId = parseId(rawId, "NORMAL");
  const canonical = canonicalById.get(soldierId);
  if (!canonical) fail(`unknown NORMAL presentation Soldier ID: ${soldierId}`);
  if (canonical.isSp) fail(`NORMAL presentation points to SP Soldier ${soldierId}`);

  if (abilityKr === null) {
    noAbilityCount += 1;
    if (canonical.tier !== 1) fail(`only Tier 1 NORMAL Soldiers may have no ability: ${soldierId}`);
    continue;
  }

  if (typeof abilityKr !== "string" || !abilityKr.trim()) {
    fail(`NORMAL Soldier ${soldierId} has an empty/non-string Korean ability`);
  }
  if (abilityKr.trim() === "-") fail(`NORMAL Soldier ${soldierId} stores '-' instead of null`);
  if (cjkPattern.test(abilityKr)) {
    cjkAbilityCount += 1;
    fail(`NORMAL Soldier ${soldierId} Korean ability contains CJK ideographs`);
  }
  localizedAbilityCount += 1;
}

for (const [rawId, value] of spEntries) {
  const soldierId = parseId(rawId, "SP");
  const canonical = canonicalById.get(soldierId);
  if (!canonical) fail(`unknown SP presentation Soldier ID: ${soldierId}`);
  if (!canonical.isSp) fail(`SP presentation points to NORMAL Soldier ${soldierId}`);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`SP Soldier ${soldierId} presentation value must be an object`);
  }
  if (!Number.isSafeInteger(value.normalSoldierId) || value.normalSoldierId <= 0) {
    fail(`SP Soldier ${soldierId} has invalid normalSoldierId`);
  }
  if (value.normalSoldierId !== canonical.normalSoldierId) {
    fail(
      `SP relation mismatch for ${soldierId}: presentation=${value.normalSoldierId}, canonical=${canonical.normalSoldierId}`,
    );
  }
  if (typeof value.abilityKr !== "string" || !value.abilityKr.trim()) {
    fail(`SP Soldier ${soldierId} has an empty/non-string Korean ability`);
  }
  if (value.abilityKr.trim() === "-") fail(`SP Soldier ${soldierId} stores '-' as Korean ability`);
  if (cjkPattern.test(value.abilityKr)) {
    cjkAbilityCount += 1;
    fail(`SP Soldier ${soldierId} Korean ability contains CJK ideographs`);
  }
  localizedAbilityCount += 1;
}

if (seenPresentationIds.size !== canonicalById.size) {
  const missing = [...canonicalById.keys()].filter((id) => !seenPresentationIds.has(id));
  fail(`presentation does not cover the frozen Soldier ID set: missing=${missing.join(",")}`);
}

for (const soldierId of seenPresentationIds) {
  if (!canonicalById.has(soldierId)) fail(`presentation contains unexpected Soldier ID: ${soldierId}`);
}

if (localizedAbilityCount !== 212) {
  fail(`localized ability count must be 212; got ${localizedAbilityCount}`);
}
if (noAbilityCount !== 12) fail(`no-ability count must be 12; got ${noAbilityCount}`);
if (cjkAbilityCount !== 0) fail(`CJK Korean-ability count must be 0; got ${cjkAbilityCount}`);

const coverage = presentation.coverage ?? {};
const expectedCoverage = {
  recordCount: 224,
  normalCount: 168,
  spCount: 56,
  localizedAbilityCount: 212,
  noAbilityCount: 12,
  unresolvedCount: 0,
};
for (const [key, expected] of Object.entries(expectedCoverage)) {
  if (coverage[key] !== expected) {
    fail(`coverage.${key} must be ${expected}; got ${coverage[key]}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      presentation: path.relative(root, presentationPath),
      canonicalSource: path.relative(root, soldierListPath),
      recordCount: seenPresentationIds.size,
      normalCount: normalEntries.length,
      spCount: spEntries.length,
      localizedAbilityCount,
      noAbilityCount,
      cjkAbilityCount,
      duplicatePresentationIdCount: 0,
      unknownPresentationIdCount: 0,
      spRelationMismatchCount: 0,
      runtimeNameJoin: false,
      idArithmetic: false,
      semanticRecomputation: false,
    },
    null,
    2,
  ),
);
