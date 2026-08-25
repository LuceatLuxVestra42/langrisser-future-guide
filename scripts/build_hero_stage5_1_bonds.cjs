'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONFIG = path.join(DATA, 'configdata');
const GENERATED = path.join(DATA, 'generated');
const VALIDATION = path.join(DATA, 'validation');

const OUT_DATA = path.join(GENERATED, 'hero-page-stage5-1-bonds.v1.json');
const OUT_AUDIT = path.join(VALIDATION, 'hero-page-stage5-1-production-candidate.v1.json');
const SEMANTIC_CHECKPOINT = path.join(VALIDATION, 'hero-page-stage5-1-retrace-semantic.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function records(file) {
  const raw = readJson(file);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  throw new Error(`No records array: ${file}`);
}

function nums(v) {
  return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
}

function unique(values) {
  return [...new Set(values)];
}

function inc(map, key) {
  map.set(String(key), (map.get(String(key)) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })
  ));
}

function identity(row) {
  return {
    heroId: Number(row.heroId),
    nameKr: row.nameKr ?? null,
    nameCn: row.nameCn ?? null,
    nameEn: row.nameEn ?? null,
  };
}

function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

const heroNames = records(path.join(DATA, 'hero-name-master.v1.json'));
const heroInfos = records(path.join(CONFIG, 'ConfigDataHeroInformationInfo.json'));
const fetters = records(path.join(CONFIG, 'ConfigDataHeroFetterInfo.json'));
const missions = records(path.join(CONFIG, 'ConfigDataMissionInfo.json'));
const dungeons = records(path.join(CONFIG, 'ConfigDataHeroDungeonLevelInfo.json'));
const semantic = readJson(SEMANTIC_CHECKPOINT);

const canonicalIds = new Set(heroNames.map(r => Number(r.heroId)));
const heroNameById = new Map(heroNames.map(r => [Number(r.heroId), r]));
const heroInfoGroups = new Map();
for (const row of heroInfos) {
  const id = Number(row.ID);
  if (!heroInfoGroups.has(id)) heroInfoGroups.set(id, []);
  heroInfoGroups.get(id).push(row);
}
const fetterById = new Map(fetters.map(r => [Number(r.ID), r]));
const missionById = new Map(missions.map(r => [Number(r.ID), r]));
const dungeonById = new Map(dungeons.map(r => [Number(r.ID), r]));

// Reverse ownership only through canonical HeroInformation records. Noncanonical
// duplicate/legacy HeroInformation rows must not contaminate production ownership.
const canonicalFetterOwners = new Map();
const canonicalDungeonOwners = new Map();
for (const heroId of canonicalIds) {
  const group = heroInfoGroups.get(heroId) || [];
  if (group.length !== 1) continue;
  const info = group[0];
  for (const fetterId of nums(info.HeroFetters_ID)) {
    if (!canonicalFetterOwners.has(fetterId)) canonicalFetterOwners.set(fetterId, []);
    canonicalFetterOwners.get(fetterId).push(heroId);
  }
  for (const dungeonId of nums(info.DungeonLevels_ID)) {
    if (!canonicalDungeonOwners.has(dungeonId)) canonicalDungeonOwners.set(dungeonId, []);
    canonicalDungeonOwners.get(dungeonId).push(heroId);
  }
}

const issues = {
  missingHeroInformation: [],
  duplicateHeroInformation: [],
  unexpectedFetterCount: [],
  unresolvedFetter: [],
  nonSingleCanonicalFetterOwner: [],
  unresolvedMission: [],
  unresolvedStage: [],
  requiredHeroZero: [],
  requiredHeroMultiple: [],
};

const conditionTypeDist = new Map();
const conditionTypeParamShapeDist = new Map();
const missionTypeDist = new Map();
const type5Param2Dist = new Map();
const fetterCountDist = new Map();
const type1Parm1SelfCount = { yes: 0, no: 0 };
const type1Parm2Values = new Map();
const type1Samples = [];

let totalFetterRefs = 0;
let totalConditions = 0;
let type2ConditionCount = 0;
let requiredHeroResolvedCount = 0;

function heroRef(id) {
  const row = heroNameById.get(Number(id));
  return row ? identity(row) : { heroId: Number(id), nameKr: null, nameCn: null, nameEn: null };
}

