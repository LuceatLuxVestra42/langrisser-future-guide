import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const compactSha = (v) => sha256(Buffer.from(JSON.stringify(v)));
const fail = (m) => { throw new Error(m); };

const manifestPath = "data/generated/hero-skill-icon-assets.v1.json";
const materialPath = "data/generated/hero-skill-icon-sp-talent-materialization.v1.json";
const spSourcePath = "data/generated/hero-page-stage5-4-sp.v1.json";
const EXPECTED_MATERIALIZATION_SHA = "3edac2845fba3fbe7100b93f55a64b1d508098f0cd82667185c0e00d2f13d62d";
const EXPECTED_GENERAL_RECORDS = 1009;
const EXPECTED_AWAKENING_RECORDS = 256;
const EXPECTED_RELEASED = 25;
const EXPECTED_USAGE = 150;
const EXPECTED_UNIQUE = 25;

function collectCurrentSpTalent() {
  const source = readJson(spSourcePath);
  if (source.status !== "COMPLETE") fail(`SP source not COMPLETE: ${source.status}`);
  if (source.summary?.spReleasedCount !== EXPECTED_RELEASED || source.summary?.spTalentResolvedCount !== EXPECTED_RELEASED || source.summary?.hardErrorCount !== 0) {
    fail(`SP source summary drift ${JSON.stringify(source.summary)}`);
  }
  const byPath = new Map();
  let released = 0;
  let usage = 0;
  for (const hero of source.records ?? []) {
    const sp = hero.sp ?? {};
    if (sp.status !== "RELEASED") continue;
    released += 1;
    const heroId = Number(hero.heroId);
    const rows = sp.talent?.starProgression ?? [];
    if (rows.length !== 6) fail(`SP star progression drift hero=${heroId} count=${rows.length}`);
    for (const row of rows) {
      usage += 1;
      const sourcePath = row.skill?.iconPath;
      if (typeof sourcePath !== "string" || !sourcePath) fail(`missing SP iconPath hero=${heroId} star=${row.star}`);
      const prefixOk = sourcePath.startsWith("UI/Icon/Skill_ABS/") || sourcePath.startsWith("UI/Icon/Skill2_ABS/");
      if (!prefixOk) fail(`unsupported SP iconPath prefix ${sourcePath}`);
      let item = byPath.get(sourcePath);
      if (!item) {
        item = { usageCount: 0, heroIds: new Set(), skillIds: new Set(), stars: new Set() };
        byPath.set(sourcePath, item);
      }
      item.usageCount += 1;
      item.heroIds.add(heroId);
      item.skillIds.add(Number(row.skillId));
      item.stars.add(Number(row.star));
    }
  }
  if (released !== EXPECTED_RELEASED || usage !== EXPECTED_USAGE || byPath.size !== EXPECTED_UNIQUE) {
    fail(`SP population drift released=${released}/${EXPECTED_RELEASED} usage=${usage}/${EXPECTED_USAGE} unique=${byPath.size}/${EXPECTED_UNIQUE}`);
  }
  return { byPath, released, usage };
}

const manifest = readJson(manifestPath);
const material = readJson(materialPath);
if (manifest.schemaId !== "hero-skill-icon-assets/v1" || manifest.status !== "FROZEN") fail("base manifest contract mismatch");
if (!Array.isArray(manifest.records) || manifest.records.length !== EXPECTED_GENERAL_RECORDS) fail(`general frozen count drift ${manifest.records?.length}/${EXPECTED_GENERAL_RECORDS}`);
if (!Array.isArray(manifest.awakeningRecords) || manifest.awakeningRecords.length !== EXPECTED_AWAKENING_RECORDS) fail(`awakening frozen count drift ${manifest.awakeningRecords?.length}/${EXPECTED_AWAKENING_RECORDS}`);
if (manifest.allHeroAdmission?.status !== "FROZEN" || manifest.allHeroAdmission?.completion !== "COMPLETE" || manifest.allHeroAdmission?.generalMissingCount !== 0) fail("general admission no longer frozen/complete");
if (manifest.spTalentRecords || manifest.spTalentAdmission) fail("SP talent admission already exists");

if (material.schemaId !== "hero-skill-icon-sp-talent-materialization/v1" || material.status !== "FROZEN" || material.completion !== "COMPLETE" || material.semanticReopen !== false) fail("SP materialization contract mismatch");
if (material.lookupAuthority !== "exact sp.talent.starProgression[].skill.iconPath only") fail("SP materialization lookup authority mismatch");
if (material.materializationSetSha256 !== EXPECTED_MATERIALIZATION_SHA || compactSha(material.records) !== EXPECTED_MATERIALIZATION_SHA) fail("SP materialization hash mismatch");
if (material.summary?.spReleasedCount !== EXPECTED_RELEASED || material.summary?.spTalentUsageCount !== EXPECTED_USAGE || material.summary?.targetUniqueIconPathCount !== EXPECTED_UNIQUE || material.summary?.provedCount !== EXPECTED_UNIQUE || material.summary?.missingCount !== 0) fail(`SP materialization summary mismatch ${JSON.stringify(material.summary)}`);
if (!Array.isArray(material.records) || material.records.length !== EXPECTED_UNIQUE) fail("SP materialization record count mismatch");

