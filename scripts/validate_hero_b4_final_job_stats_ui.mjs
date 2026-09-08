import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const artifact = JSON.parse(read("data/generated/hero-final-job-extrema.v1.json"));
const validation = JSON.parse(read("data/validation/hero-b3-final-job-extrema-summary.v1.json"));
const route = read("src/routes/heroes_.$heroId.tsx");
const server = read("src/lib/hero-final-job-extrema.server.ts");
const component = read("src/components/hero-final-job-stats-section.tsx");
const errors = [];

if (artifact?.stage !== "hero-b3-final-job-extrema-consumer" || artifact?.status !== "GENERATED") errors.push("B3 generated consumer is not ready");
if (artifact?.summary?.candidateCount !== 533 || artifact?.summary?.normalTier4CandidateCount !== 508 || artifact?.summary?.spTier4CandidateCount !== 25) errors.push("B3 candidate population drift");
if (validation?.status !== "PASS" || validation?.results?.hardErrorCount !== 0 || validation?.results?.tieSetMismatchCount !== 0) errors.push("B3 validation is not PASS");
if (!route.includes('getHeroFinalJobStatsPresentation({ data: { heroId } })')) errors.push("Hero route does not load B3 presentation data");
if (!route.includes("<HeroFinalJobStatsSection data={finalJobStats} />")) errors.push("Hero route does not render B4 final-job section");
if (route.includes("finalJobBranches") || route.includes("capstone.finalStats.HP") || route.includes("branch.capstone?.rank === 4")) errors.push("Legacy frontend final-job eligibility/stat path remains");
if (!server.includes('data/generated/hero-final-job-extrema.v1.json')) errors.push("B4 server reader does not consume B3 generated artifact");
if (server.includes("normalBondedStats") || server.includes("spBondedStats") || server.includes("childConnectionIds")) errors.push("B4 server reader reopens lower semantic sources");
if (!server.includes('parsed.eligibility?.requiredRank !== 4') || !server.includes('parsed.eligibility?.topologyUsed !== false')) errors.push("B4 server reader does not fail closed on B3 eligibility contract");
if (!component.includes("row.values[key]") || component.includes("finalStats") || component.includes("rank === 4")) errors.push("B4 component is not a pure B3 value presentation");
if (!component.includes('row.variant === "SP"')) errors.push("B4 component does not expose SP variant");

const result = {
  version: 1,
  stage: "hero-b4-final-job-stats-ui-validator",
  status: errors.length ? "FAIL" : "PASS",
  source: "data/generated/hero-final-job-extrema.v1.json",
  semanticRecomputation: false,
  frontendTierFiltering: false,
  expectedCandidateCount: 533,
  errors,
  hardErrorCount: errors.length,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