function resolveCondition(ownerHeroId, fetterId, condition, conditionIndex) {
  totalConditions += 1;
  const type = Number(condition.ConditionType);
  inc(conditionTypeDist, Number.isFinite(type) ? type : 'null');
  const presentParms = ['Parm1', 'Parm2', 'Parm3', 'Parm4', 'Parm5'].filter(k => own(condition, k));
  inc(conditionTypeParamShapeDist, `${Number.isFinite(type) ? type : 'null'}:${presentParms.join('+') || 'none'}`);

  const raw = {
    conditionType: Number.isFinite(type) ? type : condition.ConditionType ?? null,
    parm1: own(condition, 'Parm1') ? condition.Parm1 : null,
    parm2: own(condition, 'Parm2') ? condition.Parm2 : null,
    parm3: own(condition, 'Parm3') ? condition.Parm3 : null,
    parm4: own(condition, 'Parm4') ? condition.Parm4 : null,
    parm5: own(condition, 'Parm5') ? condition.Parm5 : null,
  };

  if (type === 1) {
    const parm1 = Number(condition.Parm1);
    const parm2 = Number(condition.Parm2);
    if (parm1 === ownerHeroId) type1Parm1SelfCount.yes += 1;
    else type1Parm1SelfCount.no += 1;
    inc(type1Parm2Values, Number.isFinite(parm2) ? parm2 : 'null');
    if (type1Samples.length < 30) {
      type1Samples.push({ ownerHeroId, fetterId, conditionIndex, parm1: raw.parm1, parm2: raw.parm2 });
    }
    return {
      ...raw,
      semanticStatus: 'SOURCE_PRESERVED_SEMANTICS_PENDING',
      requiredHero: null,
      mission: null,
      stage: null,
    };
  }

  if (type !== 2) {
    return {
      ...raw,
      semanticStatus: 'SOURCE_PRESERVED_UNKNOWN_CONDITION_TYPE',
      requiredHero: null,
      mission: null,
      stage: null,
    };
  }

  type2ConditionCount += 1;
  const missionId = Number(condition.Parm1);
  const mission = missionById.get(missionId) || null;
  if (!mission) {
    issues.unresolvedMission.push({ ownerHeroId, fetterId, conditionIndex, missionId });
    return {
      ...raw,
      semanticStatus: 'UNRESOLVED_MISSION',
      requiredHero: null,
      mission: { missionId },
      stage: null,
    };
  }

  const missionType = Number(mission.MissionType);
  const param1 = own(mission, 'Param1') ? Number(mission.Param1) : null;
  const param2 = own(mission, 'Param2') ? Number(mission.Param2) : null;
  const param3 = own(mission, 'Param3') ? Number(mission.Param3) : null;
  inc(missionTypeDist, Number.isFinite(missionType) ? missionType : 'null');
  if (missionType === 5) inc(type5Param2Dist, Number.isFinite(param2) ? param2 : 'null');

  let stage = null;
  let requiredHero = null;
  let semanticStatus = 'MISSION_RESOLVED_NO_EXTERNAL_REQUIRED_HERO';

  if (missionType === 5 && param2 === 6) {
    const stageId = param3;
    const dungeon = Number.isFinite(stageId) ? (dungeonById.get(stageId) || null) : null;
    if (!dungeon) {
      issues.unresolvedStage.push({ ownerHeroId, fetterId, conditionIndex, missionId, stageId });
      semanticStatus = 'UNRESOLVED_STAGE';
    } else {
      const stageOwnerIds = unique(canonicalDungeonOwners.get(stageId) || []);
      const candidates = unique([
        ...(Number.isFinite(param1) && canonicalIds.has(param1) ? [param1] : []),
        ...stageOwnerIds.filter(id => canonicalIds.has(id)),
      ]).filter(id => id !== ownerHeroId);

      stage = {
        stageId,
        nameCn: dungeon.Name ?? null,
        canonicalOwnerHeroIds: stageOwnerIds,
      };

      if (candidates.length === 1) {
        requiredHero = heroRef(candidates[0]);
        requiredHeroResolvedCount += 1;
        semanticStatus = 'REQUIRED_HERO_RESOLVED';
      } else if (candidates.length === 0) {
        issues.requiredHeroZero.push({ ownerHeroId, fetterId, conditionIndex, missionId, param1, stageId, stageOwnerIds });
        semanticStatus = 'REQUIRED_HERO_ZERO_CANDIDATE';
      } else {
        issues.requiredHeroMultiple.push({ ownerHeroId, fetterId, conditionIndex, missionId, param1, stageId, stageOwnerIds, candidates });
        semanticStatus = 'REQUIRED_HERO_MULTIPLE_CANDIDATES';
      }
    }
  }

  return {
    ...raw,
    semanticStatus,
    requiredHero,
    mission: {
      missionId,
      title: mission.Title ?? null,
      desc: mission.Desc ?? null,
      missionType: mission.MissionType ?? null,
      param1: own(mission, 'Param1') ? mission.Param1 : null,
      param2: own(mission, 'Param2') ? mission.Param2 : null,
      param3: own(mission, 'Param3') ? mission.Param3 : null,
    },
    stage,
  };
}

