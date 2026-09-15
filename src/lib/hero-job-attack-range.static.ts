import heroJobLinksRaw from "../../data/generated/hero-job-links.v1.json";
import attackRangeRaw from "../../data/generated/hero-job-attack-range.v1.json";

type HeroJobLinkConnection = {
  jobConnectionId: number;
  role: string | null;
  jobId: number | null;
  job: {
    id: number;
    nameCn: string | null;
    nameEn: string | null;
    rank: number | null;
  } | null;
};

type HeroJobLinkRecord = {
  heroId: number;
  connections: HeroJobLinkConnection[];
};

type HeroJobLinksArtifact = {
  version: 1;
  status: "PASS";
  recordCount: number;
  records: HeroJobLinkRecord[];
};

type HeroJobAttackRangeArtifact = {
  version: 1;
  domain: "hero-job-attack-range";
  status: "PASS";
  jobCount: number;
  ranges: Record<string, number[]>;
};

export type HeroJobAttackRangeRow = {
  jobConnectionId: number;
  role: string | null;
  jobId: number;
  nameCn: string | null;
  nameEn: string | null;
  rank: number | null;
  basicAttackRange: number;
};

const heroJobLinks = heroJobLinksRaw as unknown as HeroJobLinksArtifact;
const attackRange = attackRangeRaw as unknown as HeroJobAttackRangeArtifact;

if (heroJobLinks.version !== 1 || heroJobLinks.status !== "PASS" || heroJobLinks.recordCount !== 267 || heroJobLinks.records.length !== 267) {
  throw new Error("Hero Job frozen relation is not production-ready.");
}
if (attackRange.version !== 1 || attackRange.domain !== "hero-job-attack-range" || attackRange.status !== "PASS") {
  throw new Error("Hero Job attack-range frozen artifact is not production-ready.");
}

const rangeByJobId = new Map<number, number>();
for (const [rawRange, jobIds] of Object.entries(attackRange.ranges)) {
  const range = Number(rawRange);
  if (!Number.isSafeInteger(range) || range <= 0 || String(range) !== rawRange || !Array.isArray(jobIds)) {
    throw new Error(`Hero Job attack-range group is invalid at range=${rawRange}.`);
  }
  let previousJobId = 0;
  for (const jobId of jobIds) {
    if (!Number.isSafeInteger(jobId) || jobId <= 0 || jobId <= previousJobId || rangeByJobId.has(jobId)) {
      throw new Error(`Hero Job attack-range identity violation at jobId=${String(jobId)}.`);
    }
    previousJobId = jobId;
    rangeByJobId.set(jobId, range);
  }
}
if (rangeByJobId.size !== attackRange.jobCount || attackRange.jobCount !== 804) {
  throw new Error(`Hero Job attack-range frozen coverage mismatch: ${rangeByJobId.size}/${attackRange.jobCount}.`);
}

const byHeroId = new Map<number, HeroJobAttackRangeRow[]>();
for (const hero of heroJobLinks.records) {
  if (!Number.isSafeInteger(hero.heroId) || hero.heroId <= 0 || byHeroId.has(hero.heroId)) {
    throw new Error(`Hero Job attack-range Hero identity violation at heroId=${String(hero.heroId)}.`);
  }
  const seenConnectionIds = new Set<number>();
  const rows = hero.connections.map((connection) => {
    if (!Number.isSafeInteger(connection.jobConnectionId) || connection.jobConnectionId <= 0 || seenConnectionIds.has(connection.jobConnectionId)) {
      throw new Error(`Hero ${hero.heroId} has invalid or duplicate JobConnection ${String(connection.jobConnectionId)}.`);
    }
    seenConnectionIds.add(connection.jobConnectionId);
    const jobId = connection.jobId;
    if (!Number.isSafeInteger(jobId) || jobId <= 0 || connection.job?.id !== jobId) {
      throw new Error(`Hero ${hero.heroId} JobConnection ${connection.jobConnectionId} has invalid frozen Job identity.`);
    }
    const basicAttackRange = rangeByJobId.get(jobId);
    if (basicAttackRange == null) {
      throw new Error(`Hero ${hero.heroId} JobConnection ${connection.jobConnectionId} Job ${jobId} has no frozen basic attack range.`);
    }
    return {
      jobConnectionId: connection.jobConnectionId,
      role: connection.role,
      jobId,
      nameCn: connection.job?.nameCn ?? null,
      nameEn: connection.job?.nameEn ?? null,
      rank: connection.job?.rank ?? null,
      basicAttackRange,
    };
  });
  byHeroId.set(hero.heroId, rows);
}

export function getStaticHeroJobAttackRanges(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}
