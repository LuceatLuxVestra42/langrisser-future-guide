import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceFiles = [
  ["weapon", "data/localization/equipment-name-kr/weapon.tsv"],
  ["armor", "data/localization/equipment-name-kr/armor.tsv"],
  ["headgear", "data/localization/equipment-name-kr/headgear.tsv"],
  ["accessory", "data/localization/equipment-name-kr/accessory.tsv"],
];
const metadataPath = path.join(
  root,
  "data/generated/equipment_stage3_2_display_metadata.json",
);
const outputPath = path.join(
  root,
  "data/generated/equipment-name-kr-user-approved.v1.json",
);
const validationPath = path.join(
  root,
  "data/validation/equipment-name-kr-user-approved-summary.v1.json",
);

const SOURCE_STATUS = {
  CONFIRMED: "confirmed",
  PROVISIONAL: "provisional-display",
  DUPLICATE: "duplicate-non-display",
  UNRESOLVED: "unresolved-non-public",
};
const allowedStatuses = new Set(Object.values(SOURCE_STATUS));
const expectedStatusCounts = {
  [SOURCE_STATUS.CONFIRMED]: 349,
  [SOURCE_STATUS.PROVISIONAL]: 16,
  [SOURCE_STATUS.DUPLICATE]: 8,
  [SOURCE_STATUS.UNRESOLVED]: 17,
};

function fail(message) {
  console.error(`[equipment-name-kr] FAIL: ${message}`);
  process.exit(1);
}

function parseSourceRow(relativePath, line, lineNumber) {
  const columns = line.split("\t");
  if (columns.length < 3) {
    fail(`${relativePath}:${lineNumber} must contain CN, KR, and status columns`);
  }

  const nameCn = columns[0]?.trim() ?? "";
  const rawKr = columns[1]?.trim() ?? "";
  const status = columns[2]?.trim() ?? "";
  const note = columns.slice(3).join("\t").trim() || null;

  if (!nameCn) fail(`${relativePath}:${lineNumber} has an empty Chinese name`);
  if (!allowedStatuses.has(status)) {
    fail(`${relativePath}:${lineNumber} has unsupported status: ${status}`);
  }

  if (status === SOURCE_STATUS.UNRESOLVED) {
    if (rawKr !== "미확정") {
      fail(`${relativePath}:${lineNumber} unresolved non-public rows must use 미확정`);
    }
    return { nameCn, nameKr: null, rawKr, status, note };
  }

  if (!rawKr || rawKr.startsWith("미확정")) {
    fail(`${relativePath}:${lineNumber} ${status} rows require a Korean display name`);
  }

  return { nameCn, nameKr: rawKr, rawKr, status, note };
}

function readSourceRecords() {
  const records = [];

  for (const [sourceGroup, relativePath] of sourceFiles) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) fail(`missing source file: ${relativePath}`);

    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (!line.trim() || line.trimStart().startsWith("#")) return;
      records.push({
        sourceGroup,
        sourceLine: index + 1,
        ...parseSourceRow(relativePath, line, index + 1),
      });
    });
  }

  return records;
}

