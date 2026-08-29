import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONTRACT_PATH = 'data/contracts/skin-stage3-3-3-resolution-qa.v2.json';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function sameExactSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const a = new Set(actual);
  const e = new Set(expected);
  return a.size === actual.length && e.size === expected.length && a.size === e.size && [...a].every((x) => e.has(x));
}

function buildBundleReportMap(scan) {
  const map = new Map();
  for (const report of scan.bundleReports ?? []) {
    assert(typeof report?.fileName === 'string' && report.fileName.length > 0, 'bundle report missing fileName');
    assert(!map.has(report.fileName), `duplicate bundle report ${report.fileName}`);
    map.set(report.fileName, report);
  }
  return map;
}

function embeddedCabSha(report, cabName) {
  if (!report || report.scanStatus !== 'OK') return null;
  const matches = (report.embeddedCabs ?? []).filter((cab) => cab.name === cabName);
  if (matches.length !== 1) return null;
  return matches[0].sha256 ?? null;
}

function classifyResolution(resolution, bundleReports) {
  const authoritative = resolution.authoritativeCandidateBundles ?? [];
  const unscanned = resolution.unscannedCandidateBundles ?? [];
  const candidates = resolution.candidateResults ?? [];

  if (authoritative.length === 0) {
    return { qaClass: 'FAIL_CANDIDATE_COVERAGE', accepted: false, severity: 'FAIL', aliasBundles: [] };
  }
  if (unscanned.length > 0) {
    return { qaClass: 'PENDING_UNSCANNED_CANDIDATE', accepted: false, severity: 'PENDING', aliasBundles: [] };
  }
  if (candidates.some((candidate) => candidate.scanError)) {
    return { qaClass: 'FAIL_SCAN_ERROR', accepted: false, severity: 'FAIL', aliasBundles: [] };
  }

  const hits = candidates.filter((candidate) => Number(candidate.exactOccurrenceCount ?? 0) > 0);
  if (hits.some((candidate) => Number(candidate.exactOccurrenceCount ?? 0) > 1)) {
    return {
      qaClass: 'REVIEW_DUPLICATE_OCCURRENCE_IN_BUNDLE',
      accepted: false,
      severity: 'REVIEW',
      aliasBundles: hits.map((hit) => hit.bundle),
    };
  }
  if (hits.length === 0) {
    return { qaClass: 'FAIL_NOT_FOUND', accepted: false, severity: 'FAIL', aliasBundles: [] };
  }
  if (hits.length === 1) {
    const hit = hits[0];
    if (
      resolution.selectedBundle !== hit.bundle ||
      Number(hit.exactOccurrenceCount) !== 1 ||
      !Array.isArray(hit.matches) ||
      hit.matches.length !== 1
    ) {
      return { qaClass: 'FAIL_INVALID_SCAN_EVIDENCE', accepted: false, severity: 'FAIL', aliasBundles: [] };
    }
    return {
      qaClass: 'RESOLVED_EXACT_SINGLE_BUNDLE',
      accepted: true,
      severity: 'PASS',
      aliasBundles: [],
      resolvedBundles: [hit.bundle],
    };
  }

  const cabShas = [];
  const aliasBundles = [];
  for (const hit of hits) {
    if (Number(hit.exactOccurrenceCount) !== 1 || !Array.isArray(hit.matches) || hit.matches.length !== 1) {
      return {
        qaClass: 'REVIEW_DUPLICATE_OCCURRENCE_IN_BUNDLE',
        accepted: false,
        severity: 'REVIEW',
        aliasBundles: hits.map((candidate) => candidate.bundle),
      };
    }
    const report = bundleReports.get(hit.bundle);
    if (!report || report.scanStatus !== 'OK') {
      return {
        qaClass: 'FAIL_SCAN_ERROR',
        accepted: false,
        severity: 'FAIL',
        aliasBundles: hits.map((candidate) => candidate.bundle),
      };
    }
    const sha = embeddedCabSha(report, hit.matches[0].embeddedCab);
    if (!sha) {
      return {
        qaClass: 'FAIL_INVALID_SCAN_EVIDENCE',
        accepted: false,
        severity: 'FAIL',
        aliasBundles: hits.map((candidate) => candidate.bundle),
      };
    }
    cabShas.push(sha);
    aliasBundles.push(hit.bundle);
  }

  if (new Set(cabShas).size === 1) {
    return {
      qaClass: 'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS',
      accepted: true,
      severity: 'PASS',
      aliasBundles: aliasBundles.sort(),
      identicalCabSha256: cabShas[0],
      resolvedBundles: aliasBundles.sort(),
    };
  }

  return {
    qaClass: 'REVIEW_MULTIPLE_NONIDENTICAL_CABS',
    accepted: false,
    severity: 'REVIEW',
    aliasBundles: aliasBundles.sort(),
    matchedCabSha256: [...new Set(cabShas)].sort(),
  };
}

