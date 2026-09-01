import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/skin-stage3-5-static-web-asset-map.v1.json';
export const DEFAULT_RELATION_PATH = 'data/generated/skin-stage2-3-bidirectional-relation.v1.json';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function assert(c, m) { if (!c) throw new Error(m); }
function shaFile(p) { const b = fs.readFileSync(p); return { sizeBytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex'), bytes: b }; }
function safeRel(p) { return typeof p === 'string' && p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]+/).includes('..'); }
function isPngBytes(b) { return b.length >= PNG_SIGNATURE.length && b.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE); }
function resolveInside(root, rel, label) {
  assert(safeRel(rel), `${label} is not a safe relative path: ${rel}`);
  const rootAbs = path.resolve(root);
  const full = path.resolve(rootAbs, rel);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  assert(full.startsWith(prefix), `${label} escaped root: ${rel}`);
  return full;
}
function numericAsc(a, b) { return Number(a) - Number(b); }

function duplicateStats(records) {
  const bySha = new Map();
  for (const record of records) {
    const list = bySha.get(record.sha256) ?? [];
    list.push(record.skinId);
    bySha.set(record.sha256, list);
  }
  const groups = [...bySha.entries()].filter(([, ids]) => ids.length > 1);
  return {
    uniqueContentSha256Count: bySha.size,
    exactByteDuplicateGroupCount: groups.length,
    exactByteDuplicateSkinCount: new Set(groups.flatMap(([, ids]) => ids)).size,
  };
}

