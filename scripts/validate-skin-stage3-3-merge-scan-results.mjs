import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const merger = path.join(root, 'scripts/skin-stage3-3-merge-scan-results.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-stage3-3-merge-'));
const checks = [];
const add = (id, pass, detail = null) => checks.push({ id, pass: Boolean(pass), ...(detail === null ? {} : { detail }) });

function write(name, value) {
  const filePath = path.join(temp, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function fixture({ bundle, hit = 0, catalogHash = 'catalog-hash', reportHash = null }) {
  const other = bundle === 'b1' ? 'b2' : 'b1';
  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-2',
    source: { bundleFilenameCatalog: { sha256: catalogHash, lineCount: 2, uniqueNameCount: 2 } },
    counts: {
      frozenSkinCount: 540,
      frozenUniqueModelResourceIdCount: 789,
      requiredTargetCount: 1,
      supplementalTargetCount: 0,
      proposedCandidateFilenameCount: 2,
      authoritativeCandidateBundleCount: 2,
    },
    authoritativeCandidateBundles: ['b1', 'b2'],
    bundleReports: [{ fileName: bundle, sha256: reportHash ?? `sha-${bundle}`, scanStatus: 'OK' }],
    resolutions: [{
      targetId: 'skin:1:static',
      kind: 'STATIC',
      skinId: 1,
      frozenPath: 'UI/Icon/HeroSkin_ABS/Skin/Test.png',
      runtimePath: 'assets/gameproject/runtimeassets/ui/icon/heroskin_abs/skin/test.png',
      required: true,
      authoritativeCandidateBundles: ['b1', 'b2'],
      presentCandidateBundles: [bundle],
      unscannedCandidateBundles: [other],
      candidateResults: [{ bundle, exactOccurrenceCount: hit, matches: hit === 1 ? [{ offset: 1 }] : [] }],
      status: 'UNSCANNED_CANDIDATE_REMAINS',
      selectedBundle: null,
    }],
  };
}

function run(output, inputs, allowIncomplete = false) {
  const args = [merger, output, ...inputs, ...(allowIncomplete ? ['--allow-incomplete'] : [])];
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

try {
  const a = write('a.json', fixture({ bundle: 'b1', hit: 0 }));
  const b = write('b.json', fixture({ bundle: 'b2', hit: 1 }));

  const mergedPath = path.join(temp, 'merged.json');
  const mergedRun = run(mergedPath, [a, b]);
  const merged = fs.existsSync(mergedPath) ? JSON.parse(fs.readFileSync(mergedPath, 'utf8')) : null;
  add(
    'DISJOINT_BATCHES_RESOLVE_EXACT',
    mergedRun.status === 0 && merged?.status === 'BULK_REQUIRED_PATH_EVIDENCE_COMPLETE' && merged?.counts?.scannedBundleCount === 2 && merged?.counts?.requiredResolvedCount === 1 && merged?.resolutions?.[0]?.selectedBundle === 'b2',
    mergedRun.stderr || mergedRun.stdout,
  );

  const partialPath = path.join(temp, 'partial.json');
  const partialRun = run(partialPath, [a, a], true);
  const partial = fs.existsSync(partialPath) ? JSON.parse(fs.readFileSync(partialPath, 'utf8')) : null;
  add(
    'UNSCANNED_CANDIDATE_REMAINS_BLOCKED',
    partialRun.status === 0 && partial?.status === 'BULK_SCAN_PARTIAL_OR_BLOCKED' && partial?.requiredStatusCounts?.UNSCANNED_CANDIDATE_REMAINS === 1 && partial?.unscannedCandidateBundles?.length === 1,
    partialRun.stderr || partialRun.stdout,
  );

  const wrongCatalog = write('wrong-catalog.json', fixture({ bundle: 'b2', hit: 1, catalogHash: 'different' }));
  const wrongCatalogRun = run(path.join(temp, 'wrong-catalog-out.json'), [a, wrongCatalog], true);
  add('CATALOG_HASH_MISMATCH_FAILS_CLOSED', wrongCatalogRun.status !== 0 && /catalog mismatch/.test(wrongCatalogRun.stderr), wrongCatalogRun.stderr);

  const conflict = write('conflict.json', fixture({ bundle: 'b1', hit: 0, reportHash: 'different-sha' }));
  const conflictRun = run(path.join(temp, 'conflict-out.json'), [a, conflict], true);
  add('REPEATED_BUNDLE_CONFLICT_FAILS_CLOSED', conflictRun.status !== 0 && /conflicting repeated bundle report/.test(conflictRun.stderr), conflictRun.stderr);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({
  schemaVersion: 1,
  stage: 'skin-page-3',
  substage: '3-3-2',
  status: failed.length === 0 ? 'PASS_SKIN_STAGE3_3_2_BATCH_MERGE_VALIDATION' : 'FAIL_SKIN_STAGE3_3_2_BATCH_MERGE_VALIDATION',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
