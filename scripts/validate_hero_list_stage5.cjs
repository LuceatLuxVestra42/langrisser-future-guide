const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "data/generated/hero-detail.v1.json");
const HERO_LIST = path.join(ROOT, "data/generated/hero-list-stage1.v1.json");
const SERVER = path.join(ROOT, "src/lib/hero-detail-stage5.server.ts");
const FUNCTIONS = path.join(ROOT, "src/lib/hero-list.functions.ts");
const ROUTE = path.join(ROOT, "src/routes/heroes_.$heroId.tsx");
const OUT = path.join(ROOT, "data/validation/hero-list-stage5.v1.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fail = (message) => { throw new Error(`[Hero Stage 5] ${message}`); };

const manifest = readJson(MANIFEST);
const heroList = readJson(HERO_LIST);
if (manifest?.status !== "PASS_WITH_REVIEW" || manifest?.completion !== "COMPLETE") fail("Stage 6 manifest is not consumer-ready.");
if (manifest?.storage?.mode !== "SHARDED_BY_HERO" || manifest?.storage?.recordCount !== 267) fail("Stage 6 must contain 267 Hero shards.");
if (manifest?.summary?.hardErrorCount !== 0 || manifest?.summary?.siteUsableCount !== 267) fail("Stage 6 integrity summary is invalid.");
if (heroList?.freezeState !== "HERO_LIST_STAGE1_FROZEN" || heroList?.records?.length !== 267) fail("Frozen Hero list population is invalid.");

const listIds = new Set(heroList.records.map((hero) => hero.heroId));
const manifestIds = Object.keys(manifest.storage.byHeroId).map(Number);
if (manifestIds.length !== 267 || new Set(manifestIds).size !== 267) fail("Stage 6 Hero IDs are not unique 267 records.");

let parsedShardCount = 0;
let structuralFailureCount = 0;
let reviewCodeCount = 0;
let jobBranchCount = 0;
let jobConnectionCount = 0;
let capstoneCount = 0;
let verifiedCapstoneStatCount = 0;
let soldierEdgeCount = 0;
let releasedSpHeroCount = 0;
let releasedExclusiveEquipmentHeroCount = 0;
let releasedCentralDisciplineHeroCount = 0;
let bondHeroCount = 0;
let bondRowCount = 0;
let skinCount = 0;
const missing = [];
const mismatches = [];

for (const heroId of manifestIds) {
  if (!listIds.has(heroId)) mismatches.push(`Hero ${heroId}: missing frozen list record`);
  const meta = manifest.storage.byHeroId[String(heroId)];
  const absolute = typeof meta?.path === "string" ? path.join(ROOT, meta.path) : null;
  if (!absolute || !fs.existsSync(absolute)) { missing.push(heroId); continue; }

  const shard = readJson(absolute);
  parsedShardCount += 1;
  if (shard.heroId !== heroId) mismatches.push(`Hero ${heroId}: shard identity ${shard.heroId}`);
  if (!shard.identity || !shard.normal?.jobTree || !shard.soldiers || !shard.validation) mismatches.push(`Hero ${heroId}: required Stage 6 block missing`);
  if (shard.validation?.structuralStatus !== "PASS" || shard.validation?.siteUsable !== true) structuralFailureCount += 1;
  reviewCodeCount += Array.isArray(shard.validation?.reviewCodes) ? shard.validation.reviewCodes.length : 0;

  const branches = Array.isArray(shard.normal?.jobTree?.branches) ? shard.normal.jobTree.branches : [];
  const connections = Array.isArray(shard.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
  const byConnectionId = new Map(connections.map((row) => [Number(row.jobConnectionId), row]));
  jobBranchCount += branches.length;
  jobConnectionCount += connections.length;
  if (branches.length === 0 || connections.length === 0) mismatches.push(`Hero ${heroId}: empty job tree`);

  for (const branch of branches) {
    if (!Array.isArray(branch) || branch.length === 0) { mismatches.push(`Hero ${heroId}: empty job branch`); continue; }
    const capstone = byConnectionId.get(Number(branch.at(-1)));
    if (!capstone) { mismatches.push(`Hero ${heroId}: branch capstone unresolved`); continue; }
    capstoneCount += 1;
    if (capstone.finalDisplayStats?.status === "VERIFIED" && capstone.finalDisplayStats?.values) verifiedCapstoneStatCount += 1;
  }

  const soldiers = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];
  if (new Set(soldiers).size !== soldiers.length) mismatches.push(`Hero ${heroId}: duplicate Soldier IDs`);
  soldierEdgeCount += soldiers.length;

  const bonds = Array.isArray(shard.bonds) ? shard.bonds : [];
  bondRowCount += bonds.length;
  if (bonds.length) bondHeroCount += 1;
  skinCount += Array.isArray(shard.presentation?.skins) ? shard.presentation.skins.length : 0;
  if (shard.sp?.status === "RELEASED") releasedSpHeroCount += 1;
  if (shard.exclusiveEquipment?.status === "RELEASED") releasedExclusiveEquipmentHeroCount += 1;
  if (shard.centralDiscipline?.status === "RELEASED") releasedCentralDisciplineHeroCount += 1;
}

if (missing.length) fail(`Missing Stage 6 shards: ${missing.slice(0, 10).join(", ")}`);
if (mismatches.length) fail(`Stage 6 parity mismatch: ${mismatches.slice(0, 10).join(" | ")}`);
if (parsedShardCount !== 267) fail(`Expected 267 parsed shards, got ${parsedShardCount}.`);
if (structuralFailureCount !== 0) fail(`Expected zero structurally unusable shards, got ${structuralFailureCount}.`);
if (soldierEdgeCount !== 5977 || Number(manifest?.summary?.heroSoldierRelationCount) !== 5977) fail(`Hero-Soldier relation mismatch: ${soldierEdgeCount}.`);
if (releasedSpHeroCount !== Number(manifest?.summary?.releasedSpCount) || releasedSpHeroCount !== 25) fail(`SP release population mismatch: ${releasedSpHeroCount}.`);
if (releasedExclusiveEquipmentHeroCount !== Number(manifest?.summary?.exclusiveEquipmentRelationCount) || releasedExclusiveEquipmentHeroCount !== 167) fail(`Exclusive equipment population mismatch: ${releasedExclusiveEquipmentHeroCount}.`);
if (capstoneCount !== jobBranchCount || verifiedCapstoneStatCount !== capstoneCount) fail(`Capstone/stat parity mismatch branches=${jobBranchCount} capstones=${capstoneCount} verified=${verifiedCapstoneStatCount}.`);

const serverSource = fs.readFileSync(SERVER, "utf8");
const functionsSource = fs.readFileSync(FUNCTIONS, "utf8");
const routeSource = fs.readFileSync(ROUTE, "utf8");
if (!serverSource.includes("import.meta.glob<Stage6HeroShard>")) fail("Stage 5 server must use lazy shard modules.");
if (!serverSource.includes("eager: false")) fail("Stage 5 shard glob must remain lazy.");
if (serverSource.includes("ConfigData")) fail("Stage 5 server must not read raw ConfigData.");
if (!serverSource.includes("fullDatasetRuntimeRead: false")) fail("Stage 5 must declare no full Stage 6 dataset runtime read.");
if (!functionsSource.includes("getHeroDetailRouteStage5Data")) fail("Stage 5 server function is not exposed.");
if (!routeSource.includes("getHeroDetailRouteStage5Data")) fail("Hero detail route is not consuming Stage 5.");
if (!routeSource.includes("직업 트리 · 최종 스탯") || !routeSource.includes("사용 가능 병종")) fail("Stage 5 required detail blocks are missing.");

for (const witness of [1, 6]) {
  const meta = manifest.storage.byHeroId[String(witness)];
  if (!meta || !fs.existsSync(path.join(ROOT, meta.path))) fail(`Witness Hero ${witness} missing.`);
}

const report = {
  version: 2,
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
    parsedShardCount,
    structuralFailureCount,
    reviewCodeCount,
    jobBranchCount,
    jobConnectionCount,
    capstoneCount,
    verifiedCapstoneStatCount,
    soldierEdgeCount,
    releasedSpHeroCount,
    releasedExclusiveEquipmentHeroCount,
    releasedCentralDisciplineHeroCount,
    bondHeroCount,
    bondRowCount,
    skinCount,
    missingShardCount: missing.length,
    parityMismatchCount: mismatches.length,
  },
  witnesses: [1, 6],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
