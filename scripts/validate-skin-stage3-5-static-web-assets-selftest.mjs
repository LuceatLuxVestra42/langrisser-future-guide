import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildStaticWebAssets } from './build-skin-stage3-5-static-web-assets.mjs';
import { evaluateStaticWebAssetManifest } from './validate-skin-stage3-5-static-web-assets.mjs';

const CONTRACT_PATH = 'data/contracts/skin-stage3-5-static-web-asset-map.v1.json';
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));
function assert(c, m) { if (!c) throw new Error(m); }
function expectThrow(name, fn) {
  try { fn(); }
  catch { return { name, pass: true }; }
  return { name, pass: false, reason: 'expected throw' };
}

function fixture(root) {
  const extractedRoot = path.join(root, 'extracted');
  const repoRoot = path.join(root, 'repo');
  fs.mkdirSync(extractedRoot, { recursive: true });
  fs.mkdirSync(repoRoot, { recursive: true });

  const bySkinId = {};
  const byHeroId = {};
  for (let heroId = 1; heroId <= 267; heroId++) byHeroId[String(heroId)] = [];
  const sourceOrderByHero = new Map();
  const staticRequests = [];
  const staticRecords = [];
  const pngSha = sha(PNG_BYTES);

  for (let i = 0; i < 540; i++) {
    const skinId = 1001 + i;
    const heroId = (i % 267) + 1;
    const sourceOrder = (sourceOrderByHero.get(heroId) ?? 0) + 1;
    sourceOrderByHero.set(heroId, sourceOrder);
    bySkinId[String(skinId)] = { heroId, sourceOrder };
    byHeroId[String(heroId)].push({ skinId, sourceOrder });

    const requestId = `skin:${skinId}:static`;
    const runtimePath = `assets/gameproject/runtimeassets/ui/icon/heroskin_abs/skin/skin_${skinId}.png`;
    const source = {
      bundle: `ui_${Math.floor(i / 100)}.b`,
      bundleSha256: '1'.repeat(64),
      embeddedCab: `CAB-${String(i).padStart(32, '0')}`,
      embeddedCabSha256: '2'.repeat(64),
    };
    staticRequests.push({
      requestId,
      targetId: requestId,
      kind: 'STATIC',
      skinId,
      skinResourceId: null,
      runtimePath,
      selectedExtractionSource: source,
      sourceSelectionPolicy: 'SOLE_EXACT_BUNDLE_CAB',
    });
    const rel = `static/${requestId.replace(/[:]/g, '_')}.png`;
    const full = path.join(extractedRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, PNG_BYTES);
    staticRecords.push({
      requestId,
      status: 'EXTRACTED',
      runtimePath,
      source,
      artifacts: [{ role: 'PRIMARY_OBJECT', artifactType: 'PNG_TEXTURE_EXPORT', relativePath: rel.replace(/\\/g, '/'), sizeBytes: PNG_BYTES.length, sha256: pngSha }],
    });
  }

  const charRequests = Array.from({ length: 540 }, (_, i) => ({ requestId: `skin:${2001 + i}:char`, targetId: `skin:${2001 + i}:char`, kind: 'CHAR_SPINE', skinId: 2001 + i }));
  const modelRequests = Array.from({ length: 789 }, (_, i) => ({ requestId: `model:${3001 + i}:primary`, targetId: `model:${3001 + i}:primary`, kind: 'MODEL_PRIMARY', skinId: null }));
  const dummyRecords = [...charRequests, ...modelRequests].map((r) => ({ requestId: r.requestId, status: 'EXTRACTED' }));

  const plan = {
    stage: 'skin-page-3', substage: '3-4', status: 'READY_FOR_SELECTIVE_OBJECT_EXTRACTION',
    counts: { extractionRequestCount: 1869, STATIC: 540, CHAR_SPINE: 540, MODEL_PRIMARY: 789 },
    requests: [...staticRequests, ...charRequests, ...modelRequests],
  };
  const result = {
    stage: 'skin-page-3', substage: '3-4', status: 'STAGE3_4_EXTRACTION_EXECUTED', finalReadyForValidation: true,
    counts: { requestCount: 1869, extractedCount: 1869, errorCount: 0, extractedByKind: { STATIC: 540, CHAR_SPINE: 540, MODEL_PRIMARY: 789 } },
    records: [...staticRecords, ...dummyRecords],
  };
  const validation = {
    stage: 'skin-page-3', substage: '3-4', status: 'PASS_SKIN_STAGE3_4_SELECTIVE_EXTRACTION', finalReady: true,
    counts: { expectedRequestCount: 1869, acceptedRequestCount: 1869, blockerCount: 0, acceptedStaticCount: 540, acceptedCharSpineCount: 540, acceptedModelPrimaryCount: 789 },
    boundaries: { actualArtifactHashVerified: true },
  };
  const relation = {
    stage: 'skin-page-2', substage: '2-3', status: 'ACCEPTED',
    cardinality: { skinToHero: 'EXACTLY_ONE', heroToSkin: 'ZERO_OR_MANY' },
    counts: { bySkinId: 540, byHeroId: 267, edgeCount: 540 },
    bySkinId, byHeroId,
  };
  return { extractedRoot, repoRoot, plan, result, validation, relation };
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-stage3-5-selftest-'));
const checks = [];
try {
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const f = fixture(temp);
  const manifest = buildStaticWebAssets({ ...f, contract });
  const baseline = evaluateStaticWebAssetManifest(manifest, f.relation, f.repoRoot, contract);
  checks.push({ name: 'baseline 540 static mapping PASS', pass: baseline.finalReady === true && baseline.status === 'PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP' && baseline.counts.acceptedSkinCount === 540 });
  checks.push({ name: 'exact-byte duplicates are reported but do not merge identity', pass: baseline.counts.exactByteDuplicateGroupCount === 1 && baseline.counts.exactByteDuplicateSkinCount === 540 && baseline.counts.acceptedSkinCount === 540 });

  const extra = path.join(f.repoRoot, 'public/images/skins/unexpected.png');
  fs.writeFileSync(extra, PNG_BYTES);
  const unexpected = evaluateStaticWebAssetManifest(manifest, f.relation, f.repoRoot, contract);
  checks.push({ name: 'unexpected public file is a blocker', pass: unexpected.finalReady === false && unexpected.counts.unexpectedFileCount === 1 });
  fs.unlinkSync(extra);

  const relationMismatch = clone(f.relation);
  relationMismatch.bySkinId['1001'].heroId += 1;
  checks.push(expectThrow('Hero ownership mismatch fails', () => evaluateStaticWebAssetManifest(manifest, relationMismatch, f.repoRoot, contract)));

  const firstPublic = path.join(f.repoRoot, 'public/images/skins/1001.png');
  fs.writeFileSync(firstPublic, Buffer.from('tampered'));
  const tampered = evaluateStaticWebAssetManifest(manifest, f.relation, f.repoRoot, contract);
  checks.push({ name: 'public artifact tamper is a blocker', pass: tampered.finalReady === false && tampered.counts.hashMismatchCount === 1 });
  fs.writeFileSync(firstPublic, PNG_BYTES);

  const pathTamper = clone(manifest);
  pathTamper.records[0].repoPath = 'public/images/skins/999999.png';
  checks.push(expectThrow('manifest repoPath tamper fails', () => evaluateStaticWebAssetManifest(pathTamper, f.relation, f.repoRoot, contract)));

  fs.unlinkSync(firstPublic);
  const missing = evaluateStaticWebAssetManifest(manifest, f.relation, f.repoRoot, contract);
  checks.push({ name: 'missing public artifact is a blocker', pass: missing.finalReady === false && missing.counts.missingFileCount === 1 });
  fs.writeFileSync(firstPublic, PNG_BYTES);

  const badValidation = clone(f.validation);
  badValidation.finalReady = false;
  checks.push(expectThrow('non-final Stage 3-4 predecessor cannot build', () => buildStaticWebAssets({ ...f, validation: badValidation, contract })));

  const failures = checks.filter((c) => !c.pass);
  assert(failures.length === 0, failures.map((f) => `${f.name}: ${f.reason ?? 'failed'}`).join('; '));
  console.log('PASS_SKIN_STAGE3_5_STATIC_WEB_ASSET_SELFTEST');
  console.log(JSON.stringify({ checks: checks.length, failures: 0, syntheticSkinCount: 540, predecessorRequestCount: 1869, duplicatePolicy: 'REPORT_ONLY_DO_NOT_MERGE_SKIN_IDENTITY' }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
