const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  c0Contract: 'data/contracts/hero-soldier-integration-stageC-0-input.v1.json',
  c0Summary: 'data/validation/hero-soldier-integration-stageC-0-summary.v1.json',
  aFinal: 'data/validation/hero-soldier-relation-stageA-final.v1.json',
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  heroManifest: 'data/generated/hero-detail.v1.json',
  heroFinal: 'data/validation/hero-stage6-4-final.v1.json',
  soldierRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  soldierFinal: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  output: 'data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json',
};

function abs(p) { return path.join(ROOT, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function pairKey(heroId, soldierId) { return `${heroId}:${soldierId}`; }
function sorted(values) { return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
function setDiff(left, right) {
  const out = [];
  for (const v of left) if (!right.has(v)) out.push(v);
  return sorted(out);
}
function diagDiff(left, right) {
  const values = setDiff(left, right);
  return { count: values.length, sample: values.slice(0, 50) };
}
function addPair(state, heroId, soldierId, localSeen = null) {
  if (!Number.isInteger(heroId) || !Number.isInteger(soldierId)) {
    state.invalid.push({
      heroId: Number.isInteger(heroId) ? heroId : null,
      soldierId: Number.isInteger(soldierId) ? soldierId : null,
    });
    return;
  }
  const key = pairKey(heroId, soldierId);
  if (localSeen && localSeen.has(key)) state.duplicateValues.push(key);
  if (localSeen) localSeen.add(key);
  if (state.set.has(key)) state.duplicates.push(key);
  state.set.add(key);
}
function newPairState() {
  return { set: new Set(), invalid: [], duplicates: [], duplicateValues: [] };
}
function fromCanonical(edges) {
  const state = newPairState();
  for (const edge of Array.isArray(edges) ? edges : []) {
    addPair(state, edge?.heroId, edge?.soldierId);
  }
  return state;
}
function fromHeroShards(manifest) {
  const state = newPairState();
  const shardErrors = [];
  const heroIds = [];
  const byHeroId = manifest?.storage?.byHeroId || {};

  for (const [heroKey, locator] of Object.entries(byHeroId)) {
    const heroId = Number(heroKey);
    heroIds.push(heroId);
    const shardPath = locator?.path;
    if (!shardPath || !fs.existsSync(abs(shardPath))) {
      shardErrors.push({ heroId, code: 'MISSING_SHARD', path: shardPath || null });
      continue;
    }
    const shard = loadJson(shardPath);
    if (shard?.heroId !== heroId) {
      shardErrors.push({ heroId, code: 'SHARD_HERO_ID_MISMATCH', actual: shard?.heroId ?? null, path: shardPath });
    }
    const soldierIds = shard?.soldiers?.ids;
    if (!Array.isArray(soldierIds)) {
      shardErrors.push({ heroId, code: 'MISSING_SOLDIERS_IDS', path: shardPath });
      continue;
    }
    const localSeen = new Set();
    for (const soldierId of soldierIds) addPair(state, heroId, soldierId, localSeen);
  }

  return { ...state, heroIds, shardErrors };
}
function fromSoldierRecords(records) {
  const state = newPairState();
  const recordErrors = [];
  const soldierIds = [];
  for (const record of Array.isArray(records) ? records : []) {
    const soldierId = record?.soldierId;
    if (!Number.isInteger(soldierId)) {
      recordErrors.push({ code: 'INVALID_SOLDIER_ID', soldierId: soldierId ?? null });
      continue;
    }
    soldierIds.push(soldierId);
    const heroIds = record?.heroes?.finalHeroIds;
    if (!Array.isArray(heroIds)) {
      recordErrors.push({ code: 'MISSING_HEROES_FINAL_IDS', soldierId });
      continue;
    }
    const localSeen = new Set();
    for (const heroId of heroIds) addPair(state, heroId, soldierId, localSeen);
  }
  return { ...state, soldierIds, recordErrors };
}
function duplicateIds(ids) {
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup].sort((a, b) => a - b);
}
function unknownEndpointCounts(pairSet, heroSet, soldierSet) {
  const unknownHero = new Set();
  const unknownSoldier = new Set();
  for (const key of pairSet) {
    const [h, s] = key.split(':').map(Number);
    if (!heroSet.has(h)) unknownHero.add(h);
    if (!soldierSet.has(s)) unknownSoldier.add(s);
  }
  return {
    unknownHeroIds: [...unknownHero].sort((a, b) => a - b),
    unknownSoldierIds: [...unknownSoldier].sort((a, b) => a - b),
  };
}
function main() {
  const c0Contract = loadJson(P.c0Contract);
  const c0Summary = loadJson(P.c0Summary);
  const aFinal = loadJson(P.aFinal);
  const relationSet = loadJson(P.relationSet);
  const heroManifest = loadJson(P.heroManifest);
  const heroFinal = loadJson(P.heroFinal);
  const soldierRecords = loadJson(P.soldierRecords);
  const soldierFinal = loadJson(P.soldierFinal);

  const expected = c0Contract?.expectedPopulation || { heroes: 267, soldiers: 224, canonicalPairs: 5977 };
  const hardErrors = [];

  const upstreamChecks = {
    c0PassComplete: c0Summary?.status === 'PASS' && c0Summary?.completion === 'COMPLETE',
    aFinalAccepted: aFinal?.status === 'PASS_ACCEPTED',
    heroFinalFrozen: ['PASS', 'PASS_WITH_REVIEW'].includes(heroFinal?.status) && heroFinal?.completion === 'COMPLETE' && heroFinal?.heroDataPipelineStatus === 'FINAL_FROZEN',
    soldierFinalReady: soldierFinal?.status === 'PASS' && soldierFinal?.admissionStatus === 'READY_WITH_REVIEW',
  };
  for (const [name, pass] of Object.entries(upstreamChecks)) if (!pass) hardErrors.push(`Upstream gate failed: ${name}`);

  const currentBlobs = {
    c0Contract: gitBlobSha(P.c0Contract),
    c0Summary: gitBlobSha(P.c0Summary),
    aFinal: gitBlobSha(P.aFinal),
    relationSet: gitBlobSha(P.relationSet),
    heroManifest: gitBlobSha(P.heroManifest),
    heroFinal: gitBlobSha(P.heroFinal),
    soldierRecords: gitBlobSha(P.soldierRecords),
    soldierFinal: gitBlobSha(P.soldierFinal),
  };
  const frozen = c0Contract?.authoritativeInputs || {};
  const snapshotChecks = {
    relationSet: currentBlobs.relationSet === frozen?.relationLayer?.canonicalRelationSet?.gitBlobSha,
    heroManifest: currentBlobs.heroManifest === frozen?.heroFinal?.manifest?.gitBlobSha,
    heroFinal: currentBlobs.heroFinal === frozen?.heroFinal?.finalCheckpoint?.gitBlobSha,
    soldierRecords: currentBlobs.soldierRecords === frozen?.soldierFinal?.fullRecords?.gitBlobSha,
    soldierFinal: currentBlobs.soldierFinal === frozen?.soldierFinal?.finalCheckpoint?.gitBlobSha,
  };
  for (const [name, pass] of Object.entries(snapshotChecks)) if (!pass) hardErrors.push(`C-0 frozen input drift: ${name}`);

  const canonical = fromCanonical(relationSet?.edges);
  const hero = fromHeroShards(heroManifest);
  const soldier = fromSoldierRecords(soldierRecords?.records);

  const heroIdDup = duplicateIds(hero.heroIds);
  const soldierIdDup = duplicateIds(soldier.soldierIds);
  const heroSet = new Set(hero.heroIds);
  const soldierSet = new Set(soldier.soldierIds);

  const endpoint = {
    canonical: unknownEndpointCounts(canonical.set, heroSet, soldierSet),
    hero: unknownEndpointCounts(hero.set, heroSet, soldierSet),
    soldier: unknownEndpointCounts(soldier.set, heroSet, soldierSet),
  };

  const diffs = {
    canonicalMinusHero: diagDiff(canonical.set, hero.set),
    heroMinusCanonical: diagDiff(hero.set, canonical.set),
    canonicalMinusSoldier: diagDiff(canonical.set, soldier.set),
    soldierMinusCanonical: diagDiff(soldier.set, canonical.set),
    heroMinusSoldier: diagDiff(hero.set, soldier.set),
    soldierMinusHero: diagDiff(soldier.set, hero.set),
  };
  const totalPairMismatch = Object.values(diffs).reduce((sum, d) => sum + d.count, 0);

  const duplicatePairCount = canonical.duplicates.length + canonical.duplicateValues.length
    + hero.duplicates.length + hero.duplicateValues.length
    + soldier.duplicates.length + soldier.duplicateValues.length;
  const invalidPairCount = canonical.invalid.length + hero.invalid.length + soldier.invalid.length;
  const unknownHeroIds = new Set([
    ...endpoint.canonical.unknownHeroIds,
    ...endpoint.hero.unknownHeroIds,
    ...endpoint.soldier.unknownHeroIds,
  ]);
  const unknownSoldierIds = new Set([
    ...endpoint.canonical.unknownSoldierIds,
    ...endpoint.hero.unknownSoldierIds,
    ...endpoint.soldier.unknownSoldierIds,
  ]);

  const countChecks = {
    heroCount: hero.heroIds.length === expected.heroes,
    soldierCount: soldier.soldierIds.length === expected.soldiers,
    canonicalPairs: canonical.set.size === expected.canonicalPairs,
    heroPairs: hero.set.size === expected.canonicalPairs,
    soldierPairs: soldier.set.size === expected.canonicalPairs,
  };
  for (const [name, pass] of Object.entries(countChecks)) if (!pass) hardErrors.push(`Expected count failed: ${name}`);

  if (hero.shardErrors.length) hardErrors.push(`Hero shard structural errors: ${hero.shardErrors.length}`);
  if (soldier.recordErrors.length) hardErrors.push(`Soldier record structural errors: ${soldier.recordErrors.length}`);
  if (heroIdDup.length) hardErrors.push(`Duplicate Hero IDs: ${heroIdDup.length}`);
  if (soldierIdDup.length) hardErrors.push(`Duplicate Soldier IDs: ${soldierIdDup.length}`);
  if (invalidPairCount) hardErrors.push(`Malformed pairs: ${invalidPairCount}`);
  if (duplicatePairCount) hardErrors.push(`Duplicate pairs: ${duplicatePairCount}`);
  if (unknownHeroIds.size) hardErrors.push(`Unknown Hero IDs: ${unknownHeroIds.size}`);
  if (unknownSoldierIds.size) hardErrors.push(`Unknown Soldier IDs: ${unknownSoldierIds.size}`);
  if (totalPairMismatch) hardErrors.push(`Cross-consumer pair differences: ${totalPairMismatch}`);

  const status = hardErrors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    schemaId: 'hero-soldier-integration-stageC-1-pair-parity/v1',
    stage: 'C-1',
    checkpoint: 'final-cross-consumer-pair-parity',
    status,
    completion: status === 'PASS' ? 'COMPLETE' : 'BLOCKED',
    purpose: 'Directly compare the frozen canonical Hero-Soldier edge set against the final 267 Hero shards and final 224 Soldier full records without re-deriving membership from ConfigData.',
    c0Contract: P.c0Contract,
    sources: Object.fromEntries(Object.entries(currentBlobs).map(([k, sha]) => [k, { path: P[k] || null, gitBlobSha: sha }])),
    upstreamChecks,
    snapshotChecks,
    expected: {
      heroes: expected.heroes,
      soldiers: expected.soldiers,
      pairs: expected.canonicalPairs,
    },
    summary: {
      heroCount: hero.heroIds.length,
      soldierCount: soldier.soldierIds.length,
      canonicalPairCount: canonical.set.size,
      heroFinalPairCount: hero.set.size,
      soldierFinalPairCount: soldier.set.size,
      canonicalVsHeroMismatch: diffs.canonicalMinusHero.count + diffs.heroMinusCanonical.count,
      canonicalVsSoldierMismatch: diffs.canonicalMinusSoldier.count + diffs.soldierMinusCanonical.count,
      heroVsSoldierMismatch: diffs.heroMinusSoldier.count + diffs.soldierMinusHero.count,
      duplicatePairCount,
      malformedPairCount: invalidPairCount,
      unknownHeroIdCount: unknownHeroIds.size,
      unknownSoldierIdCount: unknownSoldierIds.size,
      duplicateHeroIdCount: heroIdDup.length,
      duplicateSoldierIdCount: soldierIdDup.length,
      heroShardErrorCount: hero.shardErrors.length,
      soldierRecordErrorCount: soldier.recordErrors.length,
      hardErrorCount: hardErrors.length,
    },
    differences: diffs,
    diagnostics: {
      canonicalInvalidPairs: canonical.invalid.slice(0, 50),
      canonicalDuplicatePairs: sorted(new Set([...canonical.duplicates, ...canonical.duplicateValues])).slice(0, 50),
      heroInvalidPairs: hero.invalid.slice(0, 50),
      heroDuplicatePairs: sorted(new Set([...hero.duplicates, ...hero.duplicateValues])).slice(0, 50),
      soldierInvalidPairs: soldier.invalid.slice(0, 50),
      soldierDuplicatePairs: sorted(new Set([...soldier.duplicates, ...soldier.duplicateValues])).slice(0, 50),
      unknownHeroIds: [...unknownHeroIds].sort((a, b) => a - b).slice(0, 100),
      unknownSoldierIds: [...unknownSoldierIds].sort((a, b) => a - b).slice(0, 100),
      duplicateHeroIds: heroIdDup.slice(0, 100),
      duplicateSoldierIds: soldierIdDup.slice(0, 100),
      heroShardErrors: hero.shardErrors.slice(0, 100),
      soldierRecordErrors: soldier.recordErrors.slice(0, 100),
    },
    passCriteria: {
      heroCount: expected.heroes,
      soldierCount: expected.soldiers,
      canonicalPairs: expected.canonicalPairs,
      heroFinalPairs: expected.canonicalPairs,
      soldierFinalPairs: expected.canonicalPairs,
      allSixSetDifferences: 0,
      duplicatePairs: 0,
      unknownHeroIds: 0,
      unknownSoldierIds: 0,
      malformedPairs: 0,
      hardErrors: 0,
    },
    hardErrors,
    decision: status === 'PASS'
      ? 'C-1 PASS. The canonical 5,977 Hero-Soldier pairs, final Hero-shard soldiers.ids pairs, and final Soldier-record heroes.finalHeroIds pairs are exactly identical with zero missing, extra, duplicate, malformed, or unknown-ID membership.'
      : 'C-1 FAIL. Final cross-consumer membership is not identical to the frozen canonical relation set; C-2 must not start until the reported hard errors are resolved.',
    nextStartPoint: status === 'PASS'
      ? 'C-2 consumer identity / ID resolution QA.'
      : 'Resolve C-1 pair-parity failures before any later Stage C work.',
  };

  writeJson(P.output, output);
  console.log(JSON.stringify({ status, completion: output.completion, summary: output.summary, hardErrors }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}

main();
