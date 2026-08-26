const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  c0: 'data/contracts/hero-soldier-integration-stageC-0-input.v1.json',
  c1: 'data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json',
  c2: 'data/validation/hero-soldier-integration-stageC-2-id-resolution.v1.json',
  aFinal: 'data/validation/hero-soldier-relation-stageA-final.v1.json',
  aValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  fixturePlan: 'data/validation/soldier-representative-fixture-plan.v1.json',
  relation: 'data/generated/hero-soldier-relations.v1.json',
  heroManifest: 'data/generated/hero-detail.v1.json',
  soldierRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  output: 'data/validation/hero-soldier-integration-stageC-3-special-fixtures.v1.json',
};

const FROZEN = {
  c0: 'ec4effc3fb35b2ea90cc267e0c96609e2b36f312',
  c1: 'c8a2d96ff5fce0dffb6ffbe89b92d5c37cf78bc3',
  c2: '2c1efc5bc324b2f0f3b37db666aafe8633a5a157',
  aFinal: '963dd9933d2e28e1bf66e663878c60e1c61198a0',
  aValidation: '7c38a07f25c7ee3829e7cc0d699d0ec4bbc28638',
  fixturePlan: '1f774530428ef6577d34da900f4625606a741de5',
  relation: '1e70dc3700578bc7bf03e01b7c893b4583ee59d6',
  heroManifest: 'f7926eb3cfc552443b03b0cd6795524215e34b66',
  soldierRecords: '26a6054484cccb7d2613305fe3ae01d697c713df',
};

