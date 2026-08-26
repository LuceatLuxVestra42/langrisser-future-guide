import leonDetailJson from "../../data/generated/hero-detail/by-id/6.json";
import soldierMasterJson from "../../data/generated/soldier-master.v1.json";

type StatValues = {
  hp: number;
  at: number;
  magic: number;
  df: number;
  magicDf: number;
  dex: number;
};

type SourceSkill = {
  skillId: number;
  nameCn: string;
  desc?: string | null;
  descCn?: string | null;
  iconPath?: string | null;
  icon?: string | null;
  displayType?: string | null;
  cooldown?: string | null;
  range?: string | null;
  areaOrTarget?: string | null;
  cost?: number | null;
};

type HeroDetailSource = {
  heroId: number;
  identity: {
    nameKr: string;
    nameCn: string;
    nameEn: string;
  };
  presentation: {
    rarity: { rank: number; baseLabel: string };
    factions: Array<{
      factionId: number;
      nameCn: string;
      nameKr: string | null;
      iconSourcePath: string;
    }>;
    cv: { state: string; sourceValue: string; nameKr: string | null };
    origin: { productionId: number; nameCn: string; nameKr: string | null; category: string };
    artwork: { sourceAssetPath: string };
    skins: Array<{
      skinId: number;
      order: number;
      nameCn: string;
      nameKr: string | null;
      sourceImagePath: string;
      sourceSpinePath: string;
      acquisition: {
        state: string;
        typeCode: number | null;
        labelCn: string | null;
        labelKr: string | null;
      };
    }>;
  };
  normal: {
    heroMeta: { initialStar: number; rank: number };
    jobTree: {
      primaryJobConnectionId: number;
      orderedConnectionIds: number[];
      branches: number[][];
      connections: Array<{
        jobConnectionId: number;
        role: string;
        jobId: number;
        job: { id: number; nameCn: string; nameEn: string | null; rank: number };
        uiSort: number;
        depth: number;
        predecessorConnectionIds: number[];
        childConnectionIds: number[];
        levels: Array<{
          sequence: number;
          jobLevelId: number;
          jobLevelUpHeroLevel: number;
          gotSkillId: number | null;
          gotSoldierId: number | null;
        }>;
        finalDisplayStats: {
          status: string;
          heroLevel: number;
          star: number;
          jobLevelId: number;
          values: StatValues;
        };
      }>;
    };
    skills: {
      jobLevelAcquisitions: Array<{
        acquisitionOrder: number;
        skillId: number;
        skill: SourceSkill;
        jobConnectionId: number;
        jobId: number;
        jobNameCn: string;
        connectionDepth: number;
        jobLevelId: number;
        jobLevelSequence: number;
        jobLevelUpHeroLevel: number;
      }>;
      heroDirectSkills: SourceSkill[];
    };
    talent: {
      status: string;
      selectionRule: string;
      initialStar: number;
      starProgression: Array<{
        star: number;
        skillId: number;
        skill: SourceSkill;
      }>;
    };
    awakening: {
      status: string;
      awakenId: number | null;
      level2SkillId: number | null;
      skill: SourceSkill | null;
    };
    soldierModifiers: {
      status: string;
      meaning: string;
      hp: number;
      at: number;
      df: number;
      magicDf: number;
    };
  };
  bonds: Array<{
    order: number;
    fetterId: number;
    sourceResolved: boolean;
    nameCn: string;
    maxLevel: number;
    completionConditions: Array<{
      semanticStatus: string;
      requiredHero: {
        heroId: number;
        nameKr: string;
        nameCn: string;
        nameEn: string;
      } | null;
      favorability: {
        targetHeroId: number;
        targetHeroNameKr: string;
        requiredLevel: number;
      } | null;
      mission: {
        missionId: number;
        desc: string | null;
      } | null;
      stage: {
        stageId: number;
        nameCn: string;
      } | null;
    }>;
  }>;
  exclusiveEquipment: {
    status: string;
    equipmentId: number;
    nameCn: string;
    nameKr: string | null;
    nameKrStatus: string;
    descCn: string;
    icon: string;
    equipmentType: number;
  } | null;
  centralDiscipline: {
    status: string;
    skillId: number;
    nameCn: string;
    descCn: string;
    icon: string;
    unlock: {
      equipmentLevel: number;
      heroStarLevel: number;
      castingLawLevel: number;
    };
  } | null;
  soldiers: { ids: number[] };
  sp?: {
    status: string;
    sourceNameCn: string;
    job: {
      jobConnectionId: number;
      jobId: number;
      nameCn: string;
    };
    missions: {
      firstStage: Array<{ id: number; titleCn: string; descCn: string | null }>;
      secondStage: Array<{ id: number; titleCn: string; descCn: string | null }>;
    };
    secondStageRewards: {
      buff: {
        buffId: number;
        nameCn: string;
        descCn: string;
      };
      skills: SourceSkill[];
      soldiers: Array<{
        soldierId: number;
        nameCn: string;
        nameKr: string | null;
        nameKrStatus: string;
        tier: number;
        armyType: string;
        validationStatus: string;
      }>;
    };
  };
  validation: {
    structuralStatus: string;
    publicationStatus: string;
    siteUsable: boolean;
    reviewCodes: string[];
  };
};

