import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "data/generated/hero-skill-icon-assets.v1.json");
const materializationPath = path.join(repoRoot, "data/generated/hero-skill-icon-all-hero-materialization.v1.json");
const shardDir = path.join(repoRoot, "data/generated/hero-detail/by-id");
const EXPECTED_MATERIALIZATION_SHA = "bdad69dcd040534749d44b94d39557b8d49a49be39ef387ee99def5f3c954bde";
const EXPECTED_NEW = 996;
const EXPECTED_GENERAL_UNIQUE = 1006;
const EXPECTED_LEGACY_RECORDS = 13;
const EXPECTED_AWAKENING_RECORDS = 256;

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const compactSha = (v) => sha256(Buffer.from(JSON.stringify(v)));
const fail = (m) => { throw new Error(m); };

function collectStage6Usage() {
  const files = fs.readdirSync(shardDir).filter((n) => /^\d+\.json$/.test(n)).sort((a,b) => Number(a.slice(0,-5))-Number(b.slice(0,-5)));
  if (files.length !== 267) fail(`hero shard count mismatch ${files.length}/267`);
  const byPath = new Map();
  const counts = { jobLevel: 0, direct: 0, talent: 0, total: 0 };
  const add = (group, heroId, skillId, sourcePath) => {
    counts[group] += 1; counts.total += 1;
    if (typeof sourcePath !== "string" || !sourcePath) fail(`invalid Stage6 iconPath hero=${heroId} group=${group} skill=${skillId}`);
    let r = byPath.get(sourcePath);
    if (!r) { r = { groups:new Set(), heroIds:new Set(), skillIds:new Set(), usageCount:0 }; byPath.set(sourcePath, r); }
    r.groups.add(group); r.heroIds.add(heroId); if (Number.isInteger(skillId)) r.skillIds.add(skillId); r.usageCount += 1;
  };
  for (const name of files) {
    const hero = readJson(path.join(shardDir, name));
    const heroId = Number(name.slice(0,-5));
    for (const r of hero.normal?.skills?.jobLevelAcquisitions ?? []) add("jobLevel", heroId, r.skillId, r.skill?.iconPath);
    for (const r of hero.normal?.skills?.heroDirectSkills ?? []) add("direct", heroId, r.skillId, r.iconPath);
    for (const r of hero.normal?.talent?.starProgression ?? []) add("talent", heroId, r.skillId, r.skill?.iconPath);
  }
  if (JSON.stringify(counts) !== JSON.stringify({jobLevel:1911,direct:304,talent:1602,total:3817})) fail(`Stage6 usage drift ${JSON.stringify(counts)}`);
  if (byPath.size !== EXPECTED_GENERAL_UNIQUE) fail(`Stage6 unique iconPath drift ${byPath.size}/${EXPECTED_GENERAL_UNIQUE}`);
  return { byPath, counts };
}

const manifest = readJson(manifestPath);
const material = readJson(materializationPath);
if (manifest.schemaId !== "hero-skill-icon-assets/v1" || manifest.status !== "FROZEN") fail("base manifest contract mismatch");
if (!Array.isArray(manifest.records) || manifest.records.length !== EXPECTED_LEGACY_RECORDS) fail(`legacy manifest records mismatch ${manifest.records?.length}`);
if (!Array.isArray(manifest.awakeningRecords) || manifest.awakeningRecords.length !== EXPECTED_AWAKENING_RECORDS) fail(`awakeningRecords mismatch ${manifest.awakeningRecords?.length}`);
if (manifest.allHeroAdmission) fail("allHeroAdmission already exists; refusing duplicate admission");
if (material.schemaId !== "hero-skill-icon-all-hero-materialization/v1" || material.status !== "FROZEN" || material.completion !== "COMPLETE" || material.semanticReopen !== false) fail("materialization contract mismatch");
if (material.materializationSetSha256 !== EXPECTED_MATERIALIZATION_SHA || compactSha(material.records) !== EXPECTED_MATERIALIZATION_SHA) fail("materialization hash mismatch");
if (material.summary?.targetCount !== EXPECTED_NEW || material.summary?.materializedCount !== EXPECTED_NEW || material.summary?.missingCount !== 0 || material.summary?.hashMismatchCount !== 0 || material.summary?.publicPathCollisionCount !== 0) fail(`materialization summary mismatch ${JSON.stringify(material.summary)}`);
if (!Array.isArray(material.records) || material.records.length !== EXPECTED_NEW) fail("materialization record count mismatch");

