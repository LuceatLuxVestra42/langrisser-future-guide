#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStatusSourceEntries,
  selectActiveSources,
} from '../lib/select-active-sources.mjs';
import { captureSourceProvenance } from '../lib/source-provenance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const fixturePath = path.resolve(here, '../fixtures/current-selection.v1.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  assert(left === right, `${label} mismatch\nactual:   ${left}\nexpected: ${right}`);
}

function projectDomain(domain) {
  return {
    rootId: domain.rootId,
    selectedId: domain.selectedId,
    sourcePath: domain.sourcePath,
    facet: domain.facet,
    sourceEntryFile: domain.sourceEntryFile,
    lineage: domain.lineage
  };
}

function scanRuntimeIndependence() {
  const runtimeFiles = [
    path.resolve(here, '../lib/source-provenance.mjs'),
    path.resolve(here, '../lib/select-active-sources.mjs'),
    path.resolve(here, '../cli/select.mjs')
  ];
  const forbiddenReferences = [
    'data/generated/project-doctor',
    'data/contracts/project-doctor-d1',
    'data/contracts/project-doctor-d2',
    'data/contracts/project-doctor-d3',
    'data/contracts/project-doctor-d4',
    'data/contracts/project-doctor-d5',
    'data/contracts/project-doctor-d7',
    'run-project-doctor',
    'collect-project-doctor',
    'analyze-project-doctor',
    'plan-project-doctor',
    'validate-project-doctor',
    'data/configdata/',
    'node:child_process'
  ];
  const mutationTokens = [
    'writeFileSync(',
    'writeFile(',
    'appendFileSync(',
    'renameSync(',
    'unlinkSync(',
    'rmSync(',
    'mkdirSync('
  ];

  for (const filePath of runtimeFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const token of forbiddenReferences) {
      assert(!source.includes(token), `Forbidden legacy/runtime dependency in ${path.relative(repoRoot, filePath)}: ${token}`);
    }
    for (const token of mutationTokens) {
      assert(!source.includes(token), `Runtime mutation is forbidden in ${path.relative(repoRoot, filePath)}: ${token}`);
    }
  }
}