export function loadRetainedCandidateSurface(contract, repoRoot = process.cwd()) {
  const spec = contract?.candidateSurfaceAdmission?.retainedSources;
  assert(spec, 'candidate-surface retained source contract missing');
  assert(Array.isArray(spec.unscannedDemandShards) && spec.unscannedDemandShards.length > 0, 'unscanned demand shard list missing');

  const unscanned = [];
  const demandShardCounts = [];
  for (const rel of spec.unscannedDemandShards) {
    const artifact = readJson(path.resolve(repoRoot, rel));
    assert(Array.isArray(artifact.records), `retained demand shard records missing: ${rel}`);
    const names = artifact.records.map((row) => row?.[0]);
    assert(names.every((name) => typeof name === 'string' && name.length > 0), `invalid retained bundle name: ${rel}`);
    unscanned.push(...names);
    demandShardCounts.push({ path: rel, count: names.length });
  }
  assert(unscanned.length === spec.expectedUnscannedDemandCount, `retained unscanned demand count changed: ${unscanned.length}`);
  assert(new Set(unscanned).size === unscanned.length, 'retained unscanned demand contains duplicates');

  const provenancePath = path.resolve(repoRoot, spec.scannedBundleProvenance);
  const provenance = readJson(provenancePath);
  assert(Array.isArray(provenance.records), 'retained scanned provenance records missing');
  const scanned = provenance.records.map((row) => row?.fileName);
  assert(scanned.every((name) => typeof name === 'string' && name.length > 0), 'invalid retained scanned provenance bundle name');
  assert(scanned.length === spec.expectedScannedProvenanceCount, `retained scanned provenance count changed: ${scanned.length}`);
  assert(new Set(scanned).size === scanned.length, 'retained scanned provenance contains duplicates');

  const union = [...unscanned, ...scanned];
  assert(new Set(union).size === union.length, 'retained scanned/unscanned candidate surfaces overlap');
  assert(union.length === spec.expectedUnionCount, `retained candidate union count changed: ${union.length}`);

  return {
    bundles: union.sort(),
    proof: {
      unscannedDemandCount: unscanned.length,
      scannedProvenanceCount: scanned.length,
      unionCount: union.length,
      demandShardCounts,
      scannedBundleProvenancePath: spec.scannedBundleProvenance,
    },
  };
}

