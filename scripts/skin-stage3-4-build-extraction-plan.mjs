import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/skin-stage3-4-selective-extraction.v1.json';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function assert(c, m) { if (!c) throw new Error(m); }
function countBy(items, keyFn) { const out = {}; for (const item of items) { const k = keyFn(item); out[k] = (out[k] ?? 0) + 1; } return out; }

function buildBundleReportMap(scan) {
  const map = new Map();
  for (const report of scan.bundleReports ?? []) {
    assert(typeof report?.fileName === 'string' && report.fileName.length > 0, 'bundle report missing fileName');
    assert(!map.has(report.fileName), `duplicate bundle report ${report.fileName}`);
    map.set(report.fileName, report);
  }
  return map;
}

function cabSha(report, name) {
  const rows = (report?.embeddedCabs ?? []).filter((cab) => cab.name === name);
  assert(rows.length === 1, `embedded CAB ${name} missing/duplicate in ${report?.fileName ?? 'unknown bundle'}`);
  assert(/^[0-9a-f]{64}$/i.test(rows[0].sha256 ?? ''), `embedded CAB ${name} missing SHA-256`);
  return rows[0].sha256.toLowerCase();
}

function validatePredecessors(qa, scan, contract) {
  const p = contract.predecessorRequirements;
  assert(contract.status === 'DESIGN_FROZEN', '3-4 contract is not DESIGN_FROZEN');
  assert(qa?.stage === 'skin-page-3' && qa?.substage === '3-3-3', 'invalid 3-3-3 QA input');
  assert(qa?.status === p.qaStatus, `3-3-3 QA status not admitted: ${qa?.status}`);
  assert(qa?.finalFreezeReady === true, '3-3-3 QA is not finalFreezeReady');
  assert(qa?.counts?.acceptedRequiredTargetCount === p.requiredTargetCount, 'accepted required target count changed');
  assert(qa?.counts?.pendingRequiredTargetCount === 0, 'pending required targets remain');
  assert(qa?.counts?.failedRequiredTargetCount === 0, 'failed required targets remain');
  assert(qa?.counts?.reviewRequiredTargetCount === 0, 'review required targets remain');
  assert(qa?.counts?.accountedCandidateBundleCount === p.candidateBundleCount, 'candidate bundle coverage incomplete');
  assert(qa?.counts?.bundleScanErrorCount === 0, 'bundle scan errors remain');
  assert(scan?.stage === 'skin-page-3' && scan?.substage === '3-3-2', 'invalid 3-3-2 scan input');
  assert(scan?.counts?.requiredTargetCount === p.requiredTargetCount, 'scan required target count changed');
  assert(scan?.counts?.authoritativeCandidateBundleCount === p.candidateBundleCount, 'scan candidate bundle count changed');
  assert((scan?.unscannedCandidateBundles ?? []).length === 0, 'scan still has unscanned candidate bundles');
  assert(scan?.counts?.bundleErrorCount === 0, 'scan bundle errors remain');
  assert((scan?.bundleReports ?? []).length === p.candidateBundleCount, 'scan bundle report coverage incomplete');
}

