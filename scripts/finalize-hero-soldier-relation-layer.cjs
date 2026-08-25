const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  ROOT,
  readJson,
  loadSoldiers,
  loadSpSoldiers,
  loadSpHeroes,
} = require('./lib/configdata-direct.cjs');

const paths = {
  heroMaster: 'data/hero-name-master.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  soldierInfo: 'data/configdata/ConfigDataSoldierInfo.json',
  spHeroInfo: 'data/configdata/ConfigDataSPHeroInfo.json',
  spSoldierInfo: 'data/configdata/ConfigDataSPSoldierInfo.json',
  heroIdentity: 'data/contracts/hero-identity-contract.v1.json',
  soldierIdentity: 'data/contracts/soldier-identity-contract.v1.json',
  sourceKinds: 'data/contracts/hero-soldier-relation-source-contract.v1.json',
  edgeSchema: 'data/contracts/hero-soldier-relation-edge-schema.v1.json',
  composition: 'data/contracts/hero-soldier-relation-composition-contract.v1.json',
  legacy: 'data/generated/soldier-hero-relations.v1.json',
  fixturePlan: 'data/validation/soldier-stage4-8-1-fixture-plan.v1.json',
  relation: 'data/generated/hero-soldier-relations.v1.json',
  byHero: 'data/generated/hero-soldier-by-hero.v1.json',
  bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
  validation: 'data/validation/hero-soldier-relation-validation.v1.json',
};

