import fs from "node:fs";
import path from "node:path";

type StatKey = "HP" | "ATK" | "INT" | "DEF" | "MDEF" | "DEX";

type Winner = {
  heroId: number;
  variant: "NORMAL" | "SP";
  branchIndex: number | null;
  jobConnectionId: number | null;
  jobId: number | null;
  jobNameCn: string | null;
};

type Candidate = Winner & Record<StatKey, number>;

const keys: StatKey[] = ["HP", "ATK", "INT", "DEF", "MDEF", "DEX"];
const valueKey: Record<StatKey, string> = {
  HP: "hp",
  ATK: "at",
  INT: "magic",
  DEF: "df",
  MDEF: "magicDf",
  DEX: "dex",
};

const shardDir = path.resolve(process.cwd(), "data/generated/hero-detail/by-id");
const files = fs.readdirSync(shardDir).filter((name) => name.endsWith(".json")).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
const candidates: Candidate[] = [];

function toCandidate(
  heroId: number,
  variant: "NORMAL" | "SP",
  branchIndex: number | null,
  row: any,
  values: any,
): Candidate {
  const stats = Object.fromEntries(
    keys.map((key) => {
      const value = values?.[valueKey[key]];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Missing ${key} for hero=${heroId} variant=${variant} connection=${String(row?.jobConnectionId ?? null)}`);
      }
      return [key, value];
    }),
  ) as Record<StatKey, number>;

  return {
    heroId,
    variant,
    branchIndex,
    jobConnectionId: Number.isInteger(row?.jobConnectionId) ? Number(row.jobConnectionId) : null,
    jobId: Number.isInteger(row?.jobId) ? Number(row.jobId) : Number.isInteger(row?.job?.id) ? Number(row.job.id) : null,
    jobNameCn: typeof row?.job?.nameCn === "string" ? row.job.nameCn : typeof row?.nameCn === "string" ? row.nameCn : null,
    ...stats,
  };
}

for (const file of files) {
  const shard = JSON.parse(fs.readFileSync(path.join(shardDir, file), "utf8"));
  const heroId = Number(shard?.heroId);
  if (!Number.isInteger(heroId)) throw new Error(`Invalid heroId in ${file}`);
  if (shard?.validation?.structuralStatus !== "PASS" || shard?.validation?.siteUsable !== true) {
    throw new Error(`Non-usable Stage 6 shard: hero=${heroId}`);
  }

  const branches = Array.isArray(shard?.normal?.jobTree?.branches) ? shard.normal.jobTree.branches : [];
  const connections = Array.isArray(shard?.normal?.jobTree?.connections) ? shard.normal.jobTree.connections : [];
  const byConnectionId = new Map<number, any>();
  for (const connection of connections) {
    if (Number.isInteger(connection?.jobConnectionId)) byConnectionId.set(Number(connection.jobConnectionId), connection);
  }

  branches.forEach((branch: unknown, index: number) => {
    if (!Array.isArray(branch) || branch.length === 0) return;
    const capstoneId = Number(branch.at(-1));
    const row = byConnectionId.get(capstoneId);
    if (!row) throw new Error(`Missing capstone connection hero=${heroId} branch=${index + 1} connection=${capstoneId}`);
    if (row?.finalDisplayStats?.status !== "VERIFIED") {
      throw new Error(`Non-VERIFIED capstone stats hero=${heroId} branch=${index + 1} connection=${capstoneId}`);
    }
    candidates.push(toCandidate(heroId, "NORMAL", index + 1, row, row.finalDisplayStats.values));
  });

  if (shard?.sp?.status === "RELEASED") {
    if (shard?.sp?.finalDisplayStats?.status !== "VERIFIED") throw new Error(`Released SP missing VERIFIED stats hero=${heroId}`);
    const row = shard.sp.job ?? {};
    candidates.push(toCandidate(heroId, "SP", null, row, shard.sp.finalDisplayStats.values));
  }
}

const extrema = Object.fromEntries(
  keys.map((key) => {
    const values = candidates.map((row) => row[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const project = (row: Candidate): Winner => ({
      heroId: row.heroId,
      variant: row.variant,
      branchIndex: row.branchIndex,
      jobConnectionId: row.jobConnectionId,
      jobId: row.jobId,
      jobNameCn: row.jobNameCn,
    });
    return [key, {
      min: { value: min, winners: candidates.filter((row) => row[key] === min).map(project) },
      max: { value: max, winners: candidates.filter((row) => row[key] === max).map(project) },
    }];
  }),
);

console.log(`HERO_FINAL_JOB_EXTREMA_PROBE=${JSON.stringify({ shardCount: files.length, candidateCount: candidates.length, extrema })}`);
