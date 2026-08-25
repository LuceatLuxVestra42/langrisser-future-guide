'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const C = (name) => path.join(ROOT, 'data', 'configdata', name);
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');
const TARGET_MISSIONS = [5003, 5004, 5007, 5008, 5011, 5012];

function records(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  throw new Error(`No records array in ${file}`);
}

function nums(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

const heroInfos = records(C('ConfigDataHeroInformationInfo.json'));
const fetters = records(C('ConfigDataHeroFetterInfo.json'));
const missions = records(C('ConfigDataMissionInfo.json'));
const dungeons = records(C('ConfigDataHeroDungeonLevelInfo.json'));
const heroNames = records(path.join(ROOT, 'data', 'hero-name-master.v1.json'));

const heroNameById = new Map(heroNames.map((r) => [Number(r.heroId), {
  nameKr: r.nameKr ?? null,
  nameCn: r.nameCn ?? null,
  nameEn: r.nameEn ?? null,
}]));
const missionById = new Map(missions.map((r) => [Number(r.ID), r]));
const dungeonById = new Map(dungeons.map((r) => [Number(r.ID), r]));

const dungeonOwners = new Map();
const fetterOwners = new Map();
for (const h of heroInfos) {
  const heroId = Number(h.ID);
  for (const dungeonId of nums(h.DungeonLevels_ID)) {
    if (!dungeonOwners.has(dungeonId)) dungeonOwners.set(dungeonId, []);
    dungeonOwners.get(dungeonId).push(heroId);
  }
  for (const fetterId of nums(h.HeroFetters_ID)) {
    if (!fetterOwners.has(fetterId)) fetterOwners.set(fetterId, []);
    fetterOwners.get(fetterId).push(heroId);
  }
}

function heroRef(id) {
  const n = Number(id);
  const name = heroNameById.get(n) || {};
  return { heroId: n, ...name };
}

function conditionMissionIds(row) {
  const out = [];
  for (const c of (Array.isArray(row.CompletionConditions) ? row.CompletionConditions : [])) {
    if (Number(c.ConditionType) === 2 && Number.isFinite(Number(c.Parm1))) out.push(Number(c.Parm1));
  }
  return out;
}

const missionToFetters = new Map();
for (const f of fetters) {
  for (const missionId of conditionMissionIds(f)) {
    if (!missionToFetters.has(missionId)) missionToFetters.set(missionId, []);
    missionToFetters.get(missionId).push(Number(f.ID));
  }
}

const samples = TARGET_MISSIONS.map((missionId) => {
  const mission = missionById.get(missionId) || null;
  const stageId = mission && Number(mission.Param2) === 6 && Number.isFinite(Number(mission.Param3))
    ? Number(mission.Param3)
    : null;
  const stage = stageId != null ? dungeonById.get(stageId) || null : null;
  const fetterIds = missionToFetters.get(missionId) || [];
  const ownerHeroIds = [...new Set(fetterIds.flatMap((id) => fetterOwners.get(id) || []))].sort((a, b) => a - b);
  const stageOwnerHeroIds = stageId != null ? [...new Set(dungeonOwners.get(stageId) || [])].sort((a, b) => a - b) : [];
  const param1HeroId = mission && Number.isFinite(Number(mission.Param1)) ? Number(mission.Param1) : null;

  return {
    missionId,
    mission: mission ? {
      Title: mission.Title ?? null,
      Desc: mission.Desc ?? null,
      MissionType: mission.MissionType ?? null,
      Param1: mission.Param1 ?? null,
      Param2: mission.Param2 ?? null,
      Param3: mission.Param3 ?? null,
      Param4: mission.Param4 ?? null,
      Param5: mission.Param5 ?? null,
    } : null,
    fetterIds,
    fetterOwners: ownerHeroIds.map(heroRef),
    param1Hero: param1HeroId != null ? heroRef(param1HeroId) : null,
    stage: stage ? {
      ID: stage.ID,
      Name: stage.Name ?? null,
      Desc: stage.Desc ?? null,
      Battle_ID: stage.Battle_ID ?? null,
      PreLevel_ID: stage.PreLevel_ID ?? null,
      HeroFragment_ID: stage.HeroFragment_ID ?? null,
    } : null,
    stageOwners: stageOwnerHeroIds.map(heroRef),
    relations: {
      param1EqualsFetterOwner: param1HeroId != null && ownerHeroIds.includes(param1HeroId),
      param1EqualsStageOwner: param1HeroId != null && stageOwnerHeroIds.includes(param1HeroId),
      fetterOwnerEqualsStageOwner: ownerHeroIds.some((id) => stageOwnerHeroIds.includes(id)),
      otherHeroesRelativeToFetterOwner: [...new Set([
        ...(param1HeroId != null && !ownerHeroIds.includes(param1HeroId) ? [param1HeroId] : []),
        ...stageOwnerHeroIds.filter((id) => !ownerHeroIds.includes(id)),
      ])].sort((a, b) => a - b).map(heroRef),
    },
  };
});

const discrepancy5012 = samples.find((x) => x.missionId === 5012) || null;

const result = {
  version: 5,
  status: samples.every((s) => s.mission && s.fetterOwners.length) ? 'REPRESENTATIVE_JOIN_BUILT' : 'PARTIAL',
  purpose: 'Establish representative HeroFetter -> Mission -> Param1 hero -> HeroDungeon stage owner joins before defining required-character semantics.',
  sources: [
    'data/configdata/ConfigDataHeroInformationInfo.json',
    'data/configdata/ConfigDataHeroFetterInfo.json',
    'data/configdata/ConfigDataMissionInfo.json',
    'data/configdata/ConfigDataHeroDungeonLevelInfo.json',
    'data/hero-name-master.v1.json',
  ],
  counts: {
    heroInformation: heroInfos.length,
    fetters: fetters.length,
    missions: missions.length,
    heroDungeonLevels: dungeons.length,
    heroNames: heroNames.length,
  },
  samples,
  discrepancy5012,
  interpretationGuardrail: 'Do not collapse Param1 hero, Fetter owner, and HeroDungeon owner into one requiredHero field until representative relations are reviewed. Preserve all three roles.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify({
  status: result.status,
  counts: result.counts,
  samples: samples.map((s) => ({
    missionId: s.missionId,
    desc: s.mission?.Desc,
    type: s.mission?.MissionType,
    param1: s.param1Hero,
    param2: s.mission?.Param2,
    param3: s.mission?.Param3,
    fetterOwners: s.fetterOwners,
    stage: s.stage,
    stageOwners: s.stageOwners,
    relations: s.relations,
  })),
}, null, 2));
