import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist', 'client');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
function assert(condition, message) { if (!condition) throw new Error(message); }
function shaFile(absPath) {
  const bytes = fs.readFileSync(absPath);
  return {
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

const relation = readJson('data/generated/skin-stage2-3-bidirectional-relation.v1.json');
const retirement = readJson('data/contracts/skin-stage3-5-static-retirement.v1.json');
const fullartManifest = readJson(retirement.productionBoundary.fullartManifestPath);

assert(retirement.status === 'DESIGN_FROZEN', 'Legacy Skin static retirement contract is not frozen');
assert(retirement.completion?.status === 'PASS_SKIN_STAGE3_5_STATIC_RETIREMENT', 'Legacy Skin static retirement is not final PASS');
assert(retirement.productionBoundary?.legacyStaticAssetConsumed === false, 'Legacy Skin static delivery was re-admitted');
assert(retirement.retirementPolicy?.legacyFileCountRequired === false, 'Legacy Skin file-count dependency was reintroduced');
assert(fullartManifest.boundaries?.legacyStaticAssetConsumed === false, 'Current Skin fullart manifest consumes retired static assets');
assert(fullartManifest.boundaries?.semanticRecomputed === false && fullartManifest.boundaries?.relationRecomputed === false, 'Current Skin fullart manifest crossed the semantic boundary');
assert(fs.existsSync(DIST), 'Static build output dist/client is missing');

const heroIds = Object.keys(relation.byHeroId ?? {}).map(Number).sort((a, b) => a - b);
assert(heroIds.length === 267, `Expected 267 Hero IDs, got ${heroIds.length}`);
const heroDetailFiles = heroIds.map((heroId) => path.join(DIST, 'heroes', String(heroId), 'index.html'));
const missingHeroPages = heroDetailFiles.filter((file) => !fs.existsSync(file));
assert(missingHeroPages.length === 0, `Missing static Hero detail pages: ${missingHeroPages.slice(0, 5).join(', ')}`);

const legacySkinDir = path.join(DIST, 'images', 'skins');
assert(!fs.existsSync(legacySkinDir), 'Retired Skin static directory leaked back into the production build');

const fullartRecords = Array.isArray(fullartManifest.records) ? fullartManifest.records : [];
assert(fullartRecords.length > 0, 'Current Skin fullart manifest has no delivered visuals');
let verifiedFullartCount = 0;
for (const record of fullartRecords) {
  assert(typeof record.publicPath === 'string' && record.publicPath.startsWith(retirement.productionBoundary.fullartPublicPrefix), `Invalid current fullart publicPath for Skin ${record.skinId}`);
  const rel = record.publicPath.replace(/^\/+/, '');
  const file = path.join(DIST, rel);
  assert(fs.existsSync(file), `Static candidate missing current fullart Skin ${record.skinId}`);
  const actual = shaFile(file);
  assert(actual.sizeBytes === record.sizeBytes, `Static candidate fullart size mismatch for Skin ${record.skinId}`);
  assert(actual.sha256 === String(record.sha256).toLowerCase(), `Static candidate fullart SHA mismatch for Skin ${record.skinId}`);
  verifiedFullartCount += 1;
}

const referenceHeroId = Number(fullartManifest.referenceHeroId);
assert(Number.isSafeInteger(referenceHeroId) && referenceHeroId > 0, 'Current Skin fullart reference Hero ID is invalid');
const referenceHeroFile = path.join(DIST, 'heroes', String(referenceHeroId), 'index.html');
assert(fs.existsSync(referenceHeroFile), `Reference Hero ${referenceHeroId} static detail page is missing`);
const referenceHtml = fs.readFileSync(referenceHeroFile, 'utf8');
assert(referenceHtml.length > 0 && /<!doctype\s+html|<html[\s>]/i.test(referenceHtml), `Reference Hero ${referenceHeroId} static document is not HTML`);

const result = {
  schemaVersion: 2,
  stage: 'skin-page-3',
  substage: '3-6-static-current-delivery',
  evidenceClass: 'GITHUB_PAGES_STATIC_CANDIDATE_VALIDATION',
  status: 'PASS_SKIN_STAGE3_6_STATIC_CURRENT_DELIVERY',
  finalReady: true,
  counts: {
    heroDetailPageCount: heroDetailFiles.length,
    currentFullartManifestCount: fullartRecords.length,
    verifiedFullartArtifactCount: verifiedFullartCount,
    retiredLegacySkinDirectoryCount: 0,
  },
  boundaries: {
    basePath: '/langrisser-future-guide/',
    currentFullartDeliveryVerified: true,
    actualBuiltArtifactHashVerified: true,
    heroDetailRouteFilesVerified: true,
    legacyStaticSkinDeliveryRequired: false,
    legacyStaticSkinDirectoryAbsent: true,
    allCanonicalSkinsClaimedDelivered: false,
    browserUiProofDeferred: true,
    semanticStageReopened: false,
    relationRecomputed: false,
    nameJoin: false,
    idArithmetic: false,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
