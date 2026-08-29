import { readHeroDetailRouteStage4Data } from "./hero-list.server";

type Stage6JobConnection = {
  jobConnectionId?: number;
  jobId?: number;
  role?: string | null;
  depth?: number | null;
  job?: {
    id?: number;
    nameCn?: string | null;
    nameEn?: string | null;
    rank?: number | null;
  } | null;
  finalDisplayStats?: {
    status?: string | null;
    heroLevel?: number | null;
    star?: number | null;
    values?: {
      hp?: number | null;
      at?: number | null;
      magic?: number | null;
      df?: number | null;
      magicDf?: number | null;
      dex?: number | null;
    } | null;
  } | null;
};

type Stage6JobTree = {
  branches?: number[][];
  connections?: Stage6JobConnection[];
};

type Stage6Skill = {
  skillId?: number;
  nameCn?: string | null;
  desc?: string | null;
  iconPath?: string | null;
  displayType?: string | null;
  cooldown?: string | null;
  range?: string | null;
  areaOrTarget?: string | null;
};

type Stage6SkillAcquisition = {
  acquisitionOrder?: number;
  skillId?: number;
  skill?: Stage6Skill | null;
  jobConnectionId?: number;
  jobId?: number;
  jobNameCn?: string | null;
  jobNameEn?: string | null;
  connectionDepth?: number;
  connectionOrder?: number;
  jobLevelId?: number;
  jobLevelSequence?: number;
  rankCode?: number;
  jobLevelUpHeroLevel?: number;
};

type Stage6Skills = {
  jobLevelAcquisitions?: Stage6SkillAcquisition[] | null;
  heroDirectSkills?: Stage6Skill[] | null;
};

type Stage6Talent = {
  status?: string | null;
  selectionRule?: string | null;
  initialStar?: number | null;
  starProgression?: Array<{
    star?: number;
    skillId?: number;
    skill?: Stage6Skill | null;
  }> | null;
};

type Stage6BondCondition = {
  conditionType?: number;
  semanticStatus?: string | null;
  requiredHero?: {
    heroId?: number;
    nameKr?: string | null;
    nameCn?: string | null;
    nameEn?: string | null;
  } | null;
  mission?: {
    missionId?: number;
    title?: string | null;
    desc?: string | null;
    missionType?: number;
  } | null;
  stage?: {
    stageId?: number;
    nameCn?: string | null;
  } | null;
  favorability?: {
    targetHeroId?: number;
    targetHeroNameKr?: string | null;
    targetHeroNameCn?: string | null;
    targetHeroNameEn?: string | null;
    requiredLevel?: number;
  } | null;
};

type Stage6Bond = {
  order?: number;
  fetterId?: number;
  sourceResolved?: boolean;
  nameCn?: string | null;
  maxLevel?: number;
  completionConditions?: Stage6BondCondition[] | null;
};

type FeatureBlock = {
  status?: string | null;
} | null | undefined;

type Stage6HeroShard = {
  heroId: number;
  identity?: {
    nameCn?: string | null;
    nameEn?: string | null;
    nameKr?: string | null;
  } | null;
  presentation?: {
    cv?: {
      state?: string | null;
      sourceValue?: string | null;
      nameKr?: string | null;
    } | null;
    skins?: unknown[] | null;
  } | null;
  normal?: {
    heroMeta?: {
      initialStar?: number | null;
      rank?: number | null;
    } | null;
    jobTree?: Stage6JobTree | null;
    skills?: Stage6Skills | null;
    talent?: Stage6Talent | null;
  } | null;
  bonds?: Stage6Bond[] | null;
  exclusiveEquipment?: FeatureBlock;
  centralDiscipline?: FeatureBlock;
  soldiers?: { ids?: number[] } | null;
  sp?: FeatureBlock;
  validation?: {
    structuralStatus?: string | null;
    publicationStatus?: string | null;
    siteUsable?: boolean | null;
    reviewCodes?: string[] | null;
  } | null;
};

const stage6ShardModules = import.meta.glob<Stage6HeroShard>(
  "../../data/generated/hero-detail/by-id/*.json",
  { eager: false, import: "default" },
);

function isReleased(value: FeatureBlock): boolean {
  return value?.status === "RELEASED";
}

function projectSkill(skill: Stage6Skill | null | undefined) {
  if (!skill || !Number.isInteger(skill.skillId)) return null;
  return {
    skillId: Number(skill.skillId),
    nameCn: skill.nameCn ?? null,
    desc: skill.desc ?? null,
    iconPath: skill.iconPath ?? null,
    displayType: skill.displayType ?? null,
    cooldown: skill.cooldown ?? null,
    range: skill.range ?? null,
    areaOrTarget: skill.areaOrTarget ?? null,
  };
}

