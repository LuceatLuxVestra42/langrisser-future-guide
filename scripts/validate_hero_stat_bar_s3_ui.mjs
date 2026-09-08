import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const component = read("src/components/hero-final-job-stats-section.tsx");
const server = read("src/lib/hero-final-job-extrema.server.ts");
const contract = JSON.parse(read("data/contracts/hero-stat-bar-presentation.v1.json"));
const artifact = JSON.parse(read("data/generated/hero-final-job-extrema.v1.json"));
const errors = [];

const stats = ["hp", "at", "magic", "df", "magicDf", "dex"];
const expectedDomains = {
  hp: [2332, 4803],
  at: [233, 636],
  magic: [198, 589],
  df: [174, 356],
  magicDf: [144, 377],
  dex: [71, 329],
};

if (contract?.status !== "FROZEN" || contract?.scale?.minimumFillPercent !== 25 || contract?.scale?.maximumFillPercent !== 100) {
  errors.push("S1 presentation scale contract drift");
}
if (!server.includes("scaleDomains") || !server.includes("source.extrema[stat].min.value") || !server.includes("source.extrema[stat].max.value")) {
  errors.push("S2 extrema supply is not present");
}
if (!component.includes('data-final-job-card="true"') || !component.includes('data-final-job-card-grid="true"')) {
  errors.push("S3 final-job card layout markers missing");
}
if (!component.includes('grid-cols-[2.75rem_minmax(0,1fr)_3.75rem]')) {
  errors.push("S3 stat row is not label + bar + right-side value");
}
if (!component.includes('data-stat-bar={key}') || !component.includes('style={{ width: `${barPercent}%` }}')) {
  errors.push("S3 horizontal stat bar is not rendered from barPercent");
}
if (!component.includes('data-stat-value={key}>{value}</span>')) {
  errors.push("S3 exact numeric value is not rendered to the right of the bar");
}
if (!component.includes('const MINIMUM_FILL_PERCENT = 25') || !component.includes('const MAXIMUM_FILL_PERCENT = 100')) {
  errors.push("S3 visual floor/ceiling drift");
}
if (!component.includes('const ratio = (value - domain.min) / (domain.max - domain.min)')) {
  errors.push("S3 does not use linear min/max normalization");
}
if (!component.includes('MINIMUM_FILL_PERCENT + ratio * (MAXIMUM_FILL_PERCENT - MINIMUM_FILL_PERCENT)')) {
  errors.push("S3 linear interpolation formula drift");
}
if (!component.includes('value < domain.min || value > domain.max')) {
  errors.push("S3 out-of-domain fail-closed guard missing");
}
if (!component.includes('row.variant === "SP"')) {
  errors.push("S3 temporary visible SP presentation missing");
}
if (component.includes("finalStats") || component.includes("rank === 4") || component.includes("normalBondedStats") || component.includes("spBondedStats")) {
  errors.push("S3 reopened semantic/stat calculation sources");
}

for (const stat of stats) {
  const range = artifact?.extrema?.[stat];
  const [expectedMin, expectedMax] = expectedDomains[stat];
  if (range?.min?.value !== expectedMin || range?.max?.value !== expectedMax) {
    errors.push(`B3 ${stat} domain drift`);
    continue;
  }
  const width = (value) => {
    const ratio = (value - expectedMin) / (expectedMax - expectedMin);
    return Math.min(100, Math.max(25, 25 + ratio * 75));
  };
  const midpoint = expectedMin + (expectedMax - expectedMin) / 2;
  if (width(expectedMin) !== 25) errors.push(`${stat} min fixture is not 25%`);
  if (width(expectedMax) !== 100) errors.push(`${stat} max fixture is not 100%`);
  if (Math.abs(width(midpoint) - 62.5) > 1e-9) errors.push(`${stat} midpoint fixture is not 62.5%`);
}

const result = {
  version: 1,
  stage: "hero-stat-bar-s3-ui-validator",
  status: errors.length ? "FAIL" : "PASS",
  predecessor: "hero-stat-bar-s2-extrema-supply",
  layout: "3-B final-job cards with six vertical stat rows",
  minimumFillPercent: 25,
  maximumFillPercent: 100,
  semanticRecomputation: false,
  frontendTierFiltering: false,
  spToggleImplemented: false,
  errors,
  hardErrorCount: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
