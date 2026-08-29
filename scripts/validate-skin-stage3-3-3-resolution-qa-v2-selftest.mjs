import { evaluateResolutionQa } from './validate-skin-stage3-3-3-resolution-qa-v2.mjs';

const contract = {
  status: 'DESIGN_FROZEN',
  frozenBaseline: {
    skinCount: 2,
    staticTargetCount: 2,
    charSpineTargetCount: 2,
    modelPrimaryTargetCount: 2,
    requiredTargetCount: 6,
    supplementalTargetCount: 1,
    modelSourceIndexRecordCount: 2,
    proposedCandidateFilenameCount: 2,
    bundleCatalogLineCount: 2,
    bundleCatalogSha256: 'catalog-sha',
    authoritativeCandidateBundleCount: 2,
  },
  candidateSurfaceAdmission: {
    directoryModeRequirements: {
      scanSourceType: 'PC_CLIENT_EXPORT_ASSET_BUNDLE_DIRECTORY',
    },
  },
  acceptedRequiredEvidenceClasses: [
    'RESOLVED_EXACT_SINGLE_BUNDLE',
    'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS',
  ],
  finalFreezeConditions: {
    candidateBundlesAccountedFor: 2,
    bundleScanErrors: 0,
    requiredTargetsAccepted: 6,
    pendingRequiredTargets: 0,
    failedRequiredTargets: 0,
    reviewRequiredTargets: 0,
    skinCoverage: 2,
    staticCoverage: 2,
    charSpineCoverage: 2,
    modelPrimaryCoverage: 2,
    beginCurrentUnresolved: 0,
  },
};

const expectedCandidateBundles = ['a.b', 'begin_a.b'];
const options = {
  expectedCandidateBundles,
  retainedProof: { unscannedDemandCount: 1, scannedProvenanceCount: 1, unionCount: 2 },
};

function makeScan({ withCatalog = true } = {}) {
  const bundles = ['begin_a.b', 'a.b'];
  const bundleReports = [
    { fileName: bundles[0], scanStatus: 'OK', embeddedCabs: [{ name: 'CAB-A', sha256: 'cab-a' }] },
    { fileName: bundles[1], scanStatus: 'OK', embeddedCabs: [{ name: 'CAB-B', sha256: 'cab-b' }] },
  ];
  const definitions = [
    ['s1', 'STATIC', 1, bundles[0], 'CAB-A'],
    ['s2', 'STATIC', 2, bundles[1], 'CAB-B'],
    ['c1', 'CHAR_SPINE', 1, bundles[0], 'CAB-A'],
    ['c2', 'CHAR_SPINE', 2, bundles[1], 'CAB-B'],
    ['m1', 'MODEL_PRIMARY', 1, bundles[0], 'CAB-A'],
    ['m2', 'MODEL_PRIMARY', 2, bundles[1], 'CAB-B'],
  ];
  const resolutions = definitions.map(([targetId, kind, skinId, bundle, embeddedCab], index) => ({
    targetId,
    kind,
    skinId,
    ...(kind === 'MODEL_PRIMARY' ? { skinResourceId: index + 1 } : {}),
    frozenPath: `P/${targetId}`,
    runtimePath: `assets/gameproject/runtimeassets/p/${targetId}`,
    required: true,
    authoritativeCandidateBundles: [bundle],
    presentCandidateBundles: [bundle],
    unscannedCandidateBundles: [],
    candidateResults: [{ bundle, exactOccurrenceCount: 1, matches: [{ embeddedCab, runtimePathByteOffset: 10 + index }] }],
    status: 'RESOLVED_EXACT',
    selectedBundle: bundle,
  }));
  resolutions.push({
    targetId: 'x1',
    kind: 'MODEL_ADDITIONAL',
    skinId: 1,
    skinResourceId: 1,
    frozenPath: 'P/x1',
    runtimePath: 'assets/gameproject/runtimeassets/p/x1',
    required: false,
    authoritativeCandidateBundles: [bundles[0]],
    presentCandidateBundles: [bundles[0]],
    unscannedCandidateBundles: [],
    candidateResults: [{ bundle: bundles[0], exactOccurrenceCount: 0, matches: [] }],
    status: 'NOT_FOUND_IN_ALL_CANDIDATES',
    selectedBundle: null,
  });
  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-2',
    status: 'BULK_REQUIRED_PATH_EVIDENCE_COMPLETE',
    source: withCatalog
      ? { sourceType: 'PC_CLIENT_EXPORT_ASSET_BUNDLE_SUBSET_WITH_FILENAME_CATALOG', bundleFilenameCatalog: { lineCount: 2, uniqueNameCount: 2, sha256: 'catalog-sha' } }
      : { sourceType: 'PC_CLIENT_EXPORT_ASSET_BUNDLE_DIRECTORY', bundleFilenameCatalog: null },
    counts: {
      frozenSkinCount: 2,
      frozenUniqueModelResourceIdCount: 2,
      requiredTargetCount: 6,
      supplementalTargetCount: 1,
      proposedCandidateFilenameCount: 2,
      authoritativeCandidateBundleCount: 2,
      presentCandidateBundleCount: 2,
      scannedBundleCount: 2,
      bundleErrorCount: 0,
    },
    authoritativeCandidateBundles: bundles,
    presentCandidateBundles: [...bundles],
    unscannedCandidateBundles: [],
    bundleReports,
    resolutions,
  };
}