function projectJobBranches(jobTree: Stage6JobTree | null | undefined) {
  const branchIds = Array.isArray(jobTree?.branches) ? jobTree.branches : [];
  const connections = Array.isArray(jobTree?.connections) ? jobTree.connections : [];
  const byConnectionId = new Map<number, Stage6JobConnection>();
  for (const row of connections) {
    if (Number.isInteger(row.jobConnectionId)) byConnectionId.set(Number(row.jobConnectionId), row);
  }

  return branchIds.map((ids, branchIndex) => {
    const jobs: Stage6JobConnection[] = [];
    for (const id of ids) {
      const row = byConnectionId.get(Number(id));
      if (row) jobs.push(row);
    }
    const capstone = jobs.at(-1) ?? null;
    const values = capstone?.finalDisplayStats?.values;

    return {
      branchIndex: branchIndex + 1,
      connectionIds: ids.map(Number),
      jobs: jobs.map((job) => ({
        jobConnectionId: job.jobConnectionId ?? null,
        jobId: job.jobId ?? job.job?.id ?? null,
        nameCn: job.job?.nameCn ?? null,
        nameEn: job.job?.nameEn ?? null,
        rank: job.job?.rank ?? null,
        depth: job.depth ?? null,
      })),
      capstone: capstone
        ? {
            jobConnectionId: capstone.jobConnectionId ?? null,
            jobId: capstone.jobId ?? capstone.job?.id ?? null,
            nameCn: capstone.job?.nameCn ?? null,
            rank: capstone.job?.rank ?? null,
            heroLevel: capstone.finalDisplayStats?.heroLevel ?? null,
            star: capstone.finalDisplayStats?.star ?? null,
            statStatus: capstone.finalDisplayStats?.status ?? null,
            finalStats: {
              HP: values?.hp ?? null,
              ATK: values?.at ?? null,
              INT: values?.magic ?? null,
              DEF: values?.df ?? null,
              MDEF: values?.magicDf ?? null,
              DEX: values?.dex ?? null,
            },
          }
        : null,
    };
  });
}

function projectBonds(bonds: Stage6Bond[] | null | undefined) {
  if (!Array.isArray(bonds)) return [];
  return bonds.map((bond, index) => ({
    order: Number.isInteger(bond.order) ? Number(bond.order) : index,
    fetterId: Number.isInteger(bond.fetterId) ? Number(bond.fetterId) : null,
    sourceResolved: bond.sourceResolved === true,
    nameCn: bond.nameCn ?? null,
    maxLevel: Number.isInteger(bond.maxLevel) ? Number(bond.maxLevel) : null,
    completionConditions: Array.isArray(bond.completionConditions)
      ? bond.completionConditions.map((condition) => ({
          conditionType: Number.isInteger(condition.conditionType) ? Number(condition.conditionType) : null,
          semanticStatus: condition.semanticStatus ?? null,
          requiredHero: condition.requiredHero
            ? {
                heroId: Number.isInteger(condition.requiredHero.heroId) ? Number(condition.requiredHero.heroId) : null,
                nameKr: condition.requiredHero.nameKr ?? null,
                nameCn: condition.requiredHero.nameCn ?? null,
                nameEn: condition.requiredHero.nameEn ?? null,
              }
            : null,
          mission: condition.mission
            ? {
                missionId: Number.isInteger(condition.mission.missionId) ? Number(condition.mission.missionId) : null,
                title: condition.mission.title ?? null,
                desc: condition.mission.desc ?? null,
                missionType: Number.isInteger(condition.mission.missionType) ? Number(condition.mission.missionType) : null,
              }
            : null,
          stage: condition.stage
            ? {
                stageId: Number.isInteger(condition.stage.stageId) ? Number(condition.stage.stageId) : null,
                nameCn: condition.stage.nameCn ?? null,
              }
            : null,
          favorability: condition.favorability
            ? {
                targetHeroId: Number.isInteger(condition.favorability.targetHeroId) ? Number(condition.favorability.targetHeroId) : null,
                targetHeroNameKr: condition.favorability.targetHeroNameKr ?? null,
                targetHeroNameCn: condition.favorability.targetHeroNameCn ?? null,
                targetHeroNameEn: condition.favorability.targetHeroNameEn ?? null,
                requiredLevel: Number.isInteger(condition.favorability.requiredLevel) ? Number(condition.favorability.requiredLevel) : null,
              }
            : null,
        }))
      : [],
  }));
}