const { byPath, released, usage } = collectCurrentSpTalent();
const existing = [...manifest.records, ...manifest.awakeningRecords];
const existingSourcePaths = new Set(existing.map((r) => r.sourcePath));
if (existingSourcePaths.size !== existing.length) fail("predecessor manifest sourcePath duplicate");
const existingPublic = new Set(existing.map((r) => String(r.publicPath ?? "").toLowerCase()).filter(Boolean));
const seenSource = new Set();
const seenPublic = new Set(existingPublic);
const records = [];

for (const row of material.records) {
  if (row.role !== "sp-talent") fail(`SP materialization role mismatch ${row.sourcePath}`);
  if (!byPath.has(row.sourcePath)) fail(`materialized SP sourcePath absent from current source ${row.sourcePath}`);
  if (existingSourcePaths.has(row.sourcePath)) fail(`SP sourcePath overlaps frozen predecessor manifest ${row.sourcePath}`);
  if (seenSource.has(row.sourcePath)) fail(`SP materialization duplicate sourcePath ${row.sourcePath}`);
  seenSource.add(row.sourcePath);
  const publicKey = String(row.publicPath ?? "").toLowerCase();
  if (!publicKey || seenPublic.has(publicKey)) fail(`SP publicPath collision ${row.publicPath}`);
  seenPublic.add(publicKey);
  const usageRow = byPath.get(row.sourcePath);
  const expected = {
    usageCount: usageRow.usageCount,
    heroIds: [...usageRow.heroIds].sort((a,b) => a-b),
    skillIds: [...usageRow.skillIds].sort((a,b) => a-b),
    stars: [...usageRow.stars].sort((a,b) => a-b),
  };
  for (const key of ["usageCount", "heroIds", "skillIds", "stars"]) {
    if (JSON.stringify(row[key]) !== JSON.stringify(expected[key])) fail(`SP source/materialization mismatch ${row.sourcePath} ${key}`);
  }
  if (row.verificationOwner !== "OFFICIAL_INSTALLER_EXACT_RUNTIME_PATH_UNITY_SPRITE" || row.objectType !== "Sprite") fail(`SP proof owner/type mismatch ${row.sourcePath}`);
  if (!Number.isInteger(row.pathId) || !row.bundleSha256 || !row.rawObjectSha256 || !row.rgbaSha256) fail(`SP proof metadata incomplete ${row.sourcePath}`);
  const fsPath = path.join(root, String(row.publicPath).replace(/^\//, "public/"));
  if (!fs.existsSync(fsPath)) fail(`SP PNG missing ${row.publicPath}`);
  const png = fs.readFileSync(fsPath);
  if (png.length !== row.pngBytes || sha256(png) !== row.pngSha256) fail(`SP PNG proof mismatch ${row.sourcePath}`);
  records.push({ ...row });
}

records.sort((a,b) => a.sourcePath.localeCompare(b.sourcePath));
if (records.length !== EXPECTED_UNIQUE || seenSource.size !== EXPECTED_UNIQUE) fail("SP admission cardinality mismatch");

manifest.spTalentRecords = records;
manifest.spTalentAdmission = {
  status: "FROZEN",
  completion: "COMPLETE",
  semanticReopen: false,
  stage: "SP_TALENT_SKILL_ICON_MANIFEST_ADMISSION",
  lookupAuthority: "exact sp.talent.starProgression[].skill.iconPath only",
  predecessor: {
    materializationSchemaId: material.schemaId,
    materializationSetSha256: EXPECTED_MATERIALIZATION_SHA,
  },
  spReleasedCount: released,
  spTalentUsageCount: usage,
  spTalentUniqueIconPathCount: byPath.size,
  admittedNowCount: records.length,
  spTalentMissingCount: 0,
  frozenGeneralRecordCount: EXPECTED_GENERAL_RECORDS,
  frozenAwakeningRecordCount: EXPECTED_AWAKENING_RECORDS,
  manifestArray: "spTalentRecords",
  frontendMutation: false,
};

fs.writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: "PASS_ADMITTED", spTalentRecords: records.length, released, usage, unique: byPath.size, generalRecords: manifest.records.length, awakeningRecords: manifest.awakeningRecords.length, materializationSetSha256: EXPECTED_MATERIALIZATION_SHA }, null, 2));