export function evaluateStaticWebAssetManifest(manifest, relation, repoRoot, contract) {
  assert(contract?.stage === 'skin-page-3' && contract?.substage === '3-5-0' && contract?.status === 'DESIGN_FROZEN', '3-5-0 contract is not DESIGN_FROZEN');
  assert(manifest?.stage === 'skin-page-3' && manifest?.substage === '3-5-0', 'invalid Stage 3-5-0 manifest');
  assert(manifest?.status === 'STAGE3_5_STATIC_WEB_ASSETS_MATERIALIZED', `manifest not materialized: ${manifest?.status}`);
  assert(manifest?.predecessor?.stage34Status === contract.predecessorRequirements.stage34Status, 'manifest Stage 3-4 predecessor status changed');
  assert(manifest?.predecessor?.stage34FinalReady === true, 'manifest Stage 3-4 predecessor is not finalReady');
  assert(manifest?.predecessor?.stage34AcceptedRequestCount === contract.predecessorRequirements.acceptedRequestCount, 'manifest Stage 3-4 accepted request count changed');
  assert(manifest?.predecessor?.stage34AcceptedStaticCount === contract.predecessorRequirements.acceptedStaticCount, 'manifest Stage 3-4 STATIC count changed');
  assert(manifest?.predecessor?.stage34ActualArtifactHashVerified === true, 'manifest does not preserve Stage 3-4 artifact-hash proof');

  assert(relation?.stage === 'skin-page-2' && relation?.substage === '2-3' && relation?.status === contract.predecessorRequirements.stage2RelationStatus, 'invalid frozen Stage 2 relation');
  assert(relation?.counts?.bySkinId === contract.predecessorRequirements.stage2BySkinIdCount, 'Stage 2 relation bySkinId count changed');
  assert(relation?.counts?.byHeroId === contract.predecessorRequirements.stage2ByHeroIdCount, 'Stage 2 relation byHeroId count changed');
  assert(relation?.counts?.edgeCount === contract.predecessorRequirements.stage2EdgeCount, 'Stage 2 relation edge count changed');
  assert(relation?.bySkinId && typeof relation.bySkinId === 'object', 'Stage 2 relation bySkinId map missing');

  assert(Array.isArray(manifest?.records), 'manifest records missing');
  assert(manifest.records.length === contract.output.expectedFileCount, `manifest record count changed: ${manifest.records.length}`);
  const expectedSkinIds = Object.keys(relation.bySkinId).sort(numericAsc);
  assert(expectedSkinIds.length === contract.output.expectedFileCount, `frozen relation skin count changed: ${expectedSkinIds.length}`);

  const seenSkinIds = new Set();
  const seenRepoPaths = new Set();
  const seenPublicPaths = new Set();
  const rows = [];
  let missingFileCount = 0;
  let hashMismatchCount = 0;
  let pathCollisionCount = 0;
  const repoRootAbs = path.resolve(repoRoot);

  for (const record of manifest.records) {
    assert(Number.isSafeInteger(record?.skinId) && record.skinId > 0, 'manifest skinId invalid');
    const skinId = record.skinId;
    const skinKey = String(skinId);
    assert(!seenSkinIds.has(skinId), `duplicate manifest skinId ${skinId}`);
    seenSkinIds.add(skinId);
    const relationRow = relation.bySkinId[skinKey];
    assert(relationRow, `manifest skinId not in frozen relation: ${skinId}`);
    assert(record.heroId === relationRow.heroId, `heroId changed for skin ${skinId}`);
    assert(record.sourceOrder === relationRow.sourceOrder, `sourceOrder changed for skin ${skinId}`);
    assert(record.requestId === `skin:${skinId}:static`, `requestId contract changed for skin ${skinId}`);

    const expectedRepoPath = contract.output.repoPathTemplate.replace('{skinId}', skinKey);
    const expectedPublicPath = contract.output.publicPathTemplate.replace('{skinId}', skinKey);
    assert(record.repoPath === expectedRepoPath, `repoPath changed for skin ${skinId}: ${record.repoPath}`);
    assert(record.publicPath === expectedPublicPath, `publicPath changed for skin ${skinId}: ${record.publicPath}`);
    if (seenRepoPaths.has(record.repoPath) || seenPublicPaths.has(record.publicPath)) pathCollisionCount += 1;
    assert(!seenRepoPaths.has(record.repoPath), `repoPath collision: ${record.repoPath}`);
    assert(!seenPublicPaths.has(record.publicPath), `publicPath collision: ${record.publicPath}`);
    seenRepoPaths.add(record.repoPath);
    seenPublicPaths.add(record.publicPath);

    assert(/^[0-9a-f]{64}$/i.test(record.sha256 ?? ''), `manifest SHA-256 invalid for skin ${skinId}`);
    assert(Number.isSafeInteger(record.sizeBytes) && record.sizeBytes > 0, `manifest size invalid for skin ${skinId}`);
    assert(record?.sourceArtifact?.sha256 === record.sha256, `source/destination SHA differs for skin ${skinId}`);
    assert(record?.sourceArtifact?.sizeBytes === record.sizeBytes, `source/destination size differs for skin ${skinId}`);
    assert(typeof record?.runtimePath === 'string' && record.runtimePath.length > 0, `runtimePath missing for skin ${skinId}`);
    assert(record?.selectedExtractionSource && typeof record.selectedExtractionSource.bundle === 'string', `selected extraction source missing for skin ${skinId}`);

    const filePath = resolveInside(repoRootAbs, record.repoPath, `repoPath for skin ${skinId}`);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      missingFileCount += 1;
      rows.push({ skinId, accepted: false, reason: 'PUBLIC_FILE_MISSING', repoPath: record.repoPath });
      continue;
    }
    const actual = shaFile(filePath);
    if (actual.sizeBytes !== record.sizeBytes || actual.sha256 !== record.sha256.toLowerCase() || !isPngBytes(actual.bytes)) {
      hashMismatchCount += 1;
      rows.push({ skinId, accepted: false, reason: 'PUBLIC_FILE_HASH_SIZE_OR_PNG_MISMATCH', repoPath: record.repoPath });
      continue;
    }
    rows.push({ skinId, accepted: true, repoPath: record.repoPath, sha256: actual.sha256, sizeBytes: actual.sizeBytes });
  }

  const actualSkinIds = [...seenSkinIds].map(String).sort(numericAsc);
  assert(JSON.stringify(actualSkinIds) === JSON.stringify(expectedSkinIds), 'manifest skinId set does not exactly equal frozen Stage 2 bySkinId set');

  const expectedNames = new Set(expectedSkinIds.map((id) => `${id}.png`));
  const outputRoot = resolveInside(repoRootAbs, contract.output.root, 'output root');
  let unexpectedFileCount = 0;
  if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) {
    missingFileCount += contract.output.expectedFileCount;
  } else {
    for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !expectedNames.has(entry.name)) unexpectedFileCount += 1;
    }
  }

  const acceptedRows = rows.filter((r) => r.accepted);
  const dup = duplicateStats(manifest.records);
  assert(manifest?.counts?.mappedSkinCount === contract.output.expectedFileCount, 'manifest mappedSkinCount changed');
  assert(manifest?.counts?.materializedFileCount === contract.output.expectedFileCount, 'manifest materializedFileCount changed');
  assert(manifest?.counts?.pathCollisionCount === 0, 'manifest records path collisions');
  assert(manifest?.counts?.missingFileCount === 0, 'manifest records missing files');
  assert(manifest?.counts?.hashMismatchCount === 0, 'manifest records hash mismatches');
  assert(manifest?.counts?.unexpectedFileCount === 0, 'manifest records unexpected files');
  assert(manifest?.counts?.uniqueContentSha256Count === dup.uniqueContentSha256Count, 'duplicate/content SHA accounting changed');
  assert(manifest?.counts?.exactByteDuplicateGroupCount === dup.exactByteDuplicateGroupCount, 'exact-byte duplicate group accounting changed');
  assert(manifest?.counts?.exactByteDuplicateSkinCount === dup.exactByteDuplicateSkinCount, 'exact-byte duplicate skin accounting changed');

  const finalReady = acceptedRows.length === contract.output.expectedFileCount
    && missingFileCount === 0
    && hashMismatchCount === 0
    && pathCollisionCount === 0
    && unexpectedFileCount === 0;

  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-5-0',
    evidenceClass: 'STATIC_WEB_ASSET_MAP_VALIDATION',
    status: finalReady ? contract.completion.status : 'WAITING_OR_BLOCKED_SKIN_STAGE3_5_STATIC_WEB_ASSET_MAP',
    finalReady,
    counts: {
      expectedSkinCount: contract.output.expectedFileCount,
      acceptedSkinCount: acceptedRows.length,
      missingFileCount,
      hashMismatchCount,
      pathCollisionCount,
      unexpectedFileCount,
      uniqueContentSha256Count: dup.uniqueContentSha256Count,
      exactByteDuplicateGroupCount: dup.exactByteDuplicateGroupCount,
      exactByteDuplicateSkinCount: dup.exactByteDuplicateSkinCount,
    },
    blockers: rows.filter((r) => !r.accepted),
    boundaries: {
      actualPublicArtifactHashVerified: true,
      exactBytesNoReencodeRequired: true,
      duplicateContentMergedIntoIdentity: false,
      semanticOwnershipRecomputed: false,
      sourceOrderRecomputed: false,
      runtimePathInference: false,
      filenameSimilarity: false,
    },
  };
}

