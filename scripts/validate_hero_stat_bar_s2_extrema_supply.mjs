import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const artifact = JSON.parse(read("data/generated/hero-final-job-extrema.v1.json"));
const s1 = JSON.parse(read("data/contracts/hero-stat-bar-presentation.v1.json"));
const server = read("src/lib/hero-final-job-extrema.server.ts");
const errors = [];

const expectedDomains = {
  hp: { min: 2332, max: 4803 },
  at: { min: 233, max: 636 },
  magic: { min: 198, max: 589 },
  df: { min: 174, max: 356 },
  magicDf: { min: 144, max: 377 },
  dex: { min: 71, max: 329 },
};

if (artifact?.stage !== "hero-b3-final-job-extrema-consumer" || artifact?.status !== "GENERATED") errors.push("B3 extrema artifact is not ready");
if (artifact?.eligibility?.requiredRank !== 4 || artifact?.eligibility?.topologyUsed !== false) errors.push("B3 Tier4 eligibility drift");
if (artifact?.summary?.candidateCount !== 533) errors.push("B3 candidate population drift");
if (s1?.stage !== "hero-stat-bar-s1-presentation-contract" || s1?.status !== "FROZEN") errors.push("S1 presentation contract is not frozen");
if (s1?.scale?.minimumFillPercent !== 25 || s1?.scale?.maximumFillPercent !== 100) errors.push("S1 visual scale drift");

for (const [stat, expected] of Object.entries(expectedDomains)) {
  const range = artifact?.extrema?.[stat];
  if (range?.min?.value !== expected.min || range?.max?.value !== expected.max) {
    errors.push(`${stat} B3 extrema fixture drift`);
  }
  if (!(Number.isFinite(range?.min?.value) && Number.isFinite(range?.max?.value) && range.max.value > range.min.value)) {
    errors.push(`${stat} B3 extrema domain invalid`);
  }
}

if (!server.includes("const scaleDomains = Object.fromEntries")) errors.push("S2 scaleDomains projection missing");
if (!server.includes("min: source.extrema[stat].min.value") || !server.includes("max: source.extrema[stat].max.value")) errors.push("S2 does not copy B3 extrema values directly");
if (!server.includes("scaleDomains,")) errors.push("S2 scaleDomains not returned to Hero detail presentation");
if (!server.includes("range.max.value <= range.min.value")) errors.push("S2 degenerate-domain fail-closed check missing");

const forbidden = ["Math.min(", "Math.max(", ".reduce(", "normalBondedStats", "spBondedStats", "childConnectionIds", "rank === 4"];
for (const token of forbidden) {
  if (server.includes(token)) errors.push(`S2 forbidden recomputation/source token: ${token}`);
}

const result = {
  version: 1,
  stage: "hero-stat-bar-s2-extrema-supply-validator",
  status: errors.length ? "FAIL" : "PASS",
  predecessor: "hero-stat-bar-s1-presentation-contract",
  source: "data/generated/hero-final-job-extrema.v1.json",
  target: "src/lib/hero-final-job-extrema.server.ts",
  expectedCandidateCount: 533,
  expectedDomains,
  semanticRecomputation: false,
  extremaRecomputation: false,
  frontendTierFiltering: false,
  errors,
  hardErrorCount: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