function runFreshnessFixtures() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'status-source-r1-freshness-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'data/status-sources'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'data/validation'), { recursive: true });
    const sourcePath = 'data/validation/hero-root.v1.json';
    const copyPath = 'data/validation/hero-copy.v1.json';
    const declarationPath = path.join(tempRoot, 'data/status-sources/baseline.v1.json');
    const sourceAbsolute = path.join(tempRoot, sourcePath);
    const copyAbsolute = path.join(tempRoot, copyPath);
    const sourceA = `${JSON.stringify({ status: 'PASS', note: 'A' }, null, 2)}\n`;
    const sourceB = `${JSON.stringify({ status: 'PASS', note: 'B' }, null, 2)}\n`;

    fs.writeFileSync(sourceAbsolute, sourceA);
    const provenance = captureSourceProvenance({ repoRoot: tempRoot, sourcePath });
    const baselineEntry = {
      id: 'hero-root',
      domain: 'hero',
      state: 'APPROVED',
      sourcePath,
      sourceProvenance: provenance,
      facet: 'canonical',
      successorOf: null,
      admission: [{ pointer: '/status', equals: 'PASS' }],
    };
    const writeDeclaration = entry => fs.writeFileSync(declarationPath, `${JSON.stringify({
      version: 1,
      schemaId: 'project-doctor-active-source-entries/v1',
      entries: [entry],
    }, null, 2)}\n`);

    writeDeclaration(baselineEntry);
    assert(selectActiveSources({ repoRoot: tempRoot }).domains.hero.admissionEvidence.sourceProvenance.status === 'FRESH', 'P1 same path + same bytes must be FRESH');

    const now = new Date();
    fs.utimesSync(sourceAbsolute, now, new Date(now.getTime() + 1000));
    assert(selectActiveSources({ repoRoot: tempRoot }).domains.hero.admissionEvidence.sourceProvenance.status === 'FRESH', 'P1-MTIME mtime-only change must remain FRESH');

    fs.writeFileSync(sourceAbsolute, sourceB);
    assert.throws(
      () => selectActiveSources({ repoRoot: tempRoot }),
      /STALE_SOURCE_PROVENANCE/,
      'P2 same path + changed bytes must be STALE',
    );

    fs.writeFileSync(sourceAbsolute, sourceA);
    fs.writeFileSync(copyAbsolute, sourceA);
    writeDeclaration({ ...baselineEntry, sourcePath: copyPath });
    assert.throws(
      () => selectActiveSources({ repoRoot: tempRoot }),
      /PROVENANCE_PATH_MISMATCH/,
      'P3 changed path + same bytes requires explicit provenance reattestation',
    );

    writeDeclaration({ ...baselineEntry, sourceProvenance: undefined });
    assert.throws(() => selectActiveSources({ repoRoot: tempRoot }), /INVALID_PROVENANCE/, 'N1 missing provenance must fail closed');

    writeDeclaration({ ...baselineEntry, sourceProvenance: { ...provenance, gitBlobSha: 'bad' } });
    assert.throws(() => selectActiveSources({ repoRoot: tempRoot }), /INVALID_PROVENANCE/, 'N2 malformed hash must fail closed');

    writeDeclaration({ ...baselineEntry, sourceProvenance: { ...provenance, hashAlgorithm: 'sha256' } });
    assert.throws(() => selectActiveSources({ repoRoot: tempRoot }), /INVALID_PROVENANCE/, 'N3 unsupported hash algorithm must fail closed');

    writeDeclaration({ ...baselineEntry, sourceProvenance: { ...provenance, sourcePath: copyPath } });
    assert.throws(() => selectActiveSources({ repoRoot: tempRoot }), /PROVENANCE_PATH_MISMATCH/, 'N4 provenance path mismatch must fail closed');

    writeDeclaration(baselineEntry);
    fs.unlinkSync(sourceAbsolute);
    assert.throws(() => selectActiveSources({ repoRoot: tempRoot }), /SOURCE_UNAVAILABLE/, 'N5 missing source must fail closed');

    return {
      p1Fresh: true,
      p1MtimeFresh: true,
      p2Stale: true,
      p3ExplicitReattestationRequired: true,
      invalidProvenanceFailures: 4,
      sourceUnavailableBlocked: true,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  scanRuntimeIndependence();
  const result = selectActiveSources({ repoRoot });
  const { entries } = loadStatusSourceEntries({ repoRoot });

  same(result.declarationFiles, Object.keys(fixture.declarationBlobs).sort(), 'declaration files');
  assert(result.entryCount === fixture.expected.entryCount, `entryCount ${result.entryCount} != ${fixture.expected.entryCount}`);
  assert(result.selectedCount === fixture.expected.selectedCount, `selectedCount ${result.selectedCount} != ${fixture.expected.selectedCount}`);
  assert(entries.filter(entry => entry.state === 'APPROVED').every(entry => entry.sourceProvenance?.hashAlgorithm === 'git-blob-sha1'), 'every APPROVED entry must carry git-blob-sha1 provenance');

  for (const [domain, expected] of Object.entries(fixture.expected.domains)) {
    assert(result.domains[domain], `Missing selected domain: ${domain}`);
    same(projectDomain(result.domains[domain]), expected, `${domain} selection`);
    assert(result.domains[domain].admissionEvidence?.sourceProvenance?.status === 'FRESH', `${domain} selected source provenance must be FRESH`);
  }
  same(Object.keys(result.domains).sort(), Object.keys(fixture.expected.domains).sort(), 'selected domain set');

  const equipmentExpected = fixture.expected.equipmentProjectionSubset;
  const equipmentActual = result.domains.equipment.projectionOverride?.expected ?? {};
  for (const [key, expected] of Object.entries(equipmentExpected)) {
    assert(Object.is(equipmentActual[key], expected), `equipment projection ${key}: ${equipmentActual[key]} != ${expected}`);
  }

  assert(result.rawConfigDataReadCount === 0, 'raw ConfigData read count must remain 0');
  assert(result.semanticRecomputationCount === 0, 'semantic recomputation count must remain 0');
  assert(result.domainValidatorExecutionCount === 0, 'domain validator execution count must remain 0');
  assert(result.legacyStateMutationCount === 0, 'legacy state mutation count must remain 0');

  const freshness = runFreshnessFixtures();

  console.log('PASS_STATUS_SOURCE_R1_CURRENT_SELECTION_PARITY');
  console.log(`declarations=${result.declarationFiles.length} entries=${result.entryCount} selected=${result.selectedCount}`);
  for (const [domain, selected] of Object.entries(result.domains)) {
    console.log(`${domain}: ${selected.selectedId} -> ${selected.sourcePath} provenance=${selected.admissionEvidence.sourceProvenance.status}`);
  }
  console.log(JSON.stringify({
    freshness,
    legacyRuntimeDependencies: 0,
    rawConfigDataReads: 0,
    semanticRecomputation: 0,
    domainValidatorExecution: 0,
    legacyStateMutation: 0,
  }));
} catch (error) {
  console.error(`[status-source:r1:self-test] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
}
