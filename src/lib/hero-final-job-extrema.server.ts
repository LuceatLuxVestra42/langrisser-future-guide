import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, "data/generated/hero-final-job-extrema.v1.json");
const STAT_KEYS = ["hp", "at", "magic", "df", "magicDf", "dex"] as const;

type StatKey = (typeof STAT_KEYS)[number];
type Variant = "NORMAL" | "SP";
type ExtremeKind = "MIN" | "MAX" | "BOTH" | null;

type Winner = {
  heroId: number;
  variant: Variant;
  jobConnectionId: number;
  jobId: number;
};

type SourceCandidate = Winner & {
  jobNameCn: string | null;
  values: Record<StatKey, number>;
};

type SourceArtifact = {
  stage: string;
  status: string;
  eligibility: { authoritativeField: string; requiredRank: number; topologyUsed: boolean };
  summary: { canonicalHeroCount: number; candidateCount: number };
  candidates: SourceCandidate[];
  extrema: Record<StatKey, { min: { value: number; winners: Winner[] }; max: { value: number; winners: Winner[] } }>;
};

function sameCandidate(a: Winner, b: Winner) {
  return a.heroId === b.heroId && a.variant === b.variant && a.jobConnectionId === b.jobConnectionId && a.jobId === b.jobId;
}

function readArtifact(): SourceArtifact {
  const parsed = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8")) as SourceArtifact;
  if (
    parsed.stage !== "hero-b3-final-job-extrema-consumer" ||
    parsed.status !== "GENERATED" ||
    parsed.eligibility?.authoritativeField !== "ConfigDataJobInfo.Rank" ||
    parsed.eligibility?.requiredRank !== 4 ||
    parsed.eligibility?.topologyUsed !== false ||
    parsed.summary?.canonicalHeroCount !== 267 ||
    parsed.summary?.candidateCount !== 533 ||
    !Array.isArray(parsed.candidates)
  ) {
    throw new Error("B3 final-job extrema consumer is not production-ready.");
  }
  return parsed;
}

export function readHeroFinalJobStatsPresentation(heroId: number) {
  const source = readArtifact();
  const rows = source.candidates
    .filter((candidate) => candidate.heroId === heroId)
    .map((candidate) => {
      const extremes = Object.fromEntries(STAT_KEYS.map((stat) => {
        const range = source.extrema[stat];
        const isMin = range.min.winners.some((winner) => sameCandidate(winner, candidate));
        const isMax = range.max.winners.some((winner) => sameCandidate(winner, candidate));
        const kind: ExtremeKind = isMin && isMax ? "BOTH" : isMin ? "MIN" : isMax ? "MAX" : null;
        return [stat, kind];
      })) as Record<StatKey, ExtremeKind>;
      return {
        variant: candidate.variant,
        jobConnectionId: candidate.jobConnectionId,
        jobId: candidate.jobId,
        jobNameCn: candidate.jobNameCn,
        values: candidate.values,
        extremes,
      };
    });

  return {
    heroId,
    sourceStage: source.stage,
    eligibility: source.eligibility,
    rows,
  };
}
