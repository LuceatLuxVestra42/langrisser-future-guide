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

function fail(message) {
  console.error(`[equipment-name-kr] FAIL: ${message}`);
  process.exit(1);
}

function parseDisplayText(rawValue) {
  const raw = rawValue.trim();
  if (!raw) fail("empty Korean display value");

  if (raw.startsWith("미확정")) {
    return {
      nameKr: null,
      status: "UNRESOLVED_NON_PUBLIC",
      note: raw,
    };
  }

  let display = raw;
  const notes = [];

  const duplicateNoteMatch = display.match(/^(.*?)(\([^)]*동일 아이템[^)]*\))$/u);
  if (duplicateNoteMatch) {
    display = duplicateNoteMatch[1].trim();
    notes.push(duplicateNoteMatch[2]);
  }

  const ownerNoteMatch = display.match(/^(.*),\s*([^,]+ 전용장비)$/u);
  if (ownerNoteMatch) {
    display = ownerNoteMatch[1].trim();
    notes.push(ownerNoteMatch[2].trim());
  }

  if (!display) fail(`empty approved display text after note stripping: ${raw}`);

  return {
    nameKr: display,
    status: "USER_APPROVED_DISPLAY",
    note: notes.length > 0 ? notes.join("; ") : null,
  };
}

function readSourceRecords() {
  const records = [];

  for (const [sourceGroup, relativePath] of sourceFiles) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) fail(`missing source file: ${relativePath}`);

    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (!line.trim()) return;

      const columns = line.split("\t").map((value) => value.trim()).filter(Boolean);
      if (columns.length < 2) {
        fail(`${relativePath}:${index + 1} must contain CN and KR columns`);
      }

      const nameCn = columns[0];
      const rawKr = columns.slice(1).join("\t");
      const parsed = parseDisplayText(rawKr);
      records.push({
        sourceGroup,
        sourceLine: index + 1,
        nameCn,
        rawKr,
        ...parsed,
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

  resolved.push({
    equipmentId: canonical.equipmentId,
    nameCn: canonical.nameCn,
    nameKr: source.nameKr,
    pageReady: canonical.pageReady === true,
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
  schemaVersion: 1,
  status: "PASS_USER_APPROVED_EQUIPMENT_KR_PRESENTATION",
  policy: {
    identityResolution: "build-time exact nameCn match against frozen Stage 3-2 metadata",
    productionJoinKey: "equipmentId",
    runtimeNameJoin: false,
    semanticStageReopened: false,
    unresolvedNonPublicRemainsNull: true,
  },
  counts: {
    canonical: resolved.length,
    public: publicRecords.length,
    publicNameKr: publicRecords.filter((record) => record.nameKr).length,
    nonPublic: nonPublicRecords.length,
    unresolvedNonPublic: nonPublicRecords.filter((record) => !record.nameKr).length,
  },
  byEquipmentId,
};

const validation = {
  status: "PASS",
  sourceRows: sourceRecords.length,
  canonicalRows: canonicalRecords.length,
  resolvedRows: resolved.length,
  duplicateSourceNameCn: 0,
  duplicateEquipmentId: 0,
  missingCanonicalMatch: 0,
  publicCount: publicRecords.length,
  publicMissingNameKr: missingPublicNames.length,
  nonPublicCount: nonPublicRecords.length,
  nonPublicUnexpectedNameKr: namedNonPublicRecords.length,
  runtimeNameJoin: false,
  productionJoinKey: "equipmentId",
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(validationPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);

console.log(
  `[equipment-name-kr] PASS canonical=${resolved.length} public=${publicRecords.length} publicNameKr=${output.counts.publicNameKr} unresolvedNonPublic=${output.counts.unresolvedNonPublic}`,
);
