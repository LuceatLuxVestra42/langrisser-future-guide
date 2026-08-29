import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectUnityFsBundle } from './unityfs-exact-path-scan.mjs';

const RUNTIME_PREFIX = 'assets/gameproject/runtimeassets/';
const EXPECTED_FROZEN = {
  skinCount: 540,
  modelResourceIdCount: 789,
  sourceRecordCount: 977,
};

function usage() {
  console.error(
    'Usage: node scripts/skin-stage3-3-bulk-scan.mjs <ExportAssetBundleDir> [output.json] [--allow-incomplete] [--preplan <preplan.json>] [--catalog <bundle-file-list.txt>]',
  );
}

function parseArgs(argv) {
  if (argv.length < 1) return null;
  const root = path.resolve(argv[0]);
  let output = path.resolve('data/evidence/skin-stage3-3-bulk-unityfs-scan-result.v1.json');
  let allowIncomplete = false;
  let preplanPath = null;
  let catalogPath = null;
  let positionalOutputUsed = false;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-incomplete') {
      allowIncomplete = true;
      continue;
    }
    if (arg === '--catalog') {
      if (i + 1 >= argv.length) throw new Error('--catalog requires a text path');
      catalogPath = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--preplan') {
      if (i + 1 >= argv.length) throw new Error('--preplan requires a JSON path');
      preplanPath = path.resolve(argv[++i]);
      continue;
    }
    if (!arg.startsWith('--') && !positionalOutputUsed) {
      output = path.resolve(arg);
      positionalOutputUsed = true;
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  return { root, output, allowIncomplete, preplanPath, catalogPath };
}

