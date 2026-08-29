import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/skin-stage3-5-static-web-asset-map.v1.json';
export const DEFAULT_RELATION_PATH = 'data/generated/skin-stage2-3-bidirectional-relation.v1.json';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function assert(c, m) { if (!c) throw new Error(m); }
function shaBuffer(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function shaFile(p) { const b = fs.readFileSync(p); return { sizeBytes: b.length, sha256: shaBuffer(b), bytes: b }; }
function safeRel(p) { return typeof p === 'string' && p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]+/).includes('..'); }
function isPngBytes(b) { return b.length >= PNG_SIGNATURE.length && b.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE); }
function sameSource(a, b) { return a?.bundle === b?.bundle && a?.bundleSha256 === b?.bundleSha256 && a?.embeddedCab === b?.embeddedCab && a?.embeddedCabSha256 === b?.embeddedCabSha256; }
function resolveInside(root, rel, label) {
  assert(safeRel(rel), `${label} is not a safe relative path: ${rel}`);
  const rootAbs = path.resolve(root);
  const full = path.resolve(rootAbs, rel);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  assert(full.startsWith(prefix), `${label} escaped root: ${rel}`);
  return full;
}
function numericAsc(a, b) { return Number(a) - Number(b); }

function validatePredecessors(plan, result, validation, relation, contract) {
  assert(contract?.stage === 'skin-page-3' && contract?.substage === '3-5-0' && contract?.status === 'DESIGN_FROZEN', '3-5-0 contract is not DESIGN_FROZEN');
  const p = contract.predecessorRequirements;

  assert(validation?.stage === 'skin-page-3' && validation?.substage === '3-4', 'invalid Stage 3-4 validation input');
  assert(validation?.status === p.stage34Status, `Stage 3-4 status not admitted: ${validation?.status}`);
  assert(validation?.finalReady === p.stage34FinalReady, 'Stage 3-4 finalReady changed');
  assert(validation?.counts?.expectedRequestCount === p.expectedRequestCount, 'Stage 3-4 expected request count changed');
  assert(validation?.counts?.acceptedRequestCount === p.acceptedRequestCount, 'Stage 3-4 accepted request count changed');
  assert(validation?.counts?.acceptedStaticCount === p.acceptedStaticCount, 'Stage 3-4 STATIC accepted count changed');
  assert(validation?.counts?.acceptedCharSpineCount === p.acceptedCharSpineCount, 'Stage 3-4 CHAR_SPINE accepted count changed');
  assert(validation?.counts?.acceptedModelPrimaryCount === p.acceptedModelPrimaryCount, 'Stage 3-4 MODEL_PRIMARY accepted count changed');
  assert(validation?.counts?.blockerCount === p.blockerCount, 'Stage 3-4 blockers remain');
  assert(validation?.boundaries?.actualArtifactHashVerified === p.actualArtifactHashVerified, 'Stage 3-4 artifact hash verification is not proven');

  assert(plan?.stage === 'skin-page-3' && plan?.substage === '3-4', 'invalid Stage 3-4 extraction plan');
  assert(plan?.status === 'READY_FOR_SELECTIVE_OBJECT_EXTRACTION', `Stage 3-4 plan not admitted: ${plan?.status}`);
  assert(plan?.counts?.extractionRequestCount === p.expectedRequestCount, 'Stage 3-4 plan request count changed');
  assert((plan?.counts?.STATIC ?? 0) === p.acceptedStaticCount, 'Stage 3-4 plan STATIC count changed');
  assert((plan?.counts?.CHAR_SPINE ?? 0) === p.acceptedCharSpineCount, 'Stage 3-4 plan CHAR_SPINE count changed');
  assert((plan?.counts?.MODEL_PRIMARY ?? 0) === p.acceptedModelPrimaryCount, 'Stage 3-4 plan MODEL_PRIMARY count changed');
  assert(Array.isArray(plan?.requests) && plan.requests.length === p.expectedRequestCount, 'Stage 3-4 plan requests missing/incomplete');

  assert(result?.stage === 'skin-page-3' && result?.substage === '3-4', 'invalid Stage 3-4 extraction result');
  assert(result?.status === 'STAGE3_4_EXTRACTION_EXECUTED', `Stage 3-4 extraction result not complete: ${result?.status}`);
  assert(result?.finalReadyForValidation === true, 'Stage 3-4 extraction result is not finalReadyForValidation');
  assert(result?.counts?.requestCount === p.expectedRequestCount, 'Stage 3-4 result request count changed');
  assert(result?.counts?.extractedCount === p.acceptedRequestCount, 'Stage 3-4 result extracted count changed');
  assert(result?.counts?.errorCount === 0, 'Stage 3-4 extraction errors remain');
  assert(result?.counts?.extractedByKind?.STATIC === p.acceptedStaticCount, 'Stage 3-4 result STATIC count changed');
  assert(result?.counts?.extractedByKind?.CHAR_SPINE === p.acceptedCharSpineCount, 'Stage 3-4 result CHAR_SPINE count changed');
  assert(result?.counts?.extractedByKind?.MODEL_PRIMARY === p.acceptedModelPrimaryCount, 'Stage 3-4 result MODEL_PRIMARY count changed');
  assert(Array.isArray(result?.records) && result.records.length === p.expectedRequestCount, 'Stage 3-4 result records missing/incomplete');

  assert(relation?.stage === 'skin-page-2' && relation?.substage === '2-3', 'invalid Stage 2 Skin relation');
  assert(relation?.status === p.stage2RelationStatus, `Stage 2 Skin relation not admitted: ${relation?.status}`);
  assert(relation?.counts?.bySkinId === p.stage2BySkinIdCount, 'Stage 2 bySkinId count changed');
  assert(relation?.counts?.byHeroId === p.stage2ByHeroIdCount, 'Stage 2 byHeroId count changed');
  assert(relation?.counts?.edgeCount === p.stage2EdgeCount, 'Stage 2 edge count changed');
  assert(relation?.cardinality?.skinToHero === 'EXACTLY_ONE', 'Stage 2 Skin→Hero cardinality changed');
  assert(relation?.cardinality?.heroToSkin === 'ZERO_OR_MANY', 'Stage 2 Hero→Skin cardinality changed');
  assert(relation?.bySkinId && typeof relation.bySkinId === 'object', 'Stage 2 bySkinId map missing');
}