const outputHeroes = [];
for (const nameRow of heroNames) {
  const heroId = Number(nameRow.heroId);
  const infoGroup = heroInfoGroups.get(heroId) || [];
  if (infoGroup.length === 0) {
    issues.missingHeroInformation.push(heroId);
    outputHeroes.push({ ...identity(nameRow), sourceHeroInformationId: null, bonds: [] });
    continue;
  }
  if (infoGroup.length !== 1) {
    issues.duplicateHeroInformation.push({ heroId, count: infoGroup.length });
  }
  const info = infoGroup[0];
  const fetterIds = nums(info.HeroFetters_ID);
  inc(fetterCountDist, fetterIds.length);
  totalFetterRefs += fetterIds.length;
  if (fetterIds.length !== 5) issues.unexpectedFetterCount.push({ heroId, count: fetterIds.length, fetterIds });

  const bonds = fetterIds.map((fetterId, bondIndex) => {
    const ownerIds = unique((canonicalFetterOwners.get(fetterId) || []).filter(id => canonicalIds.has(id)));
    if (ownerIds.length !== 1 || ownerIds[0] !== heroId) {
      issues.nonSingleCanonicalFetterOwner.push({ heroId, fetterId, canonicalOwnerIds: ownerIds });
    }
    const f = fetterById.get(fetterId) || null;
    if (!f) {
      issues.unresolvedFetter.push({ heroId, fetterId });
      return { order: bondIndex, fetterId, sourceResolved: false };
    }
    const conditions = (Array.isArray(f.CompletionConditions) ? f.CompletionConditions : [])
      .map((c, conditionIndex) => resolveCondition(heroId, fetterId, c, conditionIndex));
    return {
      order: bondIndex,
      fetterId,
      sourceResolved: true,
      nameCn: f.Name ?? null,
      icon: f.Icon ?? null,
      maxLevel: f.MaxLevel ?? null,
      completionConditions: conditions,
      reward: Array.isArray(f.Reward) ? f.Reward : [],
      gotSkillIds: nums(f.GotSkills_ID),
      levelUpMaterials: Array.isArray(f.LevelUpMaterials) ? f.LevelUpMaterials : [],
      levelUpGold: Array.isArray(f.LevelUpGold) ? f.LevelUpGold : [],
    };
  });

  outputHeroes.push({
    ...identity(nameRow),
    sourceHeroInformationId: Number(info.ID),
    heroHeartFetterId: own(info, 'HeroHeartFetterId') ? info.HeroHeartFetterId : null,
    heroFetterIds: fetterIds,
    bonds,
  });
}

const hardStructuralErrors = [
  ...issues.missingHeroInformation.map(x => ({ type: 'missingHeroInformation', value: x })),
  ...issues.duplicateHeroInformation.map(x => ({ type: 'duplicateHeroInformation', value: x })),
  ...issues.unexpectedFetterCount.map(x => ({ type: 'unexpectedFetterCount', value: x })),
  ...issues.unresolvedFetter.map(x => ({ type: 'unresolvedFetter', value: x })),
  ...issues.nonSingleCanonicalFetterOwner.map(x => ({ type: 'nonSingleCanonicalFetterOwner', value: x })),
  ...issues.unresolvedMission.map(x => ({ type: 'unresolvedMission', value: x })),
  ...issues.unresolvedStage.map(x => ({ type: 'unresolvedStage', value: x })),
  ...issues.requiredHeroZero.map(x => ({ type: 'requiredHeroZero', value: x })),
  ...issues.requiredHeroMultiple.map(x => ({ type: 'requiredHeroMultiple', value: x })),
];

const expected = {
  canonicalHeroCount: Number(semantic?.scope?.canonicalHeroCount ?? 267),
  canonicalType2Rows: Number(semantic?.scope?.canonicalOwnedRows ?? 1064),
  type5Param2_6Rows: Number(semantic?.validation?.missionType5Param2_6Rows ?? 338),
  requiredHeroResolvedRows: Number(semantic?.validation?.exactlyOneRequiredHero ?? 338),
};

const invariantChecks = [
  { name: 'canonical hero count', expected: expected.canonicalHeroCount, actual: heroNames.length, pass: heroNames.length === expected.canonicalHeroCount },
  { name: 'output hero count', expected: expected.canonicalHeroCount, actual: outputHeroes.length, pass: outputHeroes.length === expected.canonicalHeroCount },
  { name: 'canonical ConditionType=2 count', expected: expected.canonicalType2Rows, actual: type2ConditionCount, pass: type2ConditionCount === expected.canonicalType2Rows },
  { name: 'MissionType=5 Param2=6 count', expected: expected.type5Param2_6Rows, actual: Number(type5Param2Dist.get('6') || 0), pass: Number(type5Param2Dist.get('6') || 0) === expected.type5Param2_6Rows },
  { name: 'resolved required-Hero count', expected: expected.requiredHeroResolvedRows, actual: requiredHeroResolvedCount, pass: requiredHeroResolvedCount === expected.requiredHeroResolvedRows },
  { name: 'hard structural error count', expected: 0, actual: hardStructuralErrors.length, pass: hardStructuralErrors.length === 0 },
];