function abs(p) { return path.join(ROOT, p); }
function writeJson(p, value) { fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n'); }
function gitBlobSha(p) {
  return execFileSync('git', ['hash-object', p], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function descriptor(p) { return { path: p, gitBlobSha: gitBlobSha(p) }; }
function pairKey(heroId, soldierId) { return `${heroId}:${soldierId}`; }
function uniqueSorted(xs) { return [...new Set(xs.map(Number))].sort((a, b) => a - b); }
function structuralKey(value) { return JSON.stringify(value); }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function diffCount(a, b) { let n = 0; for (const x of a) if (!b.has(x)) n++; return n; }
function readExisting(p) { try { return readJson(abs(p)); } catch { return null; } }
function stableGeneratedAt(existing, sameSnapshot) {
  if (existing && existing.generatedAt && sameSnapshot(existing)) return existing.generatedAt;
  return new Date().toISOString();
}
function provenanceCompare(a, b) {
  const av = [a.sourceKind, a.origin?.table || '', Number(a.origin?.recordId || 0), a.origin?.field || '', Number(a.parentEdge?.soldierId || 0)];
  const bv = [b.sourceKind, b.origin?.table || '', Number(b.origin?.recordId || 0), b.origin?.field || '', Number(b.parentEdge?.soldierId || 0)];
  for (let i = 0; i < av.length; i++) {
    if (typeof av[i] === 'number') { if (av[i] !== bv[i]) return av[i] - bv[i]; }
    else { const c = String(av[i]).localeCompare(String(bv[i])); if (c) return c; }
  }
  return structuralKey(a).localeCompare(structuralKey(b));
}
function edgeCompare(a, b) { return a.soldierId - b.soldierId || a.heroId - b.heroId; }

const heroMaster = readJson(abs(paths.heroMaster)).records;
const soldierMaster = readJson(abs(paths.soldierMaster)).records;
const soldiers = loadSoldiers();
const spSoldiers = loadSpSoldiers();
const spHeroes = loadSpHeroes();
const legacy = readJson(abs(paths.legacy));

const heroIds = new Set(heroMaster.map((x) => Number(x.heroId)));
const soldierIds = new Set(soldierMaster.map((x) => Number(x.soldierId)));
const normalMasterIds = new Set(soldierMaster.filter((x) => !x.isSp).map((x) => Number(x.soldierId)));
const soldierById = new Map(soldiers.map((x) => [Number(x.soldierId), x]));
const spByNormal = new Map(spSoldiers.map((x) => [Number(x.normalSoldierId), x]));

const inputDescriptors = {
  heroMaster: descriptor(paths.heroMaster),
  soldierMaster: descriptor(paths.soldierMaster),
  soldierInfo: descriptor(paths.soldierInfo),
  spHeroInfo: descriptor(paths.spHeroInfo),
  spSoldierInfo: descriptor(paths.spSoldierInfo),
};
const contractDescriptors = {
  heroIdentity: descriptor(paths.heroIdentity),
  soldierIdentity: descriptor(paths.soldierIdentity),
  sourceKinds: descriptor(paths.sourceKinds),
  edgeSchema: descriptor(paths.edgeSchema),
  composition: descriptor(paths.composition),
};

function directBaseProvenance(soldierId) {
  return {
    sourceKind: 'BASE_SOLDIER_HERO',
    sourceClass: 'DIRECT',
    origin: { table: 'ConfigDataSoldierInfo', recordId: soldierId, recordKeyField: 'ID', field: 'GetSoldierHeros_ID' },
  };
}
function directRewardProvenance(heroId) {
  return {
    sourceKind: 'SP_HERO_REWARD',
    sourceClass: 'DIRECT',
    origin: { table: 'ConfigDataSPHeroInfo', recordId: heroId, recordKeyField: 'ID', field: 'SecondStageRewardSoldiers' },
  };
}
function directExpandProvenance(spSoldierId) {
  return {
    sourceKind: 'SP_SOLDIER_EXPAND',
    sourceClass: 'DIRECT',
    origin: { table: 'ConfigDataSPSoldierInfo', recordId: spSoldierId, recordKeyField: 'ID', field: 'SecondStageExpandHeroList' },
  };
}
function inheritedProvenance(parent, heroId, link) {
  return {
    sourceKind: 'SP_SOLDIER_INHERIT',
    sourceClass: 'DERIVED',
    origin: { ...parent.origin },
    parentEdge: { heroId, soldierId: link.normalSoldierId, parentSourceKind: parent.sourceKind },
    supportRelation: {
      kind: 'SP_FORM_LINK',
      table: 'ConfigDataSPSoldierInfo',
      recordId: link.spSoldierId,
      normalSoldierId: link.normalSoldierId,
      spSoldierId: link.spSoldierId,
    },
  };
}

function buildEdges({ reverse = false } = {}) {
  const map = new Map();
  const add = (heroId, soldierId, provenance) => {
    heroId = Number(heroId); soldierId = Number(soldierId);
    const k = pairKey(heroId, soldierId);
    if (!map.has(k)) map.set(k, { heroId, soldierId, provenance: [] });
    const edge = map.get(k);
    const pk = structuralKey(provenance);
    if (!edge.provenance.some((p) => structuralKey(p) === pk)) edge.provenance.push(provenance);
  };
  const order = (xs) => reverse ? [...xs].reverse() : xs;

  for (const sid of order([...normalMasterIds])) {
    const source = soldierById.get(sid);
    if (!source) continue;
    for (const heroId of order([...source.baseHeroIds])) add(heroId, sid, directBaseProvenance(sid));
  }
  for (const h of order(spHeroes)) {
    for (const sid of order([...h.rewardSoldierIds])) add(h.heroId, sid, directRewardProvenance(h.heroId));
  }
  for (const link of order(spSoldiers)) {
    for (const heroId of order([...link.secondStageExpandHeroIds])) add(heroId, link.spSoldierId, directExpandProvenance(link.spSoldierId));
  }

  const directSnapshot = [...map.values()].map((e) => ({ heroId: e.heroId, soldierId: e.soldierId, provenance: [...e.provenance] }));
  for (const link of order(spSoldiers)) {
    for (const edge of order(directSnapshot.filter((e) => e.soldierId === link.normalSoldierId))) {
      for (const p of order(edge.provenance.filter((p) => p.sourceClass === 'DIRECT' && (p.sourceKind === 'BASE_SOLDIER_HERO' || p.sourceKind === 'SP_HERO_REWARD')))) {
        add(edge.heroId, link.spSoldierId, inheritedProvenance(p, edge.heroId, link));
      }
    }
  }

  const edges = [...map.values()];
  for (const edge of edges) edge.provenance.sort(provenanceCompare);
  edges.sort(edgeCompare);
  return edges;
}

const edges = buildEdges();
const reversedBuildEdges = buildEdges({ reverse: true });
const sourceProductionCounts = { BASE_SOLDIER_HERO: 0, SP_HERO_REWARD: 0, SP_SOLDIER_EXPAND: 0, SP_SOLDIER_INHERIT: 0 };
for (const edge of edges) for (const p of edge.provenance) sourceProductionCounts[p.sourceKind]++;
const summary = {
  heroCount: new Set(edges.map((e) => e.heroId)).size,
  soldierCount: new Set(edges.map((e) => e.soldierId)).size,
  edgeCount: edges.length,
  provenanceCount: edges.reduce((n, e) => n + e.provenance.length, 0),
  sourceProductionCounts,
};

const existingRelation = readExisting(paths.relation);
const generatedAt = stableGeneratedAt(existingRelation, (x) => deepEqual(x.inputs, inputDescriptors) && deepEqual(x.contracts, contractDescriptors));
const relation = {
  version: 1,
  schemaId: 'hero-soldier-relation-set/v1',
  generatedAt,
  inputs: inputDescriptors,
  contracts: contractDescriptors,
  summary,
  edges,
};
writeJson(paths.relation, relation);
const relationBlobSha = gitBlobSha(paths.relation);

const byHeroMap = new Map();
const bySoldierMap = new Map();
for (const edge of edges) {
  if (!byHeroMap.has(edge.heroId)) byHeroMap.set(edge.heroId, []);
  if (!bySoldierMap.has(edge.soldierId)) bySoldierMap.set(edge.soldierId, []);
  byHeroMap.get(edge.heroId).push(edge.soldierId);
  bySoldierMap.get(edge.soldierId).push(edge.heroId);
}
function sortedIndexObject(map) {
  const out = {};
  for (const key of [...map.keys()].sort((a, b) => a - b)) out[String(key)] = uniqueSorted(map.get(key));
  return out;
}
const byHeroId = sortedIndexObject(byHeroMap);
const bySoldierId = sortedIndexObject(bySoldierMap);
const relationSetDescriptor = { path: paths.relation, gitBlobSha: relationBlobSha, schemaId: 'hero-soldier-relation-set/v1' };
const byHeroArtifact = {
  version: 1,
  schemaId: 'hero-soldier-by-hero/v1',
  generatedAt,
  relationSet: relationSetDescriptor,
  summary: { keyCount: Object.keys(byHeroId).length, relationCount: Object.values(byHeroId).reduce((n, xs) => n + xs.length, 0) },
  byHeroId,
};
const bySoldierArtifact = {
  version: 1,
  schemaId: 'hero-soldier-by-soldier/v1',
  generatedAt,
  relationSet: relationSetDescriptor,
  summary: { keyCount: Object.keys(bySoldierId).length, relationCount: Object.values(bySoldierId).reduce((n, xs) => n + xs.length, 0) },
  bySoldierId,
};
writeJson(paths.byHero, byHeroArtifact);
writeJson(paths.bySoldier, bySoldierArtifact);
const byHeroBlobSha = gitBlobSha(paths.byHero);
const bySoldierBlobSha = gitBlobSha(paths.bySoldier);

const canonicalPairSet = new Set(edges.map((e) => pairKey(e.heroId, e.soldierId)));
const legacyPairSet = new Set();
for (const row of legacy.soldierToHeroes || []) for (const heroId of row.finalHeroIds || []) legacyPairSet.add(pairKey(Number(heroId), Number(row.soldierId)));
function reconstructedFromByHero(index) {
  const set = new Set();
  for (const [hid, sids] of Object.entries(index)) for (const sid of sids) set.add(pairKey(Number(hid), Number(sid)));
  return set;
}
function reconstructedFromBySoldier(index) {
  const set = new Set();
  for (const [sid, hids] of Object.entries(index)) for (const hid of hids) set.add(pairKey(Number(hid), Number(sid)));
  return set;
}
const byHeroPairs = reconstructedFromByHero(byHeroId);
const bySoldierPairs = reconstructedFromBySoldier(bySoldierId);

const allowedDirect = {
  BASE_SOLDIER_HERO: ['ConfigDataSoldierInfo', 'GetSoldierHeros_ID'],
  SP_HERO_REWARD: ['ConfigDataSPHeroInfo', 'SecondStageRewardSoldiers'],
  SP_SOLDIER_EXPAND: ['ConfigDataSPSoldierInfo', 'SecondStageExpandHeroList'],
};
const allowedKinds = new Set(['BASE_SOLDIER_HERO', 'SP_HERO_REWARD', 'SP_SOLDIER_EXPAND', 'SP_SOLDIER_INHERIT']);
const checks = {
  unknownHeroIds: 0,
  unknownSoldierIds: 0,
  duplicateCanonicalPairs: canonicalPairSet.size === edges.length ? 0 : edges.length - canonicalPairSet.size,
  edgesWithoutProvenance: 0,
  forbiddenEmbeddedEdgeFields: 0,
  invalidSourceKinds: 0,
  invalidDirectOrigins: 0,
  invalidInheritedProvenance: 0,
  edgeOrderingMismatch: deepEqual(edges, [...edges].sort(edgeCompare)) ? 0 : 1,
  provenanceOrderingMismatch: 0,
  orderDependentBuild: deepEqual(edges, reversedBuildEdges) ? 0 : 1,
  summaryMismatch: 0,
  sourceCompletenessMissing: 0,
  sourceCompletenessExtra: 0,
  byHeroRelationCountMismatch: byHeroArtifact.summary.relationCount === edges.length ? 0 : Math.abs(byHeroArtifact.summary.relationCount - edges.length),
  bySoldierRelationCountMismatch: bySoldierArtifact.summary.relationCount === edges.length ? 0 : Math.abs(bySoldierArtifact.summary.relationCount - edges.length),
  byHeroPairMismatch: diffCount(canonicalPairSet, byHeroPairs) + diffCount(byHeroPairs, canonicalPairSet),
  bySoldierPairMismatch: diffCount(canonicalPairSet, bySoldierPairs) + diffCount(bySoldierPairs, canonicalPairSet),
  crossIndexPairMismatch: diffCount(byHeroPairs, bySoldierPairs) + diffCount(bySoldierPairs, byHeroPairs),
  duplicateByHeroValues: 0,
  duplicateBySoldierValues: 0,
  legacyMissingPairs: diffCount(legacyPairSet, canonicalPairSet),
  legacyExtraPairs: diffCount(canonicalPairSet, legacyPairSet),
  legacyCountMismatch: legacyPairSet.size === edges.length ? 0 : Math.abs(legacyPairSet.size - edges.length),
};
for (const edge of edges) {
  if (!heroIds.has(edge.heroId)) checks.unknownHeroIds++;
  if (!soldierIds.has(edge.soldierId)) checks.unknownSoldierIds++;
  if (!edge.provenance.length) checks.edgesWithoutProvenance++;
  const extraKeys = Object.keys(edge).filter((k) => !['heroId', 'soldierId', 'provenance'].includes(k));
  checks.forbiddenEmbeddedEdgeFields += extraKeys.length;
  if (!deepEqual(edge.provenance, [...edge.provenance].sort(provenanceCompare))) checks.provenanceOrderingMismatch++;
  for (const p of edge.provenance) {
    if (!allowedKinds.has(p.sourceKind)) { checks.invalidSourceKinds++; continue; }
    if (p.sourceClass === 'DIRECT') {
      const expected = allowedDirect[p.sourceKind];
      if (!expected || p.origin?.table !== expected[0] || p.origin?.field !== expected[1] || p.origin?.recordKeyField !== 'ID') checks.invalidDirectOrigins++;
    } else if (p.sourceKind === 'SP_SOLDIER_INHERIT' && p.sourceClass === 'DERIVED') {
      const parentOk = p.parentEdge && p.parentEdge.heroId === edge.heroId && ['BASE_SOLDIER_HERO', 'SP_HERO_REWARD'].includes(p.parentEdge.parentSourceKind);
      const support = p.supportRelation;
      const supportOk = support && support.kind === 'SP_FORM_LINK' && support.table === 'ConfigDataSPSoldierInfo' && support.spSoldierId === edge.soldierId && support.normalSoldierId === p.parentEdge?.soldierId && support.recordId === support.spSoldierId;
      const originExpected = allowedDirect[p.parentEdge?.parentSourceKind];
      const originOk = originExpected && p.origin?.table === originExpected[0] && p.origin?.field === originExpected[1] && p.origin?.recordKeyField === 'ID';
      if (!parentOk || !supportOk || !originOk) checks.invalidInheritedProvenance++;
    } else checks.invalidInheritedProvenance++;
  }
}
for (const xs of Object.values(byHeroId)) checks.duplicateByHeroValues += xs.length - new Set(xs).size;
for (const xs of Object.values(bySoldierId)) checks.duplicateBySoldierValues += xs.length - new Set(xs).size;
const derivedSummary = {
  heroCount: new Set(edges.map((e) => e.heroId)).size,
  soldierCount: new Set(edges.map((e) => e.soldierId)).size,
  edgeCount: edges.length,
  provenanceCount: edges.reduce((n, e) => n + e.provenance.length, 0),
  sourceProductionCounts: { BASE_SOLDIER_HERO: 0, SP_HERO_REWARD: 0, SP_SOLDIER_EXPAND: 0, SP_SOLDIER_INHERIT: 0 },
};
for (const e of edges) for (const p of e.provenance) derivedSummary.sourceProductionCounts[p.sourceKind]++;
checks.summaryMismatch = deepEqual(summary, derivedSummary) ? 0 : 1;

const expected = new Map();
function expectProv(heroId, soldierId, p) {
  const k = pairKey(heroId, soldierId);
  if (!expected.has(k)) expected.set(k, new Set());
  expected.get(k).add(structuralKey(p));
}
for (const sid of normalMasterIds) {
  const source = soldierById.get(sid);
  for (const heroId of source?.baseHeroIds || []) expectProv(heroId, sid, directBaseProvenance(sid));
}
for (const h of spHeroes) for (const sid of h.rewardSoldierIds) expectProv(h.heroId, sid, directRewardProvenance(h.heroId));
for (const link of spSoldiers) for (const heroId of link.secondStageExpandHeroIds) expectProv(heroId, link.spSoldierId, directExpandProvenance(link.spSoldierId));
const directExpectedSnapshot = [...expected.entries()].map(([k, provs]) => ({ k, provs: [...provs] }));
for (const link of spSoldiers) {
  for (const item of directExpectedSnapshot) {
    const [heroIdText, soldierIdText] = item.k.split(':');
    if (Number(soldierIdText) !== link.normalSoldierId) continue;
    for (const pk of item.provs) {
      const p = JSON.parse(pk);
      if (p.sourceClass !== 'DIRECT' || !['BASE_SOLDIER_HERO', 'SP_HERO_REWARD'].includes(p.sourceKind)) continue;
      expectProv(Number(heroIdText), link.spSoldierId, inheritedProvenance(p, Number(heroIdText), link));
    }
  }
}
const actualProvMap = new Map(edges.map((e) => [pairKey(e.heroId, e.soldierId), new Set(e.provenance.map(structuralKey))]));
for (const [k, provs] of expected) {
  const actual = actualProvMap.get(k) || new Set();
  checks.sourceCompletenessMissing += diffCount(provs, actual);
}
for (const [k, provs] of actualProvMap) {
  const exp = expected.get(k) || new Set();
  checks.sourceCompletenessExtra += diffCount(provs, exp);
}

const legacyConceptualCounts = { baseEdges: 0, directSpHeroAddedEdges: 0, inheritedSpHeroAddedEdges: 0, spExpandedEdges: 0 };
for (const row of legacy.soldierToHeroes || []) {
  legacyConceptualCounts.baseEdges += (row.sources?.baseHeroIds || []).length;
  legacyConceptualCounts.directSpHeroAddedEdges += (row.sources?.spHeroAddedHeroIds || []).length;
  legacyConceptualCounts.inheritedSpHeroAddedEdges += (row.sources?.inheritedSpHeroAddedHeroIds || []).length;
  legacyConceptualCounts.spExpandedEdges += (row.sources?.spExpandedHeroIds || []).length;
}
const currentConceptualCounts = { baseEdges: 0, directSpHeroAddedEdges: 0, inheritedSpHeroAddedEdges: 0, spExpandedEdges: 0 };
for (const edge of edges) for (const p of edge.provenance) {
  if (p.sourceKind === 'BASE_SOLDIER_HERO' && p.sourceClass === 'DIRECT') currentConceptualCounts.baseEdges++;
  if (p.sourceKind === 'SP_SOLDIER_INHERIT' && p.parentEdge?.parentSourceKind === 'BASE_SOLDIER_HERO') currentConceptualCounts.baseEdges++;
  if (p.sourceKind === 'SP_HERO_REWARD' && p.sourceClass === 'DIRECT') currentConceptualCounts.directSpHeroAddedEdges++;
  if (p.sourceKind === 'SP_SOLDIER_INHERIT' && p.parentEdge?.parentSourceKind === 'SP_HERO_REWARD') currentConceptualCounts.inheritedSpHeroAddedEdges++;
  if (p.sourceKind === 'SP_SOLDIER_EXPAND' && p.sourceClass === 'DIRECT') currentConceptualCounts.spExpandedEdges++;
}
checks.goldenConceptualCountMismatch = Object.keys(legacyConceptualCounts).reduce((n, k) => n + (legacyConceptualCounts[k] === currentConceptualCounts[k] ? 0 : 1), 0);
checks.fixturePlanBlobMismatch = gitBlobSha(paths.fixturePlan) === '8364b3840411ebd5bd74b9f027b796ef38a5086a' ? 0 : 1;
checks.spSoldierFixtureSnapshotBlobMismatch = inputDescriptors.spSoldierInfo.gitBlobSha === '93dd784a7de913daa6d72f5df6cf6890a710c58a' ? 0 : 1;
checks.invalidTraceabilitySha = [...Object.values(inputDescriptors), ...Object.values(contractDescriptors)].filter((d) => !/^[0-9a-f]{40}$/.test(d.gitBlobSha)).length;

function edgeFor(heroId, soldierId) { return edges.find((e) => e.heroId === heroId && e.soldierId === soldierId); }
function inheritedCompleteness(normalId, spId) {
  let missing = 0;
  for (const e of edges.filter((x) => x.soldierId === normalId)) {
    for (const p of e.provenance.filter((x) => x.sourceClass === 'DIRECT' && ['BASE_SOLDIER_HERO', 'SP_HERO_REWARD'].includes(x.sourceKind))) {
      const target = edgeFor(e.heroId, spId);
      const expectedProv = inheritedProvenance(p, e.heroId, { normalSoldierId: normalId, spSoldierId: spId });
      if (!target?.provenance.some((x) => structuralKey(x) === structuralKey(expectedProv))) missing++;
    }
  }
  return missing;
}
const fixtures = [];
for (const sid of [105, 247, 1032]) {
  const edgeRows = edges.filter((e) => e.soldierId === sid);
  const hasSpLink = spByNormal.has(sid);
  const invalidProv = edgeRows.flatMap((e) => e.provenance).filter((p) => p.sourceKind === 'SP_SOLDIER_INHERIT' || p.sourceKind === 'SP_SOLDIER_EXPAND').length;
  fixtures.push({ soldierId: sid, kind: 'NORMAL_ONLY', status: (!hasSpLink && edgeRows.length > 0 && invalidProv === 0) ? 'PASS' : 'FAIL', checks: { hasSpLink: hasSpLink ? 1 : 0, relationEdges: edgeRows.length, invalidSpProvenance: invalidProv } });
}
const witchLink = spByNormal.get(622);
const witchExpand = edges.filter((e) => e.soldierId === 5622).flatMap((e) => e.provenance).filter((p) => p.sourceKind === 'SP_SOLDIER_EXPAND').length;
const witchMissingInherited = inheritedCompleteness(622, 5622);
fixtures.push({ soldierId: 5622, normalSoldierId: 622, kind: 'SP_FIRST_STAGE_ONLY', status: (witchLink?.spSoldierId === 5622 && witchExpand === 0 && witchMissingInherited === 0) ? 'PASS' : 'FAIL', checks: { linkMismatch: witchLink?.spSoldierId === 5622 ? 0 : 1, expandProvenance: witchExpand, missingInherited: witchMissingInherited } });
const royalLink = spByNormal.get(320);
const royalExpandIds = [99226, 124, 115, 53, 99233];
let royalExpandMissing = 0, royalBackwardLeak = 0;
for (const hid of royalExpandIds) {
  const spEdge = edgeFor(hid, 5320);
  if (!spEdge?.provenance.some((p) => p.sourceKind === 'SP_SOLDIER_EXPAND' && p.sourceClass === 'DIRECT' && p.origin?.recordId === 5320)) royalExpandMissing++;
  const normalEdge = edgeFor(hid, 320);
  if (normalEdge?.provenance.some((p) => p.sourceKind === 'SP_SOLDIER_EXPAND')) royalBackwardLeak++;
}
const royalMissingInherited = inheritedCompleteness(320, 5320);
fixtures.push({ soldierId: 5320, normalSoldierId: 320, kind: 'SP_TWO_STAGE', status: (royalLink?.spSoldierId === 5320 && royalExpandMissing === 0 && royalBackwardLeak === 0 && royalMissingInherited === 0) ? 'PASS' : 'FAIL', checks: { linkMismatch: royalLink?.spSoldierId === 5320 ? 0 : 1, expandMissing: royalExpandMissing, backwardExpandLeak: royalBackwardLeak, missingInherited: royalMissingInherited } });

const errors = [];
for (const [id, value] of Object.entries(checks)) if (value !== 0) errors.push({ checkId: id, value });
for (const f of fixtures) if (f.status !== 'PASS') errors.push({ checkId: 'fixture', soldierId: f.soldierId, checks: f.checks });
const reviews = [];
const validation = {
  version: 1,
  schemaId: 'hero-soldier-relation-validation/v1',
  generatedAt,
  status: errors.length || reviews.length ? (errors.length ? 'FAIL' : 'REVIEW') : 'PASS',
  relationSet: relationSetDescriptor,
  indexes: {
    byHero: { path: paths.byHero, gitBlobSha: byHeroBlobSha, schemaId: 'hero-soldier-by-hero/v1', relationSetGitBlobSha: relationBlobSha },
    bySoldier: { path: paths.bySoldier, gitBlobSha: bySoldierBlobSha, schemaId: 'hero-soldier-by-soldier/v1', relationSetGitBlobSha: relationBlobSha },
  },
  checks,
  fixtures,
  goldenComparison: {
    status: checks.legacyMissingPairs === 0 && checks.legacyExtraPairs === 0 && checks.goldenConceptualCountMismatch === 0 ? 'MATCH' : 'DIFF',
    legacyRelationPath: paths.legacy,
    legacyRelationGitBlobSha: gitBlobSha(paths.legacy),
    legacyPairCount: legacyPairSet.size,
    currentPairCount: canonicalPairSet.size,
    legacyConceptualCounts,
    currentConceptualCounts,
  },
  errors,
  reviews,
};
writeJson(paths.validation, validation);

console.log(JSON.stringify({
  relation: { schemaId: relation.schemaId, gitBlobSha: relationBlobSha, summary },
  indexes: { byHero: byHeroArtifact.summary, bySoldier: bySoldierArtifact.summary },
  validation: { status: validation.status, checks, fixtures, goldenComparison: validation.goldenComparison.status, errors, reviews },
}, null, 2));
if (validation.status !== 'PASS') process.exit(1);
