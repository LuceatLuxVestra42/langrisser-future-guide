#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectActiveSources } from '../lib/select-active-sources.mjs';

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

try {
  scanRuntimeIndependence();
  const result = selectActiveSources({ repoRoot });

  same(result.declarationFiles, Object.keys(fixture.declarationBlobs).sort(), 'declaration files');
  assert(result.entryCount === fixture.expected.entryCount, `entryCount ${result.entryCount} != ${fixture.expected.entryCount}`);
  assert(result.selectedCount === fixture.expected.selectedCount, `selectedCount ${result.selectedCount} != ${fixture.expected.selectedCount}`);

  for (const [domain, expected] of Object.entries(fixture.expected.domains)) {
    assert(result.domains[domain], `Missing selected domain: ${domain}`);
    same(projectDomain(result.domains[domain]), expected, `${domain} selection`);
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

  console.log('PASS_STATUS_SOURCE_R1_CURRENT_SELECTION_PARITY');
  console.log(`declarations=${result.declarationFiles.length} entries=${result.entryCount} selected=${result.selectedCount}`);
  for (const [domain, selected] of Object.entries(result.domains)) {
    console.log(`${domain}: ${selected.selectedId} -> ${selected.sourcePath}`);
  }
  console.log('legacyRuntimeDependencies=0 rawConfigDataReads=0 semanticRecomputation=0 domainValidatorExecution=0 legacyStateMutation=0');
} catch (error) {
  console.error(`[status-source:r1:self-test] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
}
