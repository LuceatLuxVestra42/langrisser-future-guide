import armyRaw from "../../data/generated/hero-final-job-army.v1.json";

export type HeroFinalJobArmyRecord = {
  jobId: number;
  armyId: number;
  armyNameCn: string | null;
  iconNoBackLocator: string | null;
  sourceFields: ["Army_ID", "Icon_NoBack"];
};

type HeroFinalJobArmyArtifact = {
  version: 1;
  stage: "hero-final-job-army-consumer";
  status: "FROZEN";
  owner: "hero-canonical";
  summary: {
    finalJobIdCount: number;
    hardErrorCount: number;
  };
  byJobId: Record<string, HeroFinalJobArmyRecord>;
};

const army = armyRaw as unknown as HeroFinalJobArmyArtifact;

if (
  army.version !== 1 ||
  army.stage !== "hero-final-job-army-consumer" ||
  army.status !== "FROZEN" ||
  army.owner !== "hero-canonical" ||
  army.summary.hardErrorCount !== 0
) {
  throw new Error("Hero final-job army frozen artifact is not production-ready.");
}

const entries = Object.entries(army.byJobId);
if (entries.length !== army.summary.finalJobIdCount) {
  throw new Error(`Hero final-job army frozen coverage mismatch: ${entries.length}/${army.summary.finalJobIdCount}.`);
}

const armyByJobId = new Map<number, HeroFinalJobArmyRecord>();
for (const [jobIdKey, record] of entries) {
  const jobId = Number(jobIdKey);
  if (
    !Number.isSafeInteger(jobId) ||
    jobId <= 0 ||
    String(jobId) !== jobIdKey ||
    record.jobId !== jobId ||
    !Number.isSafeInteger(record.armyId) ||
    record.armyId <= 0 ||
    record.sourceFields?.[0] !== "Army_ID" ||
    record.sourceFields?.[1] !== "Icon_NoBack" ||
    armyByJobId.has(jobId)
  ) {
    throw new Error(`Hero final-job army identity violation at jobId=${jobIdKey}.`);
  }
  armyByJobId.set(jobId, record);
}

export function getStaticHeroFinalJobArmy(jobId: number) {
  return armyByJobId.get(jobId) ?? null;
}
