import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const C0 = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const C1 = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const C2 = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const C3 = 'tools/evidence-lifecycle/contracts/c3-lifecycle-classification.v1.json';
const OUTPUT = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';

const g = (args, options = {}) => execFileSync('git', args, {
  cwd: process.cwd(),
  encoding: options.encoding ?? 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonAt = (ref, p) => JSON.parse(g(['show', `${ref}:${p}`]));
const readTextAt = (ref, p) => g(['show', `${ref}:${p}`]);
const normalize = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const pointerEscape = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

function valuePresent(value) {
  if (value == null || value === false || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function extractStatusEntries(document, declarationPath) {
  const rows = Array.isArray(document?.entries)
    ? document.entries
    : document?.entry && typeof document.entry === 'object'
      ? [document.entry]
      : [];
  return rows.map(entry => ({ ...entry, sourceEntryFile: declarationPath }));
}

function listStatusSourceDeclarations(baseline) {
  return g(['ls-tree', '-r', '--name-only', baseline])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(p => /^data\/status-sources\/[^/]+\.json$/.test(p))
    .sort();
}

function collectJsonKeySignals(value, historicalKeyRegex, successorKeyRegex, pointer = '') {
  const historical = [];
  const successors = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      const nested = collectJsonKeySignals(child, historicalKeyRegex, successorKeyRegex, `${pointer}/${index}`);
      historical.push(...nested.historical);
      successors.push(...nested.successors);
    });
    return { historical, successors };
  }
  if (!value || typeof value !== 'object') return { historical, successors };
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${pointerEscape(key)}`;
    if (historicalKeyRegex.test(key) && valuePresent(child)) {
      historical.push({ pointer: childPointer, key, valueType: Array.isArray(child) ? 'array' : typeof child });
    }
    if (successorKeyRegex.test(key) && valuePresent(child)) {
      successors.push({ pointer: childPointer, key, valueType: Array.isArray(child) ? 'array' : typeof child });
    }
    const nested = collectJsonKeySignals(child, historicalKeyRegex, successorKeyRegex, childPointer);
    historical.push(...nested.historical);
    successors.push(...nested.successors);
  }
  return { historical, successors };
}

function uniqueBasis(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result.sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source) || a.detail.localeCompare(b.detail));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function buildStatusSourceContext(baseline, admittedSet) {
  const declarationPaths = listStatusSourceDeclarations(baseline);
  const approved = [];
  for (const declarationPath of declarationPaths) {
    const document = readJsonAt(baseline, declarationPath);
    for (const entry of extractStatusEntries(document, declarationPath)) {
      if (entry.state === 'APPROVED') approved.push(entry);
    }
  }

  const approvedIds = new Set(approved.map(entry => entry.id).filter(Boolean));
  const predecessorEntryIds = new Set(
    approved
      .map(entry => entry.successorOf)
      .filter(value => typeof value === 'string' && approvedIds.has(value)),
  );
  const terminalEntries = approved.filter(entry => !predecessorEntryIds.has(entry.id));
  const activeAuthorityPaths = new Map();
  const addAuthority = (candidate, entry, locator) => {
    if (typeof candidate !== 'string') return;
    const normalized = normalize(candidate);
    if (!admittedSet.has(normalized)) return;
    const rows = activeAuthorityPaths.get(normalized) ?? [];
    rows.push({ entryId: entry.id, declarationPath: entry.sourceEntryFile, locator });
    activeAuthorityPaths.set(normalized, rows);
  };
  for (const entry of terminalEntries) {
    addAuthority(entry.sourcePath, entry, '/sourcePath');
    for (let index = 0; index < (entry.projectionOverride?.supplementalSources ?? []).length; index += 1) {
      addAuthority(entry.projectionOverride.supplementalSources[index]?.path, entry, `/projectionOverride/supplementalSources/${index}/path`);
    }
  }

  const predecessorPaths = new Map();
  for (const successor of approved) {
    if (typeof successor.successorOf !== 'string') continue;
    const predecessor = approved.find(entry => entry.id === successor.successorOf);
    if (!predecessor || typeof predecessor.sourcePath !== 'string') continue;
    const normalized = normalize(predecessor.sourcePath);
    if (!admittedSet.has(normalized)) continue;
    const rows = predecessorPaths.get(normalized) ?? [];
    rows.push({
      predecessorEntryId: predecessor.id,
      successorEntryId: successor.id,
      successorDeclarationPath: successor.sourceEntryFile,
    });
    predecessorPaths.set(normalized, rows);
  }

  return {
    declarationPaths,
    approved,
    terminalEntries,
    activeAuthorityPaths,
    predecessorPaths,
  };
}

function readBaselineNode(baseline, record) {
  if (record.fileType === 'JSON') {
    try {
      return { kind: 'JSON', value: readJsonAt(baseline, record.path), parseError: null };
    } catch (error) {
      return { kind: 'JSON', value: null, parseError: String(error?.message ?? error) };
    }
  }
  try {
    return { kind: 'TEXT', value: readTextAt(baseline, record.path), parseError: null };
  } catch (error) {
    return { kind: 'TEXT', value: null, parseError: String(error?.message ?? error) };
  }
}

function build() {
  const c0 = readJson(C0);
  const c1 = readJson(C1);
  const c2 = readJson(C2);
  const c3 = readJson(C3);
  const baseline = c0.baseline.sha;

  if (c1.baseline.sha !== baseline) throw new Error(`C1 baseline mismatch: ${c1.baseline.sha} != ${baseline}`);
  if (c2.baseline.sha !== baseline) throw new Error(`C2 baseline mismatch: ${c2.baseline.sha} != ${baseline}`);
  if (c3.baseline.sha !== baseline) throw new Error(`C3 baseline mismatch: ${c3.baseline.sha} != ${baseline}`);
  if (c1.inventoryDigest.value !== c3.input.c1InventoryDigest) throw new Error('C1 inventory digest does not match frozen C3 input.');
  if (c2.graphDigest.value !== c3.input.c2GraphDigest) throw new Error(`C2 graph digest does not match frozen C3 input: ${c2.graphDigest.value}`);

  const admittedRecords = c1.records.filter(record => record.admissionStatus === 'ADMITTED');
  if (admittedRecords.length !== c3.input.admittedNodeCount) throw new Error('C1 admitted node count does not match frozen C3 input.');
  const admittedSet = new Set(admittedRecords.map(record => record.path));
  const incomingMap = new Map(c2.incoming.map(row => [row.path, row]));
  if (incomingMap.size !== admittedRecords.length) throw new Error('C2 incoming population does not match C1 admitted population.');

  const statusContext = buildStatusSourceContext(baseline, admittedSet);
  const edgesByTarget = new Map();
  for (const edge of c2.edges.filter(edge => edge.retentionClass === 'PROTECTING')) {
    const rows = edgesByTarget.get(edge.toPath) ?? [];
    rows.push(edge);
    edgesByTarget.set(edge.toPath, rows);
  }

  const operationalTypes = new Set(c3.activeOperational.protectingEdgeTypes);
  const predecessorTypes = new Set(c3.retentionPredecessor.edgeTypes);
  const provenanceTypes = new Set(c3.retentionProvenance.edgeTypes);
  const historicalRoles = new Set(c3.retentionHistorical.explicitRoleSignals);
  const historicalKeyRegex = new RegExp(`^(?:${c3.retentionHistorical.explicitRationaleKeyRegex})$`, 'i');
  const successorKeyRegex = new RegExp(`^(?:${c3.explicitlySuperseded.explicitSuccessorKeyRegex})$`, 'i');
  const supersededStatusRegex = new RegExp(c3.explicitlySuperseded.statusTokenRegex, 'i');
  const precedence = c3.precedence;
  const allowedPrimary = new Set(c3.primaryLifecycle);
  const records = [];
  const parseErrors = [];
  const protectingFallbackErrors = [];

  for (const record of admittedRecords.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    const incoming = incomingMap.get(record.path);
    if (!incoming) throw new Error(`Missing C2 incoming record: ${record.path}`);
    const protectingEdges = (edgesByTarget.get(record.path) ?? []).slice().sort((a, b) =>
      a.edgeType.localeCompare(b.edgeType) || a.fromPath.localeCompare(b.fromPath));
    if (protectingEdges.length !== incoming.protectingReferenceCount) {
      throw new Error(`Protecting edge count mismatch for ${record.path}: ${protectingEdges.length} != ${incoming.protectingReferenceCount}`);
    }

    const node = readBaselineNode(baseline, record);
    if (node.parseError) parseErrors.push({ path: record.path, error: node.parseError });
    const jsonSignals = node.kind === 'JSON' && node.value
      ? collectJsonKeySignals(node.value, historicalKeyRegex, successorKeyRegex)
      : { historical: [], successors: [] };

    const candidateBasis = new Map();
    const add = (lifecycle, basis) => {
      if (!allowedPrimary.has(lifecycle)) throw new Error(`Unknown lifecycle ${lifecycle}`);
      const rows = candidateBasis.get(lifecycle) ?? [];
      rows.push(basis);
      candidateBasis.set(lifecycle, rows);
    };

    for (const authority of statusContext.activeAuthorityPaths.get(record.path) ?? []) {
      add('ACTIVE_AUTHORITY', {
        kind: 'STATUS_SOURCE_TERMINAL_AUTHORITY',
        source: authority.declarationPath,
        detail: `${authority.entryId}:${authority.locator}`,
      });
    }

    if (record.scopeAdmissionRole === 'AUTHORITY_DECLARATION') {
      add('ACTIVE_OPERATIONAL', {
        kind: 'AUTHORITY_DECLARATION_ROLE',
        source: C1,
        detail: 'scopeAdmissionRole=AUTHORITY_DECLARATION',
      });
    }
    if (record.scopeAdmissionRole === 'RETENTION_DECLARATION' && node.kind === 'JSON' && node.value?.state === 'APPROVED_FOR_HANDOFF') {
      add('ACTIVE_OPERATIONAL', {
        kind: 'ACTIVE_RETENTION_DECLARATION',
        source: record.path,
        detail: 'state=APPROVED_FOR_HANDOFF',
      });
    }

    for (const edge of protectingEdges) {
      if (operationalTypes.has(edge.edgeType)) {
        add('ACTIVE_OPERATIONAL', {
          kind: 'CURRENT_PROTECTING_EDGE',
          source: edge.fromPath,
          detail: `${edge.edgeType}:${edge.sourceFieldOrLocator}`,
        });
      }
      if (predecessorTypes.has(edge.edgeType)) {
        add('RETENTION_PREDECESSOR', {
          kind: 'EXPLICIT_PREDECESSOR_EDGE',
          source: edge.fromPath,
          detail: `${edge.edgeType}:${edge.sourceFieldOrLocator}`,
        });
      }
      if (provenanceTypes.has(edge.edgeType)) {
        add('RETENTION_PROVENANCE', {
          kind: 'EXPLICIT_PROVENANCE_EDGE',
          source: edge.fromPath,
          detail: `${edge.edgeType}:${edge.sourceFieldOrLocator}`,
        });
      }
      if (edge.edgeType === 'MANIFEST_REF') {
        const locators = [edge.sourceFieldOrLocator, ...(edge.additionalLocators ?? [])];
        if (locators.some(locator => /predecessor/i.test(locator))) {
          add('RETENTION_PREDECESSOR', {
            kind: 'MANIFEST_PREDECESSOR_REF',
            source: edge.fromPath,
            detail: locators.filter(locator => /predecessor/i.test(locator)).sort().join(','),
          });
        } else {
          add('RETENTION_PROVENANCE', {
            kind: 'MANIFEST_PROVENANCE_REF',
            source: edge.fromPath,
            detail: locators.slice().sort().join(','),
          });
        }
      }
    }

    for (const relation of statusContext.predecessorPaths.get(record.path) ?? []) {
      add('RETENTION_PREDECESSOR', {
        kind: 'STATUS_SOURCE_SUCCESSOR_PREDECESSOR',
        source: relation.successorDeclarationPath,
        detail: `${relation.predecessorEntryId}->${relation.successorEntryId}`,
      });
      add('EXPLICITLY_SUPERSEDED', {
        kind: 'EXPLICIT_SUCCESSOR_DECLARATION',
        source: relation.successorDeclarationPath,
        detail: `successorOf=${relation.predecessorEntryId}; successor=${relation.successorEntryId}`,
      });
    }

    if (historicalRoles.has(record.scopeAdmissionRole)) {
      add('RETENTION_HISTORICAL', {
        kind: 'EXPLICIT_HISTORICAL_ROLE',
        source: C1,
        detail: `scopeAdmissionRole=${record.scopeAdmissionRole}`,
      });
    }
    for (const signal of jsonSignals.historical) {
      add('RETENTION_HISTORICAL', {
        kind: 'EXPLICIT_RETENTION_RATIONALE',
        source: record.path,
        detail: `${signal.pointer} (${signal.key})`,
      });
    }

    const statusValues = [
      record.explicitMetadata?.status,
      record.explicitMetadata?.completion,
      record.explicitMetadata?.freezeState,
    ].filter(value => typeof value === 'string');
    for (const statusValue of statusValues) {
      if (!supersededStatusRegex.test(statusValue)) continue;
      add('EXPLICITLY_SUPERSEDED', {
        kind: 'EXPLICIT_SUPERSEDED_STATUS',
        source: record.path,
        detail: statusValue,
      });
    }
    for (const signal of jsonSignals.successors) {
      add('EXPLICITLY_SUPERSEDED', {
        kind: 'EXPLICIT_SUCCESSOR_DECLARATION',
        source: record.path,
        detail: `${signal.pointer} (${signal.key})`,
      });
    }

    const matched = precedence.filter(lifecycle => candidateBasis.has(lifecycle));
    let primaryLifecycle;
    if (matched.length) {
      primaryLifecycle = matched[0];
    } else {
      primaryLifecycle = 'UNREFERENCED_REVIEW';
      add('UNREFERENCED_REVIEW', {
        kind: 'NO_HIGHER_PRECEDENCE_SIGNAL',
        source: C3,
        detail: `protectingReferenceCount=${incoming.protectingReferenceCount}`,
      });
    }

    if (primaryLifecycle === 'UNREFERENCED_REVIEW' && incoming.protectingReferenceCount !== 0) {
      protectingFallbackErrors.push({
        path: record.path,
        protectingReferenceCount: incoming.protectingReferenceCount,
        protectingEdgeTypes: [...new Set(protectingEdges.map(edge => edge.edgeType))].sort(),
      });
    }

    const classificationBasis = uniqueBasis(candidateBasis.get(primaryLifecycle) ?? []);
    const secondaryReasons = matched
      .filter(lifecycle => lifecycle !== primaryLifecycle)
      .map(lifecycle => ({
        lifecycle,
        basis: uniqueBasis(candidateBasis.get(lifecycle) ?? []),
      }));

    records.push({
      path: record.path,
      scopeAdmissionRole: record.scopeAdmissionRole,
      protectingReferenceCount: incoming.protectingReferenceCount,
      informationalReferenceCount: incoming.informationalReferenceCount,
      totalReferenceCount: incoming.totalReferenceCount,
      protectingEdgeTypes: [...new Set(protectingEdges.map(edge => edge.edgeType))].sort(),
      primaryLifecycle,
      classificationBasis,
      secondaryReasons,
    });
  }

  if (parseErrors.length) {
    throw new Error(`C3 failed to read ${parseErrors.length} admitted baseline nodes; first=${JSON.stringify(parseErrors[0])}`);
  }
  if (protectingFallbackErrors.length) {
    throw new Error(`C3 protecting nodes fell through to UNREFERENCED_REVIEW (${protectingFallbackErrors.length}); first=${JSON.stringify(protectingFallbackErrors[0])}`);
  }
  if (records.length !== c3.completionCriteria.classifiedPopulationParity) throw new Error('C3 classified population parity failed.');
  if (records.some(row => !row.classificationBasis.length)) throw new Error('C3 classificationBasis missing.');

  const primaryLifecycleCounts = countBy(records, 'primaryLifecycle');
  const unreferencedReviewCount = primaryLifecycleCounts.UNREFERENCED_REVIEW ?? 0;
  const classificationDigest = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
  const basisCount = records.reduce((sum, row) => sum + row.classificationBasis.length, 0);
  const secondaryReasonCount = records.reduce((sum, row) => sum + row.secondaryReasons.length, 0);

  return {
    version: 1,
    schemaId: 'evidence-lifecycle-c3-lifecycle-classification/v1',
    stage: 'C3 - Lifecycle Classification',
    status: unreferencedReviewCount > 0 ? 'PASS_WITH_REVIEW' : 'PASS',
    completion: 'COMPLETE',
    freezeState: 'C3_LIFECYCLE_CLASSIFICATION_COMPLETE',
    baseline: {
      branch: c0.baseline.branch,
      sha: baseline,
    },
    input: {
      c0Contract: C0,
      c1Inventory: C1,
      c1InventoryDigest: c1.inventoryDigest.value,
      c2ReferenceGraph: C2,
      c2GraphDigest: c2.graphDigest.value,
      c3Contract: C3,
      admittedNodeCount: admittedRecords.length,
    },
    authorityBoundary: {
      semanticReopen: false,
      rawSemanticRecomputationCount: 0,
      destructiveDecisionCount: 0,
      filenameSimilarityInferenceCount: 0,
      stageOrderingInferenceCount: 0,
      chronologyInferenceCount: 0,
      nameJoinInferenceCount: 0,
      idArithmeticInferenceCount: 0,
    },
    statusSourceObservation: {
      declarationCount: statusContext.declarationPaths.length,
      approvedEntryCount: statusContext.approved.length,
      terminalApprovedEntryCount: statusContext.terminalEntries.length,
      admittedActiveAuthorityPathCount: statusContext.activeAuthorityPaths.size,
      admittedStatusSourcePredecessorPathCount: statusContext.predecessorPaths.size,
    },
    summary: {
      admittedNodeCount: admittedRecords.length,
      classifiedNodeCount: records.length,
      primaryLifecycleCounts,
      classificationBasisCount: basisCount,
      secondaryReasonCount,
      unclassifiedCount: 0,
      multiplePrimaryLifecycleCount: 0,
      classificationBasisMissingCount: 0,
      unreferencedReviewWithProtectingReferenceCount: 0,
      unreferencedReviewCount,
      hardErrorCount: 0,
    },
    policy: {
      primaryLifecyclePrecedence: precedence,
      totalReferenceCountDoesNotDriveLifecycle: true,
      informationalReferenceDoesNotProtect: true,
      zeroProtectingReferenceDoesNotMeanUnused: true,
      zeroProtectingReferenceDoesNotMeanDelete: true,
      unreferencedReviewDoesNotMeanDelete: true,
      c3DoesNotFreezeRetentionPartition: true,
      c3DoesNotDecideDeletionEligibility: true,
    },
    classificationDigest: {
      algorithm: 'sha256',
      value: classificationDigest,
      canonicalization: 'JSON.stringify(sorted-classification-record-array)',
    },
    records,
  };
}

const result = build();
const text = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, text);
  console.log(JSON.stringify({
    status: result.status,
    completion: result.completion,
    outputPath: OUTPUT,
    summary: result.summary,
    classificationDigest: result.classificationDigest,
  }, null, 2));
} else {
  process.stdout.write(text);
}
