import attackRangeRaw from "../../data/generated/hero-final-job-attack-range.v1.json";

type FinalJobAttackRangeRecord = {
  jobId: number;
  attackRange: number;
  sourceField: "BF_AttackDistance";
};

type FinalJobAttackRangeArtifact = {
  version: 1;
  stage: "hero-final-job-attack-range-consumer";
  status: "FROZEN";
  owner: "hero-canonical";
  summary: {
    finalJobIdCount: number;
    hardErrorCount: number;
  };
  byJobId: Record<string, FinalJobAttackRangeRecord>;
};

const attackRange = attackRangeRaw as unknown as FinalJobAttackRangeArtifact;

if (
  attackRange.version !== 1 ||
  attackRange.stage !== "hero-final-job-attack-range-consumer" ||
  attackRange.status !== "FROZEN" ||
  attackRange.owner !== "hero-canonical" ||
  attackRange.summary.hardErrorCount !== 0
) {
  throw new Error("Hero final-job attack-range frozen artifact is not production-ready.");
}

const entries = Object.entries(attackRange.byJobId);
if (entries.length !== attackRange.summary.finalJobIdCount) {
  throw new Error(
    `Hero final-job attack-range frozen coverage mismatch: ${entries.length}/${attackRange.summary.finalJobIdCount}.`,
  );
}

const rangeByJobId = new Map<number, number>();
for (const [jobIdKey, record] of entries) {
  const jobId = Number(jobIdKey);
  if (
    !Number.isSafeInteger(jobId) ||
    jobId <= 0 ||
    String(jobId) !== jobIdKey ||
    record.jobId !== jobId ||
    !Number.isSafeInteger(record.attackRange) ||
    record.attackRange <= 0 ||
    record.sourceField !== "BF_AttackDistance" ||
    rangeByJobId.has(jobId)
  ) {
    throw new Error(`Hero final-job attack-range identity violation at jobId=${jobIdKey}.`);
  }
  rangeByJobId.set(jobId, record.attackRange);
}

export function getStaticHeroFinalJobAttackRange(jobId: number) {
  return rangeByJobId.get(jobId) ?? null;
}