export function buildExtractionPlan(qa, scan, contract) {
  validatePredecessors(qa, scan, contract);
  const bundleReports = buildBundleReportMap(scan);
  const resolutionById = new Map((scan.resolutions ?? []).map((r) => [r.targetId, r]));
  const qaRows = qa.rows ?? [];
  assert(qaRows.length === contract.predecessorRequirements.requiredTargetCount, 'QA row count changed');
  const requests = [];

  for (const row of qaRows) {
    assert(row.accepted === true && row.severity === 'PASS', `QA row ${row.targetId} is not accepted`);
    assert(contract.acceptedQaClasses.includes(row.qaClass), `QA class not admitted for ${row.targetId}: ${row.qaClass}`);
    const resolution = resolutionById.get(row.targetId);
    assert(resolution?.required === true, `required scan resolution missing for ${row.targetId}`);
    assert(resolution.kind === row.kind, `kind mismatch for ${row.targetId}`);
    assert(resolution.frozenPath === row.frozenPath, `frozen path mismatch for ${row.targetId}`);
    const hits = (resolution.candidateResults ?? []).filter((c) => Number(c.exactOccurrenceCount ?? 0) > 0);
    assert(hits.length >= 1, `accepted row ${row.targetId} has no exact hit`);

    const provenance = hits.map((hit) => {
      assert(Number(hit.exactOccurrenceCount) === 1, `accepted row ${row.targetId} has duplicate occurrence`);
      assert(Array.isArray(hit.matches) && hit.matches.length === 1, `accepted row ${row.targetId} match evidence invalid`);
      const report = bundleReports.get(hit.bundle);
      assert(report?.scanStatus === 'OK', `bundle report not OK for ${row.targetId}: ${hit.bundle}`);
      const match = hit.matches[0];
      return {
        bundle: hit.bundle,
        bundleSha256: report.sha256,
        embeddedCab: match.embeddedCab,
        embeddedCabSha256: cabSha(report, match.embeddedCab),
        runtimePathByteOffset: match.runtimePathByteOffset,
      };
    }).sort((a, b) => a.bundle.localeCompare(b.bundle) || a.embeddedCab.localeCompare(b.embeddedCab));

    if (row.qaClass === 'RESOLVED_EXACT_SINGLE_BUNDLE') {
      assert(provenance.length === 1, `single-bundle QA row ${row.targetId} has ${provenance.length} hits`);
    } else {
      assert(provenance.length > 1, `alias QA row ${row.targetId} needs multiple hits`);
      assert(new Set(provenance.map((p) => p.embeddedCabSha256)).size === 1, `alias CAB SHA mismatch for ${row.targetId}`);
      assert(provenance[0].embeddedCabSha256 === row.identicalCabSha256, `alias QA hash mismatch for ${row.targetId}`);
    }

    const selected = provenance[0];
    requests.push({
      requestId: row.targetId,
      targetId: row.targetId,
      kind: row.kind,
      skinId: row.skinId,
      skinResourceId: row.skinResourceId ?? null,
      frozenPath: row.frozenPath,
      runtimePath: resolution.runtimePath,
      qaClass: row.qaClass,
      extractionClass: contract.kindToExtractionClass[row.kind],
      sourceProvenance: provenance,
      selectedExtractionSource: {
        bundle: selected.bundle,
        bundleSha256: selected.bundleSha256,
        embeddedCab: selected.embeddedCab,
        embeddedCabSha256: selected.embeddedCabSha256,
      },
      sourceSelectionPolicy: row.qaClass === 'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS'
        ? 'LEXICOGRAPHIC_TRANSPORT_REPRESENTATIVE_FROM_BYTE_IDENTICAL_CABS_NOT_SEMANTIC_OWNERSHIP'
        : 'SOLE_EXACT_BUNDLE_CAB',
    });
  }

  const kindCounts = countBy(requests, (r) => r.kind);
  const expected = contract.expectedExtractionRequests;
  assert(requests.length === expected.total, `extraction request total changed: ${requests.length}`);
  assert((kindCounts.STATIC ?? 0) === expected.STATIC, `STATIC request count changed: ${kindCounts.STATIC ?? 0}`);
  assert((kindCounts.CHAR_SPINE ?? 0) === expected.CHAR_SPINE, `CHAR_SPINE request count changed: ${kindCounts.CHAR_SPINE ?? 0}`);
  assert((kindCounts.MODEL_PRIMARY ?? 0) === expected.MODEL_PRIMARY, `MODEL_PRIMARY request count changed: ${kindCounts.MODEL_PRIMARY ?? 0}`);
  assert(requests.every((r) => typeof r.extractionClass === 'string'), 'unknown extraction class');

  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-4',
    evidenceClass: 'SELECTIVE_SERIALIZED_OBJECT_EXTRACTION_REQUEST_PLAN',
    status: 'READY_FOR_SELECTIVE_OBJECT_EXTRACTION',
    predecessor: {
      qaStatus: qa.status,
      qaFinalFreezeReady: true,
      accountedCandidateBundleCount: qa.counts.accountedCandidateBundleCount,
      acceptedRequiredTargetCount: qa.counts.acceptedRequiredTargetCount,
    },
    counts: {
      extractionRequestCount: requests.length,
      ...kindCounts,
      safeAliasRequestCount: requests.filter((r) => r.qaClass === 'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS').length,
    },
    extractionBoundary: contract.extractionBoundary,
    requests,
  };
}

function parseArgs(argv) {
  const o = { contractPath: DEFAULT_CONTRACT_PATH };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--contract') o.contractPath = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown argument ${a}`);
    else pos.push(a);
  }
  if (!o.help) {
    if (pos.length !== 3) throw new Error('required: <qa.json> <scan.json> <output.json>');
    [o.qaPath, o.scanPath, o.outputPath] = pos;
  }
  return o;
}
function usage() { console.log('Usage: node scripts/skin-stage3-4-build-extraction-plan.mjs <qa.json> <scan.json> <output.json> [--contract <contract.json>]'); }
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) usage();
    else {
      const result = buildExtractionPlan(readJson(o.qaPath), readJson(o.scanPath), readJson(o.contractPath));
      fs.mkdirSync(path.dirname(path.resolve(o.outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(o.outputPath), `${JSON.stringify(result, null, 2)}\n`);
      console.log(JSON.stringify({ output: path.resolve(o.outputPath), status: result.status, counts: result.counts }, null, 2));
    }
  } catch (e) { console.error(`[skin-stage3-4-plan] ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
}
