import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const readText = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const writeJson = (rel, value) => {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const stage54Path = "data/generated/hero-page-stage5-4-sp.v1.json";
const stage63Path = "data/validation/hero-stage6-3-final.v1.json";
const contractPath = "data/contracts/hero-stage6-4-site-consumer.v1.json";
const libPath = "src/lib/hero-detail-stage5.server.ts";
const routePath = "src/routes/heroes_.$heroId.tsx";
const validationPath = "data/validation/hero-sp-detail-presentation.v1.json";
const checkpointPath = "data/checkpoints/hero-sp-detail-presentation.v1.json";

const stage54 = readJson(stage54Path);
const stage63 = readJson(stage63Path);
const contract = readJson(contractPath);
const lib = readText(libPath);
const route = readText(routePath);

const records = Array.isArray(stage54.records) ? stage54.records : [];
const released = records.filter((row) => row?.sp?.status === "RELEASED");
const notReleased = records.filter((row) => row?.sp?.status === "NOT_RELEASED");
const missionCount = released.reduce((sum, row) => {
  const first = Array.isArray(row?.sp?.missions?.firstStage) ? row.sp.missions.firstStage.length : 0;
  const second = Array.isArray(row?.sp?.missions?.secondStage) ? row.sp.missions.secondStage.length : 0;
  return sum + first + second;
}, 0);

const malformedReleased = released.flatMap((row) => {
  const errors = [];
  const first = Array.isArray(row?.sp?.missions?.firstStage) ? row.sp.missions.firstStage : [];
  const second = Array.isArray(row?.sp?.missions?.secondStage) ? row.sp.missions.secondStage : [];
  const skills = Array.isArray(row?.sp?.secondStageRewards?.skills) ? row.sp.secondStageRewards.skills : [];
  const soldiers = Array.isArray(row?.sp?.secondStageRewards?.soldiers) ? row.sp.secondStageRewards.soldiers : [];
  if (!row?.sp?.job || !Number.isInteger(Number(row.sp.job.jobId))) errors.push("job");
  if (first.length !== 7) errors.push(`firstStage=${first.length}`);
  if (second.length !== 7) errors.push(`secondStage=${second.length}`);
  if (skills.length !== 2) errors.push(`rewardSkills=${skills.length}`);
  if (soldiers.length !== 1) errors.push(`rewardSoldiers=${soldiers.length}`);
  return errors.length ? [{ heroId: row.heroId, errors }] : [];
});

const checks = [
  ["stage5-4-complete", stage54?.status === "COMPLETE"],
  ["stage5-4-hard-errors-zero", Number(stage54?.summary?.hardErrorCount) === 0],
  ["canonical-hero-count-267", records.length === 267 && Number(stage54?.summary?.canonicalHeroCount) === 267],
  ["released-sp-count-25", released.length === 25 && Number(stage54?.summary?.spReleasedCount) === 25],
  ["not-released-sp-count-242", notReleased.length === 242 && Number(stage54?.summary?.spNotReleasedCount) === 242],
  ["sp-mission-count-350", missionCount === 350 && Number(stage54?.summary?.totalMissionCount) === 350],
  ["released-sp-shape", malformedReleased.length === 0],
  ["stage6-3-sp-parity", Number(stage63?.summary?.releasedSpCount) === 25 && Number(stage63?.summary?.notReleasedSpCount) === 242 && Number(stage63?.summary?.spRelationMismatchCount) === 0],
  ["stage6-4-contract-frozen", contract?.status === "FROZEN" && contract?.stage === "hero-page-6-4"],
  ["stage6-sp-projection-present", lib.includes("type Stage6Sp =") && lib.includes("function projectSp(") && lib.includes("sp: projectSp(shard.sp)" )],
  ["hero-sp-section-present", route.includes('data-hero-sp-detail="true"') && route.includes("function HeroSpSection(" )],
  ["no-raw-configdata-runtime", !lib.includes("data/configdata/") && !route.includes("data/configdata/" )],
];

const failedChecks = checks.filter(([, pass]) => !pass).map(([name]) => name);
const status = failedChecks.length === 0 ? "PASS" : "FAIL";

const validation = {
  version: 1,
  stage: "hero-sp-detail-presentation",
  status,
  completion: status === "PASS" ? "COMPLETE" : "INCOMPLETE",
  authoritativeSources: [stage54Path, stage63Path, contractPath],
  summary: {
    canonicalHeroCount: records.length,
    releasedSpHeroCount: released.length,
    notReleasedSpHeroCount: notReleased.length,
    missionCount,
    malformedReleasedCount: malformedReleased.length,
    failedCheckCount: failedChecks.length,
  },
  checks: checks.map(([name, pass]) => ({ name, pass })),
  malformedReleased,
  failedChecks,
  boundary: {
    presentationOnly: true,
    semanticStageReopened: false,
    rawConfigDataRuntimeRead: false,
    relationRederivation: false,
    classFusionMarkScope: "OUT_OF_SCOPE_UNTOUCHED",
  },
};

writeJson(validationPath, validation);
writeJson(checkpointPath, {
  version: 1,
  stage: "hero-sp-detail-presentation",
  status,
  completion: validation.completion,
  freezeState: status === "PASS" ? "HERO_SP_DETAIL_PRESENTATION_V1_COMPLETE" : "HERO_SP_DETAIL_PRESENTATION_V1_INCOMPLETE",
  authoritativeSources: validation.authoritativeSources,
  confirmed: validation.summary,
  completedScope: [
    "Stage 6 frozen SP job presentation",
    "Stage 6 frozen first/second SP mission presentation",
    "Stage 6 frozen second-stage reward presentation",
  ],
  excludedScope: [
    "SP semantic recomputation",
    "MissionType reinterpretation",
    "Goods ID semantic inference",
    "class fusion-power mark changes",
  ],
  nextStartPoint: "Continue Hero presentation work from the next incomplete UI unit; do not reopen Hero Stage 4/5/6 semantics.",
  reopenConditions: [
    "Hero Stage 6 SP contract change",
    "canonical SP population change",
    "authoritative SP relation contradiction",
  ],
});

console.log(JSON.stringify({ status, summary: validation.summary, failedChecks }, null, 2));
if (status !== "PASS") process.exit(1);
