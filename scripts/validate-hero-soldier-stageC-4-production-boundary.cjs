const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const contractPath = 'data/contracts/hero-soldier-integration-stageC-4-production-boundary.v1.json';
const outputPath = 'data/validation/hero-soldier-integration-stageC-4-production-boundary.v1.json';

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) { fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n'); }
function gitBlobSha(p) { return execFileSync('git', ['hash-object', p], { cwd: ROOT, encoding: 'utf8' }).trim(); }
function descriptor(p) { return { path: p, gitBlobSha: gitBlobSha(p) }; }
function isPassFamily(value) { return typeof value === 'string' && value.startsWith('PASS'); }

const contract = readJson(contractPath);
const c0 = readJson(contract.upstreamCheckpoints.c0.path);
const c1 = readJson(contract.upstreamCheckpoints.c1.path);
const c2 = readJson(contract.upstreamCheckpoints.c2.path);
const c3 = readJson(contract.upstreamCheckpoints.c3.path);
const canonical = readJson(contract.frozenProductionArtifacts.canonicalRelation.path);
const byHero = readJson(contract.frozenProductionArtifacts.byHeroIndex.path);
const bySoldier = readJson(contract.frozenProductionArtifacts.bySoldierIndex.path);
const heroManifest = readJson(contract.frozenProductionArtifacts.heroFinalConsumer.manifestPath);
const soldierRecords = readJson(contract.frozenProductionArtifacts.soldierFinalConsumer.path);

const sourceFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(?:[cm]?[jt]sx?)$/i.test(ent.name)) sourceFiles.push(full);
  }
}
walk(abs(contract.staticGate.scanRoot));

const blockedPathHits = [];
const blockedSemanticHits = [];
const blockedIdArithmeticHits = [];
const blockedNameJoinHits = [];
const semanticTokens = contract.staticGate.blockedSemanticTokensInHeroSoldierSource || [];
const pathTokens = contract.staticGate.blockedFrontendPathTokens || [];

