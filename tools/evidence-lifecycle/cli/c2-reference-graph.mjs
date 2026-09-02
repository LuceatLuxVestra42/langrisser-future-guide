import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const C0 = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const C1 = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const C2 = 'tools/evidence-lifecycle/contracts/c2-reference-graph.v1.json';
const VALIDATORS = 'tools/project-check/contracts/validators.v1.json';
const PACKAGE = 'package.json';
const OUTPUT = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const MAX_TEXT_BLOB = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.py', '.yml', '.yaml', '.txt', '.toml']);

const g = (args, options = {}) => execFileSync('git', args, {
  cwd: process.cwd(),
  encoding: options.encoding ?? 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonAt = (ref, p) => JSON.parse(g(['show', `${ref}:${p}`]));
const normalize = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pointerEscape = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

function readTree(sha) {
  return String(g(['ls-tree', '-r', '-l', '-z', sha], { encoding: 'buffer' }))
    .split('\0')
    .filter(Boolean)
    .map(row => {
      const tab = row.indexOf('\t');
      const head = row.slice(0, tab).match(/^(\d+)\s+(\w+)\s+([0-9a-f]{40})\s+(-|\d+)$/);
      if (!head) throw new Error(`Bad ls-tree row: ${row.slice(0, 120)}`);
      return {
        path: row.slice(tab + 1),
        type: head[2],
        blobSha: head[3],
        size: head[4] === '-' ? null : Number(head[4]),
      };
    })
    .filter(row => row.type === 'blob');
}

function isTextSource(entry) {
  if (entry.size != null && entry.size > MAX_TEXT_BLOB) return false;
  const ext = path.posix.extname(entry.path).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || entry.path === 'package.json';
}

function extractStatusEntries(document, declarationPath) {
  const rows = Array.isArray(document?.entries)
    ? document.entries
    : document?.entry && typeof document.entry === 'object'
      ? [document.entry]
      : [];
  return rows.map(entry => ({ ...entry, sourceEntryFile: declarationPath }));
}

function resolveValidatorEntrypoints(baseline, treeMap) {
  const catalog = readJsonAt(baseline, VALIDATORS);
  const pkg = readJsonAt(baseline, PACKAGE);
  const entrypoints = new Set();
  const addPathTokens = text => {
    if (typeof text !== 'string') return;
    const regex = /(?:^|[\s"'`])((?:scripts|tools)\/[A-Za-z0-9_./@+\-]+\.(?:mjs|cjs|js|ts|tsx|py))/g;
    for (const match of text.matchAll(regex)) {
      const candidate = normalize(match[1]);
      if (treeMap.has(candidate)) entrypoints.add(candidate);
    }
  };
  for (const validator of catalog.validators ?? []) {
    for (const arg of validator.args ?? []) addPathTokens(arg);
    if (validator.executable === 'npm' && validator.args?.[0] === 'run') {
      addPathTokens(pkg.scripts?.[validator.args[1]]);
    }
  }
  return { catalog, pkg, entrypoints };
}

function scanJsonStrings(value, matcher, callback, pointer = '') {
  if (typeof value === 'string') {
    matcher.lastIndex = 0;
    for (const match of value.matchAll(matcher)) callback(match[0], pointer || '/');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanJsonStrings(child, matcher, callback, `${pointer}/${index}`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    scanJsonStrings(child, matcher, callback, `${pointer}/${pointerEscape(key)}`);
  }
}

function scanTextLines(text, matcher, callback) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    matcher.lastIndex = 0;
    for (const match of lines[index].matchAll(matcher)) callback(match[0], `L${index + 1}`);
  }
}

function structuredProtectingLocator(locator) {
  if (!locator.startsWith('/')) return false;
  const tokens = locator.split('/').filter(Boolean).map(token => token.replaceAll('~1', '/').replaceAll('~0', '~').toLowerCase());
  if (!tokens.length) return false;
  const terminal = tokens.at(-1);
  const exact = new Set([
    'sourcepath', 'sourcepaths', 'artifactpath', 'artifactpaths', 'manifestpath', 'manifestpaths',
    'predecessorpath', 'predecessorpaths', 'inputpath', 'inputpaths', 'validationpath', 'validationpaths',
    'checkpointpath', 'checkpointpaths', 'contractpath', 'contractpaths', 'consumerpath', 'consumerpaths',
    'authoritypath', 'authoritypaths', 'outputpath', 'outputpaths', 'generatedpath', 'generatedpaths',
  ]);
  if (exact.has(terminal)) return true;
  if (terminal !== 'path') return false;
  const ancestors = tokens.slice(0, -1).join('.');
  return /(predecessor|provenance|source|input|manifest|artifact|validation|checkpoint|contract|supplemental|consumer|authority|producer|output|generated)/.test(ancestors);
}

function buildContext({ baseline, tree, admittedRecords }) {
  const treeMap = new Map(tree.map(entry => [entry.path, entry]));
  const recordMap = new Map(admittedRecords.map(record => [record.path, record]));
  const statusDeclarationPaths = tree
    .map(entry => entry.path)
    .filter(p => /^data\/status-sources\/[^/]+\.json$/.test(p));
  const approvedStatusEntries = [];
  const activeStatusTargetPaths = new Set();
  for (const declarationPath of statusDeclarationPaths) {
    const document = readJsonAt(baseline, declarationPath);
    for (const entry of extractStatusEntries(document, declarationPath)) {
      if (entry.state !== 'APPROVED') continue;
      approvedStatusEntries.push(entry);
      if (typeof entry.sourcePath === 'string') activeStatusTargetPaths.add(normalize(entry.sourcePath));
      for (const supplemental of entry.projectionOverride?.supplementalSources ?? []) {
        if (typeof supplemental?.path === 'string') activeStatusTargetPaths.add(normalize(supplemental.path));
      }
    }
  }

  const { catalog, pkg, entrypoints } = resolveValidatorEntrypoints(baseline, treeMap);
  const activeToolRoots = new Set();
  for (const entrypoint of entrypoints) {
    const match = entrypoint.match(/^tools\/([^/]+)\//);
    if (match) activeToolRoots.add(match[1]);
  }
  const currentToolContracts = new Set(tree
    .map(entry => entry.path)
    .filter(p => {
      const match = p.match(/^tools\/([^/]+)\/(?:contract|contracts)\//);
      return Boolean(match && activeToolRoots.has(match[1]));
    }));
  const trackedWorkflowPaths = new Set(tree.map(entry => entry.path).filter(p => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)));
  const productionConsumerPaths = new Set(tree.map(entry => entry.path).filter(p => /^(?:src|app|pages)\//.test(p)));
  const manifestPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'MANIFEST').map(record => record.path));
  const retentionDeclarationPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'RETENTION_DECLARATION').map(record => record.path));
  const explicitActiveWorkflowPaths = new Set();
  const addExplicitActiveWorkflow = value => {
    const candidate = normalize(value);
    if (trackedWorkflowPaths.has(candidate)) explicitActiveWorkflowPaths.add(candidate);
  };

  const statusSourceLifecyclePath = 'tools/status-source/contracts/lifecycle.v1.json';
  if (treeMap.has(statusSourceLifecyclePath)) {
    const lifecycle = readJsonAt(baseline, statusSourceLifecyclePath);
    const transport = lifecycle?.policy?.transport ?? {};
    if (transport.productionWriterActivation === 'ACTIVE') addExplicitActiveWorkflow(transport.productionWriterWorkflow);
    if (transport.legacyWriterActive === true) addExplicitActiveWorkflow(transport.legacyWriterWorkflow);
    for (const pipeline of lifecycle?.pipelines ?? []) addExplicitActiveWorkflow(pipeline?.completionWorkflow);
  }

  for (const declarationPath of retentionDeclarationPaths) {
    try {
      const declaration = readJsonAt(baseline, declarationPath);
      if (declaration?.state === 'APPROVED_FOR_HANDOFF') addExplicitActiveWorkflow(declaration.requestedByWorkflow);
    } catch {
      // C2 critical JSON handling below will fail closed if this source is operationally relevant.
    }
  }

  return {
    treeMap,
    recordMap,
    statusDeclarationPaths: new Set(statusDeclarationPaths),
    approvedStatusEntries,
    activeStatusTargetPaths,
    validatorCatalog: catalog,
    packageJson: pkg,
    validatorEntrypoints: entrypoints,
    activeToolRoots,
    currentToolContracts,
    trackedWorkflowPaths,
    explicitActiveWorkflowPaths,
    productionConsumerPaths,
    manifestPaths,
    retentionDeclarationPaths,
  };
}

function sourceClasses(sourcePath, sourceRecord, context) {
  const classes = [];
  if (context.statusDeclarationPaths.has(sourcePath)) classes.push('STATUS_SOURCE_DECLARATION');
  if (context.activeStatusTargetPaths.has(sourcePath)) classes.push('CURRENT_STATUS_SOURCE_TARGET');
  if (context.validatorEntrypoints.has(sourcePath)) classes.push('REGISTERED_PROJECT_CHECK_VALIDATOR_ENTRYPOINT');
  if (context.currentToolContracts.has(sourcePath)) classes.push('CURRENT_TOOL_CONTRACT');
  if (context.retentionDeclarationPaths.has(sourcePath)) classes.push('RETENTION_DECLARATION');
  if (context.explicitActiveWorkflowPaths.has(sourcePath)) classes.push('ACTIVE_WORKFLOW');
  if (context.productionConsumerPaths.has(sourcePath)) classes.push('CURRENT_PRODUCTION_CONSUMER');
  if (context.manifestPaths.has(sourcePath)) classes.push('MANIFEST');
  if (sourceRecord) classes.push('LIFECYCLE_NODE');
  if (!classes.length) classes.push('OTHER_REPOSITORY_TEXT');
  return classes;
}

function classifyMention({ sourcePath, sourceRecord, locator, context }) {
  const classes = sourceClasses(sourcePath, sourceRecord, context);
  const structured = locator.startsWith('/');
  const semanticLocator = structuredProtectingLocator(locator);
  const has = name => classes.includes(name);

  if (has('REGISTERED_PROJECT_CHECK_VALIDATOR_ENTRYPOINT')) {
    return { edgeType: 'VALIDATOR_INPUT_REF', retentionClass: 'PROTECTING', sourceClasses: classes };
  }
  if (has('ACTIVE_WORKFLOW')) {
    return { edgeType: 'ACTIVE_WORKFLOW_REF', retentionClass: 'PROTECTING', sourceClasses: classes };
  }
  if (has('CURRENT_PRODUCTION_CONSUMER')) {
    return { edgeType: 'FROZEN_CONSUMER_REF', retentionClass: 'PROTECTING', sourceClasses: classes };
  }
  if (has('STATUS_SOURCE_DECLARATION') && (!structured || semanticLocator)) {
    return { edgeType: 'STATUS_SOURCE_REF', retentionClass: 'PROTECTING', sourceClasses: classes };
  }
  if (has('CURRENT_TOOL_CONTRACT') && (!structured || semanticLocator)) {
    return {
      edgeType: /predecessor/i.test(locator) ? 'ACTIVE_PREDECESSOR_REF' : 'CURRENT_CONTRACT_REF',
      retentionClass: 'PROTECTING',
      sourceClasses: classes,
    };
  }
  if (has('RETENTION_DECLARATION') && (!structured || semanticLocator)) {
    return {
      edgeType: /predecessor/i.test(locator) ? 'ACTIVE_PREDECESSOR_REF' : 'ACTIVE_PROVENANCE_REF',
      retentionClass: 'PROTECTING',
      sourceClasses: classes,
    };
  }
  if (has('MANIFEST') && (!structured || semanticLocator)) {
    return { edgeType: 'MANIFEST_REF', retentionClass: 'PROTECTING', sourceClasses: classes };
  }
  if (has('CURRENT_STATUS_SOURCE_TARGET') && (!structured || semanticLocator)) {
    return {
      edgeType: /predecessor/i.test(locator) ? 'ACTIVE_PREDECESSOR_REF' : 'ACTIVE_PROVENANCE_REF',
      retentionClass: 'PROTECTING',
      sourceClasses: classes,
    };
  }

  if (sourcePath.endsWith('.md')) return { edgeType: 'HISTORICAL_DOC_MENTION', retentionClass: 'INFORMATIONAL', sourceClasses: classes };
  if (sourceRecord?.scopeAdmissionRole === 'CHECKPOINT') return { edgeType: 'CHECKPOINT_CROSS_REFERENCE', retentionClass: 'INFORMATIONAL', sourceClasses: classes };
  if (sourceRecord?.scopeAdmissionRole === 'CONTRACT') return { edgeType: 'NON_ACTIVE_CONTRACT_REF', retentionClass: 'INFORMATIONAL', sourceClasses: classes };
  if (sourceRecord) return { edgeType: 'EVIDENCE_CROSS_REFERENCE', retentionClass: 'INFORMATIONAL', sourceClasses: classes };
  return { edgeType: 'NON_ACTIVE_CROSS_REFERENCE', retentionClass: 'INFORMATIONAL', sourceClasses: classes };
}

function groupMentions(mentions) {
  const grouped = new Map();
  for (const mention of mentions) {
    const key = [mention.fromPath, mention.toPath, mention.edgeType, mention.retentionClass].join('\u0000');
    let row = grouped.get(key);
    if (!row) {
      row = {
        fromPath: mention.fromPath,
        toPath: mention.toPath,
        edgeType: mention.edgeType,
        retentionClass: mention.retentionClass,
        sourceFieldOrLocator: mention.locator,
        additionalLocators: [],
        occurrenceCount: 0,
        explicit: true,
        sourceClasses: [...mention.sourceClasses].sort(),
      };
      grouped.set(key, row);
    }
    row.occurrenceCount += 1;
    const locators = new Set([row.sourceFieldOrLocator, ...row.additionalLocators, mention.locator]);
    const sorted = [...locators].sort((a, b) => a.localeCompare(b));
    row.sourceFieldOrLocator = sorted[0];
    row.additionalLocators = sorted.slice(1);
    row.sourceClasses = [...new Set([...row.sourceClasses, ...mention.sourceClasses])].sort();
  }
  return [...grouped.values()].sort((a, b) =>
    a.toPath.localeCompare(b.toPath) ||
    a.fromPath.localeCompare(b.fromPath) ||
    a.edgeType.localeCompare(b.edgeType) ||
    a.retentionClass.localeCompare(b.retentionClass));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function build() {
  const c0 = readJson(C0);
  const c1 = readJson(C1);
  const c2 = readJson(C2);
  const baseline = c0.baseline.sha;
  if (c1.baseline.sha !== baseline) throw new Error(`C1 baseline mismatch: ${c1.baseline.sha} != ${baseline}`);
  if (c1.inventoryDigest.value !== c2.input.c1InventoryDigest) throw new Error('C1 inventory digest does not match frozen C2 input.');
  const admittedRecords = c1.records.filter(record => record.admissionStatus === 'ADMITTED');
  if (admittedRecords.length !== c2.input.admittedNodeCount) throw new Error('C1 admitted node count does not match frozen C2 input.');
  const admittedPaths = admittedRecords.map(record => record.path).sort();
  const admittedSet = new Set(admittedPaths);
  const matcher = new RegExp(admittedPaths.slice().sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'g');
  const tree = readTree(baseline);
  const context = buildContext({ baseline, tree, admittedRecords });
  const mentions = [];
  let scannedBlobCount = 0;
  let rawExplicitMentionCount = 0;
  let selfMentionExcludedCount = 0;
  let jsonParseFallbackCount = 0;
  let criticalJsonParseErrorCount = 0;

  for (const entry of tree) {
    if (!isTextSource(entry)) continue;
    scannedBlobCount += 1;
    let text;
    try {
      text = g(['cat-file', 'blob', entry.blobSha]);
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    const sourceRecord = context.recordMap.get(entry.path) ?? null;
    const recordMention = (targetPath, locator) => {
      rawExplicitMentionCount += 1;
      if (!admittedSet.has(targetPath)) throw new Error(`Matcher returned non-admitted target: ${targetPath}`);
      if (entry.path === targetPath) {
        selfMentionExcludedCount += 1;
        return;
      }
      const classification = classifyMention({ sourcePath: entry.path, sourceRecord, locator, context });
      mentions.push({
        fromPath: entry.path,
        toPath: targetPath,
        locator,
        ...classification,
      });
    };

    if (entry.path.endsWith('.json')) {
      try {
        scanJsonStrings(JSON.parse(text), matcher, recordMention);
      } catch {
        jsonParseFallbackCount += 1;
        const classes = sourceClasses(entry.path, sourceRecord, context);
        if (classes.some(name => ['STATUS_SOURCE_DECLARATION', 'CURRENT_STATUS_SOURCE_TARGET', 'CURRENT_TOOL_CONTRACT', 'RETENTION_DECLARATION', 'MANIFEST'].includes(name))) {
          criticalJsonParseErrorCount += 1;
        }
        scanTextLines(text, matcher, recordMention);
      }
    } else {
      scanTextLines(text, matcher, recordMention);
    }
  }

  const edges = groupMentions(mentions);
  const protectingEdges = edges.filter(edge => edge.retentionClass === 'PROTECTING');
  const informationalEdges = edges.filter(edge => edge.retentionClass === 'INFORMATIONAL');
  const referencedNodes = new Set(edges.map(edge => edge.toPath));
  const protectingReferencedNodes = new Set(protectingEdges.map(edge => edge.toPath));
  const incoming = admittedPaths.map(nodePath => {
    const nodeEdges = edges.filter(edge => edge.toPath === nodePath);
    const protecting = nodeEdges.filter(edge => edge.retentionClass === 'PROTECTING');
    const informational = nodeEdges.filter(edge => edge.retentionClass === 'INFORMATIONAL');
    return {
      path: nodePath,
      protectingReferenceCount: protecting.length,
      informationalReferenceCount: informational.length,
      totalReferenceCount: nodeEdges.length,
      protectingFromPaths: [...new Set(protecting.map(edge => edge.fromPath))].sort(),
      informationalFromPaths: [...new Set(informational.map(edge => edge.fromPath))].sort(),
    };
  });

  if (criticalJsonParseErrorCount) throw new Error(`Critical C2 JSON source parse errors: ${criticalJsonParseErrorCount}`);

  const baselineTreeSha = g(['rev-parse', `${baseline}^{tree}`]).trim();
  const referenceInputFingerprintPayload = {
    baselineTreeSha,
    c1InventoryDigest: c1.inventoryDigest.value,
    statusSourceDeclarationBlobs: [...context.statusDeclarationPaths].sort().map(p => [p, context.treeMap.get(p)?.blobSha ?? null]),
    validatorCatalogBlobSha: g(['rev-parse', `${baseline}:${VALIDATORS}`]).trim(),
    packageJsonBlobSha: g(['rev-parse', `${baseline}:${PACKAGE}`]).trim(),
    activeWorkflowBlobs: [...context.explicitActiveWorkflowPaths].sort().map(p => [p, context.treeMap.get(p)?.blobSha ?? null]),
  };
  const graphDigest = crypto.createHash('sha256').update(JSON.stringify(edges)).digest('hex');
  const referenceInputFingerprint = crypto.createHash('sha256').update(JSON.stringify(referenceInputFingerprintPayload)).digest('hex');

  return {
    version: 1,
    schemaId: 'evidence-lifecycle-c2-reference-graph/v1',
    stage: 'C2 - Typed Reference Graph',
    status: 'PASS_WITH_REVIEW',
    completion: 'COMPLETE',
    freezeState: 'C2_REFERENCE_GRAPH_COMPLETE',
    baseline: {
      branch: c0.baseline.branch,
      sha: baseline,
      treeSha: baselineTreeSha,
    },
    input: {
      c0Contract: C0,
      c1Inventory: C1,
      c2Contract: C2,
      admittedNodeCount: admittedRecords.length,
      c1InventoryDigest: c1.inventoryDigest.value,
    },
    authorityBoundary: {
      semanticReopen: false,
      rawSemanticRecomputationCount: 0,
      inferredReferenceCount: 0,
      filenameSimilarityReferenceCount: 0,
      stageOrderingReferenceCount: 0,
      chronologyReferenceCount: 0,
      nameJoinReferenceCount: 0,
      idArithmeticReferenceCount: 0,
    },
    referenceSourceObservation: {
      baselineRepositoryBlobCount: tree.length,
      scannedTextBlobCount: scannedBlobCount,
      statusSourceDeclarationCount: context.statusDeclarationPaths.size,
      approvedStatusSourceEntryCount: context.approvedStatusEntries.length,
      activeStatusTargetCount: context.activeStatusTargetPaths.size,
      registeredValidatorEntrypointCount: context.validatorEntrypoints.size,
      activeToolRootCount: context.activeToolRoots.size,
      currentToolContractCount: context.currentToolContracts.size,
      trackedWorkflowCount: context.trackedWorkflowPaths.size,
      activeWorkflowCount: context.explicitActiveWorkflowPaths.size,
      productionConsumerSourceCount: context.productionConsumerPaths.size,
      manifestNodeCount: context.manifestPaths.size,
      retentionDeclarationNodeCount: context.retentionDeclarationPaths.size,
      jsonParseFallbackCount,
      criticalJsonParseErrorCount,
    },
    summary: {
      admittedNodeCount: admittedRecords.length,
      rawExplicitMentionCount,
      selfMentionExcludedCount,
      edgeCount: edges.length,
      protectingEdgeCount: protectingEdges.length,
      informationalEdgeCount: informationalEdges.length,
      referencedNodeCount: referencedNodes.size,
      zeroReferenceNodeCount: admittedRecords.length - referencedNodes.size,
      protectingReferencedNodeCount: protectingReferencedNodes.size,
      zeroProtectingReferenceNodeCount: admittedRecords.length - protectingReferencedNodes.size,
      protectingEdgeTypeCounts: countBy(protectingEdges, 'edgeType'),
      informationalEdgeTypeCounts: countBy(informationalEdges, 'edgeType'),
    },
    policy: {
      exactAdmittedPathMentionRequired: true,
      sourceAndTargetMustBeDistinct: true,
      protectionRequiresExplicitCurrentSourceClass: true,
      structuredProtectionRequiresSemanticPathLocator: true,
      informationalMentionDoesNotProtectRetention: true,
      zeroProtectingReferencesDoesNotMeanUnused: true,
      zeroProtectingReferencesDoesNotMeanDelete: true,
      c2DoesNotClassifyLifecycle: true,
      c2DoesNotDecideDeletionEligibility: true,
    },
    referenceInputFingerprint: {
      algorithm: 'sha256',
      value: referenceInputFingerprint,
      canonicalization: 'JSON.stringify(reference-input-fingerprint-payload)',
      payload: referenceInputFingerprintPayload,
    },
    graphDigest: {
      algorithm: 'sha256',
      value: graphDigest,
      canonicalization: 'JSON.stringify(sorted-edge-array)',
    },
    edges,
    incoming,
  };
}

const result = build();
const text = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, text);
  console.log(JSON.stringify({ status: result.status, completion: result.completion, outputPath: OUTPUT, summary: result.summary }, null, 2));
} else {
  process.stdout.write(text);
}