function abs(p) { return path.join(ROOT, p); }
function load(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function write(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function blob(p) {
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
function edgeSort(a, b) { return a.soldierId - b.soldierId || a.heroId - b.heroId; }
function direct(edge, kind) {
  return (edge?.provenance || []).find((p) => p?.sourceKind === kind && p?.sourceClass === 'DIRECT') || null;
}
function inherited(edge, parentKind) {
  return (edge?.provenance || []).find((p) =>
    p?.sourceKind === 'SP_SOLDIER_INHERIT' &&
    p?.sourceClass === 'DERIVED' &&
    p?.parentEdge?.parentSourceKind === parentKind
  ) || null;
}
function expectedOrigin(p, table, field) {
  return !!p && p?.origin?.table === table && p?.origin?.field === field;
}
function expectedLink(p, normalSoldierId, spSoldierId) {
  return !!p &&
    p?.supportRelation?.kind === 'SP_FORM_LINK' &&
    p?.supportRelation?.normalSoldierId === normalSoldierId &&
    p?.supportRelation?.spSoldierId === spSoldierId;
}
function choose(edges, predicate) {
  return [...edges].filter(predicate).sort(edgeSort)[0] || null;
}

function main() {
  const c0 = load(P.c0);
  const c1 = load(P.c1);
  const c2 = load(P.c2);
  const aFinal = load(P.aFinal);
  const aValidation = load(P.aValidation);
  const fixturePlan = load(P.fixturePlan);
  const relation = load(P.relation);
  const heroManifest = load(P.heroManifest);
  const soldierRecords = load(P.soldierRecords);

  const hardErrors = [];
  const sources = {};
  for (const [name, p] of Object.entries(P)) {
    if (name === 'output') continue;
    sources[name] = { path: p, gitBlobSha: blob(p) };
  }

  const snapshotChecks = {};
  for (const [name, expectedSha] of Object.entries(FROZEN)) {
    snapshotChecks[name] = sources[name]?.gitBlobSha === expectedSha;
    if (!snapshotChecks[name]) hardErrors.push(`Frozen input drift: ${name}`);
  }
  const c0RelationSha = c0?.authoritativeInputs?.relationLayer?.canonicalRelationSet?.gitBlobSha;
  snapshotChecks.c0CanonicalRelationMatches = c0RelationSha === FROZEN.relation;
  if (!snapshotChecks.c0CanonicalRelationMatches) hardErrors.push('C-0 canonical relation snapshot no longer matches the accepted A relation blob.');

  const upstreamChecks = {
    aFinalAccepted: aFinal?.status === 'PASS_ACCEPTED',
    aValidationPass: aValidation?.status === 'PASS',
    aFixturePassFive: aFinal?.acceptedCounts?.fixturePass === 5 && aFinal?.acceptedCounts?.fixtureFail === 0,
    c1PassComplete: c1?.status === 'PASS' && c1?.completion === 'COMPLETE' && c1?.summary?.hardErrorCount === 0,
    c2PassFamilyComplete: ['PASS', 'PASS_WITH_REVIEW'].includes(c2?.status) && c2?.completion === 'COMPLETE' && c2?.summary?.hardErrorCount === 0,
    fixturePlanPass: fixturePlan?.status === 'PASS' && fixturePlan?.coverage?.fixtureCount === 5,
  };
  for (const [name, ok] of Object.entries(upstreamChecks)) if (!ok) hardErrors.push(`Upstream gate failed: ${name}`);

  const aFixtureBySoldier = new Map((aValidation?.fixtures || []).map((f) => [f.soldierId, f]));
  const planned = fixturePlan?.fixtures || [];
  const normal105 = planned.find((f) => f.soldierId === 105 && f.fixtureKind === 'NORMAL_ONLY');
  const firstStage = planned.find((f) => f.soldierId === 622 && f.spSoldierId === 5622 && f.fixtureKind === 'SP_FIRST_STAGE_ONLY');
  const twoStage = planned.find((f) => f.soldierId === 320 && f.spSoldierId === 5320 && f.fixtureKind === 'SP_TWO_STAGE');
  const fixturePlanChecks = {
    normal105Present: !!normal105,
    firstStage622to5622Present: !!firstStage,
    twoStage320to5320Present: !!twoStage,
    aNormal105Pass: aFixtureBySoldier.get(105)?.status === 'PASS',
    aFirstStage5622Pass: aFixtureBySoldier.get(5622)?.status === 'PASS',
    aTwoStage5320Pass: aFixtureBySoldier.get(5320)?.status === 'PASS',
    aFirstStageNoExpand: aFixtureBySoldier.get(5622)?.checks?.expandProvenance === 0,
    aTwoStageExpandPresent: aFixtureBySoldier.get(5320)?.checks?.expandMissing === 0,
    aTwoStageNoBackwardLeak: aFixtureBySoldier.get(5320)?.checks?.backwardExpandLeak === 0,
  };
  for (const [name, ok] of Object.entries(fixturePlanChecks)) if (!ok) hardErrors.push(`Frozen fixture prerequisite failed: ${name}`);

  const edges = Array.isArray(relation?.edges) ? relation.edges : [];
  if (edges.length !== 5977) hardErrors.push(`Canonical edge count is ${edges.length}, expected 5977.`);

  const firstStageEdges = edges.filter((e) => e.soldierId === 5622);
  const firstStageExpandCount = firstStageEdges.filter((e) => !!direct(e, 'SP_SOLDIER_EXPAND')).length;
  if (firstStageExpandCount !== 0) hardErrors.push(`SP first-stage fixture 5622 unexpectedly has ${firstStageExpandCount} direct second-stage expand edges.`);

  const selected = [
    {
      code: 'NORMAL_BASE',
      description: 'Normal Soldier baseline relation produced by direct BASE_SOLDIER_HERO provenance.',
      edge: choose(edges, (e) => e.soldierId === 105 && !!direct(e, 'BASE_SOLDIER_HERO')),
      provenance: (e) => direct(e, 'BASE_SOLDIER_HERO'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSoldierInfo', 'GetSoldierHeros_ID'),
    },
    {
      code: 'SP_FIRST_STAGE_INHERIT_BASE',
      description: 'One-stage SP Soldier inherits a normal Soldier direct base relation through the explicit 622 -> 5622 SP form link.',
      edge: choose(edges, (e) => e.soldierId === 5622 && !!inherited(e, 'BASE_SOLDIER_HERO')),
      provenance: (e) => inherited(e, 'BASE_SOLDIER_HERO'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSoldierInfo', 'GetSoldierHeros_ID') && expectedLink(p, 622, 5622),
    },
    {
      code: 'SP_TWO_STAGE_INHERIT_BASE',
      description: 'Two-stage SP Soldier preserves inherited normal-Soldier membership through the explicit 320 -> 5320 SP form link.',
      edge: choose(edges, (e) => e.soldierId === 5320 && !!inherited(e, 'BASE_SOLDIER_HERO')),
      provenance: (e) => inherited(e, 'BASE_SOLDIER_HERO'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSoldierInfo', 'GetSoldierHeros_ID') && expectedLink(p, 320, 5320),
    },
    {
      code: 'SP_HERO_REWARD_DIRECT',
      description: 'Direct SP Hero second-stage reward relation is present in the accepted canonical relation set.',
      edge: choose(edges, (e) => !!direct(e, 'SP_HERO_REWARD')),
      provenance: (e) => direct(e, 'SP_HERO_REWARD'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSPHeroInfo', 'SecondStageRewardSoldiers'),
    },
    {
      code: 'SP_HERO_REWARD_INHERITED',
      description: 'An SP Hero reward attached to a normal Soldier is inherited by its explicitly linked SP Soldier form.',
      edge: choose(edges, (e) => !!inherited(e, 'SP_HERO_REWARD')),
      provenance: (e) => inherited(e, 'SP_HERO_REWARD'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSPHeroInfo', 'SecondStageRewardSoldiers') && p?.supportRelation?.kind === 'SP_FORM_LINK',
    },
    {
      code: 'SECOND_STAGE_EXPAND',
      description: 'Two-stage SP Soldier 5320 contains a direct SecondStageExpandHeroList relation.',
      edge: choose(edges, (e) => e.soldierId === 5320 && !!direct(e, 'SP_SOLDIER_EXPAND')),
      provenance: (e) => direct(e, 'SP_SOLDIER_EXPAND'),
      validateProvenance: (p) => expectedOrigin(p, 'ConfigDataSPSoldierInfo', 'SecondStageExpandHeroList'),
    },
  ];

  const soldierById = new Map((soldierRecords?.records || []).map((r) => [r.soldierId, r]));
  const heroLocators = heroManifest?.storage?.byHeroId || {};
  const cases = [];

  for (const spec of selected) {
    const edge = spec.edge;
    const diagnostics = [];
    if (!edge) {
      diagnostics.push('No accepted canonical edge matches this frozen fixture criterion.');
      cases.push({ code: spec.code, description: spec.description, status: 'FAIL', heroId: null, soldierId: null, diagnostics });
      hardErrors.push(`${spec.code}: canonical fixture edge not found.`);
      continue;
    }

    const provenance = spec.provenance(edge);
    const provenancePass = spec.validateProvenance(provenance);
    if (!provenancePass) diagnostics.push('Canonical provenance shape/origin does not match the frozen A-stage semantic rule.');

    const heroId = edge.heroId;
    const soldierId = edge.soldierId;
    const locator = heroLocators[String(heroId)];
    let heroFinalHasPair = false;
    let heroShardPath = locator?.path || null;
    if (!heroShardPath || !fs.existsSync(abs(heroShardPath))) {
      diagnostics.push('Final Hero shard is missing.');
    } else {
      const shard = load(heroShardPath);
      heroFinalHasPair = shard?.heroId === heroId && Array.isArray(shard?.soldiers?.ids) && shard.soldiers.ids.includes(soldierId);
      if (!heroFinalHasPair) diagnostics.push('Final Hero shard does not contain the accepted Soldier membership pair.');
    }

    const soldierRecord = soldierById.get(soldierId);
    const soldierFinalHasPair = !!soldierRecord && Array.isArray(soldierRecord?.heroes?.finalHeroIds) && soldierRecord.heroes.finalHeroIds.includes(heroId);
    if (!soldierFinalHasPair) diagnostics.push('Final Soldier record does not contain the accepted Hero membership pair.');

    const status = provenancePass && heroFinalHasPair && soldierFinalHasPair ? 'PASS' : 'FAIL';
    if (status === 'FAIL') hardErrors.push(`${spec.code}: final regression fixture failed for ${pairKey(heroId, soldierId)}.`);

    cases.push({
      code: spec.code,
      description: spec.description,
      status,
      heroId,
      soldierId,
      pairKey: pairKey(heroId, soldierId),
      canonicalEdgePresent: true,
      canonicalProvenancePass: provenancePass,
      provenance: provenance ? {
        sourceKind: provenance.sourceKind,
        sourceClass: provenance.sourceClass,
        origin: provenance.origin || null,
        parentEdge: provenance.parentEdge || null,
        supportRelation: provenance.supportRelation || null,
      } : null,
      finalHero: { shardPath: heroShardPath, containsSoldierId: heroFinalHasPair },
      finalSoldier: { containsHeroId: soldierFinalHasPair },
      diagnostics,
    });
  }

  const fixturePassCount = cases.filter((c) => c.status === 'PASS').length;
  const fixtureFailCount = cases.length - fixturePassCount;
  const provenanceFailureCount = cases.filter((c) => !c.canonicalProvenancePass && c.heroId !== null).length;
  const heroConsumerFailureCount = cases.filter((c) => c.heroId !== null && !c.finalHero?.containsSoldierId).length;
  const soldierConsumerFailureCount = cases.filter((c) => c.heroId !== null && !c.finalSoldier?.containsHeroId).length;

  const frozenConceptualCounts = aValidation?.goldenComparison?.currentConceptualCounts || {};
  const conceptualCountChecks = {
    baseEdges: frozenConceptualCounts.baseEdges === 5720,
    directSpHeroAddedEdges: frozenConceptualCounts.directSpHeroAddedEdges === 25,
    inheritedSpHeroAddedEdges: frozenConceptualCounts.inheritedSpHeroAddedEdges === 5,
    spExpandedEdges: frozenConceptualCounts.spExpandedEdges === 228,
  };
  for (const [name, ok] of Object.entries(conceptualCountChecks)) if (!ok) hardErrors.push(`Accepted A conceptual count changed: ${name}`);

  const status = hardErrors.length === 0 && fixtureFailCount === 0 ? 'PASS' : 'FAIL';
  const output = {
    version: 1,
    schemaId: 'hero-soldier-integration-stageC-3-special-fixtures/v1',
    stage: 'C-3',
    checkpoint: 'special-relation-final-consumer-regression',
    status,
    completion: status === 'PASS' ? 'COMPLETE' : 'BLOCKED',
    purpose: 'Regression-test representative accepted A-stage Hero-Soldier relation semantics through the final Hero and Soldier consumers without rereading or re-deriving raw ConfigData.',
    sourcePolicy: 'C-3 reads only frozen A/C checkpoints, the accepted canonical relation set with provenance, the frozen representative fixture plan, and final materialized Hero/Soldier consumer outputs.',
    sources,
    upstreamChecks,
    snapshotChecks,
    fixturePlanChecks,
    frozenAConceptualCounts: frozenConceptualCounts,
    conceptualCountChecks,
    summary: {
      canonicalRelationCount: edges.length,
      semanticFixtureCount: cases.length,
      fixturePassCount,
      fixtureFailCount,
      provenanceFailureCount,
      heroConsumerFailureCount,
      soldierConsumerFailureCount,
      firstStageUnexpectedExpandEdgeCount: firstStageExpandCount,
      hardErrorCount: hardErrors.length,
    },
    fixtures: cases,
    nonBlockingReviewsForwarded: c2?.nonBlockingReviews || [],
    hardErrors,
    passCriteria: {
      upstreamAFinalC1C2Accepted: true,
      frozenSnapshotsUnchanged: true,
      semanticFixtures: 6,
      fixtureFailures: 0,
      provenanceFailures: 0,
      finalHeroMembershipFailures: 0,
      finalSoldierMembershipFailures: 0,
      firstStageUnexpectedSecondStageExpansion: 0,
      hardErrors: 0,
    },
    decision: status === 'PASS'
      ? 'C-3 PASS. Six representative semantic relation paths—normal base, one-stage SP inheritance, two-stage SP inheritance, direct SP Hero reward, inherited SP Hero reward, and second-stage SP expansion—remain present in the accepted canonical relation and are preserved in both final Hero and final Soldier consumers.'
      : 'C-3 FAIL. At least one frozen semantic fixture, provenance rule, snapshot, or final consumer membership check failed. Stage C must stop before C-4.',
    nextStartPoint: status === 'PASS'
      ? 'C-4 production-boundary contract: freeze canonical/index/consumer/frontend ownership and prohibit runtime relation recomputation.'
      : 'Stop Stage C and inspect C-3 hardErrors/fixture diagnostics before proceeding.',
  };
  write(P.output, output);
  console.log(JSON.stringify({ status: output.status, completion: output.completion, summary: output.summary, fixtures: output.fixtures.map((f) => ({ code: f.code, status: f.status, pairKey: f.pairKey })), hardErrors: output.hardErrors }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}

main();