function expectedStaticRequests(plan, contract) {
  const rows = plan.requests.filter((r) => r.kind === contract.scope.includedKind);
  assert(rows.length === contract.output.expectedFileCount, `STATIC request count changed: ${rows.length}`);
  const bySkinId = new Map();
  const requestIds = new Set();
  for (const row of rows) {
    assert(Number.isSafeInteger(row?.skinId) && row.skinId > 0, `STATIC request skinId invalid: ${row?.requestId}`);
    const skinId = row.skinId;
    assert(row.requestId === `skin:${skinId}:static`, `STATIC requestId contract changed for skin ${skinId}: ${row.requestId}`);
    assert(row.targetId === row.requestId, `STATIC targetId/requestId mismatch for skin ${skinId}`);
    assert(typeof row.runtimePath === 'string' && row.runtimePath.length > 0, `STATIC runtimePath missing for skin ${skinId}`);
    assert(!bySkinId.has(skinId), `duplicate STATIC skinId ${skinId}`);
    assert(!requestIds.has(row.requestId), `duplicate STATIC requestId ${row.requestId}`);
    bySkinId.set(skinId, row);
    requestIds.add(row.requestId);
  }
  return [...bySkinId.values()].sort((a, b) => a.skinId - b.skinId);
}

function resultMap(result) {
  const map = new Map();
  for (const row of result.records) {
    assert(typeof row?.requestId === 'string' && row.requestId.length > 0, 'Stage 3-4 result requestId missing');
    assert(!map.has(row.requestId), `duplicate Stage 3-4 result requestId ${row.requestId}`);
    map.set(row.requestId, row);
  }
  return map;
}

function exactDuplicateGroups(records) {
  const bySha = new Map();
  for (const record of records) {
    const list = bySha.get(record.sha256) ?? [];
    list.push(record.skinId);
    bySha.set(record.sha256, list);
  }
  return [...bySha.entries()]
    .filter(([, skinIds]) => skinIds.length > 1)
    .map(([sha256, skinIds]) => ({ sha256, skinIds: [...skinIds].sort(numericAsc), count: skinIds.length }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256));
}

