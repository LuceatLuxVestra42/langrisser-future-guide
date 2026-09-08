import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const artifact = JSON.parse(read("data/generated/hero-final-job-extrema.v1.json"));
const contract = JSON.parse(read("data/contracts/hero-stat-bar-presentation.v1.json"));
const server = read("src/lib/hero-final-job-extrema.server.ts");
const component = read("src/components/hero-final-job-stats-section.tsx");
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

function candidateKey(row) {
  return `${row.heroId}|${row.variant}|${row.jobConnectionId}|${row.jobId}`;
}

function width(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new Error("invalid width fixture input");
  }
  if (value < min || value > max) {
    throw new Error(`value ${value} outside ${min}-${max}`);
  }
  const ratio = (value - min) / (max - min);
  return Math.min(100, Math.max(25, 25 + ratio * 75));
}

if (contract?.status !== "FROZEN" || contract?.scale?.minimumFillPercent !== 25 || contract?.scale?.maximumFillPercent !== 100) {
  errors.push("S1 presentation contract drift");
}
if (artifact?.stage !== "hero-b3-final-job-extrema-consumer" || artifact?.status !== "GENERATED") {
  errors.push("B3 artifact is not generated authority");
}
if (artifact?.summary?.candidateCount !== 533 || artifact?.summary?.canonicalHeroCount !== 267) {
  errors.push("B3 candidate population drift");
}
if (!Array.isArray(artifact?.candidates) || artifact.candidates.length !== 533) {
  errors.push("B3 candidate array count drift");
}
if (!server.includes("scaleDomains") || !server.includes("source.extrema[stat].min.value") || !server.includes("source.extrema[stat].max.value")) {
  errors.push("S2 scale domain supply is not direct B3 extrema projection");
}
if (!component.includes("const value = row.values[key]") || !component.includes("getBarPercent(value, data.scaleDomains[key])")) {
  errors.push("S3 UI does not bind exact row value and matching stat domain into the bar calculation");
}
if (!component.includes('data-stat-value={key}>{value}</span>')) {
  errors.push("S3 UI numeric value is not the exact B3 candidate value");
}

const byKey = new Map();
for (const candidate of artifact.candidates ?? []) {
  const key = candidateKey(candidate);
  if (byKey.has(key)) errors.push(`duplicate B3 candidate identity ${key}`);
  byKey.set(key, candidate);

  for (const stat of stats) {
    const range = artifact?.extrema?.[stat];
    const value = candidate?.values?.[stat];
    if (!Number.isFinite(value)) {
      errors.push(`${key} missing numeric ${stat}`);
      continue;
    }
    if (!range || value < range.min.value || value > range.max.value) {
      errors.push(`${key} ${stat}=${value} outside B3 extrema domain`);
    }
  }
}

for (const stat of stats) {
  const range = artifact?.extrema?.[stat];
  const [expectedMin, expectedMax] = expectedDomains[stat];
  if (range?.min?.value !== expectedMin || range?.max?.value !== expectedMax) {
    errors.push(`B3 ${stat} domain drift`);
    continue;
  }

  if (width(expectedMin, expectedMin, expectedMax) !== 25) errors.push(`${stat} min width != 25`);
  if (width(expectedMax, expectedMin, expectedMax) !== 100) errors.push(`${stat} max width != 100`);
  const midpoint = expectedMin + (expectedMax - expectedMin) / 2;
  if (Math.abs(width(midpoint, expectedMin, expectedMax) - 62.5) > 1e-9) errors.push(`${stat} midpoint width != 62.5`);

  for (const winner of range.min.winners ?? []) {
    const candidate = byKey.get(candidateKey(winner));
    if (!candidate) errors.push(`${stat} min winner missing from candidates: ${candidateKey(winner)}`);
    else if (candidate.values[stat] !== expectedMin) errors.push(`${stat} min winner value mismatch: ${candidateKey(winner)}`);
  }
  for (const winner of range.max.winners ?? []) {
    const candidate = byKey.get(candidateKey(winner));
    if (!candidate) errors.push(`${stat} max winner missing from candidates: ${candidateKey(winner)}`);
    else if (candidate.values[stat] !== expectedMax) errors.push(`${stat} max winner value mismatch: ${candidateKey(winner)}`);
  }
}

const leonFixtures = [
  {
    key: "6|NORMAL|64|307",
    values: { hp: 3497, at: 599, magic: 224, df: 231, magicDf: 203, dex: 125 },
    expectedPercent: { hp: 60.3601780656, at: 93.1141439206, magic: 29.9872122762, df: 48.4890109890, magicDf: 43.9914163090, dex: 40.6976744186 },
  },
  {
    key: "6|NORMAL|65|306",
    values: { hp: 3806, at: 569, magic: 224, df: 242, magicDf: 231, dex: 125 },
  },
  {
    key: "6|SP|66|377",
    values: { hp: 4041, at: 602, magic: 224, df: 260, magicDf: 231, dex: 125 },
  },
];

for (const fixture of leonFixtures) {
  const candidate = byKey.get(fixture.key);
  if (!candidate) {
    errors.push(`Leon fixture missing ${fixture.key}`);
    continue;
  }
  for (const stat of stats) {
    if (candidate.values[stat] !== fixture.values[stat]) {
      errors.push(`Leon ${fixture.key} ${stat} value drift`);
    }
    const [min, max] = expectedDomains[stat];
    const actualPercent = width(candidate.values[stat], min, max);
    if (actualPercent < 25 || actualPercent > 100) errors.push(`Leon ${fixture.key} ${stat} width outside 25-100`);
    if (fixture.expectedPercent?.[stat] != null && Math.abs(actualPercent - fixture.expectedPercent[stat]) > 1e-9) {
      errors.push(`Leon ${fixture.key} ${stat} width fixture drift`);
    }
  }
}

const result = {
  version: 1,
  stage: "hero-stat-bar-s5-parity-validator",
  status: errors.length ? "FAIL" : "PASS",
  candidateCount: artifact?.candidates?.length ?? null,
  validatedStats: stats,
  fullCandidateDomainParity: errors.filter((error) => error.includes("outside B3 extrema domain")).length === 0,
  extremaWinnerParity: errors.filter((error) => error.includes("winner")).length === 0,
  leonFixtureCount: leonFixtures.length,
  minimumFillPercent: 25,
  maximumFillPercent: 100,
  semanticRecomputation: false,
  errors,
  hardErrorCount: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