function validateCandidateSurface(scan, contract, expectedCandidateBundles, retainedProof = null) {
  const base = contract.frozenBaseline;
  assert(Array.isArray(expectedCandidateBundles), 'expected frozen candidate surface missing');
  assert(expectedCandidateBundles.length === base.authoritativeCandidateBundleCount, 'expected candidate surface count changed');
  assert(new Set(expectedCandidateBundles).size === expectedCandidateBundles.length, 'expected candidate surface contains duplicates');
  assert(Array.isArray(scan?.authoritativeCandidateBundles), 'authoritative candidate bundle list missing');
  assert(
    sameExactSet(scan.authoritativeCandidateBundles, expectedCandidateBundles),
    'authoritative candidate bundle set differs from retained frozen 536-candidate surface',
  );

  const catalog = scan?.source?.bundleFilenameCatalog ?? null;
  if (catalog) {
    assert(catalog.lineCount === base.bundleCatalogLineCount, `catalog line count changed: ${catalog.lineCount}`);
    assert(catalog.sha256 === base.bundleCatalogSha256, 'catalog SHA-256 changed');
    assert(catalog.uniqueNameCount === base.bundleCatalogLineCount, `catalog unique-name count changed: ${catalog.uniqueNameCount}`);
    return {
      mode: 'FROZEN_CATALOG_EXACT',
      historicalCatalogVerified: true,
      retainedCandidateSurfaceVerified: true,
      retainedProof,
    };
  }

  const directoryRequirement = contract.candidateSurfaceAdmission.directoryModeRequirements;
  assert(
    scan?.source?.sourceType === directoryRequirement.scanSourceType,
    `catalogless scan sourceType not admitted: ${scan?.source?.sourceType}`,
  );
  return {
    mode: 'RETAINED_CANDIDATE_SURFACE_EXACT',
    historicalCatalogVerified: false,
    retainedCandidateSurfaceVerified: true,
    retainedProof,
  };
}