const { byPath, counts } = collectStage6Usage();
const existing = [...manifest.records, ...manifest.awakeningRecords];
const existingPaths = new Set(existing.map((r) => r.sourcePath));
if (existingPaths.size !== existing.length) fail("existing manifest sourcePath duplicate");
const generalAlready = [...byPath.keys()].filter((p) => existingPaths.has(p));
if (generalAlready.length !== 10) fail(`legacy current-general overlap drift ${generalAlready.length}/10`);

const newRecords = [];
const seenPublic = new Set(existing.map((r) => String(r.publicPath || "").toLowerCase()).filter(Boolean));
for (const row of material.records) {
  const sourcePath = row.sourcePath;
  if (!byPath.has(sourcePath)) fail(`materialized sourcePath absent from current Stage6: ${sourcePath}`);
  if (existingPaths.has(sourcePath)) fail(`materialized sourcePath overlaps existing manifest: ${sourcePath}`);
  const publicKey = String(row.publicPath || "").toLowerCase();
  if (!publicKey || seenPublic.has(publicKey)) fail(`publicPath collision: ${row.publicPath}`);
  seenPublic.add(publicKey);
  const file = path.join(repoRoot, row.filesystemPath);
  if (!fs.existsSync(file)) fail(`public asset missing: ${row.filesystemPath}`);
  const bytes = fs.readFileSync(file);
  if (bytes.length !== row.pngBytes || sha256(bytes) !== row.pngSha256) fail(`public PNG proof mismatch: ${sourcePath}`);
  const usage = byPath.get(sourcePath);
  const expectedUsage = {
    usageCount: usage.usageCount,
    groups: [...usage.groups].sort(),
    heroIds: [...usage.heroIds].sort((a,b)=>a-b),
    skillIds: [...usage.skillIds].sort((a,b)=>a-b),
  };
  for (const key of ["usageCount","groups","heroIds","skillIds"]) if (JSON.stringify(row[key]) !== JSON.stringify(expectedUsage[key])) fail(`materialization/Stage6 usage mismatch ${sourcePath} ${key}`);
  newRecords.push({
    role: "stage6-general",
    sourcePath,
    usageCount: row.usageCount,
    groups: row.groups,
    heroIds: row.heroIds,
    skillIds: row.skillIds,
    verificationOwner: row.verificationOwner,
    packagePart: row.packagePart,
    packageName: row.packageName,
    bundleEntry: row.bundleEntry,
    bundleSha256: row.bundleSha256,
    containerPath: row.containerPath,
    objectType: row.objectType,
    pathId: row.pathId,
    rawObjectSha256: row.rawObjectSha256,
    rgbaSha256: row.rgbaSha256,
    width: row.width,
    height: row.height,
    publicPath: row.publicPath,
    pngBytes: row.pngBytes,
    pngSha256: row.pngSha256,
  });
}
newRecords.sort((a,b) => a.sourcePath.localeCompare(b.sourcePath));
if (newRecords.length !== EXPECTED_NEW || new Set(newRecords.map((r)=>r.sourcePath)).size !== EXPECTED_NEW) fail("new admission uniqueness mismatch");

const admittedPaths = new Set([...existingPaths, ...newRecords.map((r)=>r.sourcePath)]);
const missingGeneral = [...byPath.keys()].filter((p) => !admittedPaths.has(p));
if (missingGeneral.length !== 0) fail(`current Stage6 general coverage missing ${missingGeneral.length}`);

manifest.records = [...manifest.records, ...newRecords];
manifest.allHeroAdmission = {
  status: "FROZEN",
  completion: "COMPLETE",
  semanticReopen: false,
  stage: "ALL_HERO_GENERAL_SKILL_ICON_MANIFEST_ADMISSION",
  lookupAuthority: "exact Stage6 sourcePath only",
  predecessor: {
    materializationSchemaId: material.schemaId,
    materializationSetSha256: EXPECTED_MATERIALIZATION_SHA,
  },
  stage6Usage: counts,
  stage6UniqueGeneralIconPathCount: EXPECTED_GENERAL_UNIQUE,
  legacyGeneralMatchedCount: generalAlready.length,
  admittedNowCount: EXPECTED_NEW,
  generalMissingCount: 0,
  publicPathCollisionCount: 0,
  manifestArray: "records",
  frontendMutation: false,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status:"PASS_ADMITTED", legacyRecordCount:EXPECTED_LEGACY_RECORDS, admittedNowCount:EXPECTED_NEW, recordsCount:manifest.records.length, awakeningRecordsCount:manifest.awakeningRecords.length, totalManifestCount:manifest.records.length+manifest.awakeningRecords.length, stage6GeneralMatched:EXPECTED_GENERAL_UNIQUE, stage6GeneralMissing:0, materializationSetSha256:EXPECTED_MATERIALIZATION_SHA}, null, 2));
