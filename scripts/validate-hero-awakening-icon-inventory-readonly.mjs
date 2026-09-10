import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
const fail = (message) => { throw new Error(message); };

const detailIndex = readJson("data/generated/hero-detail.v1.json");
const manifest = readJson("data/generated/hero-skill-icon-assets.v1.json");

if (detailIndex.status !== "PASS_WITH_REVIEW" || detailIndex.completion !== "COMPLETE") fail("Hero detail frozen consumer is not complete");
if (detailIndex.summary?.canonicalHeroCount !== 267 || detailIndex.storage?.recordCount !== 267) fail("Hero detail canonical population mismatch");
if (manifest.schemaId !== "hero-skill-icon-assets/v1" || manifest.status !== "FROZEN") fail("Hero skill icon manifest contract mismatch");

const storageByHeroId = detailIndex.storage?.byHeroId;
if (!storageByHeroId || typeof storageByHeroId !== "object") fail("Hero detail shard index is missing");
const admittedBySourcePath = new Map(manifest.records.map((record) => [record.sourcePath, record]));
const referencesBySourcePath = new Map();
let definedCount = 0;
let notDefinedCount = 0;
let falseNoneCount = 0;
let skillIdParityMismatchCount = 0;
let iconPathMissingCount = 0;

for (const [heroIdText, locator] of Object.entries(storageByHeroId)) {
  const heroId = Number(heroIdText);
  const shard = readJson(locator.path);
  if (shard.heroId !== heroId) fail(`Hero shard identity mismatch ${heroId}`);
  const awakening = shard.normal?.awakening;
  if (!awakening) fail(`Hero ${heroId} awakening block missing`);

  if (awakening.level2Status === "DEFINED") {
    definedCount += 1;
    if (awakening.status !== "VERIFIED" || !awakening.skill) fail(`Hero ${heroId} DEFINED awakening is not VERIFIED with a skill payload`);
    if (awakening.level2SkillId !== awakening.skill.skillId) { skillIdParityMismatchCount += 1; continue; }
    const sourcePath = awakening.skill.iconPath;
    if (typeof sourcePath !== "string" || sourcePath.length === 0) { iconPathMissingCount += 1; continue; }
    if (!referencesBySourcePath.has(sourcePath)) referencesBySourcePath.set(sourcePath, { heroIds: [], skillIds: [] });
    const group = referencesBySourcePath.get(sourcePath);
    group.heroIds.push(heroId);
    group.skillIds.push(awakening.skill.skillId);
  } else if (awakening.level2Status === "LEVEL2_SKILL_NOT_DEFINED") {
    notDefinedCount += 1;
    if (awakening.status === "NONE") falseNoneCount += 1;
  } else {
    fail(`Hero ${heroId} has unexpected awakening level2Status ${awakening.level2Status}`);
  }
}

if (definedCount !== 257) fail(`DEFINED awakening count mismatch ${definedCount}/257`);
if (notDefinedCount !== 10) fail(`NOT_DEFINED awakening count mismatch ${notDefinedCount}/10`);
if (falseNoneCount !== 0) fail(`false NONE awakening count ${falseNoneCount}`);
if (skillIdParityMismatchCount !== 0) fail(`awakening Skill-ID parity mismatches ${skillIdParityMismatchCount}`);
if (iconPathMissingCount !== 0) fail(`awakening iconPath missing count ${iconPathMissingCount}`);

const inventory = [...referencesBySourcePath.entries()].map(([sourcePath, references]) => {
  const admitted = admittedBySourcePath.get(sourcePath) ?? null;
  const publicExists = admitted ? fs.existsSync(path.join(repoRoot, admitted.publicPath.replace(/^\//, ""))) : false;
  return {
    sourcePath,
    heroReferenceCount: references.heroIds.length,
    heroIds: references.heroIds.sort((a, b) => a - b),
    skillIds: [...new Set(references.skillIds)].sort((a, b) => a - b),
    classification: admitted && publicExists ? "ALREADY_MATERIALIZED" : admitted ? "MANIFEST_HIT_PUBLIC_MISSING" : "NEEDS_VERIFICATION",
    publicPath: admitted?.publicPath ?? null,
  };
}).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

const alreadyMaterialized = inventory.filter((row) => row.classification === "ALREADY_MATERIALIZED");
const manifestHitPublicMissing = inventory.filter((row) => row.classification === "MANIFEST_HIT_PUBLIC_MISSING");
const needsVerification = inventory.filter((row) => row.classification === "NEEDS_VERIFICATION");
const coveredHeroReferences = alreadyMaterialized.reduce((sum, row) => sum + row.heroReferenceCount, 0);

const result = {
  status: manifestHitPublicMissing.length === 0 ? "PASS" : "BLOCKER",
  semanticReopen: false,
  source: {
    heroDetailIndex: "data/generated/hero-detail.v1.json",
    manifest: "data/generated/hero-skill-icon-assets.v1.json",
  },
  summary: {
    canonicalHeroCount: 267,
    definedAwakeningCount: definedCount,
    notDefinedAwakeningCount: notDefinedCount,
    falseNoneCount,
    skillIdParityMismatchCount,
    iconPathMissingCount,
    uniqueIconPathCount: inventory.length,
    alreadyMaterializedUniqueCount: alreadyMaterialized.length,
    manifestHitPublicMissingUniqueCount: manifestHitPublicMissing.length,
    needsVerificationUniqueCount: needsVerification.length,
    alreadyMaterializedHeroReferenceCount: coveredHeroReferences,
    needsVerificationHeroReferenceCount: definedCount - coveredHeroReferences,
  },
  inventory,
};

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