function validateFrozenScan(scan, contract, options = {}) {
  const base = contract.frozenBaseline;
  assert(scan?.schemaVersion === 1, `scan schemaVersion changed: ${scan?.schemaVersion}`);
  assert(scan?.stage === 'skin-page-3', `scan stage changed: ${scan?.stage}`);
  assert(scan?.substage === '3-3-2', `scan substage changed: ${scan?.substage}`);
  assert(scan?.counts?.frozenSkinCount === base.skinCount, `Skin count changed: ${scan?.counts?.frozenSkinCount}`);
  assert(scan?.counts?.frozenUniqueModelResourceIdCount === base.modelPrimaryTargetCount, `model resource count changed: ${scan?.counts?.frozenUniqueModelResourceIdCount}`);
  assert(scan?.counts?.requiredTargetCount === base.requiredTargetCount, `required target count changed: ${scan?.counts?.requiredTargetCount}`);
  assert(scan?.counts?.supplementalTargetCount === base.supplementalTargetCount, `supplemental target count changed: ${scan?.counts?.supplementalTargetCount}`);
  assert(scan?.counts?.proposedCandidateFilenameCount === base.proposedCandidateFilenameCount, `proposed candidate filename count changed: ${scan?.counts?.proposedCandidateFilenameCount}`);
  assert(scan?.counts?.authoritativeCandidateBundleCount === base.authoritativeCandidateBundleCount, `candidate bundle count changed: ${scan?.counts?.authoritativeCandidateBundleCount}`);

  const candidateSurfaceAdmission = validateCandidateSurface(
    scan,
    contract,
    options.expectedCandidateBundles,
    options.retainedProof ?? null,
  );

  assert(new Set(scan.authoritativeCandidateBundles).size === scan.authoritativeCandidateBundles.length, 'authoritative candidate bundle list contains duplicates');
  const authoritativeSet = new Set(scan.authoritativeCandidateBundles);
  assert(Array.isArray(scan?.presentCandidateBundles), 'present candidate bundle list missing');
  assert(Array.isArray(scan?.unscannedCandidateBundles), 'unscanned candidate bundle list missing');
  assert(new Set(scan.presentCandidateBundles).size === scan.presentCandidateBundles.length, 'present candidate bundle list contains duplicates');
  assert(new Set(scan.unscannedCandidateBundles).size === scan.unscannedCandidateBundles.length, 'unscanned candidate bundle list contains duplicates');
  assert(scan.presentCandidateBundles.every((name) => authoritativeSet.has(name)), 'present bundle outside authoritative candidate list');
  assert(scan.unscannedCandidateBundles.every((name) => authoritativeSet.has(name)), 'unscanned bundle outside authoritative candidate list');
  assert(scan.presentCandidateBundles.every((name) => !scan.unscannedCandidateBundles.includes(name)), 'present/unscanned bundle overlap');
  assert(scan.presentCandidateBundles.length + scan.unscannedCandidateBundles.length === base.authoritativeCandidateBundleCount, 'present/unscanned bundle partition incomplete');
  assert(scan?.counts?.presentCandidateBundleCount === scan.presentCandidateBundles.length, 'present candidate count disagrees with list');
  assert(scan?.counts?.scannedBundleCount === (scan.bundleReports ?? []).length, 'scanned bundle count disagrees with reports');
  assert((scan.bundleReports ?? []).length === scan.presentCandidateBundles.length, 'bundle report count disagrees with present candidates');
  const reportNames = new Set((scan.bundleReports ?? []).map((report) => report.fileName));
  assert(reportNames.size === (scan.bundleReports ?? []).length, 'bundle report fileName duplicate');
  assert(scan.presentCandidateBundles.every((name) => reportNames.has(name)), 'present candidate missing bundle report');
  const actualBundleErrors = (scan.bundleReports ?? []).filter((report) => report.scanStatus === 'ERROR').length;
  assert(scan?.counts?.bundleErrorCount === actualBundleErrors, `bundle error count disagrees with reports: ${scan?.counts?.bundleErrorCount} != ${actualBundleErrors}`);

  assert(Array.isArray(scan?.resolutions), 'scan resolutions missing');
  const candidateUnion = new Set(scan.resolutions.flatMap((resolution) => resolution.authoritativeCandidateBundles ?? []));
  assert(candidateUnion.size === authoritativeSet.size && [...authoritativeSet].every((name) => candidateUnion.has(name)), 'target candidate union disagrees with authoritative candidate list');

  const required = scan.resolutions.filter((item) => item?.required === true);
  const supplemental = scan.resolutions.filter((item) => item?.required !== true);
  assert(required.length === base.requiredTargetCount, `required resolution rows changed: ${required.length}`);
  assert(supplemental.length === base.supplementalTargetCount, `supplemental resolution rows changed: ${supplemental.length}`);

  const ids = scan.resolutions.map((item) => item?.targetId);
  assert(ids.every((id) => typeof id === 'string' && id.length > 0), 'resolution targetId missing');
  assert(new Set(ids).size === ids.length, 'resolution targetId duplicate');

  for (const resolution of scan.resolutions) {
    const authoritative = resolution.authoritativeCandidateBundles ?? [];
    const present = resolution.presentCandidateBundles ?? [];
    const unscanned = resolution.unscannedCandidateBundles ?? [];
    const candidates = resolution.candidateResults ?? [];
    assert(authoritative.length > 0, `target ${resolution.targetId} has no authoritative candidate`);
    assert(authoritative.every((name) => authoritativeSet.has(name)), `target ${resolution.targetId} candidate outside authoritative set`);
    assert(new Set(authoritative).size === authoritative.length, `target ${resolution.targetId} candidate duplicate`);
    assert(present.every((name) => authoritative.includes(name)), `target ${resolution.targetId} present candidate outside target candidate list`);
    assert(unscanned.every((name) => authoritative.includes(name)), `target ${resolution.targetId} unscanned candidate outside target candidate list`);
    assert(present.length + unscanned.length === authoritative.length, `target ${resolution.targetId} candidate partition incomplete`);
    assert(candidates.length === present.length, `target ${resolution.targetId} candidate result count disagrees with present list`);
    assert(candidates.every((candidate) => present.includes(candidate.bundle)), `target ${resolution.targetId} candidate result bundle mismatch`);
    for (const candidate of candidates) {
      const occurrenceCount = Number(candidate.exactOccurrenceCount ?? 0);
      assert(Number.isSafeInteger(occurrenceCount) && occurrenceCount >= 0, `target ${resolution.targetId} invalid occurrence count`);
      assert(Array.isArray(candidate.matches), `target ${resolution.targetId} candidate matches missing`);
      if (!candidate.scanError) assert(candidate.matches.length === occurrenceCount, `target ${resolution.targetId} match count mismatch`);
    }
  }

  const requiredKinds = countBy(required, (item) => item.kind);
  assert(requiredKinds.STATIC === base.staticTargetCount, `STATIC target count changed: ${requiredKinds.STATIC ?? 0}`);
  assert(requiredKinds.CHAR_SPINE === base.charSpineTargetCount, `CHAR_SPINE target count changed: ${requiredKinds.CHAR_SPINE ?? 0}`);
  assert(requiredKinds.MODEL_PRIMARY === base.modelPrimaryTargetCount, `MODEL_PRIMARY target count changed: ${requiredKinds.MODEL_PRIMARY ?? 0}`);
  return { required, supplemental, requiredKinds, candidateSurfaceAdmission };
}