const checks = [];
const add = (id, pass) => checks.push({ id, pass: Boolean(pass) });

let result = evaluateResolutionQa(makeScan({ withCatalog: true }), contract, options);
add('FROZEN_CATALOG_EXACT_FINAL_PASS', result.finalFreezeReady && result.candidateSurfaceAdmission.mode === 'FROZEN_CATALOG_EXACT');

const directory = makeScan({ withCatalog: false });
result = evaluateResolutionQa(directory, contract, options);
add('RETAINED_CANDIDATE_SURFACE_DIRECTORY_FINAL_PASS', result.finalFreezeReady && result.candidateSurfaceAdmission.mode === 'RETAINED_CANDIDATE_SURFACE_EXACT');

const alias = structuredClone(directory);
const target = alias.resolutions[0];
target.authoritativeCandidateBundles = ['begin_a.b', 'a.b'];
target.presentCandidateBundles = ['begin_a.b', 'a.b'];
target.candidateResults = [
  { bundle: 'begin_a.b', exactOccurrenceCount: 1, matches: [{ embeddedCab: 'CAB-A', runtimePathByteOffset: 10 }] },
  { bundle: 'a.b', exactOccurrenceCount: 1, matches: [{ embeddedCab: 'CAB-B', runtimePathByteOffset: 20 }] },
];
target.status = 'AMBIGUOUS_MULTIPLE_BUNDLES';
target.selectedBundle = null;
alias.bundleReports[1].embeddedCabs[0].sha256 = 'cab-a';
result = evaluateResolutionQa(alias, contract, options);
add('IDENTICAL_CAB_ALIAS_ACCEPTED', result.finalFreezeReady && result.counts.safeAliasTargetCount === 1);

const conflict = structuredClone(alias);
conflict.bundleReports[1].embeddedCabs[0].sha256 = 'different';
result = evaluateResolutionQa(conflict, contract, options);
add('NONIDENTICAL_CAB_REVIEW', !result.finalFreezeReady && result.status === 'REVIEW_SKIN_STAGE3_3_3_RESOLUTION_QA' && result.counts.reviewRequiredTargetCount === 1);

