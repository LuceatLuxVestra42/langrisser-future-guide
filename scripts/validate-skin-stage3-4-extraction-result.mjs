import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/skin-stage3-4-selective-extraction.v1.json';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function assert(c, m) { if (!c) throw new Error(m); }
function safeRel(p) { return typeof p === 'string' && p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]+/).includes('..'); }
function shaFile(p) { const b = fs.readFileSync(p); return { sizeBytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }; }
function sameSource(a, b) { return a?.bundle === b?.bundle && a?.bundleSha256 === b?.bundleSha256 && a?.embeddedCab === b?.embeddedCab && a?.embeddedCabSha256 === b?.embeddedCabSha256; }

export function evaluateExtractionResult(plan, result, rootDir, contract) {
  assert(contract.status === 'DESIGN_FROZEN', '3-4 contract is not DESIGN_FROZEN');
  assert(plan?.stage === 'skin-page-3' && plan?.substage === '3-4', 'invalid extraction plan');
  assert(plan?.status === 'READY_FOR_SELECTIVE_OBJECT_EXTRACTION', `plan not executable: ${plan?.status}`);
  assert(plan?.predecessor?.qaFinalFreezeReady === true, 'plan predecessor is not final freeze ready');
  assert(plan?.counts?.extractionRequestCount === contract.expectedExtractionRequests.total, 'plan request count changed');
  assert(result?.stage === 'skin-page-3' && result?.substage === '3-4', 'invalid extraction result');
  assert(Array.isArray(result?.records), 'extraction result records missing');
  const requestById = new Map(plan.requests.map((r) => [r.requestId, r]));
  assert(requestById.size === plan.requests.length, 'plan requestId duplicate');
  const seen = new Set();
  const rows = [];

  for (const record of result.records) {
    assert(typeof record?.requestId === 'string', 'result requestId missing');
    assert(!seen.has(record.requestId), `duplicate result requestId ${record.requestId}`);
    seen.add(record.requestId);
    const request = requestById.get(record.requestId);
    assert(request, `result contains unknown requestId ${record.requestId}`);
    if (record.status !== 'EXTRACTED') {
      rows.push({ requestId: record.requestId, kind: request.kind, status: record.status ?? 'MISSING_STATUS', accepted: false, reason: record.reason ?? null });
      continue;
    }
    assert(record.runtimePath === request.runtimePath, `runtimePath mismatch for ${record.requestId}`);
    assert(sameSource(record.source, request.selectedExtractionSource), `selected extraction source mismatch for ${record.requestId}`);
    assert(Array.isArray(record.artifacts) && record.artifacts.length > 0, `artifacts missing for ${record.requestId}`);
    const primary = record.artifacts.filter((a) => a.role === 'PRIMARY_OBJECT');
    assert(primary.length === 1, `exactly one PRIMARY_OBJECT required for ${record.requestId}`);
    const artifactPaths = new Set();
    for (const artifact of record.artifacts) {
      assert(safeRel(artifact.relativePath), `unsafe artifact path for ${record.requestId}: ${artifact.relativePath}`);
      assert(!artifactPaths.has(artifact.relativePath), `duplicate artifact path for ${record.requestId}: ${artifact.relativePath}`);
      artifactPaths.add(artifact.relativePath);
      assert(/^[0-9a-f]{64}$/i.test(artifact.sha256 ?? ''), `artifact SHA-256 invalid for ${record.requestId}`);
      assert(Number.isSafeInteger(artifact.sizeBytes) && artifact.sizeBytes >= 0, `artifact size invalid for ${record.requestId}`);
      const full = path.resolve(rootDir, artifact.relativePath);
      const root = path.resolve(rootDir) + path.sep;
      assert(full.startsWith(root), `artifact escaped extraction root for ${record.requestId}`);
      assert(fs.existsSync(full) && fs.statSync(full).isFile(), `artifact file missing for ${record.requestId}: ${artifact.relativePath}`);
      const actual = shaFile(full);
      assert(actual.sizeBytes === artifact.sizeBytes, `artifact size mismatch for ${record.requestId}: ${artifact.relativePath}`);
      assert(actual.sha256 === artifact.sha256.toLowerCase(), `artifact SHA mismatch for ${record.requestId}: ${artifact.relativePath}`);
    }
    rows.push({ requestId: record.requestId, kind: request.kind, status: 'EXTRACTED', accepted: true, artifactCount: record.artifacts.length });
  }

  for (const request of plan.requests) {
    if (!seen.has(request.requestId)) rows.push({ requestId: request.requestId, kind: request.kind, status: 'MISSING_RESULT', accepted: false });
  }
  const accepted = rows.filter((r) => r.accepted);
  const blockers = rows.filter((r) => !r.accepted);
  const byKind = {};
  for (const r of accepted) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const finalReady = accepted.length === contract.expectedExtractionRequests.total && blockers.length === 0 && (byKind.STATIC ?? 0) === contract.expectedExtractionRequests.STATIC && (byKind.CHAR_SPINE ?? 0) === contract.expectedExtractionRequests.CHAR_SPINE && (byKind.MODEL_PRIMARY ?? 0) === contract.expectedExtractionRequests.MODEL_PRIMARY;
  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-4',
    evidenceClass: 'SELECTIVE_SERIALIZED_OBJECT_EXTRACTION_VALIDATION',
    status: finalReady ? 'PASS_SKIN_STAGE3_4_SELECTIVE_EXTRACTION' : 'WAITING_OR_BLOCKED_SKIN_STAGE3_4_SELECTIVE_EXTRACTION',
    finalReady,
    counts: {
      expectedRequestCount: plan.requests.length,
      acceptedRequestCount: accepted.length,
      blockerCount: blockers.length,
      acceptedStaticCount: byKind.STATIC ?? 0,
      acceptedCharSpineCount: byKind.CHAR_SPINE ?? 0,
      acceptedModelPrimaryCount: byKind.MODEL_PRIMARY ?? 0,
    },
    blockers,
    boundaries: { runtimePathInference: false, filenameSimilarity: false, semanticOwnershipSelection: false, actualArtifactHashVerified: true },
  };
}

function parseArgs(argv) {
  const o = { contractPath: DEFAULT_CONTRACT_PATH, outputPath: null, allowIncomplete: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--contract') o.contractPath = argv[++i];
    else if (a === '--root') o.rootDir = argv[++i];
    else if (a === '--write') o.outputPath = argv[++i];
    else if (a === '--allow-incomplete') o.allowIncomplete = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown argument ${a}`);
    else pos.push(a);
  }
  if (!o.help) { if (pos.length !== 2 || !o.rootDir) throw new Error('required: <plan.json> <result.json> --root <dir>'); [o.planPath, o.resultPath] = pos; }
  return o;
}
function usage() { console.log('Usage: node scripts/validate-skin-stage3-4-extraction-result.mjs <plan.json> <result.json> --root <extracted-dir> [--write <validation.json>] [--allow-incomplete] [--contract <contract.json>]'); }
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) usage();
    else {
      const validation = evaluateExtractionResult(readJson(o.planPath), readJson(o.resultPath), o.rootDir, readJson(o.contractPath));
      const text = `${JSON.stringify(validation, null, 2)}\n`;
      if (o.outputPath) { fs.mkdirSync(path.dirname(path.resolve(o.outputPath)), { recursive: true }); fs.writeFileSync(path.resolve(o.outputPath), text); }
      process.stdout.write(text);
      if (!validation.finalReady && !o.allowIncomplete) process.exitCode = 2;
    }
  } catch (e) { console.error(`[skin-stage3-4-validate] ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
}