function pair(base) {
  return [`begin_${base}`, base];
}
function staticCandidates(locator) {
  const match = /^UI\/Icon\/(HeroSkin2?_ABS)\//i.exec(locator);
  if (!match) return [];
  return pair(`ui_icon_${match[1].replace(/_ABS$/i, '').toLowerCase()}_abs.b`);
}
function charCandidates(locator) {
  const match = /^Spine\/Char\/([^/]+)_ABS\//i.exec(locator);
  if (!match) return [];
  return pair(`spine_char_${match[1].toLowerCase()}_abs.b`);
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

function buildTargetsFromPreplan(preplan) {
  if (preplan.counts?.skinCount !== EXPECTED_FROZEN.skinCount) {
    throw new Error(`preplan Skin count changed: ${preplan.counts?.skinCount}`);
  }
  if (preplan.counts?.selectedUniqueModelResourceIds !== EXPECTED_FROZEN.modelResourceIdCount) {
    throw new Error(`preplan model resource count changed: ${preplan.counts?.selectedUniqueModelResourceIds}`);
  }
  const targets = [];
  for (const record of preplan.records) {
    targets.push({
      targetId: `skin:${record.skinId}:static`,
      kind: 'STATIC',
      skinId: record.skinId,
      frozenPath: record.static.sourceImagePath,
      runtimePath: runtimePath(record.static.sourceImagePath),
      proposedBundles: [...record.static.candidate.proposed],
      required: true,
    });
    targets.push({
      targetId: `skin:${record.skinId}:char`,
      kind: 'CHAR_SPINE',
      skinId: record.skinId,
      frozenPath: record.spine.sourceSpinePath,
      runtimePath: runtimePath(record.spine.sourceSpinePath),
      proposedBundles: [...record.spine.candidate.proposed],
      required: true,
    });
    for (const model of record.modelResources) {
      if (!model.primaryPrefabPath) throw new Error(`model ${model.skinResourceId} missing primary path`);
      targets.push({
        targetId: `model:${model.skinResourceId}:primary`,
        kind: 'MODEL_PRIMARY',
        skinId: record.skinId,
        skinResourceId: model.skinResourceId,
        sourceRecordIndexZeroBased: model.sourceRecordIndexZeroBased,
        frozenPath: model.primaryPrefabPath,
        runtimePath: runtimePath(model.primaryPrefabPath),
        proposedBundles: [...model.candidate.proposed],
        required: true,
      });
      for (const additional of model.additionalPrefabPathFields ?? []) {
        targets.push({
          targetId: `model:${model.skinResourceId}:field${additional.fieldNumber}`,
          kind: 'MODEL_ADDITIONAL',
          skinId: record.skinId,
          skinResourceId: model.skinResourceId,
          sourceRecordIndexZeroBased: model.sourceRecordIndexZeroBased,
          fieldNumber: additional.fieldNumber,
          frozenPath: additional.path,
          runtimePath: runtimePath(additional.path),
          proposedBundles: [...model.candidate.proposed],
          required: false,
        });
      }
    }
  }
  return targets;
}

function buildTargetsFromRepo(repoRoot = process.cwd()) {
  const inventoryPath = path.join(repoRoot, 'data/generated/skin-stage3-1-asset-inventory.v1.json');
  const sourceDir = path.join(repoRoot, 'data/evidence/skin-stage3-3-model-resource-source-index');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  if (inventory.counts?.skinCount !== EXPECTED_FROZEN.skinCount) {
    throw new Error(`frozen Stage 3-1 Skin count changed: ${inventory.counts?.skinCount}`);
  }
  if (inventory.counts?.uniqueModelResourceIdCount !== EXPECTED_FROZEN.modelResourceIdCount) {
    throw new Error(`frozen Stage 3-1 model resource count changed: ${inventory.counts?.uniqueModelResourceIdCount}`);
  }

  const shardFiles = fs
    .readdirSync(sourceDir)
    .filter((name) => /^model-resource-\d{4}-\d{4}\.v1\.json$/.test(name))
    .sort();
  const sourceRows = [];
  for (const name of shardFiles) {
    sourceRows.push(...JSON.parse(fs.readFileSync(path.join(sourceDir, name), 'utf8')).records);
  }
  const sourceById = new Map();
  for (const row of sourceRows) {
    if (sourceById.has(row.skinResourceId)) {
      throw new Error(`duplicate source skinResourceId ${row.skinResourceId}`);
    }
    sourceById.set(row.skinResourceId, row);
  }
  if (sourceRows.length !== EXPECTED_FROZEN.sourceRecordCount || sourceById.size !== EXPECTED_FROZEN.sourceRecordCount) {
    throw new Error(`model source index mismatch rows=${sourceRows.length} unique=${sourceById.size}`);
  }

  const targets = [];
  const selectedModelIds = new Set();
  for (const record of inventory.records) {
    const staticProposed = staticCandidates(record.static.sourceImagePath);
    const charProposed = charCandidates(record.spine.sourceSpinePath);
    if (staticProposed.length !== 2 || charProposed.length !== 2) {
      throw new Error(`nonstandard frozen locator for Skin ${record.skinId}`);
    }
    targets.push({
      targetId: `skin:${record.skinId}:static`,
      kind: 'STATIC',
      skinId: record.skinId,
      frozenPath: record.static.sourceImagePath,
      runtimePath: runtimePath(record.static.sourceImagePath),
      proposedBundles: staticProposed,
      required: true,
    });
    targets.push({
      targetId: `skin:${record.skinId}:char`,
      kind: 'CHAR_SPINE',
      skinId: record.skinId,
      frozenPath: record.spine.sourceSpinePath,
      runtimePath: runtimePath(record.spine.sourceSpinePath),
      proposedBundles: charProposed,
      required: true,
    });

    for (const id of record.modelResourceIds) {
      selectedModelIds.add(id);
      const source = sourceById.get(id);
      if (!source) throw new Error(`frozen model resource ID ${id} missing from source index`);
      const proposed = modelCandidates(source.primaryPrefabPath);
      if (proposed.length !== 2) {
        throw new Error(`nonstandard model Prefab path for resource ${id}: ${source.primaryPrefabPath}`);
      }
      targets.push({
        targetId: `model:${id}:primary`,
        kind: 'MODEL_PRIMARY',
        skinId: record.skinId,
        skinResourceId: id,
        sourceRecordIndexZeroBased: source.sourceRecordIndexZeroBased,
        frozenPath: source.primaryPrefabPath,
        runtimePath: runtimePath(source.primaryPrefabPath),
        proposedBundles: proposed,
        required: true,
      });
      for (const additional of source.additionalPrefabPathFields ?? []) {
        targets.push({
          targetId: `model:${id}:field${additional.fieldNumber}`,
          kind: 'MODEL_ADDITIONAL',
          skinId: record.skinId,
          skinResourceId: id,
          sourceRecordIndexZeroBased: source.sourceRecordIndexZeroBased,
          fieldNumber: additional.fieldNumber,
          frozenPath: additional.path,
          runtimePath: runtimePath(additional.path),
          proposedBundles: proposed,
          required: false,
        });
      }
    }
  }
  if (selectedModelIds.size !== EXPECTED_FROZEN.modelResourceIdCount) {
    throw new Error(`selected model resource IDs changed: ${selectedModelIds.size}`);
  }
  return targets;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!fs.statSync(args.root).isDirectory()) throw new Error(`${args.root} is not a directory`);

  const targets = args.preplanPath
    ? buildTargetsFromPreplan(JSON.parse(fs.readFileSync(args.preplanPath, 'utf8')))
    : buildTargetsFromRepo();
  const requiredTargets = targets.filter((target) => target.required);
  const supplementalTargets = targets.filter((target) => !target.required);
  if (requiredTargets.length !== 1869) {
    throw new Error(`required target count changed: ${requiredTargets.length}`);
  }

  const rootNames = fs.readdirSync(args.root, { withFileTypes: true });
  const exactFiles = new Set(rootNames.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const proposedBundleNames = [...new Set(targets.flatMap((target) => target.proposedBundles))].sort();
  let catalogNames = null;
  let catalogMeta = null;
  if (args.catalogPath) {
    const catalogBytes = fs.readFileSync(args.catalogPath);
    const lines = catalogBytes.toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    catalogNames = new Set(lines);
    catalogMeta = {
      sourceFileName: path.basename(args.catalogPath),
      lineCount: lines.length,
      uniqueNameCount: catalogNames.size,
      sha256: crypto.createHash('sha256').update(catalogBytes).digest('hex'),
    };
  }
  const authoritativeCandidateBundles = catalogNames
    ? proposedBundleNames.filter((name) => catalogNames.has(name))
    : proposedBundleNames.filter((name) => exactFiles.has(name));
  const presentCandidateBundles = authoritativeCandidateBundles.filter((name) => exactFiles.has(name));
  const targetIdsByBundle = new Map();
  const targetById = new Map(targets.map((target) => [target.targetId, target]));
  for (const target of targets) {
    for (const bundleName of target.proposedBundles) {
      if (!exactFiles.has(bundleName)) continue;
      const ids = targetIdsByBundle.get(bundleName) ?? [];
      ids.push(target.targetId);
      targetIdsByBundle.set(bundleName, ids);
    }
  }

  const bundleReports = [];
  const resultByBundleAndPath = new Map();
  for (const bundleName of presentCandidateBundles) {
    const targetIds = targetIdsByBundle.get(bundleName) ?? [];
    const runtimePaths = [...new Set(targetIds.map((id) => targetById.get(id).runtimePath))].sort();
    const filePath = path.join(args.root, bundleName);
    try {
      const report = inspectUnityFsBundle(filePath, runtimePaths);
      bundleReports.push({
        fileName: report.fileName,
        sizeBytes: report.sizeBytes,
        sha256: report.sha256,
        unityFs: report.unityFs,
        embeddedCabs: report.embeddedCabs,
        requestedRuntimePathCount: runtimePaths.length,
        scanStatus: 'OK',
      });
      for (const result of report.results) {
        resultByBundleAndPath.set(`${bundleName}\n${result.runtimePath}`, result);
      }
    } catch (error) {
      bundleReports.push({
        fileName: bundleName,
        sizeBytes: fs.statSync(filePath).size,
        scanStatus: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const resolutions = targets.map((target) => {
    const authoritativeCandidates = target.proposedBundles.filter((bundleName) =>
      catalogNames ? catalogNames.has(bundleName) : exactFiles.has(bundleName),
    );
    const unscannedCandidateBundles = authoritativeCandidates.filter((bundleName) => !exactFiles.has(bundleName));
    const candidates = authoritativeCandidates
      .filter((bundleName) => exactFiles.has(bundleName))
      .map((bundleName) => {
        const bundleReport = bundleReports.find((item) => item.fileName === bundleName);
        if (bundleReport?.scanStatus === 'ERROR') {
          return { bundle: bundleName, scanError: bundleReport.error, exactOccurrenceCount: 0, matches: [] };
        }
        const result = resultByBundleAndPath.get(`${bundleName}\n${target.runtimePath}`);
        if (!result) {
          return { bundle: bundleName, scanError: 'missing scanner result', exactOccurrenceCount: 0, matches: [] };
        }
        return { bundle: bundleName, exactOccurrenceCount: result.exactOccurrenceCount, matches: result.matches };
      });
    const status = classifyTarget(candidates, unscannedCandidateBundles);
    const selectedBundle = status === 'RESOLVED_EXACT'
      ? candidates.find((candidate) => candidate.exactOccurrenceCount === 1)?.bundle ?? null
      : null;
    return {
      ...target,
      authoritativeCandidateBundles: authoritativeCandidates,
      presentCandidateBundles: candidates.map((candidate) => candidate.bundle),
      unscannedCandidateBundles,
      candidateResults: candidates,
      status,
      selectedBundle,
    };
  });

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
    evidenceClass: 'BULK_AUTHORITATIVE_UNITYFS_EXACT_RUNTIME_PATH_SCAN',
    status: fullResolved ? 'BULK_REQUIRED_PATH_EVIDENCE_COMPLETE' : 'BULK_SCAN_PARTIAL_OR_BLOCKED',
    source: {
      sourceType: args.catalogPath ? 'PC_CLIENT_EXPORT_ASSET_BUNDLE_SUBSET_WITH_FILENAME_CATALOG' : 'PC_CLIENT_EXPORT_ASSET_BUNDLE_DIRECTORY',
      sourceLocationName: path.basename(args.root),
      bundleFormat: 'UnityFS',
      acquisitionMethod: 'local raw-byte SHA-256; UnityFS block/directory decompression; embedded CAB exact case-normalized full runtime-path byte search',
      bundleFilenameCatalog: catalogMeta,
    },
    guardrails: {
      fuzzyMatching: false,
      numericIdArithmetic: false,
      inferredBundleMembership: false,
      crossRootFallback: false,
      alternatePathSubstitution: false,
      runtimePrefix: RUNTIME_PREFIX,
      candidateFilenameMembership: 'EXACT_BASENAME_IN_SOURCE_DIRECTORY',
    },
    counts: {
      frozenSkinCount: EXPECTED_FROZEN.skinCount,
      frozenUniqueModelResourceIdCount: EXPECTED_FROZEN.modelResourceIdCount,
      requiredTargetCount: requiredTargets.length,
      supplementalTargetCount: supplementalTargets.length,
      proposedCandidateFilenameCount: proposedBundleNames.length,
      authoritativeCandidateBundleCount: authoritativeCandidateBundles.length,
      presentCandidateBundleCount: presentCandidateBundles.length,
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
    presentCandidateBundles,
    unscannedCandidateBundles: authoritativeCandidateBundles.filter((name) => !exactFiles.has(name)),
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
  console.log(
    JSON.stringify(
      {
        output: args.output,
        status: result.status,
        counts: result.counts,
        requiredStatusCounts,
        supplementalStatusCounts,
      },
      null,
      2,
    ),
  );
  if (!fullResolved && !args.allowIncomplete) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
