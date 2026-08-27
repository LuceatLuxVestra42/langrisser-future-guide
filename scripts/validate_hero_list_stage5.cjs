const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "data/generated/hero-detail.v1.json");
const HERO_LIST = path.join(ROOT, "data/generated/hero-list-stage1.v1.json");
const SERVER = path.join(ROOT, "src/lib/hero-detail-stage5.server.ts");
const FUNCTIONS = path.join(ROOT, "src/lib/hero-list.functions.ts");
const ROUTE = path.join(ROOT, "src/routes/heroes_.$heroId.tsx");
const OUT = path.join(ROOT, "data/validation/hero-list-stage5.v1.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fail(message) {
  throw new Error(`[Hero Stage 5] ${message}`);
}

const manifest = readJson(MANIFEST);
const heroList = readJson(HERO_LIST);

if (manifest?.status !== "PASS_WITH_REVIEW" || manifest?.completion !== "COMPLETE") {
  fail("Stage 6 manifest is not FINAL consumer-ready.");
}
if (manifest?.storage?.mode !== "SHARDED_BY_HERO" || manifest?.storage?.recordCount !== 267) {
  fail("Stage 6 manifest must contain 267 sharded Hero records.");
}
if (manifest?.summary?.hardErrorCount !== 0 || manifest?.summary?.siteUsableCount !== 267) {
  fail("Stage 6 manifest integrity summary is invalid.");
}
if (heroList?.freezeState !== "HERO_LIST_STAGE1_FROZEN" || heroList?.records?.length !== 267) {
  fail("Frozen Hero list population is invalid.");
}

const listIds = new Set(heroList.records.map((hero) => hero.heroId));
const manifestIds = Object.keys(manifest.storage.byHeroId).map(Number);
if (manifestIds.length !== 267 || new Set(manifestIds).size !== 267) {
  fail("Stage 6 manifest Hero IDs are not unique 267 records.");
}

let shardCount = 0;
let hardErrorCount = 0;
let warningCount = 0;
let branchCount = 0;
let capstoneCount = 0;
let soldierEdgeCount = 0;
let spHeroCount = 0;
let exclusiveEquipmentHeroCount = 0;
let centralDisciplineHeroCount = 0;
let bondHeroCount = 0;
let skinCount = 0;
const missing = [];
const mismatches = [];

function meaningful(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

for (const heroId of manifestIds) {
  if (!listIds.has(heroId)) mismatches.push(`Hero ${heroId}: missing frozen list record`);

  const meta = manifest.storage.byHeroId[String(heroId)];
  const rel = meta?.path;
  const absolute = typeof rel === "string" ? path.join(ROOT, rel) : null;
  if (!absolute || !fs.existsSync(absolute)) {
    missing.push(heroId);
    continue;
  }

  const shard = readJson(absolute);
  shardCount += 1;
  if (shard.heroId !== heroId) mismatches.push(`Hero ${heroId}: shard identity ${shard.heroId}`);
  if (!shard.identity || !shard.normal || !shard.soldiers || !shard.validation) {
    mismatches.push(`Hero ${heroId}: required Stage 6 block missing`);
  }

  const errors = Array.isArray(shard.validation?.hardErrors) ? shard.validation.hardErrors : [];
  const warnings = Array.isArray(shard.validation?.warnings) ? shard.validation.warnings : [];
  hardErrorCount += errors.length;
  warningCount += warnings.length;

  const branches = Array.isArray(shard.normal?.jobTree?.branch) ? shard.normal.jobTree.branch : [];
  branchCount += branches.length;
  for (const branch of branches) {
    const connections = Array.isArray(branch?.connections) ? branch.connections : [];
    const capstone = connections.find((job) => job?.isCapstone === true) ||
      connections.find((job) => job?.jobId === branch?.capstoneJobId) ||
      connections.at(-1);
    if (capstone) capstoneCount += 1;
  }

  const soldiers = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];
  if (new Set(soldiers).size !== soldiers.length) mismatches.push(`Hero ${heroId}: duplicate Soldier IDs`);
  soldierEdgeCount += soldiers.length;

  const skins = Array.isArray(shard.presentation?.skins) ? shard.presentation.skins : [];
  skinCount += skins.length;
  if (meaningful(shard.sp)) spHeroCount += 1;
  if (meaningful(shard.exclusiveEquipment)) exclusiveEquipmentHeroCount += 1;
  if (meaningful(shard.centralDiscipline)) centralDisciplineHeroCount += 1;
  if (meaningful(shard.bonds)) bondHeroCount += 1;
}

if (missing.length) fail(`Missing Stage 6 shards: ${missing.slice(0, 10).join(", ")}`);
if (mismatches.length) fail(`Stage 6 parity mismatch: ${mismatches.slice(0, 10).join(" | ")}`);
if (shardCount !== 267) fail(`Expected 267 parsed shards, got ${shardCount}.`);
if (hardErrorCount !== 0) fail(`Expected zero shard hard errors, got ${hardErrorCount}.`);

const serverSource = fs.readFileSync(SERVER, "utf8");
const functionsSource = fs.readFileSync(FUNCTIONS, "utf8");
const routeSource = fs.readFileSync(ROUTE, "utf8");

if (!serverSource.includes("import.meta.glob<Stage6HeroShard>")) fail("Stage 5 server must use lazy shard modules.");
if (!serverSource.includes('eager: false')) fail("Stage 5 shard glob must remain lazy.");
if (serverSource.includes("ConfigData")) fail("Stage 5 server must not read raw ConfigData.");
if (!serverSource.includes("fullDatasetRuntimeRead: false")) fail("Stage 5 must declare no full Stage 6 dataset runtime read.");
if (!functionsSource.includes("getHeroDetailRouteStage5Data")) fail("Stage 5 server function is not exposed.");
if (!routeSource.includes("getHeroDetailRouteStage5Data")) fail("Hero detail route is not consuming Stage 5.");
if (!routeSource.includes("직업 트리 · 최종 스탯")) fail("Stage 5 job detail block is missing.");
if (!routeSource.includes("사용 가능 병종")) fail("Stage 5 Soldier detail block is missing.");

for (const witness of [1, 6]) {
  const meta = manifest.storage.byHeroId[String(witness)];
  if (!meta || !fs.existsSync(path.join(ROOT, meta.path))) fail(`Witness Hero ${witness} missing.`);
}

const report = {
  version: 1,
  stage: "hero-list-stage5",
  status: "PASS",
  completion: "VALIDATED",
  sourcePolicy: {
    heroStage6FinalFrozenOnly: true,
    singleHeroShardRuntimeRead: true,
    fullStage6DatasetRuntimeRead: false,
    rawConfigDataRead: false,
    relationshipRederivation: false,
    nameOrIdHeuristics: false,
  },
  summary: {
    heroCount: 267,
    parsedShardCount: shardCount,
    hardErrorCount,
    warningCount,
    jobBranchCount: branchCount,
    capstoneCount,
    soldierEdgeCount,
    spHeroCount,
    exclusiveEquipmentHeroCount,
    centralDisciplineHeroCount,
    bondHeroCount,
    skinCount,
    missingShardCount: missing.length,
    parityMismatchCount: mismatches.length,
  },
  witnesses: [1, 6],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