const pending = structuredClone(directory);
pending.unscannedCandidateBundles = ['a.b'];
pending.presentCandidateBundles = ['begin_a.b'];
pending.bundleReports = pending.bundleReports.filter((item) => item.fileName === 'begin_a.b');
pending.counts.presentCandidateBundleCount = 1;
pending.counts.scannedBundleCount = 1;
for (const row of pending.resolutions) {
  if (!row.authoritativeCandidateBundles.includes('a.b')) continue;
  row.presentCandidateBundles = [];
  row.unscannedCandidateBundles = ['a.b'];
  row.candidateResults = [];
  row.status = 'UNSCANNED_CANDIDATE_REMAINS';
  row.selectedBundle = null;
}
result = evaluateResolutionQa(pending, contract, options);
add('UNSCANNED_REMAINS_PENDING', !result.finalFreezeReady && result.status === 'WAITING_FOR_STAGE3_3_2_FULL_SCAN' && result.counts.unscannedCandidateBundleCount === 1);

const missing = structuredClone(directory);
missing.resolutions[0].candidateResults[0] = { bundle: 'begin_a.b', exactOccurrenceCount: 0, matches: [] };
missing.resolutions[0].status = 'NOT_FOUND_IN_ALL_CANDIDATES';
missing.resolutions[0].selectedBundle = null;
result = evaluateResolutionQa(missing, contract, options);
add('ALL_CANDIDATES_NOT_FOUND_FAILS', !result.finalFreezeReady && result.status === 'FAIL_SKIN_STAGE3_3_3_RESOLUTION_QA');

const duplicate = structuredClone(directory);
duplicate.resolutions[0].candidateResults[0] = {
  bundle: 'begin_a.b',
  exactOccurrenceCount: 2,
  matches: [
    { embeddedCab: 'CAB-A', runtimePathByteOffset: 1 },
    { embeddedCab: 'CAB-A', runtimePathByteOffset: 2 },
  ],
};
duplicate.resolutions[0].status = 'DUPLICATE_OCCURRENCE_IN_BUNDLE';
duplicate.resolutions[0].selectedBundle = null;
result = evaluateResolutionQa(duplicate, contract, options);
add('DUPLICATE_OCCURRENCE_REVIEW', !result.finalFreezeReady && result.counts.reviewRequiredTargetCount === 1);

let setTamperBlocked = false;
try {
  const tamper = structuredClone(directory);
  tamper.authoritativeCandidateBundles = ['begin_a.b', 'other.b'];
  tamper.presentCandidateBundles = ['begin_a.b', 'other.b'];
  evaluateResolutionQa(tamper, contract, options);
} catch {
  setTamperBlocked = true;
}
add('EXACT_RETAINED_CANDIDATE_SET_TAMPER_BLOCKED', setTamperBlocked);

let catalogTamperBlocked = false;
try {
  const tamper = makeScan({ withCatalog: true });
  tamper.source.bundleFilenameCatalog.sha256 = 'wrong';
  evaluateResolutionQa(tamper, contract, options);
} catch {
  catalogTamperBlocked = true;
}
add('HISTORICAL_CATALOG_TAMPER_BLOCKED', catalogTamperBlocked);

let sourceTypeBlocked = false;
try {
  const tamper = structuredClone(directory);
  tamper.source.sourceType = 'UNKNOWN';
  evaluateResolutionQa(tamper, contract, options);
} catch {
  sourceTypeBlocked = true;
}
add('CATALOGLESS_UNKNOWN_SOURCE_TYPE_BLOCKED', sourceTypeBlocked);

let countTamperBlocked = false;
try {
  const tamper = structuredClone(directory);
  tamper.counts.requiredTargetCount = 5;
  evaluateResolutionQa(tamper, contract, options);
} catch {
  countTamperBlocked = true;
}
add('FROZEN_COUNT_TAMPER_BLOCKED', countTamperBlocked);

const failed = checks.filter((check) => !check.pass);
const summary = {
  status: failed.length === 0 ? 'PASS_SKIN_STAGE3_3_3_RESOLUTION_QA_V2_SELFTEST' : 'FAIL_SKIN_STAGE3_3_3_RESOLUTION_QA_V2_SELFTEST',
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;