export function buildStaticWebAssets({ plan, result, validation, relation, extractedRoot, repoRoot, contract, replaceExisting = false }) {
  validatePredecessors(plan, result, validation, relation, contract);
  const staticRequests = expectedStaticRequests(plan, contract);
  const resultById = resultMap(result);
  const relationKeys = Object.keys(relation.bySkinId).sort(numericAsc);
  const requestSkinKeys = staticRequests.map((r) => String(r.skinId));
  assert(relationKeys.length === contract.output.expectedFileCount, `Stage 2 relation skin count changed: ${relationKeys.length}`);
  assert(JSON.stringify(relationKeys) === JSON.stringify(requestSkinKeys), 'Stage 3-4 STATIC skinId set does not exactly equal frozen Stage 2 bySkinId set');

  const repoRootAbs = path.resolve(repoRoot);
  const outputRoot = resolveInside(repoRootAbs, contract.output.root, 'output root');
  fs.mkdirSync(outputRoot, { recursive: true });

  const expectedNames = new Set(staticRequests.map((r) => `${r.skinId}.png`));
  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    assert(entry.isFile(), `unexpected directory/non-file in ${contract.output.root}: ${entry.name}`);
    assert(expectedNames.has(entry.name), `unexpected file in ${contract.output.root}: ${entry.name}`);
  }

  const records = [];
  const repoPaths = new Set();
  const publicPaths = new Set();

  for (const request of staticRequests) {
    const skinId = request.skinId;
    const relationRow = relation.bySkinId[String(skinId)];
    assert(relationRow && Number.isSafeInteger(relationRow.heroId) && Number.isSafeInteger(relationRow.sourceOrder), `Stage 2 relation row invalid for skin ${skinId}`);
    const resultRow = resultById.get(request.requestId);
    assert(resultRow, `Stage 3-4 result missing STATIC request ${request.requestId}`);
    assert(resultRow.status === 'EXTRACTED', `Stage 3-4 STATIC request not extracted: ${request.requestId}`);
    assert(resultRow.runtimePath === request.runtimePath, `Stage 3-4 runtimePath mismatch for ${request.requestId}`);
    assert(sameSource(resultRow.source, request.selectedExtractionSource), `Stage 3-4 source mismatch for ${request.requestId}`);
    assert(Array.isArray(resultRow.artifacts), `Stage 3-4 artifacts missing for ${request.requestId}`);
    const primary = resultRow.artifacts.filter((a) => a.role === contract.materializationPolicy.sourceArtifactRole);
    assert(primary.length === 1, `exactly one PRIMARY_OBJECT required for ${request.requestId}`);
    const artifact = primary[0];
    assert(artifact.artifactType === contract.materializationPolicy.sourceArtifactType, `STATIC primary artifact type changed for ${request.requestId}: ${artifact.artifactType}`);
    assert(/^[0-9a-f]{64}$/i.test(artifact.sha256 ?? ''), `STATIC source artifact SHA-256 invalid for ${request.requestId}`);
    assert(Number.isSafeInteger(artifact.sizeBytes) && artifact.sizeBytes > 0, `STATIC source artifact size invalid for ${request.requestId}`);

    const sourcePath = resolveInside(extractedRoot, artifact.relativePath, `source artifact for ${request.requestId}`);
    assert(fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile(), `source artifact missing for ${request.requestId}: ${artifact.relativePath}`);
    const source = shaFile(sourcePath);
    assert(source.sizeBytes === artifact.sizeBytes, `source artifact size mismatch for ${request.requestId}`);
    assert(source.sha256 === artifact.sha256.toLowerCase(), `source artifact SHA mismatch for ${request.requestId}`);
    assert(isPngBytes(source.bytes), `source artifact is not PNG for ${request.requestId}`);

    const repoPath = `public/images/skins/${skinId}.png`;
    const publicPath = `images/skins/${skinId}.png`;
    assert(repoPath === contract.output.repoPathTemplate.replace('{skinId}', String(skinId)), `repo path template mismatch for skin ${skinId}`);
    assert(publicPath === contract.output.publicPathTemplate.replace('{skinId}', String(skinId)), `public path template mismatch for skin ${skinId}`);
    assert(!repoPaths.has(repoPath), `repo path collision: ${repoPath}`);
    assert(!publicPaths.has(publicPath), `public path collision: ${publicPath}`);
    repoPaths.add(repoPath);
    publicPaths.add(publicPath);

    const destination = resolveInside(repoRootAbs, repoPath, `destination for skin ${skinId}`);
    if (fs.existsSync(destination)) {
      assert(fs.statSync(destination).isFile(), `destination is not a file for skin ${skinId}`);
      const existing = shaFile(destination);
      if (existing.sha256 !== source.sha256 || existing.sizeBytes !== source.sizeBytes) {
        assert(replaceExisting, `existing expected destination differs for skin ${skinId}; rerun with --replace-existing only after reviewed source freshness`);
      }
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!fs.existsSync(destination) || replaceExisting || shaFile(destination).sha256 !== source.sha256) {
      fs.copyFileSync(sourcePath, destination);
    }
    const dest = shaFile(destination);
    assert(dest.sizeBytes === source.sizeBytes, `destination size mismatch for skin ${skinId}`);
    assert(dest.sha256 === source.sha256, `destination SHA mismatch for skin ${skinId}`);
    assert(isPngBytes(dest.bytes), `destination is not PNG for skin ${skinId}`);

    records.push({
      skinId,
      heroId: relationRow.heroId,
      sourceOrder: relationRow.sourceOrder,
      requestId: request.requestId,
      runtimePath: request.runtimePath,
      repoPath,
      publicPath,
      sizeBytes: dest.sizeBytes,
      sha256: dest.sha256,
      sourceArtifact: {
        relativePath: artifact.relativePath,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
      },
      selectedExtractionSource: request.selectedExtractionSource,
      sourceSelectionPolicy: request.sourceSelectionPolicy,
    });
  }

  const duplicateContentGroups = exactDuplicateGroups(records);
  const duplicateSkinIds = new Set(duplicateContentGroups.flatMap((g) => g.skinIds));
  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-5-0',
    evidenceClass: 'STATIC_WEB_ASSET_MAP',
    status: 'STAGE3_5_STATIC_WEB_ASSETS_MATERIALIZED',
    predecessor: {
      stage34Status: validation.status,
      stage34FinalReady: validation.finalReady,
      stage34AcceptedRequestCount: validation.counts.acceptedRequestCount,
      stage34AcceptedStaticCount: validation.counts.acceptedStaticCount,
      stage34ActualArtifactHashVerified: validation.boundaries.actualArtifactHashVerified,
      stage2RelationStatus: relation.status,
      stage2BySkinIdCount: relation.counts.bySkinId,
    },
    output: {
      root: contract.output.root,
      filenamePolicy: contract.output.filenamePolicy,
      copyMode: contract.materializationPolicy.copyMode,
    },
    counts: {
      mappedSkinCount: records.length,
      materializedFileCount: records.length,
      uniqueContentSha256Count: new Set(records.map((r) => r.sha256)).size,
      exactByteDuplicateGroupCount: duplicateContentGroups.length,
      exactByteDuplicateSkinCount: duplicateSkinIds.size,
      pathCollisionCount: 0,
      missingFileCount: 0,
      hashMismatchCount: 0,
      unexpectedFileCount: 0,
    },
    duplicateContentGroups,
    records,
    boundaries: {
      exactBytesCopiedWithoutReencode: true,
      runtimePathInference: false,
      filenameSimilarity: false,
      rawConfigDataRead: false,
      semanticOwnershipRecomputed: false,
      sourceOrderRecomputed: false,
      duplicateContentMergedIntoIdentity: false,
      charSpineWebConversionPerformed: false,
      modelPrimaryWebConversionPerformed: false,
    },
  };
}

