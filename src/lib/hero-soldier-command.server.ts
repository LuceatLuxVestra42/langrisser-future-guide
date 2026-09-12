type CommandVector = {
  hp: number;
  at: number;
  df: number;
  magicDf: number;
};

type CommandVariant = {
  baseSource: string;
  base: CommandVector;
  hero3Contribution: CommandVector;
  final: CommandVector;
};

type CommandRecord = {
  heroId: number;
  spEligible: boolean;
  normal: CommandVariant;
  sp: CommandVariant | null;
};

type CommandArtifact = {
  version: number;
  artifact: string;
  recordCount: number;
  spVariantCount: number;
  records: CommandRecord[];
};

type CommandCheckpoint = {
  status: string;
  completion: string;
  artifact?: {
    path?: string;
    recordCount?: number;
    spVariantCount?: number;
  };
  validation?: {
    status?: string;
    hardErrorCount?: number;
  };
};

const commandArtifactModules = import.meta.glob<CommandArtifact>(
  "../../data/generated/hero-soldier-command-modifiers.v1.json",
  { eager: true, import: "default" },
);

const commandCheckpointModules = import.meta.glob<CommandCheckpoint>(
  "../../data/validation/hero-soldier-command-modifiers-i3-f.v1.json",
  { eager: true, import: "default" },
);

function getSingleModule<T>(modules: Record<string, T>, label: string): T {
  const values = Object.values(modules);
  if (values.length !== 1 || !values[0]) {
    throw new Error(`${label} frozen consumer module is missing or ambiguous.`);
  }
  return values[0];
}

function assertVector(value: CommandVector, label: string) {
  for (const key of ["hp", "at", "df", "magicDf"] as const) {
    if (!Number.isFinite(value?.[key])) {
      throw new Error(`${label}.${key} must be a finite number.`);
    }
  }
}

const checkpoint = getSingleModule(commandCheckpointModules, "Hero Soldier command checkpoint");
const artifact = getSingleModule(commandArtifactModules, "Hero Soldier command artifact");

if (
  checkpoint.status !== "FINAL_FROZEN" ||
  checkpoint.completion !== "HERO_SOLDIER_COMMAND_FINAL_MATERIALIZATION_COMPLETE" ||
  checkpoint.validation?.status !== "PASS" ||
  checkpoint.validation?.hardErrorCount !== 0
) {
  throw new Error("Hero Soldier command frozen checkpoint is not production-ready.");
}

if (
  artifact.version !== 1 ||
  artifact.artifact !== "hero-soldier-command-modifiers" ||
  artifact.recordCount !== 267 ||
  artifact.records.length !== artifact.recordCount ||
  artifact.spVariantCount !== 25 ||
  checkpoint.artifact?.recordCount !== artifact.recordCount ||
  checkpoint.artifact?.spVariantCount !== artifact.spVariantCount
) {
  throw new Error("Hero Soldier command frozen artifact population gate failed.");
}

const commandByHeroId = new Map<number, CommandRecord>();
for (const record of artifact.records) {
  if (!Number.isSafeInteger(record.heroId) || record.heroId <= 0 || commandByHeroId.has(record.heroId)) {
    throw new Error(`Hero Soldier command has invalid/duplicate heroId=${record.heroId}.`);
  }
  assertVector(record.normal.base, `Hero ${record.heroId} normal.base`);
  assertVector(record.normal.hero3Contribution, `Hero ${record.heroId} normal.hero3Contribution`);
  assertVector(record.normal.final, `Hero ${record.heroId} normal.final`);
  if (record.spEligible !== Boolean(record.sp)) {
    throw new Error(`Hero ${record.heroId} SP eligibility/payload parity failed.`);
  }
  if (record.sp) {
    assertVector(record.sp.base, `Hero ${record.heroId} sp.base`);
    assertVector(record.sp.hero3Contribution, `Hero ${record.heroId} sp.hero3Contribution`);
    assertVector(record.sp.final, `Hero ${record.heroId} sp.final`);
  }
  commandByHeroId.set(record.heroId, record);
}

export function readHeroSoldierCommand(heroId: number) {
  const record = commandByHeroId.get(heroId);
  if (!record) {
    throw new Error(`Hero ${heroId} is missing from frozen Soldier command artifact.`);
  }
  return record;
}
