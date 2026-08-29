import fs from 'node:fs';
import path from 'node:path';
import { evaluateResolutionQa, DEFAULT_CONTRACT_PATH } from './validate-skin-stage3-3-3-resolution-qa.mjs';

const ROOT = process.cwd();
const INVENTORY_PATH = 'data/generated/skin-stage3-1-asset-inventory.v1.json';
const SOURCE_INDEX_DIR = 'data/evidence/skin-stage3-3-model-resource-source-index';
const CURRENT_DIR = 'data/evidence/skin-stage3-3-current-subset';
const CHECKPOINT_PATH = 'data/validation/skin-stage3-3-3-current-subset-qa.v1.json';
const RUNTIME_PREFIX = 'assets/gameproject/runtimeassets/';

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function pair(base) {
  return [`begin_${base}`, base];
}
function staticCandidates(locator) {
  const match = /^UI\/Icon\/(HeroSkin2?_ABS)\//i.exec(locator);
  return match ? pair(`ui_icon_${match[1].replace(/_ABS$/i, '').toLowerCase()}_abs.b`) : [];
}
function charCandidates(locator) {
  const match = /^Spine\/Char\/([^/]+)_ABS\//i.exec(locator);
  return match ? pair(`spine_char_${match[1].toLowerCase()}_abs.b`) : [];
}
function modelCandidates(locator) {
  let match = /^Spine\/General\/([^/]+)_ABS\//i.exec(locator);
  if (match) return pair(`spine_general_${match[1].toLowerCase()}_abs.b`);
  match = /^Spine\/Soldier\/(?:[^/]+\/)?([^/]+)_ABS\//i.exec(locator);
  if (match) return pair(`spine_soldier_${match[1].toLowerCase()}_abs.b`);
  return [];
}
function runtimePath(locator) {
  return `${RUNTIME_PREFIX}${locator}`.toLowerCase();
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
function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function loadSourceById() {
  const dir = path.join(ROOT, SOURCE_INDEX_DIR);
  const shardFiles = fs.readdirSync(dir)
    .filter((name) => /^model-resource-\d{4}-\d{4}\.v1\.json$/.test(name))
    .sort();
  const rows = shardFiles.flatMap((name) => readJson(`${SOURCE_INDEX_DIR}/${name}`).records ?? []);
  assert(rows.length === 977, `model source row count changed: ${rows.length}`);
  const byId = new Map();
  for (const row of rows) {
    assert(!byId.has(row.skinResourceId), `duplicate source skinResourceId ${row.skinResourceId}`);
    byId.set(row.skinResourceId, row);
  }
  assert(byId.size === 977, `model source unique count changed: ${byId.size}`);
  return byId;
}

function buildTargets(inventory, sourceById) {
  assert(inventory.counts?.skinCount === 540, `Skin count changed: ${inventory.counts?.skinCount}`);
  assert(inventory.counts?.uniqueModelResourceIdCount === 789, `model resource count changed: ${inventory.counts?.uniqueModelResourceIdCount}`);
  const targets = [];
  const selectedModelIds = new Set();
  for (const record of inventory.records ?? []) {
    const staticProposed = staticCandidates(record.static?.sourceImagePath ?? '');
    const charProposed = charCandidates(record.spine?.sourceSpinePath ?? '');
    assert(staticProposed.length === 2, `Skin ${record.skinId} static locator nonstandard`);
    assert(charProposed.length === 2, `Skin ${record.skinId} char locator nonstandard`);
    targets.push({
      targetId: `skin:${record.skinId}:static`, kind: 'STATIC', skinId: record.skinId,
      frozenPath: record.static.sourceImagePath, runtimePath: runtimePath(record.static.sourceImagePath),
      proposedBundles: staticProposed, required: true,
    });
    targets.push({
      targetId: `skin:${record.skinId}:char`, kind: 'CHAR_SPINE', skinId: record.skinId,
      frozenPath: record.spine.sourceSpinePath, runtimePath: runtimePath(record.spine.sourceSpinePath),
      proposedBundles: charProposed, required: true,
    });
    for (const id of record.modelResourceIds ?? []) {
      selectedModelIds.add(id);
      const source = sourceById.get(id);
      assert(source, `model source missing ${id}`);
      const proposed = modelCandidates(source.primaryPrefabPath ?? '');
      assert(proposed.length === 2, `model ${id} primary path nonstandard`);
      targets.push({
        targetId: `model:${id}:primary`, kind: 'MODEL_PRIMARY', skinId: record.skinId,
        skinResourceId: id, sourceRecordIndexZeroBased: source.sourceRecordIndexZeroBased,
        frozenPath: source.primaryPrefabPath, runtimePath: runtimePath(source.primaryPrefabPath),
        proposedBundles: proposed, required: true,
      });
      for (const additional of source.additionalPrefabPathFields ?? []) {
        targets.push({
          targetId: `model:${id}:field${additional.fieldNumber}`, kind: 'MODEL_ADDITIONAL', skinId: record.skinId,
          skinResourceId: id, sourceRecordIndexZeroBased: source.sourceRecordIndexZeroBased,
          fieldNumber: additional.fieldNumber, frozenPath: additional.path, runtimePath: runtimePath(additional.path),
          proposedBundles: proposed, required: false,
        });
      }
    }
  }
  assert(selectedModelIds.size === 789, `selected model resource count changed: ${selectedModelIds.size}`);
  const required = targets.filter((target) => target.required);
  const supplemental = targets.filter((target) => !target.required);
  assert(required.length === 1869, `required target count changed: ${required.length}`);
  assert(supplemental.length === 81, `supplemental target count changed: ${supplemental.length}`);
  const targetIds = targets.map((target) => target.targetId);
  assert(new Set(targetIds).size === targetIds.length, 'targetId duplicate while rebuilding current subset');
  return targets;
}

function loadBundleSets() {
  const provenance = readJson(`${CURRENT_DIR}/bundle-provenance.v1.json`);
  assert(provenance.count === 13 && provenance.records?.length === 13, 'present bundle provenance count changed');
  const present = provenance.records.map((record) => record.fileName).sort();
  const unscanned = [
    ...readJson(`${CURRENT_DIR}/unscanned-bundle-demand-0000-0299.v1.json`).records,
    ...readJson(`${CURRENT_DIR}/unscanned-bundle-demand-0300-0522.v1.json`).records,
  ].map((row) => row[0]).sort();
  assert(unscanned.length === 523, `unscanned bundle count changed: ${unscanned.length}`);
  assert(new Set(unscanned).size === 523, 'unscanned bundle list contains duplicates');
  assert(present.every((name) => !unscanned.includes(name)), 'present/unscanned bundle overlap');
  const authoritative = [...new Set([...present, ...unscanned])].sort();
  assert(authoritative.length === 536, `authoritative candidate bundle count changed: ${authoritative.length}`);
  return { provenance, present, unscanned, authoritative };
}

function loadExactHits() {
  const hitMap = new Map();
  const add = (targetId, bundle, cab, offset) => {
    const key = `${targetId}\n${bundle}`;
    assert(!hitMap.has(key), `duplicate compact exact hit ${key}`);
    hitMap.set(key, { bundle, exactOccurrenceCount: 1, matches: [{ embeddedCab: cab, offset }] });
  };
  const staticEvidence = readJson(`${CURRENT_DIR}/resolved-static.v1.json`);
  for (const group of staticEvidence.groups ?? []) {
    for (const [skinId, offset] of group.records ?? []) add(`skin:${skinId}:static`, group.bundle, group.cab, offset);
  }
  const charEvidence = readJson(`${CURRENT_DIR}/resolved-char.v1.json`);
  for (const record of charEvidence.records ?? []) add(record.targetId, record.bundle, record.cab, record.offset);
  const modelEvidence = readJson(`${CURRENT_DIR}/resolved-model.v1.json`);
  for (const record of modelEvidence.records ?? []) add(record.targetId, record.bundle, record.cab, record.offset);
  assert(staticEvidence.count === 335, `static compact hit count changed: ${staticEvidence.count}`);
  assert(charEvidence.count === 9, `char compact hit count changed: ${charEvidence.count}`);
  assert(modelEvidence.count === 29, `model compact hit count changed: ${modelEvidence.count}`);
  assert(hitMap.size === 373, `total compact exact hit count changed: ${hitMap.size}`);
  return hitMap;
}

function normalizeBundleReports(provenance) {
  return provenance.records.map((record) => ({
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    unityFs: { unityRevision: record.unityRevision },
    embeddedCabs: record.embeddedCabs,
    requestedRuntimePathCount: null,
    scanStatus: record.scanStatus,
  })).sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function buildScan(targets, bundleSets, hitMap, contract) {
  const authoritativeSet = new Set(bundleSets.authoritative);
  const presentSet = new Set(bundleSets.present);
  const resolutions = targets.map((target) => {
    const authoritativeCandidateBundles = target.proposedBundles.filter((name) => authoritativeSet.has(name));
    const presentCandidateBundles = authoritativeCandidateBundles.filter((name) => presentSet.has(name));
    const unscannedCandidateBundles = authoritativeCandidateBundles.filter((name) => !presentSet.has(name));
    const candidateResults = presentCandidateBundles.map((bundle) =>
      hitMap.get(`${target.targetId}\n${bundle}`) ?? { bundle, exactOccurrenceCount: 0, matches: [] },
    );
    const status = classifyTarget(candidateResults, unscannedCandidateBundles);
    const selectedBundle = status === 'RESOLVED_EXACT'
      ? candidateResults.find((candidate) => candidate.exactOccurrenceCount === 1)?.bundle ?? null
      : null;
    return { ...target, authoritativeCandidateBundles, presentCandidateBundles, unscannedCandidateBundles, candidateResults, status, selectedBundle };
  });
  const required = resolutions.filter((resolution) => resolution.required);
  const supplemental = resolutions.filter((resolution) => !resolution.required);
  const requiredStatusCounts = countBy(required, (item) => item.status);
  const supplementalStatusCounts = countBy(supplemental, (item) => item.status);
  const requiredResolvedCount = requiredStatusCounts.RESOLVED_EXACT ?? 0;
  const supplementalResolvedCount = supplementalStatusCounts.RESOLVED_EXACT ?? 0;
  const bundleReports = normalizeBundleReports(bundleSets.provenance);
  const base = contract.frozenBaseline;
  return {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-2',
    evidenceClass: 'BULK_AUTHORITATIVE_UNITYFS_EXACT_RUNTIME_PATH_SCAN',
    status: 'BULK_SCAN_PARTIAL_OR_BLOCKED',
    source: {
      sourceType: 'PC_CLIENT_EXPORT_ASSET_BUNDLE_SUBSET_WITH_FILENAME_CATALOG',
      sourceLocationName: 'retained-current-subset-normalized-from-compact-evidence',
      bundleFormat: 'UnityFS',
      acquisitionMethod: 'normalized only from retained compact exact-path evidence; no new asset evidence introduced',
      bundleFilenameCatalog: {
        sourceFileName: 'historical-bundle-file-list.txt',
        lineCount: base.bundleCatalogLineCount,
        uniqueNameCount: base.bundleCatalogLineCount,
        sha256: base.bundleCatalogSha256,
      },
    },
    guardrails: {
      fuzzyMatching: false,
      numericIdArithmetic: false,
      inferredBundleMembership: false,
      crossRootFallback: false,
      alternatePathSubstitution: false,
      runtimePrefix: RUNTIME_PREFIX,
      candidateFilenameMembership: 'FROZEN_536_CANDIDATE_SET_FROM_RETAINED_EVIDENCE',
    },
    counts: {
      frozenSkinCount: 540,
      frozenUniqueModelResourceIdCount: 789,
      requiredTargetCount: required.length,
      supplementalTargetCount: supplemental.length,
      proposedCandidateFilenameCount: new Set(targets.flatMap((target) => target.proposedBundles)).size,
      authoritativeCandidateBundleCount: bundleSets.authoritative.length,
      presentCandidateBundleCount: bundleSets.present.length,
      scannedBundleCount: bundleReports.length,
      bundleErrorCount: bundleReports.filter((report) => report.scanStatus === 'ERROR').length,
      requiredResolvedCount,
      requiredBlockerCount: required.length - requiredResolvedCount,
      supplementalResolvedCount,
      supplementalBlockerCount: supplemental.length - supplementalResolvedCount,
    },
    requiredStatusCounts,
    supplementalStatusCounts,
    authoritativeCandidateBundles: bundleSets.authoritative,
    presentCandidateBundles: bundleSets.present,
    unscannedCandidateBundles: bundleSets.unscanned,
    bundleReports,
    resolutions,
    blockers: required.filter((item) => item.status !== 'RESOLVED_EXACT').map((item) => ({
      targetId: item.targetId, kind: item.kind, skinId: item.skinId, skinResourceId: item.skinResourceId,
      frozenPath: item.frozenPath, status: item.status,
      authoritativeCandidateBundles: item.authoritativeCandidateBundles,
      presentCandidateBundles: item.presentCandidateBundles,
      unscannedCandidateBundles: item.unscannedCandidateBundles,
    })),
  };
}

function main() {
  const contract = readJson(DEFAULT_CONTRACT_PATH);
  const inventory = readJson(INVENTORY_PATH);
  const sourceById = loadSourceById();
  const targets = buildTargets(inventory, sourceById);
  const bundleSets = loadBundleSets();
  const hitMap = loadExactHits();
  const scan = buildScan(targets, bundleSets, hitMap, contract);
  const qa = evaluateResolutionQa(scan, contract);

  assert(scan.counts.requiredResolvedCount === 369, `normalized required exact count changed: ${scan.counts.requiredResolvedCount}`);
  assert(scan.counts.supplementalResolvedCount === 4, `normalized supplemental exact count changed: ${scan.counts.supplementalResolvedCount}`);
  assert(qa.status === 'WAITING_FOR_STAGE3_3_2_FULL_SCAN', `unexpected partial QA status ${qa.status}`);
  assert(qa.finalFreezeReady === false, 'partial evidence must not freeze Stage 3-3-3');
  assert(qa.counts.acceptedRequiredTargetCount === 369, `accepted required changed: ${qa.counts.acceptedRequiredTargetCount}`);
  assert(qa.counts.pendingRequiredTargetCount === 1500, `pending required changed: ${qa.counts.pendingRequiredTargetCount}`);
  assert(qa.counts.failedRequiredTargetCount === 0, `failed required changed: ${qa.counts.failedRequiredTargetCount}`);
  assert(qa.counts.reviewRequiredTargetCount === 0, `review required changed: ${qa.counts.reviewRequiredTargetCount}`);
  assert(qa.counts.acceptedStaticCount === 335, `accepted static changed: ${qa.counts.acceptedStaticCount}`);
  assert(qa.counts.acceptedCharSpineCount === 9, `accepted char changed: ${qa.counts.acceptedCharSpineCount}`);
  assert(qa.counts.acceptedModelPrimaryCount === 25, `accepted model primary changed: ${qa.counts.acceptedModelPrimaryCount}`);
  assert(qa.counts.accountedCandidateBundleCount === 13, `accounted bundle count changed: ${qa.counts.accountedCandidateBundleCount}`);
  assert(qa.counts.unscannedCandidateBundleCount === 523, `unscanned bundle count changed: ${qa.counts.unscannedCandidateBundleCount}`);
  assert(qa.counts.bundleScanErrorCount === 0, `bundle scan errors changed: ${qa.counts.bundleScanErrorCount}`);

  const checkpoint = {
    schemaVersion: 1,
    stage: 'skin-page-3',
    substage: '3-3-3',
    checkpoint: 'SKIN_STAGE3_3_3_CURRENT_SUBSET_QA_CHECKPOINT',
    status: 'PASS_CURRENT_SUBSET_QA_PENDING_EXTERNAL_BUNDLES',
    completion: null,
    finalFreezeReady: false,
    validationMethod: 'RECONSTRUCT_FROZEN_CURRENT_SUBSET_FROM_COMPACT_EVIDENCE_THEN_RUN_STAGE3_3_3_QA',
    sources: {
      inventory: INVENTORY_PATH,
      modelSourceIndex: `${SOURCE_INDEX_DIR}/model-resource-*.v1.json`,
      bundleProvenance: `${CURRENT_DIR}/bundle-provenance.v1.json`,
      resolvedStatic: `${CURRENT_DIR}/resolved-static.v1.json`,
      resolvedChar: `${CURRENT_DIR}/resolved-char.v1.json`,
      resolvedModel: `${CURRENT_DIR}/resolved-model.v1.json`,
      unscannedDemand: [
        `${CURRENT_DIR}/unscanned-bundle-demand-0000-0299.v1.json`,
        `${CURRENT_DIR}/unscanned-bundle-demand-0300-0522.v1.json`,
      ],
      qaContract: DEFAULT_CONTRACT_PATH,
      qaValidator: 'scripts/validate-skin-stage3-3-3-resolution-qa.mjs',
    },
    normalizedStage3_3_2: {
      requiredResolvedExact: scan.counts.requiredResolvedCount,
      supplementalResolvedExact: scan.counts.supplementalResolvedCount,
      presentCandidateBundles: scan.counts.presentCandidateBundleCount,
      unscannedCandidateBundles: scan.unscannedCandidateBundles.length,
      bundleScanErrors: scan.counts.bundleErrorCount,
    },
    qa: {
      status: qa.status,
      acceptedRequiredTargets: qa.counts.acceptedRequiredTargetCount,
      pendingRequiredTargets: qa.counts.pendingRequiredTargetCount,
      failedRequiredTargets: qa.counts.failedRequiredTargetCount,
      reviewRequiredTargets: qa.counts.reviewRequiredTargetCount,
      acceptedSkinCoverage: qa.counts.acceptedSkinCoverage,
      acceptedStatic: qa.counts.acceptedStaticCount,
      acceptedCharSpine: qa.counts.acceptedCharSpineCount,
      acceptedModelPrimary: qa.counts.acceptedModelPrimaryCount,
      safeAliasTargets: qa.counts.safeAliasTargetCount,
      accountedCandidateBundles: qa.counts.accountedCandidateBundleCount,
      unscannedCandidateBundles: qa.counts.unscannedCandidateBundleCount,
      bundleScanErrors: qa.counts.bundleScanErrorCount,
      qaClassCounts: qa.qaClassCounts,
    },
    boundaries: {
      newAssetEvidenceIntroduced: false,
      compactEvidenceNormalizedOnly: true,
      canonicalSkinRecomputed: false,
      heroSkinOwnershipRecomputed: false,
      sourceOrderRecomputed: false,
      modelResourceSelectionRecomputed: false,
      beginCurrentPreferredByName: false,
      stage3_3_3CompletionClaimed: false,
      stage3_4ExtractionStarted: false,
    },
    blocker: {
      code: 'STAGE3_3_2_REMAINING_BUNDLE_BYTES_NOT_AVAILABLE',
      remainingCandidateBundleCount: 523,
      requiredPendingTargetCount: 1500,
    },
    nextStartPoint: 'Scan any available subset of the remaining 523 catalog-confirmed candidate .b files, merge it with the retained Stage 3-3-2 evidence, and rerun Stage 3-3-3 QA. Final freeze remains prohibited until pending/fail/review are all zero.',
  };

  fs.writeFileSync(path.join(ROOT, CHECKPOINT_PATH), `${JSON.stringify(checkpoint, null, 2)}\n`);
  console.log(JSON.stringify({ checkpoint: CHECKPOINT_PATH, status: checkpoint.status, qa: checkpoint.qa }, null, 2));
}

main();
