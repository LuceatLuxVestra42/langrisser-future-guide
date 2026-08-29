import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node scripts/skin-stage3-3-merge-scan-results.mjs <output.json> <scan-a.json> <scan-b.json> [scan-c.json ...] [--allow-incomplete]');
}

function parseArgs(argv) {
  const allowIncomplete = argv.includes('--allow-incomplete');
  const positional = argv.filter((arg) => arg !== '--allow-incomplete');
  if (positional.length < 3) return null;
  return {
    output: path.resolve(positional[0]),
    inputs: positional.slice(1).map((item) => path.resolve(item)),
    allowIncomplete,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertCompatible(base, next, sourceName) {
  const expected = {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-2',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (next[key] !== value) throw new Error(`${sourceName}: incompatible ${key}=${next[key]}`);
  }
  const baseCounts = base.counts ?? {};
  const nextCounts = next.counts ?? {};
  for (const key of ['frozenSkinCount', 'frozenUniqueModelResourceIdCount', 'requiredTargetCount', 'supplementalTargetCount', 'proposedCandidateFilenameCount', 'authoritativeCandidateBundleCount']) {
    if (baseCounts[key] !== nextCounts[key]) throw new Error(`${sourceName}: frozen count mismatch ${key}: ${nextCounts[key]} != ${baseCounts[key]}`);
  }
  const baseCatalog = base.source?.bundleFilenameCatalog ?? null;
  const nextCatalog = next.source?.bundleFilenameCatalog ?? null;
  if (Boolean(baseCatalog) !== Boolean(nextCatalog)) throw new Error(`${sourceName}: catalog presence mismatch`);
  if (baseCatalog && (baseCatalog.sha256 !== nextCatalog.sha256 || baseCatalog.lineCount !== nextCatalog.lineCount || baseCatalog.uniqueNameCount !== nextCatalog.uniqueNameCount)) {
    throw new Error(`${sourceName}: bundle filename catalog mismatch`);
  }
  if (!sameArray(base.authoritativeCandidateBundles, next.authoritativeCandidateBundles)) {
    throw new Error(`${sourceName}: authoritative candidate bundle list mismatch`);
  }
  if ((base.resolutions?.length ?? 0) !== (next.resolutions?.length ?? 0)) {
    throw new Error(`${sourceName}: resolution length mismatch`);
  }
}

function classifyTarget(candidateResults, unscannedCandidateBundles) {
  if (unscannedCandidateBundles.length > 0) return 'UNSCANNED_CANDIDATE_REMAINS';
  const hits = candidateResults.filter((candidate) => candidate.exactOccurrenceCount > 0);
  const duplicateWithinBundle = hits.filter((candidate) => candidate.exactOccurrenceCount > 1);
  const scanErrors = candidateResults.filter((candidate) => candidate.scanError);
  if (scanErrors.length > 0) return 'SCAN_ERROR';
  if (candidateResults.length === 0) return 'NO_CANDIDATE_BUNDLE_IN_CATALOG';
  if (duplicateWithinBundle.length > 0) return 'DUPLICATE_OCCURRENCE_IN_BUNDLE';
  if (hits.length === 0) return 'NOT_FOUND_IN_ALL_CANDIDATES';
  if (hits.length > 1) return 'AMBIGUOUS_MULTIPLE_BUNDLES';
  return 'RESOLVED_EXACT';
}

function countBy(items, field) {
  const out = {};
  for (const item of items) out[item[field]] = (out[item[field]] ?? 0) + 1;
  return out;
}

function mergeBundleReports(inputs) {
  const byName = new Map();
  for (const input of inputs) {
    for (const report of input.bundleReports ?? []) {
      const prior = byName.get(report.fileName);
      if (!prior) {
        byName.set(report.fileName, report);
        continue;
      }
      if (stable(prior) !== stable(report)) {
        throw new Error(`conflicting repeated bundle report: ${report.fileName}`);
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function mergeResolutions(inputs) {
  const base = inputs[0];
  const inputMaps = inputs.map((input) => new Map((input.resolutions ?? []).map((item) => [item.targetId, item])));
  return (base.resolutions ?? []).map((baseItem) => {
    const authoritative = baseItem.authoritativeCandidateBundles ?? [];
    const candidateByBundle = new Map();
    for (let i = 0; i < inputs.length; i += 1) {
      const item = inputMaps[i].get(baseItem.targetId);
      if (!item) throw new Error(`input ${i + 1}: missing target ${baseItem.targetId}`);
      for (const key of ['kind', 'skinId', 'skinResourceId', 'fieldNumber', 'frozenPath', 'runtimePath', 'required']) {
        if (stable(item[key]) !== stable(baseItem[key])) throw new Error(`input ${i + 1}: target identity mismatch ${baseItem.targetId} field=${key}`);
      }
      if (!sameArray(item.authoritativeCandidateBundles ?? [], authoritative)) {
        throw new Error(`input ${i + 1}: target candidate mismatch ${baseItem.targetId}`);
      }
      for (const candidate of item.candidateResults ?? []) {
        const prior = candidateByBundle.get(candidate.bundle);
        if (!prior) candidateByBundle.set(candidate.bundle, candidate);
        else if (stable(prior) !== stable(candidate)) throw new Error(`conflicting repeated candidate result: ${baseItem.targetId} @ ${candidate.bundle}`);
      }
    }
    const candidateResults = authoritative
      .filter((bundle) => candidateByBundle.has(bundle))
      .map((bundle) => candidateByBundle.get(bundle));
    const presentCandidateBundles = candidateResults.map((candidate) => candidate.bundle);
    const unscannedCandidateBundles = authoritative.filter((bundle) => !candidateByBundle.has(bundle));
    const status = classifyTarget(candidateResults, unscannedCandidateBundles);
    const selectedBundle = status === 'RESOLVED_EXACT'
      ? candidateResults.find((candidate) => candidate.exactOccurrenceCount === 1)?.bundle ?? null
      : null;
    return {
      ...baseItem,
      authoritativeCandidateBundles: authoritative,
      presentCandidateBundles,
      unscannedCandidateBundles,
      candidateResults,
      status,
      selectedBundle,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 1;
    return;
  }
  const inputs = args.inputs.map((filePath) => readJson(filePath));
  const base = inputs[0];
  for (let i = 0; i < inputs.length; i += 1) assertCompatible(base, inputs[i], path.basename(args.inputs[i]));

  const authoritativeCandidateBundles = [...base.authoritativeCandidateBundles];
  const bundleReports = mergeBundleReports(inputs);
  const scannedBundleNames = bundleReports.map((report) => report.fileName);
  const scannedSet = new Set(scannedBundleNames);
  const unexpectedBundles = scannedBundleNames.filter((name) => !authoritativeCandidateBundles.includes(name));
  if (unexpectedBundles.length > 0) throw new Error(`scanned bundle outside authoritative candidate set: ${unexpectedBundles.join(', ')}`);

  const resolutions = mergeResolutions(inputs);
  const requiredResolutions = resolutions.filter((item) => item.required);
  const supplementalResolutions = resolutions.filter((item) => !item.required);
  const requiredStatusCounts = countBy(requiredResolutions, 'status');
  const supplementalStatusCounts = countBy(supplementalResolutions, 'status');
  const requiredResolvedCount = requiredStatusCounts.RESOLVED_EXACT ?? 0;
  const requiredBlockerCount = requiredResolutions.length - requiredResolvedCount;
  const bundleErrorCount = bundleReports.filter((bundle) => bundle.scanStatus === 'ERROR').length;
  const fullResolved = requiredBlockerCount === 0 && bundleErrorCount === 0;

  const result = {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-2',
    evidenceClass: 'MERGED_BATCH_BULK_AUTHORITATIVE_UNITYFS_EXACT_RUNTIME_PATH_SCAN',
    status: fullResolved ? 'BULK_REQUIRED_PATH_EVIDENCE_COMPLETE' : 'BULK_SCAN_PARTIAL_OR_BLOCKED',
    source: {
      sourceType: 'MERGED_PC_CLIENT_EXPORT_ASSET_BUNDLE_BATCH_SCANS',
      inputResultFiles: args.inputs.map((filePath) => path.basename(filePath)),
      bundleFilenameCatalog: base.source?.bundleFilenameCatalog ?? null,
      acquisitionMethod: 'merge previously scanned local raw-byte SHA-256 / UnityFS exact runtime-path evidence; no bundle membership inference',
    },
    guardrails: {
      fuzzyMatching: false,
      numericIdArithmetic: false,
      inferredBundleMembership: false,
      crossRootFallback: false,
      alternatePathSubstitution: false,
      mergeRequiresIdenticalFrozenCounts: true,
      mergeRequiresIdenticalCatalogHash: Boolean(base.source?.bundleFilenameCatalog),
      repeatedBundleResultMustBeIdentical: true,
      repeatedCandidateResultMustBeIdentical: true,
    },
    counts: {
      frozenSkinCount: base.counts.frozenSkinCount,
      frozenUniqueModelResourceIdCount: base.counts.frozenUniqueModelResourceIdCount,
      requiredTargetCount: requiredResolutions.length,
      supplementalTargetCount: supplementalResolutions.length,
      proposedCandidateFilenameCount: base.counts.proposedCandidateFilenameCount,
      authoritativeCandidateBundleCount: authoritativeCandidateBundles.length,
      presentCandidateBundleCount: scannedSet.size,
      scannedBundleCount: bundleReports.length,
      bundleErrorCount,
      requiredResolvedCount,
      requiredBlockerCount,
      supplementalResolvedCount: supplementalStatusCounts.RESOLVED_EXACT ?? 0,
      supplementalBlockerCount: supplementalResolutions.length - (supplementalStatusCounts.RESOLVED_EXACT ?? 0),
    },
    requiredStatusCounts,
    supplementalStatusCounts,
    authoritativeCandidateBundles,
    presentCandidateBundles: scannedBundleNames,
    unscannedCandidateBundles: authoritativeCandidateBundles.filter((name) => !scannedSet.has(name)),
    bundleReports,
    resolutions,
    blockers: requiredResolutions
      .filter((item) => item.status !== 'RESOLVED_EXACT')
      .map((item) => ({
        targetId: item.targetId,
        kind: item.kind,
        skinId: item.skinId,
        skinResourceId: item.skinResourceId,
        frozenPath: item.frozenPath,
        status: item.status,
        authoritativeCandidateBundles: item.authoritativeCandidateBundles,
        presentCandidateBundles: item.presentCandidateBundles,
        unscannedCandidateBundles: item.unscannedCandidateBundles,
      })),
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ output: args.output, status: result.status, counts: result.counts, requiredStatusCounts, supplementalStatusCounts }, null, 2));
  if (!fullResolved && !args.allowIncomplete) process.exitCode = 2;
}

main();