const unknownConditionTypes = [...conditionTypeDist.keys()].filter(k => !['1', '2'].includes(String(k)));
const type1ConditionCount = Number(conditionTypeDist.get('1') || 0);
const type1SemanticsPending = type1ConditionCount > 0;
const semanticCoverage = {
  conditionType1: type1SemanticsPending ? 'SOURCE_PRESERVED_SEMANTICS_PENDING' : 'NOT_PRESENT',
  conditionType2: 'MISSION_JOIN_AND_REQUIRED_HERO_RESOLVER_VERIFIED',
  unknownConditionTypes,
};

const dataDoc = {
  version: 1,
  stage: 'hero-page-5-1',
  artifact: 'hero-bond-production-candidate',
  sourcePolicy: 'Canonical Hero IDs come from hero-name-master; HeroInformation exact-ID ownership and source HeroFetter order are preserved. No name/pattern fallback joins are used.',
  semanticCoverage,
  recordCount: outputHeroes.length,
  records: outputHeroes,
};

const auditStatus = hardStructuralErrors.length || invariantChecks.some(x => !x.pass)
  ? 'FAIL'
  : (type1SemanticsPending || unknownConditionTypes.length ? 'REVIEW' : 'PASS');

const audit = {
  version: 1,
  stage: 'hero-page-5-1',
  checkpoint: 'production-candidate',
  status: auditStatus,
  completion: auditStatus === 'PASS' ? 'READY_FOR_FINAL_GATE' : 'PRODUCTION_CANDIDATE_BUILT',
  purpose: 'Build the 267-Hero bond block from current ConfigData while refusing to fabricate unresolved CompletionCondition semantics.',
  inputs: [
    'data/hero-name-master.v1.json',
    'data/configdata/ConfigDataHeroInformationInfo.json',
    'data/configdata/ConfigDataHeroFetterInfo.json',
    'data/configdata/ConfigDataMissionInfo.json',
    'data/configdata/ConfigDataHeroDungeonLevelInfo.json',
    'data/validation/hero-page-stage5-1-retrace-semantic.v1.json'
  ],
  outputs: ['data/generated/hero-page-stage5-1-bonds.v1.json'],
  summary: {
    canonicalHeroCount: heroNames.length,
    outputHeroCount: outputHeroes.length,
    totalFetterRefs,
    heroFetterCountDistribution: sortedObject(fetterCountDist),
    totalCompletionConditions: totalConditions,
    conditionTypeDistribution: sortedObject(conditionTypeDist),
    conditionTypeParamShapeDistribution: sortedObject(conditionTypeParamShapeDist),
    type2ConditionCount,
    type2MissionTypeDistribution: sortedObject(missionTypeDist),
    type5Param2Distribution: sortedObject(type5Param2Dist),
    requiredHeroResolvedCount,
    type1ConditionCount,
    type1Parm1EqualsOwner: type1Parm1SelfCount,
    type1Parm2Distribution: sortedObject(type1Parm2Values),
    unknownConditionTypes,
    hardStructuralErrorCount: hardStructuralErrors.length,
  },
  semanticCoverage,
  type1RepresentativeSamples: type1Samples,
  invariantChecks,
  issues,
  hardStructuralErrors,
  decision: auditStatus === 'PASS'
    ? 'All CompletionCondition semantics required by the production contract are covered; proceed to the final Stage 5-1 gate.'
    : auditStatus === 'REVIEW'
      ? 'The 267-Hero production block is structurally clean, but at least one CompletionCondition type remains source-preserved without a frozen semantic interpretation. Trace that type before declaring Stage 5-1 COMPLETE.'
      : 'Do not freeze Stage 5-1. Fix structural/reference failures first.'
};

fs.mkdirSync(GENERATED, { recursive: true });
fs.mkdirSync(VALIDATION, { recursive: true });
fs.writeFileSync(OUT_DATA, JSON.stringify(dataDoc, null, 2) + '\n');
fs.writeFileSync(OUT_AUDIT, JSON.stringify(audit, null, 2) + '\n');

console.log(JSON.stringify({
  status: audit.status,
  completion: audit.completion,
  summary: audit.summary,
  invariantChecks: audit.invariantChecks,
  decision: audit.decision,
  outputs: audit.outputs.concat(['data/validation/hero-page-stage5-1-production-candidate.v1.json'])
}, null, 2));

if (auditStatus === 'FAIL') process.exitCode = 1;
