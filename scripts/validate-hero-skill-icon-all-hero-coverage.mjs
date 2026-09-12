import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const shardDir = path.join(repoRoot, "data/generated/hero-detail/by-id");
const manifestPath = path.join(repoRoot, "data/generated/hero-skill-icon-assets.v1.json");

const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputPath = outputArg ? path.resolve(repoRoot, outputArg.slice("--output=".length)) : null;

const expectedUsage = Object.freeze({
  jobLevel: 1911,
  direct: 304,
  talent: 1602,
  total: 3817,
});

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numericShardNames() {
  return fs.readdirSync(shardDir)
    .filter((name) => /^\d+\.json$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

const usageCounts = { jobLevel: 0, direct: 0, talent: 0, total: 0 };
let nullIconPathCount = 0;
let emptyIconPathCount = 0;
const usageByPath = new Map();

function addUsage(group, heroId, skillId, iconPath) {
  usageCounts[group] += 1;
  usageCounts.total += 1;

  if (iconPath === null || iconPath === undefined) {
    nullIconPathCount += 1;
    return;
  }
  if (typeof iconPath !== "string") fail(`non-string iconPath hero=${heroId} group=${group} skill=${String(skillId)}`);
  if (iconPath.length === 0) {
    emptyIconPathCount += 1;
    return;
  }

  let entry = usageByPath.get(iconPath);
  if (!entry) {
    entry = {
      sourcePath: iconPath,
      usageCount: 0,
      groups: new Set(),
      heroIds: new Set(),
      skillIds: new Set(),
    };
    usageByPath.set(iconPath, entry);
  }
  entry.usageCount += 1;
  entry.groups.add(group);
  entry.heroIds.add(heroId);
  if (Number.isInteger(skillId)) entry.skillIds.add(skillId);
}

const shardNames = numericShardNames();
if (shardNames.length !== 267) fail(`hero shard count mismatch ${shardNames.length}/267`);

for (const shardName of shardNames) {
  const hero = readJson(path.join(shardDir, shardName));
  const heroId = Number.parseInt(shardName, 10);

  for (const row of hero.normal?.skills?.jobLevelAcquisitions ?? []) {
    addUsage("jobLevel", heroId, row.skillId, row.skill?.iconPath);
  }
  for (const row of hero.normal?.skills?.heroDirectSkills ?? []) {
    addUsage("direct", heroId, row.skillId, row.iconPath);
  }
  for (const row of hero.normal?.talent?.starProgression ?? []) {
    addUsage("talent", heroId, row.skillId, row.skill?.iconPath);
  }
}

for (const key of ["jobLevel", "direct", "talent", "total"]) {
  if (usageCounts[key] !== expectedUsage[key]) {
    fail(`usage count mismatch ${key}=${usageCounts[key]} expected=${expectedUsage[key]}`);
  }
}
if (nullIconPathCount !== 0) fail(`null iconPath count=${nullIconPathCount}`);
if (emptyIconPathCount !== 0) fail(`empty iconPath count=${emptyIconPathCount}`);

const manifest = readJson(manifestPath);
const manifestRows = [
  ...(Array.isArray(manifest.records) ? manifest.records : []),
  ...(Array.isArray(manifest.awakeningRecords) ? manifest.awakeningRecords : []),
];
const manifestSourcePaths = manifestRows
  .map((row) => row?.sourcePath)
  .filter((value) => typeof value === "string" && value.length > 0);
const manifestSet = new Set(manifestSourcePaths);
const usageSet = new Set(usageByPath.keys());

const serializeUsage = (sourcePath) => {
  const entry = usageByPath.get(sourcePath);
  return {
    sourcePath,
    usageCount: entry.usageCount,
    groups: [...entry.groups].sort(),
    heroIds: [...entry.heroIds].sort((a, b) => a - b),
    skillIds: [...entry.skillIds].sort((a, b) => a - b),
  };
};

const matched = [...usageSet].filter((sourcePath) => manifestSet.has(sourcePath)).sort();
const unmatched = [...usageSet].filter((sourcePath) => !manifestSet.has(sourcePath)).sort();
const orphan = [...manifestSet].filter((sourcePath) => !usageSet.has(sourcePath)).sort();

const report = {
  version: 1,
  schemaId: "hero-skill-icon-all-hero-coverage/v1",
  status: unmatched.length === 0 ? "PASS" : "INCOMPLETE_COVERAGE",
  input: {
    heroShardDirectory: "data/generated/hero-detail/by-id",
    heroShardCount: shardNames.length,
    manifestPath: "data/generated/hero-skill-icon-assets.v1.json",
    canonicalIconPaths: [
      "normal.skills.jobLevelAcquisitions[].skill.iconPath",
      "normal.skills.heroDirectSkills[].iconPath",
      "normal.talent.starProgression[].skill.iconPath",
    ],
  },
  usage: {
    ...usageCounts,
    nullIconPathCount,
    emptyIconPathCount,
    uniqueStage6IconPathCount: usageSet.size,
  },
  manifest: {
    sourcePathRecordCount: manifestSourcePaths.length,
    uniqueSourcePathCount: manifestSet.size,
    duplicateSourcePathCount: manifestSourcePaths.length - manifestSet.size,
  },
  coverage: {
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    orphanCount: orphan.length,
  },
  matched,
  unmatched: unmatched.map(serializeUsage),
  orphan,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
}
process.stdout.write(json);