if (!fs.existsSync(metadataPath)) {
  fail("missing frozen Stage 3-2 display metadata");
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const canonicalRecords = metadata.records ?? [];
const sourceRecords = readSourceRecords();

if (canonicalRecords.length !== 390) {
  fail(`canonical equipment count must be 390; got ${canonicalRecords.length}`);
}
if (sourceRecords.length !== 390) {
  fail(`user localization source count must be 390; got ${sourceRecords.length}`);
}

const sourceStatusCounts = Object.fromEntries(
  [...allowedStatuses].map((status) => [
    status,
    sourceRecords.filter((record) => record.status === status).length,
  ]),
);
for (const [status, expected] of Object.entries(expectedStatusCounts)) {
  if (sourceStatusCounts[status] !== expected) {
    fail(`source status ${status} must contain ${expected} rows; got ${sourceStatusCounts[status]}`);
  }
}

const canonicalByNameCn = new Map();
for (const record of canonicalRecords) {
  if (canonicalByNameCn.has(record.nameCn)) {
    fail(`duplicate canonical Chinese name: ${record.nameCn}`);
  }
  canonicalByNameCn.set(record.nameCn, record);
}

const seenSourceNames = new Set();
const resolved = [];
for (const source of sourceRecords) {
  if (seenSourceNames.has(source.nameCn)) {
    fail(`duplicate localization source Chinese name: ${source.nameCn}`);
  }
  seenSourceNames.add(source.nameCn);

  const canonical = canonicalByNameCn.get(source.nameCn);
  if (!canonical) {
    fail(`localization source has no canonical equipment match: ${source.nameCn}`);
  }

  const pageReady = canonical.pageReady === true;
  if (source.status === SOURCE_STATUS.UNRESOLVED && pageReady) {
    fail(`unresolved non-public source row is pageReady in canonical metadata: ${source.nameCn}`);
  }
  if (source.status !== SOURCE_STATUS.UNRESOLVED && !pageReady) {
    fail(`named source row is non-public in canonical metadata: ${source.nameCn}`);
  }

  resolved.push({
    equipmentId: canonical.equipmentId,
    nameCn: canonical.nameCn,
    nameKr: source.nameKr,
    pageReady,
    sourceGroup: source.sourceGroup,
    sourceLine: source.sourceLine,
    status: source.status,
    note: source.note,
  });
}

const unresolvedCanonicalNames = canonicalRecords
  .filter((record) => !seenSourceNames.has(record.nameCn))
  .map((record) => record.nameCn);
if (unresolvedCanonicalNames.length > 0) {
  fail(`canonical names missing from localization source: ${unresolvedCanonicalNames.join(", ")}`);
}

resolved.sort((a, b) => a.equipmentId - b.equipmentId);
const seenIds = new Set();
for (const record of resolved) {
  if (seenIds.has(record.equipmentId)) fail(`duplicate resolved equipmentId: ${record.equipmentId}`);
  seenIds.add(record.equipmentId);
}

const publicRecords = resolved.filter((record) => record.pageReady);
const nonPublicRecords = resolved.filter((record) => !record.pageReady);
const missingPublicNames = publicRecords.filter((record) => !record.nameKr);
const namedNonPublicRecords = nonPublicRecords.filter((record) => record.nameKr);
const provisionalRecords = resolved.filter((record) => record.status === SOURCE_STATUS.PROVISIONAL);
const duplicateRecords = resolved.filter((record) => record.status === SOURCE_STATUS.DUPLICATE);
const confirmedRecords = resolved.filter((record) => record.status === SOURCE_STATUS.CONFIRMED);
const unresolvedRecords = resolved.filter((record) => record.status === SOURCE_STATUS.UNRESOLVED);

if (publicRecords.length !== 373) {
  fail(`public equipment count must be 373; got ${publicRecords.length}`);
}
if (nonPublicRecords.length !== 17) {
  fail(`non-public equipment count must be 17; got ${nonPublicRecords.length}`);
}
if (missingPublicNames.length > 0) {
  fail(
    `public equipment missing Korean display names: ${missingPublicNames
      .map((record) => `${record.equipmentId}:${record.nameCn}`)
      .join(", ")}`,
  );
}
if (namedNonPublicRecords.length > 0) {
  fail(
    `non-public equipment unexpectedly received Korean display names: ${namedNonPublicRecords
      .map((record) => `${record.equipmentId}:${record.nameCn}`)
      .join(", ")}`,
  );
}
if (confirmedRecords.length !== 349 || provisionalRecords.length !== 16 || duplicateRecords.length !== 8 || unresolvedRecords.length !== 17) {
  fail("resolved localization status counts changed unexpectedly");
}

const byEquipmentId = Object.fromEntries(
  resolved.map((record) => [
    String(record.equipmentId),
    {
      nameCn: record.nameCn,
      nameKr: record.nameKr,
      pageReady: record.pageReady,
      sourceGroup: record.sourceGroup,
      sourceLine: record.sourceLine,
      status: record.status,
      note: record.note,
    },
  ]),
);

const output = {
  schemaVersion: 2,
  status: "PASS_USER_APPROVED_EQUIPMENT_KR_PRESENTATION",
  policy: {
    identityResolution: "build-time exact nameCn match against frozen Stage 3-2 metadata",
    productionJoinKey: "equipmentId",
    runtimeNameJoin: false,
    semanticStageReopened: false,
    confirmedAndProvisionalSeparated: true,
    provisionalDisplayDoesNotMutateCanonicalNameKr: true,
    unresolvedNonPublicRemainsNull: true,
  },
  counts: {
    canonical: resolved.length,
    public: publicRecords.length,
    publicNameKr: publicRecords.filter((record) => record.nameKr).length,
    confirmed: confirmedRecords.length,
    provisionalDisplay: provisionalRecords.length,
    duplicateNonDisplay: duplicateRecords.length,
    nonPublic: nonPublicRecords.length,
    unresolvedNonPublic: unresolvedRecords.length,
  },
  byEquipmentId,
};

const validation = {
  status: "PASS",
  sourceRows: sourceRecords.length,
  canonicalRows: canonicalRecords.length,
  resolvedRows: resolved.length,
  sourceStatusCounts,
  duplicateSourceNameCn: 0,
  duplicateEquipmentId: 0,
  missingCanonicalMatch: 0,
  publicCount: publicRecords.length,
  publicMissingNameKr: missingPublicNames.length,
  confirmedCount: confirmedRecords.length,
  provisionalDisplayCount: provisionalRecords.length,
  duplicateNonDisplayCount: duplicateRecords.length,
  nonPublicCount: nonPublicRecords.length,
  nonPublicUnexpectedNameKr: namedNonPublicRecords.length,
  runtimeNameJoin: false,
  productionJoinKey: "equipmentId",
  semanticStageReopened: false,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(validationPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);

console.log(
  `[equipment-name-kr] PASS canonical=${resolved.length} public=${publicRecords.length} confirmed=${confirmedRecords.length} provisional=${provisionalRecords.length} duplicate=${duplicateRecords.length} unresolvedNonPublic=${unresolvedRecords.length}`,
);
