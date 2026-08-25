'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const C = (name) => path.join(ROOT, 'data', 'configdata', name);
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');

function records(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  throw new Error(`No records array in ${file}`);
}
function nums(v) { return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []; }
function inc(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function mapObj(map) { return Object.fromEntries([...map.entries()].sort((a,b) => String(a[0]).localeCompare(String(b[0]), undefined, {numeric:true}))); }

const heroInfos = records(C('ConfigDataHeroInformationInfo.json'));
const fetters = records(C('ConfigDataHeroFetterInfo.json'));
const missions = records(C('ConfigDataMissionInfo.json'));
const dungeons = records(C('ConfigDataHeroDungeonLevelInfo.json'));
const heroNames = records(path.join(ROOT, 'data', 'hero-name-master.v1.json'));

const canonicalIds = new Set(heroNames.map((r) => Number(r.heroId)));
const heroNameById = new Map(heroNames.map((r) => [Number(r.heroId), r.nameKr || r.nameCn || String(r.heroId)]));
const missionById = new Map(missions.map((r) => [Number(r.ID), r]));
const dungeonById = new Map(dungeons.map((r) => [Number(r.ID), r]));
const fetterById = new Map(fetters.map((r) => [Number(r.ID), r]));

const fetterOwners = new Map();
const dungeonOwners = new Map();
for (const h of heroInfos) {
  const hid = Number(h.ID);
  for (const fid of nums(h.HeroFetters_ID)) {
    if (!fetterOwners.has(fid)) fetterOwners.set(fid, []);
    fetterOwners.get(fid).push(hid);
  }
  for (const did of nums(h.DungeonLevels_ID)) {
    if (!dungeonOwners.has(did)) dungeonOwners.set(did, []);
    dungeonOwners.get(did).push(hid);
  }
}

const rows = [];
for (const f of fetters) {
  const fid = Number(f.ID);
  const owners = [...new Set(fetterOwners.get(fid) || [])];
  for (const [conditionIndex, c] of (Array.isArray(f.CompletionConditions) ? f.CompletionConditions : []).entries()) {
    if (Number(c.ConditionType) !== 2) continue;
    const missionId = Number(c.Parm1);
    const mission = missionById.get(missionId) || null;
    const param1 = mission && Number.isFinite(Number(mission.Param1)) ? Number(mission.Param1) : null;
    const param1IsCanonicalHero = param1 != null && canonicalIds.has(param1);
    const hasDungeonParam = mission && Number(mission.Param2) === 6 && Number.isFinite(Number(mission.Param3));
    const stageId = hasDungeonParam ? Number(mission.Param3) : null;
    const stage = stageId != null ? dungeonById.get(stageId) || null : null;
    const stageOwnerIds = stageId != null ? [...new Set(dungeonOwners.get(stageId) || [])] : [];
    const knownHeroRefs = [...new Set([
      ...(param1IsCanonicalHero ? [param1] : []),
      ...stageOwnerIds.filter((id) => canonicalIds.has(id)),
    ])];
    const externalHeroIds = knownHeroRefs.filter((id) => !owners.includes(id));
    rows.push({
      fetterId: fid,
      fetterName: f.Name ?? null,
      conditionIndex,
      owners,
      ownerNames: owners.map((id) => heroNameById.get(id) || null),
      missionId,
      missionResolved: !!mission,
      missionType: mission?.MissionType ?? null,
      missionDesc: mission?.Desc ?? null,
      param1,
      param1IsCanonicalHero,
      param1Name: param1IsCanonicalHero ? heroNameById.get(param1) || null : null,
      param2: mission?.Param2 ?? null,
      param3: mission?.Param3 ?? null,
      stageId,
      stageResolved: stageId == null ? null : !!stage,
      stageName: stage?.Name ?? null,
      stageOwnerIds,
      stageOwnerNames: stageOwnerIds.map((id) => heroNameById.get(id) || null),
      externalHeroIds,
      externalHeroNames: externalHeroIds.map((id) => heroNameById.get(id) || null),
    });
  }
}

const missionTypeDist = new Map();
const missionTypeParam2Dist = new Map();
const externalCountDist = new Map();
for (const r of rows) {
  inc(missionTypeDist, String(r.missionType));
  inc(missionTypeParam2Dist, `${r.missionType}/${r.param2}`);
  inc(externalCountDist, String(r.externalHeroIds.length));
}

const unresolvedMission = rows.filter((r) => !r.missionResolved);
const unresolvedDungeon = rows.filter((r) => r.stageId != null && !r.stageResolved);
const dungeonWithoutOwner = rows.filter((r) => r.stageId != null && r.stageResolved && r.stageOwnerIds.length === 0);
const multiFetterOwner = rows.filter((r) => r.owners.length !== 1);
const externalZero = rows.filter((r) => r.externalHeroIds.length === 0);
const externalMulti = rows.filter((r) => r.externalHeroIds.length > 1);
const nonCanonicalParam1 = rows.filter((r) => r.param1 != null && !r.param1IsCanonicalHero);

const typeSummaries = {};
for (const type of [...new Set(rows.map((r) => String(r.missionType)))].sort()) {
  const group = rows.filter((r) => String(r.missionType) === type);
  typeSummaries[type] = {
    count: group.length,
    param2Distribution: mapObj(group.reduce((m,r)=>(inc(m,String(r.param2)),m), new Map())),
    param1CanonicalHeroCount: group.filter((r) => r.param1IsCanonicalHero).length,
    externalHeroCountDistribution: mapObj(group.reduce((m,r)=>(inc(m,String(r.externalHeroIds.length)),m), new Map())),
    examples: group.slice(0, 8).map((r) => ({ missionId:r.missionId, desc:r.missionDesc, owners:r.ownerNames, param1:r.param1Name, param2:r.param2, param3:r.param3, stage:r.stageName, stageOwners:r.stageOwnerNames, external:r.externalHeroNames })),
  };
}

const result = {
  version: 6,
  status: unresolvedMission.length || unresolvedDungeon.length || dungeonWithoutOwner.length || multiFetterOwner.length ? 'HAS_JOIN_ERRORS' : 'JOIN_CLEAN',
  purpose: 'Validate all HeroFetter Mission(ConditionType=2) joins and test whether external related heroes can be derived as known hero references minus the Fetter owner.',
  counts: {
    type2ConditionCount: rows.length,
    uniqueMissionIds: new Set(rows.map((r) => r.missionId)).size,
    unresolvedMission: unresolvedMission.length,
    unresolvedDungeon: unresolvedDungeon.length,
    dungeonWithoutOwner: dungeonWithoutOwner.length,
    nonSingleFetterOwner: multiFetterOwner.length,
    nonCanonicalParam1: nonCanonicalParam1.length,
  },
  distributions: {
    missionType: mapObj(missionTypeDist),
    missionTypeParam2: mapObj(missionTypeParam2Dist),
    externalHeroCount: mapObj(externalCountDist),
  },
  typeSummaries,
  exceptions: {
    unresolvedMission,
    unresolvedDungeon,
    dungeonWithoutOwner,
    nonSingleFetterOwner: multiFetterOwner,
    externalZero: externalZero.slice(0, 100),
    externalMulti: externalMulti.slice(0, 100),
    nonCanonicalParam1: nonCanonicalParam1.slice(0, 100),
  },
  rows,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  status: result.status,
  counts: result.counts,
  distributions: result.distributions,
  typeSummaries,
  externalZeroCount: externalZero.length,
  externalZeroExamples: externalZero.slice(0, 20).map((r)=>({missionId:r.missionId,desc:r.missionDesc,type:r.missionType,owners:r.ownerNames,param1:r.param1Name,param2:r.param2,param3:r.param3,stage:r.stageName,stageOwners:r.stageOwnerNames})),
  externalMultiCount: externalMulti.length,
  externalMultiExamples: externalMulti.slice(0, 20).map((r)=>({missionId:r.missionId,desc:r.missionDesc,type:r.missionType,owners:r.ownerNames,param1:r.param1Name,param2:r.param2,param3:r.param3,stage:r.stageName,stageOwners:r.stageOwnerNames,external:r.externalHeroNames})),
}, null, 2));
