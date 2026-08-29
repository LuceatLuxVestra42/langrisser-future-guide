import fs from 'node:fs';
import path from 'node:path';

const HERO_LIST_PATH = 'data/generated/hero-list-stage1.v1.json';
const HERO_DETAIL_DIR = 'data/generated/hero-detail/by-id';
const SKILL_INFO_PATH = 'data/configdata/ConfigDataSkillInfo.json';
const OUTPUT_PATH = 'data/generated/hero-fusion-power-presentation.v1.json';

const heroList = JSON.parse(fs.readFileSync(HERO_LIST_PATH, 'utf8'));
const skillInfo = JSON.parse(fs.readFileSync(SKILL_INFO_PATH, 'utf8'));

if (heroList?.freezeState !== 'HERO_LIST_STAGE1_FROZEN' || heroList?.summary?.canonicalHeroCount !== 267 || heroList?.summary?.generatedRecordCount !== 267 || heroList?.records?.length !== 267) {
  throw new Error('Hero fusion projection requires frozen Hero List Stage 1 (267/267).');
}

const heroListById = new Map(heroList.records.map((row) => [Number(row.heroId), row]));
const skillById = new Map(skillInfo.map((row, index) => [Number(row.ID), { row, index }]));
const records = [];
const heroIds = new Set();
const skillIds = new Set();

for (const fileName of fs.readdirSync(HERO_DETAIL_DIR).filter((name) => /^\d+\.json$/.test(name))) {
  const shard = JSON.parse(fs.readFileSync(path.join(HERO_DETAIL_DIR, fileName), 'utf8'));
  const heroId = Number(shard.heroId);
  const listHero = heroListById.get(heroId);
  if (!listHero) throw new Error(`Hero ${heroId} detail shard has no frozen Stage 1 row.`);

  for (const acquisition of shard.normal?.skills?.jobLevelAcquisitions ?? []) {
    if (acquisition?.skill?.displayType !== '超绝强化') continue;

    const skillId = Number(acquisition.skill.skillId);
    const found = skillById.get(skillId);
    if (!found) throw new Error(`Hero ${heroId} fusion skill ${skillId} missing ConfigDataSkillInfo row.`);
    const raw = found.row;

    if (raw.SkillType !== 14 || raw.SkillTypeParam1 !== 2 || !Number.isInteger(raw.SkillTypeParam2)) {
      throw new Error(`Hero ${heroId} fusion skill ${skillId} violates explicit SkillType relation contract.`);
    }
    if (heroIds.has(heroId)) throw new Error(`Hero ${heroId} has multiple fusion-power projection rows.`);
    if (skillIds.has(skillId)) throw new Error(`Fusion skill ${skillId} is owned by multiple Hero rows.`);

    const targetFactionId = Number(raw.SkillTypeParam2);
    const targetFaction = (listHero.factions ?? []).find((faction) => Number(faction.factionId) === targetFactionId);
    if (!targetFaction) {
      throw new Error(`Hero ${heroId} target faction ${targetFactionId} is absent from frozen Hero faction rows.`);
    }
    if (!String(targetFaction.iconSourcePath ?? '').startsWith('UI/Icon/KeyWord_ABS/Icon_Group_')) {
      throw new Error(`Hero ${heroId} target faction ${targetFactionId} has invalid exact icon locator.`);
    }

    heroIds.add(heroId);
    skillIds.add(skillId);
    records.push({
      heroId,
      heroNameCn: listHero.identity?.nameCn ?? shard.identity?.nameCn ?? null,
      heroNameKr: listHero.identity?.nameKr ?? shard.identity?.nameKr ?? null,
      skillId,
      skillInfoRecordIndex: found.index,
      skillType: raw.SkillType,
      skillTypeParam1: raw.SkillTypeParam1,
      skillTypeParam2: raw.SkillTypeParam2,
      targetFactionId,
      factionNameCn: targetFaction.nameCn ?? null,
      factionNameKr: targetFaction.nameKr ?? null,
      iconSourcePath: targetFaction.iconSourcePath,
      webAssetPath: `/images/factions/${targetFactionId}.png`,
      localAssetPath: `public/images/factions/${targetFactionId}.png`,
      relationStatus: 'RESOLVED',
    });
  }
}

records.sort((a, b) => a.heroId - b.heroId);
const factionIds = new Set(records.map((row) => row.targetFactionId));
if (records.length !== 35 || heroIds.size !== 35 || skillIds.size !== 35 || factionIds.size !== 12) {
  throw new Error(`Hero fusion projection population drift: ${JSON.stringify({records:records.length, heroes:heroIds.size, skills:skillIds.size, factions:factionIds.size})}`);
}
for (let factionId = 1; factionId <= 12; factionId += 1) {
  if (!factionIds.has(factionId)) throw new Error(`Faction ${factionId} is missing from the 12-faction fusion target set.`);
}

const output = {
  version: 1,
  stage: 'hero-fusion-power-presentation',
  schemaId: 'hero-fusion-power-presentation/v1',
  status: 'PASS',
  completion: 'COMPLETE',
  freezeState: 'HERO_FUSION_POWER_PRESENTATION_FROZEN',
  source: {
    heroList: HERO_LIST_PATH,
    heroListFreezeState: heroList.freezeState,
    heroDetailShardRoot: HERO_DETAIL_DIR,
    skillInfo: SKILL_INFO_PATH,
    relationField: 'ConfigDataSkillInfo.SkillTypeParam2',
    factionIconLocatorField: 'HeroListStage1.factions[].iconSourcePath',
  },
  policy: {
    candidateEdge: 'frozen Hero detail normal.skills.jobLevelAcquisitions',
    displayTypeGate: '超绝强化',
    requiredSkillType: 14,
    requiredSkillTypeParam1: 2,
    targetFactionField: 'SkillTypeParam2',
    descriptionParsing: false,
    skillNameInference: false,
    skillIconNameInference: false,
    heroNameJoin: false,
    idArithmetic: false,
    semanticStageReopened: false,
    productionRawConfigFallback: false,
  },
  summary: {
    canonicalHeroCount: 267,
    fusionPowerHeroCount: 35,
    uniqueHeroCount: heroIds.size,
    uniqueSkillCount: skillIds.size,
    uniqueTargetFactionCount: factionIds.size,
    factionAssetCount: 12,
    pendingCount: 0,
    hardErrorCount: 0,
  },
  records,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({status:'PASS_HERO_FUSION_POWER_PRESENTATION', ...output.summary, representative: records.filter((row) => [6,12,25,55,110].includes(row.heroId))}, null, 2));