export function evaluateResolutionQa(scan, contract, options = {}) {
  assert(contract?.status === 'DESIGN_FROZEN', '3-3-3 contract is not DESIGN_FROZEN');
  const { required, supplemental, requiredKinds, candidateSurfaceAdmission } = validateFrozenScan(scan, contract, options);
  const bundleReports = buildBundleReportMap(scan);
  const rows = required.map((resolution) => ({
    targetId: resolution.targetId,
    kind: resolution.kind,
    skinId: resolution.skinId,
    skinResourceId: resolution.skinResourceId,
    frozenPath: resolution.frozenPath,
    sourceStatus: resolution.status,
    ...classifyResolution(resolution, bundleReports),
  }));

  const qaClassCounts = countBy(rows, (row) => row.qaClass);
  const accepted = rows.filter((row) => row.accepted);
  const pending = rows.filter((row) => row.severity === 'PENDING');
  const failed = rows.filter((row) => row.severity === 'FAIL');
  const review = rows.filter((row) => row.severity === 'REVIEW');
  const acceptedSkinIds = new Set(accepted.map((row) => row.skinId));
  const acceptedKindCounts = countBy(accepted, (row) => row.kind);
  const aliasRows = accepted.filter((row) => row.qaClass === 'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS');
  const unscannedBundleCount = scan.unscannedCandidateBundles.length;
  const accountedBundleCount = contract.frozenBaseline.authoritativeCandidateBundleCount - unscannedBundleCount;
  const bundleScanErrors = scan.counts.bundleErrorCount;

  const finalFreezeReady =
    accountedBundleCount === contract.finalFreezeConditions.candidateBundlesAccountedFor &&
    bundleScanErrors === contract.finalFreezeConditions.bundleScanErrors &&
    accepted.length === contract.finalFreezeConditions.requiredTargetsAccepted &&
    pending.length === 0 && failed.length === 0 && review.length === 0 &&
    acceptedSkinIds.size === contract.finalFreezeConditions.skinCoverage &&
    acceptedKindCounts.STATIC === contract.finalFreezeConditions.staticCoverage &&
    acceptedKindCounts.CHAR_SPINE === contract.finalFreezeConditions.charSpineCoverage &&
    acceptedKindCounts.MODEL_PRIMARY === contract.finalFreezeConditions.modelPrimaryCoverage;

  let status = 'WAITING_FOR_STAGE3_3_2_FULL_SCAN';
  if (failed.length > 0) status = 'FAIL_SKIN_STAGE3_3_3_RESOLUTION_QA';
  else if (review.length > 0 && pending.length === 0) status = 'REVIEW_SKIN_STAGE3_3_3_RESOLUTION_QA';
  else if (finalFreezeReady) status = 'PASS_SKIN_STAGE3_3_3_RESOLUTION_QA_FREEZE_READY';

  return {
    schemaVersion: 2,
    stage: 'skin-page-3',
    substage: '3-3-3',
    evidenceClass: 'SKIN_BULK_RESOLUTION_QA',
    status,
    finalFreezeReady,
    sourceScanStatus: scan.status ?? null,
    candidateSurfaceAdmission,
    counts: {
      requiredTargetCount: required.length,
      acceptedRequiredTargetCount: accepted.length,
      pendingRequiredTargetCount: pending.length,
      failedRequiredTargetCount: failed.length,
      reviewRequiredTargetCount: review.length,
      safeAliasTargetCount: aliasRows.length,
      acceptedSkinCoverage: acceptedSkinIds.size,
      acceptedStaticCount: acceptedKindCounts.STATIC ?? 0,
      acceptedCharSpineCount: acceptedKindCounts.CHAR_SPINE ?? 0,
      acceptedModelPrimaryCount: acceptedKindCounts.MODEL_PRIMARY ?? 0,
      candidateBundleCount: contract.frozenBaseline.authoritativeCandidateBundleCount,
      accountedCandidateBundleCount: accountedBundleCount,
      unscannedCandidateBundleCount: unscannedBundleCount,
      bundleScanErrorCount: bundleScanErrors,
      supplementalTargetCount: supplemental.length,
    },
    qaClassCounts,
    requiredKindCounts: requiredKinds,
    acceptedEvidenceClasses: contract.acceptedRequiredEvidenceClasses,
    rows,
    blockers: rows.filter((row) => !row.accepted),
    aliasEvidence: aliasRows.map((row) => ({
      targetId: row.targetId,
      skinId: row.skinId,
      skinResourceId: row.skinResourceId,
      bundles: row.aliasBundles,
      identicalCabSha256: row.identicalCabSha256,
    })),
    boundaries: {
      canonicalSkinRecomputed: false,
      heroSkinOwnershipRecomputed: false,
      sourceOrderRecomputed: false,
      modelResourceSelectionRecomputed: false,
      beginCurrentPreferredByName: false,
      partialInputMayFreeze: false,
      syntheticCatalogMetadataCreated: false,
      historicalCatalogRequiredForDirectoryMode: false,
    },
    nextStartPoint: finalFreezeReady
      ? 'Freeze Stage 3-3-3 resolution QA and proceed to Stage 3-4 selective actual asset extraction.'
      : pending.length > 0
        ? 'Continue Stage 3-3-2 exact-content scanning for every remaining admitted frozen candidate bundle, then rerun this validator.'
        : 'Review explicit FAIL/REVIEW classes only; do not infer or silently select a bundle.',
  };
}