function projectStage6Shard(shard: Stage6HeroShard) {
  const validation = shard.validation;
  if (!validation || validation.structuralStatus !== "PASS" || validation.siteUsable !== true) {
    throw new Error(`Hero ${shard.heroId} Stage 6 shard is not structurally usable.`);
  }

  const jobTree = shard.normal?.jobTree;
  const branches = projectJobBranches(jobTree);
  const connections = Array.isArray(jobTree?.connections) ? jobTree.connections : [];
  const bonds = projectBonds(shard.bonds);
  const soldierIds = Array.isArray(shard.soldiers?.ids) ? shard.soldiers.ids : [];
  const skins = Array.isArray(shard.presentation?.skins) ? shard.presentation.skins : [];
  const reviewCodes = Array.isArray(validation.reviewCodes) ? validation.reviewCodes : [];
  const jobLevelAcquisitions = Array.isArray(shard.normal?.skills?.jobLevelAcquisitions)
    ? shard.normal.skills.jobLevelAcquisitions
        .map((row) => {
          const skill = projectSkill(row.skill);
          if (!skill) return null;
          return {
            acquisitionOrder: row.acquisitionOrder ?? null,
            skillId: row.skillId ?? skill.skillId,
            skill,
            jobConnectionId: row.jobConnectionId ?? null,
            jobId: row.jobId ?? null,
            jobNameCn: row.jobNameCn ?? null,
            jobNameEn: row.jobNameEn ?? null,
            connectionDepth: row.connectionDepth ?? null,
            connectionOrder: row.connectionOrder ?? null,
            jobLevelId: row.jobLevelId ?? null,
            jobLevelSequence: row.jobLevelSequence ?? null,
            rankCode: row.rankCode ?? null,
            jobLevelUpHeroLevel: row.jobLevelUpHeroLevel ?? null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];
  const heroDirectSkills = Array.isArray(shard.normal?.skills?.heroDirectSkills)
    ? shard.normal.skills.heroDirectSkills
        .map(projectSkill)
        .filter((skill): skill is NonNullable<typeof skill> => skill !== null)
    : [];
  const talentProgression = Array.isArray(shard.normal?.talent?.starProgression)
    ? shard.normal.talent.starProgression
        .map((row) => {
          const skill = projectSkill(row.skill);
          if (!skill || !Number.isInteger(row.star)) return null;
          return {
            star: Number(row.star),
            skillId: row.skillId ?? skill.skillId,
            skill,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  return {
    identity: {
      nameKr: shard.identity?.nameKr ?? null,
      nameCn: shard.identity?.nameCn ?? null,
      nameEn: shard.identity?.nameEn ?? null,
    },
    presentation: {
      cvState: shard.presentation?.cv?.state ?? null,
      cvSourceValue: shard.presentation?.cv?.sourceValue ?? null,
      cvNameKr: shard.presentation?.cv?.nameKr ?? null,
      skinCount: skins.length,
    },
    base: {
      initialStar: shard.normal?.heroMeta?.initialStar ?? null,
      rank: shard.normal?.heroMeta?.rank ?? null,
    },
    talent: {
      status: shard.normal?.talent?.status ?? null,
      selectionRule: shard.normal?.talent?.selectionRule ?? null,
      initialStar: shard.normal?.talent?.initialStar ?? null,
      starProgression: talentProgression,
    },
    skills: {
      heroDirectSkills,
      jobLevelAcquisitions,
    },
    jobs: {
      branchCount: branches.length,
      connectionCount: connections.length,
      branches,
    },
    bonds: {
      count: bonds.length,
      rows: bonds,
    },
    soldiers: { count: soldierIds.length, ids: soldierIds },
    systems: {
      bondRowCount: bonds.length,
      exclusiveEquipmentStatus: shard.exclusiveEquipment?.status ?? null,
      exclusiveEquipmentReleased: isReleased(shard.exclusiveEquipment),
      centralDisciplineStatus: shard.centralDiscipline?.status ?? null,
      centralDisciplineReleased: isReleased(shard.centralDiscipline),
      spStatus: shard.sp?.status ?? null,
      spReleased: isReleased(shard.sp),
    },
    validation: {
      structuralStatus: validation.structuralStatus,
      publicationStatus: validation.publicationStatus ?? null,
      reviewCodes,
      reviewCount: reviewCodes.length,
    },
  };
}

export async function readHeroDetailRouteStage5Data(heroId: number) {
  const shell = readHeroDetailRouteStage4Data(heroId);
  if (!shell) return null;
  const moduleKey = `../../data/generated/hero-detail/by-id/${heroId}.json`;
  const loadShard = stage6ShardModules[moduleKey];
  if (!loadShard) return null;
  const shard = await loadShard();
  if (!shard || shard.heroId !== heroId) throw new Error(`Hero ${heroId} Stage 6 shard identity mismatch.`);
  return {
    ...shell,
    stage6: {
      ...shell.stage6,
      admissionStatus: "SINGLE_SHARD_LOADED",
      singleShardRuntimeRead: true,
      fullDatasetRuntimeRead: false,
    },
    detail: projectStage6Shard(shard),
  };
}