function parseArgs(argv) {
  const o = { contractPath: DEFAULT_CONTRACT_PATH, relationPath: DEFAULT_RELATION_PATH, repoRoot: '.', replaceExisting: false, outputPath: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--contract') o.contractPath = argv[++i];
    else if (a === '--relation') o.relationPath = argv[++i];
    else if (a === '--repo-root') o.repoRoot = argv[++i];
    else if (a === '--write') o.outputPath = argv[++i];
    else if (a === '--replace-existing') o.replaceExisting = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown argument ${a}`);
    else pos.push(a);
  }
  if (!o.help) {
    if (pos.length !== 4) throw new Error('required: <stage3-4-plan.json> <stage3-4-result.json> <stage3-4-validation.json> <extracted-root>');
    [o.planPath, o.resultPath, o.validationPath, o.extractedRoot] = pos;
  }
  return o;
}
function usage() {
  console.log('Usage: node scripts/build-skin-stage3-5-static-web-assets.mjs <stage3-4-plan.json> <stage3-4-result.json> <stage3-4-validation.json> <extracted-root> [--repo-root <repo-root>] [--relation <relation.json>] [--write <manifest.json>] [--replace-existing] [--contract <contract.json>]');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) usage();
    else {
      const contract = readJson(o.contractPath);
      const repoRoot = path.resolve(o.repoRoot);
      const outputPath = path.resolve(repoRoot, o.outputPath ?? contract.output.manifestPath);
      const manifest = buildStaticWebAssets({
        plan: readJson(o.planPath),
        result: readJson(o.resultPath),
        validation: readJson(o.validationPath),
        relation: readJson(o.relationPath),
        extractedRoot: path.resolve(o.extractedRoot),
        repoRoot,
        contract,
        replaceExisting: o.replaceExisting,
      });
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(JSON.stringify({ output: outputPath, status: manifest.status, counts: manifest.counts }, null, 2));
    }
  } catch (e) {
    console.error(`[skin-stage3-5-static-web-assets] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
