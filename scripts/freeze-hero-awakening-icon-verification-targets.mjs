import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const outputPath = "data/generated/hero-awakening-icon-verification-targets.v1.json";
const predecessorCommit = "22f73cc0d25565d02b884312dd100f89cbe7e350";
const a5ValidatorPath = "scripts/validate-hero-awakening-icon-inventory-readonly.mjs";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
const fail = (message) => { throw new Error(message); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

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
    if (awakening.level2SkillId !== awakening.skill.skillId) {
      skillIdParityMismatchCount += 1;
      continue;
    }
    const sourcePath = awakening.skill.iconPath;
    if (typeof sourcePath !== "string" || sourcePath.length === 0) {
      iconPathMissingCount += 1;
      continue;
    }
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
if (referencesBySourcePath.size !== 257) fail(`unique awakening iconPath count mismatch ${referencesBySourcePath.size}/257`);

const inventory = [...referencesBySourcePath.entries()].map(([sourcePath, references]) => {
  const admitted = admittedBySourcePath.get(sourcePath) ?? null;
  const publicRepoPath = admitted?.publicPath ? path.join("public", admitted.publicPath.replace(/^\//, "")) : null;
  const publicExists = publicRepoPath ? fs.existsSync(path.join(repoRoot, publicRepoPath)) : false;
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
const targets = inventory
  .filter((row) => row.classification === "NEEDS_VERIFICATION")
  .map(({ sourcePath, heroReferenceCount, heroIds, skillIds }) => ({ sourcePath, heroReferenceCount, heroIds, skillIds }));

if (alreadyMaterialized.length !== 1) fail(`already materialized count mismatch ${alreadyMaterialized.length}/1`);
if (alreadyMaterialized[0]?.sourcePath !== "UI/Icon/Skill_ABS/Skill_Super4.png") fail("unexpected already-materialized awakening path");
if (manifestHitPublicMissing.length !== 0) fail(`manifest hit public missing count ${manifestHitPublicMissing.length}`);
if (targets.length !== 256) fail(`verification target count mismatch ${targets.length}/256`);
if (targets.some((row) => row.sourcePath === "UI/Icon/Skill_ABS/Skill_Super4.png")) fail("already-materialized Leon awakening leaked into target set");

const canonicalTargetsJson = JSON.stringify(targets);
const targetSetSha256 = sha256(canonicalTargetsJson);
const artifact = {
  version: 1,
  schemaId: "hero-awakening-icon-verification-targets/v1",
  status: "FROZEN",
  completion: "COMPLETE",
  semanticReopen: false,
  predecessor: {
    stage: "A5_AWAKENING_ICON_INVENTORY",
    commit: predecessorCommit,
    validator: a5ValidatorPath,
  },
  source: {
    heroDetailIndex: "data/generated/hero-detail.v1.json",
    manifest: "data/generated/hero-skill-icon-assets.v1.json",
    selectionRule: "exact A5 NEEDS_VERIFICATION classification only",
  },
  summary: {
    canonicalHeroCount: 267,
    definedAwakeningCount: 257,
    notDefinedAwakeningCount: 10,
    uniqueIconPathCount: 257,
    alreadyMaterializedUniqueCount: 1,
    manifestHitPublicMissingUniqueCount: 0,
    targetUniqueCount: 256,
  },
  targetSetSha256,
  targetSetHashContract: "sha256(UTF-8 JSON.stringify(targets))",
  targets,
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
const writeMode = process.argv.includes("--write");

if (writeMode) {
  fs.mkdirSync(path.dirname(path.join(repoRoot, outputPath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, outputPath), serialized, "utf8");
}

if (!fs.existsSync(path.join(repoRoot, outputPath))) fail(`frozen target artifact missing: ${outputPath}`);
const frozen = readJson(outputPath);
if (frozen.schemaId !== artifact.schemaId || frozen.status !== "FROZEN" || frozen.completion !== "COMPLETE") fail("frozen target artifact contract mismatch");
if (frozen.semanticReopen !== false) fail("semanticReopen must remain false");
if (frozen.predecessor?.commit !== predecessorCommit || frozen.predecessor?.validator !== a5ValidatorPath) fail("A5 predecessor mismatch");
if (frozen.targetSetSha256 !== targetSetSha256) fail(`targetSetSha256 mismatch ${frozen.targetSetSha256}/${targetSetSha256}`);
if (JSON.stringify(frozen.targets) !== canonicalTargetsJson) fail("frozen target records drifted from A5 classification");
if (frozen.summary?.targetUniqueCount !== 256) fail("frozen target count mismatch");

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "AWAKENING_ICON_A6_1_TARGET_SET_FREEZE",
  output: outputPath,
  targetUniqueCount: targets.length,
  targetSetSha256,
  semanticReopen: false,
}, null, 2));