for (const full of sourceFiles) {
  const rel = path.relative(ROOT, full).split(path.sep).join('/');
  const text = fs.readFileSync(full, 'utf8');
  for (const token of pathTokens) {
    if (text.includes(token)) blockedPathHits.push({ path: rel, token });
  }

  const heroSoldierRelevant = /(?:hero|soldier)/i.test(rel) || /\b(?:heroId|soldierId|finalHeroIds)\b|soldiers\s*\.\s*ids/.test(text);
  if (!heroSoldierRelevant) continue;

  for (const token of semanticTokens) {
    if (text.includes(token)) blockedSemanticHits.push({ path: rel, token });
  }

  const idArithmeticPatterns = [
    /(?:hero|soldier)[\s\S]{0,180}(?:\+\s*5000|-\s*5000)/i,
    /(?:\+\s*5000|-\s*5000)[\s\S]{0,180}(?:hero|soldier)/i,
  ];
  if (idArithmeticPatterns.some((re) => re.test(text))) blockedIdArithmeticHits.push({ path: rel, rule: 'no +/-5000 Hero/Soldier membership translation' });

  const nameJoinPatterns = [
    /\.find\s*\([^\n]{0,240}(?:heroName|soldierName|nameKr|nameCn|nameEn)/i,
    /(?:heroName|soldierName|nameKr|nameCn|nameEn)[^\n]{0,180}\.find\s*\(/i,
  ];
  if (nameJoinPatterns.some((re) => re.test(text))) blockedNameJoinHits.push({ path: rel, rule: 'no display-name membership JOIN' });
}

const canonicalSha = contract.frozenProductionArtifacts.canonicalRelation.gitBlobSha;
const checks = {
  contractStageIsC4: contract.stage === 'C-4',
  contractFrozen: contract.status === 'FROZEN',
  c0BlobFrozen: gitBlobSha(contract.upstreamCheckpoints.c0.path) === contract.upstreamCheckpoints.c0.gitBlobSha,
  c1BlobFrozen: gitBlobSha(contract.upstreamCheckpoints.c1.path) === contract.upstreamCheckpoints.c1.gitBlobSha,
  c2BlobFrozen: gitBlobSha(contract.upstreamCheckpoints.c2.path) === contract.upstreamCheckpoints.c2.gitBlobSha,
  c3BlobFrozen: gitBlobSha(contract.upstreamCheckpoints.c3.path) === contract.upstreamCheckpoints.c3.gitBlobSha,
  c0Accepted: c0.status === 'FROZEN',
  c1Accepted: c1.status === 'PASS' && c1.completion === 'COMPLETE',
  c2Accepted: isPassFamily(c2.status) && c2.completion === 'COMPLETE',
  c3Accepted: c3.status === 'PASS' && c3.completion === 'COMPLETE',
  canonicalBlobFrozen: gitBlobSha(contract.frozenProductionArtifacts.canonicalRelation.path) === canonicalSha,
  byHeroBlobFrozen: gitBlobSha(contract.frozenProductionArtifacts.byHeroIndex.path) === contract.frozenProductionArtifacts.byHeroIndex.gitBlobSha,
  bySoldierBlobFrozen: gitBlobSha(contract.frozenProductionArtifacts.bySoldierIndex.path) === contract.frozenProductionArtifacts.bySoldierIndex.gitBlobSha,
  heroManifestBlobFrozen: gitBlobSha(contract.frozenProductionArtifacts.heroFinalConsumer.manifestPath) === contract.frozenProductionArtifacts.heroFinalConsumer.manifestGitBlobSha,
  soldierRecordsBlobFrozen: gitBlobSha(contract.frozenProductionArtifacts.soldierFinalConsumer.path) === contract.frozenProductionArtifacts.soldierFinalConsumer.gitBlobSha,
  canonicalPairCount: canonical.summary?.edgeCount === contract.frozenProductionArtifacts.canonicalRelation.expectedPairCount,
  byHeroSourceIsCanonical: byHero.relationSet?.gitBlobSha === canonicalSha,
  bySoldierSourceIsCanonical: bySoldier.relationSet?.gitBlobSha === canonicalSha,
  byHeroKeyCount: byHero.summary?.keyCount === contract.frozenProductionArtifacts.byHeroIndex.expectedKeyCount,
  byHeroPairCount: byHero.summary?.relationCount === contract.frozenProductionArtifacts.byHeroIndex.expectedPairCount,
  bySoldierKeyCount: bySoldier.summary?.keyCount === contract.frozenProductionArtifacts.bySoldierIndex.expectedKeyCount,
  bySoldierPairCount: bySoldier.summary?.relationCount === contract.frozenProductionArtifacts.bySoldierIndex.expectedPairCount,
  c0CanonicalMatches: c0.relationSnapshotIdentity?.canonicalGitBlobSha === canonicalSha && c0.relationSnapshotIdentity?.allEqualRequired === true,
  c3CanonicalCountMatches: c3.summary?.canonicalRelationCount === contract.frozenProductionArtifacts.canonicalRelation.expectedPairCount,
  oneWayDirectionFrozen: contract.mutationPolicy?.direction === 'ONE_WAY_ONLY',
  frontendWritebackForbidden: contract.mutationPolicy?.frontendMayWriteBackMembership === false,
  crossConsumerPatchForbidden: contract.mutationPolicy?.heroConsumerMayPatchSoldierConsumer === false && contract.mutationPolicy?.soldierConsumerMayPatchHeroConsumer === false,
  presentationCannotChangeMembership: contract.mutationPolicy?.nameOrPresentationMayChangeMembership === false,
  finalHeroMembershipFieldFrozen: contract.frozenProductionArtifacts.heroFinalConsumer.membershipField.endsWith('#soldiers.ids'),
  finalSoldierMembershipFieldFrozen: contract.frozenProductionArtifacts.soldierFinalConsumer.membershipField === 'records[*].heroes.finalHeroIds',
  noBlockedFrontendPathImports: blockedPathHits.length === 0,
  noBlockedSemanticReconstruction: blockedSemanticHits.length === 0,
  noBlockedIdArithmetic: blockedIdArithmeticHits.length === 0,
  noBlockedNameJoin: blockedNameJoinHits.length === 0,
};

const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const hardErrors = [
  ...failedChecks.map((check) => ({ code: 'CHECK_FAILED', check })),
  ...blockedPathHits.map((x) => ({ code: 'FRONTEND_FORBIDDEN_PATH_IMPORT', ...x })),
  ...blockedSemanticHits.map((x) => ({ code: 'FRONTEND_RELATION_RECOMPUTE_SIGNATURE', ...x })),
  ...blockedIdArithmeticHits.map((x) => ({ code: 'FRONTEND_ID_ARITHMETIC', ...x })),
  ...blockedNameJoinHits.map((x) => ({ code: 'FRONTEND_NAME_JOIN', ...x })),
];

const status = hardErrors.length === 0 ? 'PASS' : 'FAIL';
const output = {
  version: 1,
  schemaId: 'hero-soldier-integration-stageC-4-production-boundary-validation/v1',
  stage: 'C-4',
  checkpoint: 'production-boundary-contract',
  status,
  completion: status === 'PASS' ? 'COMPLETE' : 'BLOCKED',
  purpose: 'Validate that accepted Hero-Soldier relation ownership is frozen as a one-way offline production flow and that frontend source does not bypass final Hero/Soldier consumers or reconstruct membership.',
  sources: {
    contract: descriptor(contractPath),
    c0: descriptor(contract.upstreamCheckpoints.c0.path),
    c1: descriptor(contract.upstreamCheckpoints.c1.path),
    c2: descriptor(contract.upstreamCheckpoints.c2.path),
    c3: descriptor(contract.upstreamCheckpoints.c3.path),
    canonicalRelation: descriptor(contract.frozenProductionArtifacts.canonicalRelation.path),
    byHeroIndex: descriptor(contract.frozenProductionArtifacts.byHeroIndex.path),
    bySoldierIndex: descriptor(contract.frozenProductionArtifacts.bySoldierIndex.path),
    heroManifest: descriptor(contract.frozenProductionArtifacts.heroFinalConsumer.manifestPath),
    soldierRecords: descriptor(contract.frozenProductionArtifacts.soldierFinalConsumer.path),
  },
  productionFlow: contract.productionFlow,
  checks,
  summary: {
    canonicalRelationCount: canonical.summary?.edgeCount ?? null,
    heroIndexKeyCount: byHero.summary?.keyCount ?? null,
    heroIndexPairCount: byHero.summary?.relationCount ?? null,
    soldierIndexKeyCount: bySoldier.summary?.keyCount ?? null,
    soldierIndexPairCount: bySoldier.summary?.relationCount ?? null,
    frontendSourceFileCount: sourceFiles.length,
    blockedFrontendPathImportCount: blockedPathHits.length,
    blockedSemanticReconstructionCount: blockedSemanticHits.length,
    blockedIdArithmeticCount: blockedIdArithmeticHits.length,
    blockedNameJoinCount: blockedNameJoinHits.length,
    failedCheckCount: failedChecks.length,
    hardErrorCount: hardErrors.length,
  },
  frontendBoundary: {
    implementationStatus: contract.frontendBoundary.currentImplementationStatus,
    scansFinalImplementationNow: false,
    note: 'C-4 freezes ownership and enforces forbidden bypass/recompute signatures. Route/click/back/404/mobile behavior remains outside Stage C and is validated later in UI Integration QA.',
  },
  diagnostics: {
    blockedPathHits,
    blockedSemanticHits,
    blockedIdArithmeticHits,
    blockedNameJoinHits,
    failedChecks,
  },
  nonBlockingReviewsForwarded: [
    { code: 'PRESENTATION_METADATA_INCOMPLETE', classification: 'REVIEW', blocking: false, rule: 'Localization/release/assets cannot mutate membership IDs.' },
    { code: 'HERO_SOLDIER_FRONTEND_NOT_YET_IMPLEMENTED', classification: 'REVIEW', blocking: false, rule: 'C-4 is the production ownership boundary; deployed navigation behavior is a later UI Integration QA concern.' },
  ],
  hardErrors,
  decision: status === 'PASS'
    ? 'C-4 PASS. Hero-Soldier production ownership is frozen as canonical relation -> byHero/bySoldier offline projections -> final Hero/Soldier consumers -> frontend presentation/navigation. Frontend writeback, raw ConfigData relation reads, direct canonical/index ownership, semantic reconstruction, detected +/-5000 translation, and detected display-name membership JOINs are prohibited.'
    : `C-4 FAIL. ${hardErrors.length} hard boundary violation(s) must be resolved before C-5.`,
  nextStartPoint: status === 'PASS'
    ? 'C-5 final closeout: read only C-0 through C-4 and freeze the integrated Hero-Soldier pipeline as FINAL_FROZEN.'
    : 'Resolve C-4 hard errors; do not proceed to C-5.',
};

writeJson(outputPath, output);
console.log(JSON.stringify({ status, ...output.summary }, null, 2));
if (status !== 'PASS') process.exitCode = 1;
