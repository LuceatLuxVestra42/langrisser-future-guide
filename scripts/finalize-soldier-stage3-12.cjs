const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGE3_PATH = path.join(ROOT, 'data/generated/soldier-stage3.v1.json');
const STAGE3_VALIDATION_PATH = path.join(ROOT, 'data/validation/soldier-stage3-final.v1.json');
const SOLDIER_MASTER_PATH = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const HERO_MASTER_PATH = path.join(ROOT, 'data/hero-name-master.v1.json');
const OUT_PATH = path.join(ROOT, 'data/generated/soldier-hero-relations.v1.json');
const VALIDATION_PATH = path.join(ROOT, 'data/validation/soldier-stage3-12-final.v1.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function uniqueSorted(xs) { return [...new Set(xs)].sort((a, b) => a - b); }
function duplicates(xs) {
  const seen = new Set(), dup = new Set();
  for (const x of xs) seen.has(x) ? dup.add(x) : seen.add(x);
  return [...dup].sort((a,b)=>a-b);
}
function sameSet(a, b) {
  const aa = uniqueSorted(a), bb = uniqueSorted(b);
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

const stage3 = readJson(STAGE3_PATH);
const prior = readJson(STAGE3_VALIDATION_PATH);
const soldierMaster = readJson(SOLDIER_MASTER_PATH).records;
const heroMaster = readJson(HERO_MASTER_PATH).records;

if (prior.status !== 'PASS' || (prior.errors?.length ?? 0) !== 0 || (prior.reviews?.length ?? 0) !== 0) {
  throw new Error(`3-12 requires clean 3-1~3-11 PASS; got ${prior.status}`);
}
if (!Array.isArray(stage3.records) || !Array.isArray(stage3.spRelations)) {
  throw new Error('soldier-stage3.v1.json missing records/spRelations');
}

const errors = [], reviews = [];
const recordById = new Map(stage3.records.map(r => [r.soldierId, r]));
const masterById = new Map(soldierMaster.map(r => [r.soldierId, r]));
const heroById = new Map(heroMaster.map(r => [r.heroId, r]));
const spBySpId = new Map(stage3.spRelations.map(r => [r.spSoldierId, r]));
const spByNormalId = new Map(stage3.spRelations.map(r => [r.normalSoldierId, r]));

for (const id of duplicates(stage3.records.map(r => r.soldierId))) errors.push(`duplicate stage3 soldier record ${id}`);
for (const id of duplicates(heroMaster.map(r => r.heroId))) errors.push(`duplicate hero master ID ${id}`);
for (const r of stage3.records) if (!masterById.has(r.soldierId)) errors.push(`stage3 soldier ${r.soldierId} missing soldier master`);

const soldierToHeroes = [];
const finalHeroIdsBySoldier = new Map();

for (const r of stage3.records) {
  const master = masterById.get(r.soldierId);
  if (!master) continue;

  const baseHeroIds = uniqueSorted(r.heroes?.baseHeroIds ?? []);
  const directSpHeroAddedHeroIds = uniqueSorted(r.heroes?.spHeroAddedHeroIds ?? []);
  let inheritedSpHeroAddedHeroIds = [];
  let spExpandedHeroIds = [];
  let normalSoldierId = null;

  if (master.isSp) {
    const rel = spBySpId.get(r.soldierId);
    if (!rel) {
      errors.push(`SP soldier ${r.soldierId} missing stage3 SP relation`);
    } else {
      normalSoldierId = rel.normalSoldierId;
      const normal = recordById.get(normalSoldierId);
      if (!normal) {
        errors.push(`SP soldier ${r.soldierId} normal ${normalSoldierId} missing stage3 record`);
      } else {
        if (!sameSet(baseHeroIds, normal.heroes?.baseHeroIds ?? [])) {
          errors.push(`SP soldier ${r.soldierId} base heroes differ from normal ${normalSoldierId}`);
        }
        inheritedSpHeroAddedHeroIds = uniqueSorted(normal.heroes?.spHeroAddedHeroIds ?? []);
      }
      spExpandedHeroIds = uniqueSorted(rel.secondStage?.expandHeroIds ?? []);
      if (!rel.secondStageUnlock && spExpandedHeroIds.length) {
        errors.push(`SP soldier ${r.soldierId} has expanded heroes with secondStageUnlock=false`);
      }
    }
  } else if (spByNormalId.has(r.soldierId)) {
    normalSoldierId = r.soldierId;
  }

  const finalHeroIds = uniqueSorted([
    ...baseHeroIds,
    ...directSpHeroAddedHeroIds,
    ...inheritedSpHeroAddedHeroIds,
    ...spExpandedHeroIds
  ]);

  for (const hid of finalHeroIds) {
    if (!heroById.has(hid)) errors.push(`soldier ${r.soldierId} final hero ${hid} missing hero master`);
  }
  if (!sameSet(finalHeroIds, [
    ...baseHeroIds,
    ...directSpHeroAddedHeroIds,
    ...inheritedSpHeroAddedHeroIds,
    ...spExpandedHeroIds
  ])) errors.push(`soldier ${r.soldierId} final union mismatch`);

  finalHeroIdsBySoldier.set(r.soldierId, finalHeroIds);
  soldierToHeroes.push({
    soldierId: r.soldierId,
    siteId: master.siteId,
    nameCn: master.nameCn,
    nameKr: master.nameKr,
    tier: master.tier,
    isSp: Boolean(master.isSp),
    normalSoldierId: master.isSp ? normalSoldierId : null,
    finalHeroIds,
    sources: {
      baseHeroIds,
      spHeroAddedHeroIds: directSpHeroAddedHeroIds,
      inheritedSpHeroAddedHeroIds,
      spExpandedHeroIds
    }
  });
}

soldierToHeroes.sort((a,b)=>a.soldierId-b.soldierId);

const heroToSoldiersMap = new Map(heroMaster.map(h => [h.heroId, []]));
for (const row of soldierToHeroes) {
  for (const hid of row.finalHeroIds) {
    if (!heroToSoldiersMap.has(hid)) continue;
    heroToSoldiersMap.get(hid).push(row.soldierId);
  }
}

const heroToSoldiers = heroMaster
  .map(h => ({
    heroId: h.heroId,
    nameCn: h.nameCn,
    nameKr: h.nameKr,
    nameEn: h.nameEn,
    soldierIds: uniqueSorted(heroToSoldiersMap.get(h.heroId) ?? [])
  }))
  .sort((a,b)=>a.heroId-b.heroId);

let missingHeroToSoldierEdges = 0;
let missingSoldierToHeroEdges = 0;
let totalEdges = 0;

const heroIndex = new Map(heroToSoldiers.map(h => [h.heroId, new Set(h.soldierIds)]));
for (const s of soldierToHeroes) {
  totalEdges += s.finalHeroIds.length;
  for (const hid of s.finalHeroIds) {
    if (!heroIndex.get(hid)?.has(s.soldierId)) {
      missingHeroToSoldierEdges++;
      errors.push(`reverse index missing hero ${hid} -> soldier ${s.soldierId}`);
    }
  }
}
for (const h of heroToSoldiers) {
  for (const sid of h.soldierIds) {
    if (!(finalHeroIdsBySoldier.get(sid) ?? []).includes(h.heroId)) {
      missingSoldierToHeroEdges++;
      errors.push(`forward index missing soldier ${sid} -> hero ${h.heroId}`);
    }
  }
}

const spRows = soldierToHeroes.filter(x=>x.isSp);
let spBaseInheritanceMismatch = 0;
let spAddedInheritanceMismatch = 0;
for (const s of spRows) {
  const normal = soldierToHeroes.find(x=>x.soldierId===s.normalSoldierId);
  if (!normal) continue;
  if (!sameSet(s.sources.baseHeroIds, normal.sources.baseHeroIds)) spBaseInheritanceMismatch++;
  if (!sameSet(s.sources.inheritedSpHeroAddedHeroIds, normal.sources.spHeroAddedHeroIds)) spAddedInheritanceMismatch++;
}
if (spBaseInheritanceMismatch) errors.push(`SP base hero inheritance mismatches: ${spBaseInheritanceMismatch}`);
if (spAddedInheritanceMismatch) errors.push(`SP added-hero inheritance mismatches: ${spAddedInheritanceMismatch}`);

const soldiersWithNoHeroes = soldierToHeroes.filter(x=>x.finalHeroIds.length===0).map(x=>x.soldierId);
const heroesWithNoSoldiers = heroToSoldiers.filter(x=>x.soldierIds.length===0).map(x=>x.heroId);
if (soldiersWithNoHeroes.length) reviews.push(`soldiers with no final heroes: ${soldiersWithNoHeroes.join(',')}`);
if (heroesWithNoSoldiers.length) reviews.push(`heroes with no final soldiers: ${heroesWithNoSoldiers.join(',')}`);

const generatedAt = new Date().toISOString();
const out = {
  version: 1,
  stage: '3-12',
  status: errors.length ? 'FAIL' : (reviews.length ? 'PASS_WITH_REVIEW' : 'PASS'),
  generatedAt,
  sources: {
    stage3: 'data/generated/soldier-stage3.v1.json',
    stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
    soldierMaster: 'data/generated/soldier-master.v1.json',
    heroMaster: 'data/hero-name-master.v1.json'
  },
  contract: {
    normalSoldier: 'finalHeroIds = baseHeroIds UNION spHeroAddedHeroIds',
    spSoldier: 'finalHeroIds = normal baseHeroIds UNION normal spHeroAddedHeroIds UNION direct spHeroAddedHeroIds UNION SecondStageExpandHeroList',
    reverseIndex: 'Hero -> Soldier is generated only by reversing the final Soldier -> Hero relation; names and numeric ID patterns are never used as JOIN keys.'
  },
  soldierToHeroes,
  heroToSoldiers
};

const validation = {
  version: 1,
  stage: '3-12',
  status: out.status,
  generatedAt,
  counts: {
    soldierRecords: soldierToHeroes.length,
    normalSoldiers: soldierToHeroes.filter(x=>!x.isSp).length,
    spSoldiers: spRows.length,
    heroRecords: heroToSoldiers.length,
    finalEdges: totalEdges,
    baseEdges: soldierToHeroes.reduce((n,x)=>n+x.sources.baseHeroIds.length,0),
    directSpHeroAddedEdges: soldierToHeroes.reduce((n,x)=>n+x.sources.spHeroAddedHeroIds.length,0),
    inheritedSpHeroAddedEdges: soldierToHeroes.reduce((n,x)=>n+x.sources.inheritedSpHeroAddedHeroIds.length,0),
    spExpandedEdges: soldierToHeroes.reduce((n,x)=>n+x.sources.spExpandedHeroIds.length,0),
    soldiersWithNoHeroes: soldiersWithNoHeroes.length,
    heroesWithNoSoldiers: heroesWithNoSoldiers.length
  },
  checks: {
    missingHeroIds: errors.filter(x=>/final hero .* missing hero master/.test(x)).length,
    missingSoldierMasterIds: errors.filter(x=>/missing soldier master/.test(x)).length,
    missingSpRelations: errors.filter(x=>/missing stage3 SP relation/.test(x)).length,
    spBaseInheritanceMismatch,
    spAddedInheritanceMismatch,
    missingHeroToSoldierEdges,
    missingSoldierToHeroEdges,
    duplicateSoldierRows: duplicates(soldierToHeroes.map(x=>x.soldierId)).length,
    duplicateHeroRows: duplicates(heroToSoldiers.map(x=>x.heroId)).length
  },
  policy: {
    '3-5': 'Base relation comes from Normal SoldierInfo.GetSoldierHeros_ID; SP Soldier inherits the Normal base list.',
    '3-6': 'SPHeroInfo.SecondStageRewardSoldiers adds Hero -> Soldier edges; the reverse Soldier -> Hero edge is inherited by the SP form through its Normal relation.',
    '3-7': 'Normal <-> SP relation comes only from SPSoldierInfo.NormalSoliderId <-> ID.',
    '3-11': 'SecondStageExpandHeroList adds only newly expanded heroes to the SP Soldier.',
    '3-12': 'Final relation is a set union with provenance preserved, then reversed to build Hero -> Soldier.'
  },
  errors: uniqueSorted(errors),
  reviews: uniqueSorted(reviews)
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
fs.writeFileSync(VALIDATION_PATH, JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify(validation, null, 2));
if (errors.length) process.exit(1);