type SoldierMasterSource = {
  records: Array<{
    soldierId: number;
    siteId: string;
    nameCn: string;
    nameKr: string | null;
    nameKrStatus: string;
    tier: number;
    armyType: string;
    uiGroup: string;
    isSp: boolean;
    validationStatus: string;
  }>;
};

const leon = leonDetailJson as unknown as HeroDetailSource;
const soldierMaster = soldierMasterJson as unknown as SoldierMasterSource;
const soldierById = new Map(soldierMaster.records.map((record) => [record.soldierId, record]));

export type HeroPrototypePageData = ReturnType<typeof projectHero>;

function cleanRichText(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
}

function projectSkill(skill: SourceSkill) {
  return {
    skillId: skill.skillId,
    nameCn: skill.nameCn,
    description: cleanRichText(skill.desc ?? skill.descCn),
    iconSourcePath: skill.iconPath ?? skill.icon ?? null,
    displayType: skill.displayType ?? null,
    cooldown: skill.cooldown ?? null,
    range: skill.range ?? null,
    areaOrTarget: skill.areaOrTarget ?? null,
    cost: skill.cost ?? null,
  };
}

function projectHero(source: HeroDetailSource) {
  const jobs = source.normal.jobTree.connections
    .slice()
    .sort((a, b) => a.uiSort - b.uiSort)
    .map((connection) => ({
      jobConnectionId: connection.jobConnectionId,
      jobId: connection.jobId,
      nameCn: connection.job.nameCn,
      rank: connection.job.rank,
      depth: connection.depth,
      role: connection.role,
      predecessorConnectionIds: connection.predecessorConnectionIds,
      childConnectionIds: connection.childConnectionIds,
      finalDisplayStats: connection.finalDisplayStats,
      acquiredSkillIds: connection.levels.flatMap((level) =>
        level.gotSkillId === null ? [] : [level.gotSkillId],
      ),
      acquiredSoldierIds: connection.levels.flatMap((level) =>
        level.gotSoldierId === null ? [] : [level.gotSoldierId],
      ),
    }));

  const soldiers = source.soldiers.ids.map((soldierId) => {
    const soldier = soldierById.get(soldierId);
    if (!soldier) {
      return {
        soldierId,
        siteId: `soldier-${soldierId}`,
        displayName: `Soldier ${soldierId}`,
        nameCn: null,
        localizationPending: true,
        tier: null,
        armyType: null,
        uiGroup: null,
        isSp: false,
        validationStatus: "REVIEW",
      };
    }

    return {
      soldierId: soldier.soldierId,
      siteId: soldier.siteId,
      displayName: soldier.nameKr ?? soldier.nameCn,
      nameCn: soldier.nameCn,
      localizationPending: soldier.nameKr === null,
      tier: soldier.tier,
      armyType: soldier.armyType,
      uiGroup: soldier.uiGroup,
      isSp: soldier.isSp,
      validationStatus: soldier.validationStatus,
    };
  });

  return {
    heroId: source.heroId,
    identity: source.identity,
    rarity: source.presentation.rarity,
    factions: source.presentation.factions.map((faction) => ({
      factionId: faction.factionId,
      displayName: faction.nameKr ?? faction.nameCn,
      nameCn: faction.nameCn,
      localizationPending: faction.nameKr === null,
      iconSourcePath: faction.iconSourcePath,
    })),
    cv: {
      displayName: source.presentation.cv.nameKr ?? source.presentation.cv.sourceValue,
      sourceValue: source.presentation.cv.sourceValue,
      localizationPending: source.presentation.cv.nameKr === null,
    },
    origin: {
      displayName: source.presentation.origin.nameKr ?? source.presentation.origin.nameCn,
      nameCn: source.presentation.origin.nameCn,
      category: source.presentation.origin.category,
      localizationPending: source.presentation.origin.nameKr === null,
    },
    artworkSourcePath: source.presentation.artwork.sourceAssetPath,
    skins: source.presentation.skins
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((skin) => ({
        skinId: skin.skinId,
        order: skin.order,
        displayName: skin.nameKr ?? skin.nameCn,
        nameCn: skin.nameCn,
        localizationPending: skin.nameKr === null,
        sourceImagePath: skin.sourceImagePath,
        sourceSpinePath: skin.sourceSpinePath,
        acquisitionLabel: skin.acquisition.labelKr ?? skin.acquisition.labelCn,
        acquisitionState: skin.acquisition.state,
      })),
    normal: {
      initialStar: source.normal.heroMeta.initialStar,
      primaryJobConnectionId: source.normal.jobTree.primaryJobConnectionId,
      branches: source.normal.jobTree.branches,
      jobs,
      directSkills: source.normal.skills.heroDirectSkills.map(projectSkill),
      skillAcquisitions: source.normal.skills.jobLevelAcquisitions.map((record) => ({
        acquisitionOrder: record.acquisitionOrder,
        skill: projectSkill(record.skill),
        jobConnectionId: record.jobConnectionId,
        jobId: record.jobId,
        jobNameCn: record.jobNameCn,
        connectionDepth: record.connectionDepth,
        jobLevelId: record.jobLevelId,
        jobLevelSequence: record.jobLevelSequence,
        jobLevelUpHeroLevel: record.jobLevelUpHeroLevel,
      })),
      talent: {
        status: source.normal.talent.status,
        selectionRule: source.normal.talent.selectionRule,
        initialStar: source.normal.talent.initialStar,
        starProgression: source.normal.talent.starProgression.map((entry) => ({
          star: entry.star,
          skill: projectSkill(entry.skill),
        })),
      },
      awakening: {
        status: source.normal.awakening.status,
        skill:
          source.normal.awakening.skill === null
            ? null
            : projectSkill(source.normal.awakening.skill),
      },
      soldierModifiers: source.normal.soldierModifiers,
    },
    bonds: source.bonds.map((bond) => ({
      order: bond.order,
      fetterId: bond.fetterId,
      nameCn: bond.nameCn,
      maxLevel: bond.maxLevel,
      sourceResolved: bond.sourceResolved,
      requiredHeroes: bond.completionConditions.flatMap((condition) =>
        condition.requiredHero
          ? [
              {
                heroId: condition.requiredHero.heroId,
                nameKr: condition.requiredHero.nameKr,
                nameCn: condition.requiredHero.nameCn,
              },
            ]
          : [],
      ),
      favorabilityLevels: bond.completionConditions.flatMap((condition) =>
        condition.favorability ? [condition.favorability.requiredLevel] : [],
      ),
      missionDescriptions: bond.completionConditions.flatMap((condition) =>
        condition.mission?.desc ? [condition.mission.desc] : [],
      ),
    })),
    exclusiveEquipment: source.exclusiveEquipment
      ? {
          status: source.exclusiveEquipment.status,
          equipmentId: source.exclusiveEquipment.equipmentId,
          displayName: source.exclusiveEquipment.nameKr ?? source.exclusiveEquipment.nameCn,
          nameCn: source.exclusiveEquipment.nameCn,
          localizationPending: source.exclusiveEquipment.nameKr === null,
          description: cleanRichText(source.exclusiveEquipment.descCn),
          iconSourcePath: source.exclusiveEquipment.icon,
        }
      : null,
    centralDiscipline: source.centralDiscipline
      ? {
          status: source.centralDiscipline.status,
          skillId: source.centralDiscipline.skillId,
          nameCn: source.centralDiscipline.nameCn,
          description: cleanRichText(source.centralDiscipline.descCn),
          iconSourcePath: source.centralDiscipline.icon,
          unlock: source.centralDiscipline.unlock,
        }
      : null,
    soldiers,
    sp: source.sp
      ? {
          status: source.sp.status,
          sourceNameCn: source.sp.sourceNameCn,
          job: source.sp.job,
          missionCounts: {
            firstStage: source.sp.missions.firstStage.length,
            secondStage: source.sp.missions.secondStage.length,
            total: source.sp.missions.firstStage.length + source.sp.missions.secondStage.length,
          },
          rewardBuff: {
            buffId: source.sp.secondStageRewards.buff.buffId,
            nameCn: source.sp.secondStageRewards.buff.nameCn,
            description: cleanRichText(source.sp.secondStageRewards.buff.descCn),
          },
          rewardSkills: source.sp.secondStageRewards.skills.map(projectSkill),
          rewardSoldiers: source.sp.secondStageRewards.soldiers.map((soldier) => ({
            soldierId: soldier.soldierId,
            displayName: soldier.nameKr ?? soldier.nameCn,
            nameCn: soldier.nameCn,
            localizationPending: soldier.nameKr === null,
            tier: soldier.tier,
            armyType: soldier.armyType,
            validationStatus: soldier.validationStatus,
          })),
        }
      : null,
    validation: source.validation,
  };
}

export function readHeroPrototypePageData(heroId: number): HeroPrototypePageData | null {
  if (heroId !== leon.heroId) return null;
  return projectHero(leon);
}
