import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const contract = JSON.parse(read("data/contracts/hero-stat-bar-presentation.v1.json"));
const artifact = JSON.parse(read("data/generated/hero-final-job-extrema.v1.json"));
const component = read("src/components/hero-final-job-stats-section.tsx");
const errors = [];

if (contract?.status !== "FROZEN") errors.push("S1 presentation contract is not FROZEN");
if (contract?.variantPresentation?.spCurrentTemporaryPolicy !== "RELEASED SP final-job cards remain visibly rendered alongside Normal cards for this implementation so the bar presentation can be inspected before SP mode exists.") errors.push("Temporary SP visibility policy drift");
if (contract?.variantPresentation?.spToggleImplementationInScope !== false) errors.push("SP toggle unexpectedly entered current scope");
if (contract?.variantPresentation?.spSemanticReclassification !== false) errors.push("SP semantic reclassification unexpectedly enabled");

if (artifact?.stage !== "hero-b3-final-job-extrema-consumer" || artifact?.status !== "GENERATED") errors.push("B3 artifact is not ready");
if (artifact?.summary?.candidateCount !== 533) errors.push("B3 candidate count drift");
if (artifact?.summary?.spTier4CandidateCount !== 25) errors.push("Released SP Tier4 candidate count drift");

const leonRows = artifact.candidates.filter((row) => row.heroId === 6);
const leonNormal = leonRows.filter((row) => row.variant === "NORMAL");
const leonSp = leonRows.filter((row) => row.variant === "SP");
if (leonRows.length !== 3 || leonNormal.length !== 2 || leonSp.length !== 1) errors.push("Leon Normal/SP presentation fixture drift");

const expectedLeon = new Map([
  ["NORMAL:64:307", { hp: 3497, at: 599, magic: 224, df: 231, magicDf: 203, dex: 125 }],
  ["NORMAL:65:306", { hp: 3806, at: 569, magic: 224, df: 242, magicDf: 231, dex: 125 }],
  ["SP:66:377", { hp: 4041, at: 602, magic: 224, df: 260, magicDf: 231, dex: 125 }],
]);
for (const row of leonRows) {
  const key = `${row.variant}:${row.jobConnectionId}:${row.jobId}`;
  const expected = expectedLeon.get(key);
  if (!expected) {
    errors.push(`Unexpected Leon final-job row ${key}`);
    continue;
  }
  for (const stat of ["hp", "at", "magic", "df", "magicDf", "dex"]) {
    if (row.values?.[stat] !== expected[stat]) errors.push(`Leon ${key} ${stat} value drift`);
  }
}

if (!component.includes("{data.rows.map((row) => (")) errors.push("Component no longer renders the full presentation row set");
if (!component.includes('data-final-job-variant={row.variant}')) errors.push("Variant identity marker missing");
if (!component.includes('row.variant === "SP"')) errors.push("SP presentation badge path missing");
if (!component.includes(">SP</span>")) errors.push("SP badge text missing");
if (!component.includes("data-stat-bar-row={key}")) errors.push("Stat bar rows missing from final-job cards");
if (component.includes('data.rows.filter((row) => row.variant === "NORMAL")') || component.includes('data.rows.filter((row) => row.variant !== "SP")')) errors.push("SP rows are being filtered out");
if (component.includes("SP로 전환")) errors.push("SP toggle implementation entered S4 scope unexpectedly");

const result = {
  version: 1,
  stage: "hero-stat-bar-s4-sp-presentation-validator",
  status: errors.length ? "FAIL" : "PASS",
  temporarySpVisibility: "NORMAL_AND_RELEASED_SP_RENDERED_TOGETHER",
  futureSpToggleImplemented: false,
  semanticReclassification: false,
  b3CandidateCount: artifact?.summary?.candidateCount ?? null,
  b3SpCandidateCount: artifact?.summary?.spTier4CandidateCount ?? null,
  leonFixture: {
    totalRows: leonRows.length,
    normalRows: leonNormal.length,
    spRows: leonSp.length,
  },
  errors,
  hardErrorCount: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