function parseArgs(argv) {
  const o = { contractPath: DEFAULT_CONTRACT_PATH, relationPath: DEFAULT_RELATION_PATH, repoRoot: '.', outputPath: null, allowIncomplete: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--contract') o.contractPath = argv[++i];
    else if (a === '--relation') o.relationPath = argv[++i];
    else if (a === '--repo-root') o.repoRoot = argv[++i];
    else if (a === '--write') o.outputPath = argv[++i];
    else if (a === '--allow-incomplete') o.allowIncomplete = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown argument ${a}`);
    else pos.push(a);
  }
  if (!o.help) {
    if (pos.length !== 1) throw new Error('required: <manifest.json>');
    [o.manifestPath] = pos;
  }
  return o;
}
function usage() {
  console.log('Usage: node scripts/validate-skin-stage3-5-static-web-assets.mjs <manifest.json> [--repo-root <repo-root>] [--relation <relation.json>] [--write <validation.json>] [--allow-incomplete] [--contract <contract.json>]');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) usage();
    else {
      const contract = readJson(o.contractPath);
      const repoRoot = path.resolve(o.repoRoot);
      const outputPath = path.resolve(repoRoot, o.outputPath ?? contract.output.validationPath);
      const validation = evaluateStaticWebAssetManifest(readJson(o.manifestPath), readJson(o.relationPath), repoRoot, contract);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(validation, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
      if (!validation.finalReady && !o.allowIncomplete) process.exitCode = 2;
    }
  } catch (e) {
    console.error(`[skin-stage3-5-static-web-assets-validate] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
