import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
const fail = (message) => { throw new Error(message); };

const manifest = readJson("data/generated/hero-skill-icon-assets.v1.json");
const assetValidation = readJson("data/generated/hero-awakening-icon-asset-validation.v1.json");
const resolverSource = fs.readFileSync(path.join(repoRoot, "src/lib/hero-skill-icon-assets.ts"), "utf8");

const EXPECTED_A7_3_VALIDATION_SHA = "876e3c9bf041b3e51d374c96eb4711dee8c2a75cc5df2bcb78c39bb6dbe82d26";
const EXPECTED_AWAKENING_MAP_SHA = "def7582c48e99b48f0a0f8b1608f13a8c22ca3aa7cf287055787e1d39661563e";
const UNKNOWN_SOURCE = "UI/Icon/Skill_ABS/__A8_UNKNOWN_EXACT_PATH__.png";

if (assetValidation.schemaId !== "hero-awakening-icon-asset-validation/v1" || assetValidation.status !== "FROZEN" || assetValidation.completion !== "COMPLETE") fail("A7-3 checkpoint contract mismatch");
if (assetValidation.semanticReopen !== false || assetValidation.validationSetSha256 !== EXPECTED_A7_3_VALIDATION_SHA) fail("A7-3 validation hash mismatch");
if (assetValidation.awakeningMapSha256 !== EXPECTED_AWAKENING_MAP_SHA || assetValidation.summary?.totalAwakeningCount !== 257 || assetValidation.summary?.publicFileCount !== 257) fail("A7-3 awakening asset summary mismatch");

if (manifest.schemaId !== "hero-skill-icon-assets/v1" || manifest.status !== "FROZEN") fail("manifest contract mismatch");
if (manifest.awakeningAdmission?.status !== "FROZEN" || manifest.awakeningAdmission?.completion !== "COMPLETE" || manifest.awakeningAdmission?.semanticReopen !== false) fail("A7-2 admission contract mismatch");
if (manifest.awakeningAdmission?.lookupAuthority !== "exact sourcePath only" || manifest.awakeningAdmission?.awakeningMapSha256 !== EXPECTED_AWAKENING_MAP_SHA) fail("A7-2 exact lookup authority mismatch");
if (!Array.isArray(manifest.records) || manifest.records.length !== 13) fail("legacy manifest record count mismatch");
if (!Array.isArray(manifest.awakeningRecords) || manifest.awakeningRecords.length !== 256) fail("awakeningRecords count mismatch");

const admitted = [...manifest.records, ...manifest.awakeningRecords];
const bySourcePath = new Map(admitted.map((record) => [record.sourcePath, record]));
if (bySourcePath.size !== admitted.length || bySourcePath.size !== 269) fail(`combined exact lookup uniqueness mismatch ${bySourcePath.size}/${admitted.length}`);

const legacyLeonAwakening = manifest.records.filter((record) => record.role === "awakening");
if (legacyLeonAwakening.length !== 1) fail("legacy Leon awakening count mismatch");
const allAwakening = [...legacyLeonAwakening, ...manifest.awakeningRecords];
if (allAwakening.length !== 257) fail("total awakening lookup population mismatch");
for (const record of allAwakening) {
  const resolved = bySourcePath.get(record.sourcePath);
  if (!resolved || resolved.publicPath !== record.publicPath) fail(`awakening exact lookup mismatch ${record.sourcePath}`);
}
if (bySourcePath.has(UNKNOWN_SOURCE)) fail("unknown exact-path fixture unexpectedly admitted");

if (!resolverSource.includes("...manifest.records") || !resolverSource.includes("...manifest.awakeningRecords")) fail("resolver does not consume both manifest arrays");
if (!resolverSource.includes("admittedRecords.map((record) => [record.sourcePath, record])")) fail("resolver exact sourcePath map construction missing");
if (resolverSource.includes("heroId !== manifest.scope.heroId") || resolverSource.includes("_heroId !== manifest.scope.heroId")) fail("legacy Hero 6 gate still present");
if (!resolverSource.includes("export function getHeroSkillIconUrl(_heroId: number")) fail("resolver hero argument should be provenance-neutral");
if (!resolverSource.includes("const record = bySourcePath.get(sourcePath)")) fail("resolver exact lookup call missing");
if (!resolverSource.includes("if (!record) return null")) fail("unknown exact-path null contract missing");

console.log(JSON.stringify({
  checkpoint: "AWAKENING_ICON_A8_FRONTEND_INTEGRATION_PREFLIGHT",
  status: "PASS",
  completion: "COMPLETE",
  legacyManifestRecordCount: manifest.records.length,
  awakeningAdmissionRecordCount: manifest.awakeningRecords.length,
  totalAwakeningResolvableCount: allAwakening.length,
  combinedExactLookupCount: bySourcePath.size,
  heroScopeGatePresent: false,
  unknownExactPathAdmitted: false,
  awakeningMapSha256: EXPECTED_AWAKENING_MAP_SHA,
  assetValidationSetSha256: EXPECTED_A7_3_VALIDATION_SHA,
  semanticReopen: false,
}, null, 2));