function parseArgs(argv) {
  const options = { contractPath: DEFAULT_CONTRACT_PATH, outputPath: null, allowIncomplete: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--contract') options.contractPath = argv[++i];
    else if (arg === '--write') options.outputPath = argv[++i];
    else if (arg === '--allow-incomplete') options.allowIncomplete = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new Error(`unknown argument ${arg}`);
    else positional.push(arg);
  }
  if (!options.help) {
    if (positional.length !== 1) throw new Error('exactly one Stage 3-3-2 scan result JSON path is required');
    options.scanPath = positional[0];
  }
  return options;
}

function usage() {
  console.log('Usage: node scripts/validate-skin-stage3-3-3-resolution-qa-v2.mjs <stage3-3-2-scan.json> [--contract <contract.json>] [--write <qa.json>] [--allow-incomplete]');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
    } else {
      const contractPath = path.resolve(options.contractPath);
      const contract = readJson(contractPath);
      const repoRoot = process.cwd();
      const retained = loadRetainedCandidateSurface(contract, repoRoot);
      const scan = readJson(path.resolve(options.scanPath));
      const result = evaluateResolutionQa(scan, contract, {
        expectedCandidateBundles: retained.bundles,
        retainedProof: retained.proof,
      });
      const serialized = `${JSON.stringify(result, null, 2)}\n`;
      if (options.outputPath) {
        const output = path.resolve(options.outputPath);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, serialized);
      }
      process.stdout.write(serialized);
      if (!result.finalFreezeReady && !options.allowIncomplete) process.exitCode = 2;
    }
  } catch (error) {
    console.error(`[skin-stage3-3-3-resolution-qa-v2] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
