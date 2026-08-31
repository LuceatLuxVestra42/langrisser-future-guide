import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectStatus } from '../lib/project-status-view.mjs';
import { loadProjectStatusWriterContract, writeProjectStatus } from '../lib/write-project-status.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const fixture = readJson('tools/project-status/fixtures/current-project-status.v1.json');
const allowStaleCanonical = process.env.PROJECT_STATUS_ALLOW_STALE_CANONICAL === '1';

const fail = message => { throw new Error(message); };
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
};

const first = buildProjectStatus({ repoRoot });
const second = buildProjectStatus({ repoRoot });
same(first.normalized, second.normalized, 'deterministic normalized output');
same(first.projectStatus, second.projectStatus, 'deterministic projected output');
if (first.markdown !== second.markdown) fail('deterministic markdown output mismatch');

const normalized = first.normalized;
const projected = first.projectStatus;

if (normalized.readOnly !== true) fail('normalized output must be read-only');
if (normalized.validatorExecutionCount !== 0) fail('domain validator execution must remain zero');
if (normalized.rawConfigDataReadCount !== 0) fail('raw ConfigData reads must remain zero');
if (normalized.semanticRecomputationCount !== 0) fail('semantic recomputation must remain zero');
if (normalized.canonicalJoinRecomputationCount !== 0) fail('canonical JOIN recomputation must remain zero');
if (normalized.legacyProjectDoctorRuntimeImportCount !== 0) fail('legacy Doctor runtime imports must remain zero');
if (normalized.legacyGeneratedStatusReadCount !== 0) fail('legacy generated status reads must remain zero');
if (normalized.sourceAuthority?.schemaId !== 'status-source-selection/v1') fail('R1 Status Source selection must be the authority predecessor');
if (normalized.sourceAuthority?.selectedCount !== 6) fail('R1 Status Source selection must provide six domains');

for (const key of ['projectHealth', 'healthCounts', 'lifecycleCounts', 'knownHardErrorTotal', 'reviewTotal', 'blockerTotal']) {
  same(projected[key], fixture[key], `aggregate ${key}`);
}

if (projected.domains.length !== 6) fail(`expected six projected domains, got ${projected.domains.length}`);
for (const record of projected.domains) {
  const expected = fixture.domains[record.domain];
  if (!expected) fail(`unexpected domain ${record.domain}`);
  same(record.activeSourceId, expected.selectedId, `${record.domain} selectedId`);
  same(record.activeSource, expected.activeSource, `${record.domain} activeSource`);
  same(record.lifecycle, expected.lifecycle, `${record.domain} lifecycle`);
  same(record.health, expected.health, `${record.domain} health`);
  same(record.status, expected.status, `${record.domain} status`);
  same(record.completion, expected.completion, `${record.domain} completion`);
  same(record.freezeState, expected.freezeState, `${record.domain} freezeState`);
  same(record.population, expected.population, `${record.domain} population`);
  same(record.reviewCount, expected.reviewCount, `${record.domain} reviewCount`);
  same(record.blockerCount, expected.blockerCount, `${record.domain} blockerCount`);
  same(record.supplementalSources.length, expected.supplementalCount, `${record.domain} supplementalCount`);
}

const equipment = projected.domains.find(item => item.domain === 'equipment');
same(
  { canonical: equipment.population.canonical, public: equipment.population.public, general: equipment.population.general, exclusive: equipment.population.exclusive },
  { canonical: 390, public: 365, general: 198, exclusive: 167 },
  'Equipment successor projection',
);

const skin = projected.domains.find(item => item.domain === 'skin');
if (skin.lifecycle !== 'COMPLETE'
  || skin.health !== 'PASS'
  || skin.status !== 'PASS'
  || skin.completion !== 'SKIN_STAGE3_2_COMPLETE'
  || skin.reviewCount !== 0
  || skin.blockerCount !== 0) {
  fail('Skin completed asset-evidence projection must be COMPLETE/PASS with no review or blocker');
}

const canonicalProjectStatus = readJson('data/generated/project-status.v1.json');
if (canonicalProjectStatus.schemaId !== 'project-status/v1') fail('canonical Project Status schema must remain project-status/v1');
if (!allowStaleCanonical) {
  for (const key of [
    'version',
    'schemaId',
    'derivedOnly',
    'rawConfigDataReadCount',
    'semanticRecomputationCount',
    'projectHealth',
    'healthCounts',
    'lifecycleCounts',
    'knownHardErrorTotal',
    'reviewTotal',
    'blockerTotal',
  ]) {
    same(projected[key], canonicalProjectStatus[key], `canonical compatibility ${key}`);
  }
  for (const canonicalDomain of canonicalProjectStatus.domains ?? []) {
    const successor = projected.domains.find(item => item.domain === canonicalDomain.domain);
    if (!successor) fail(`NEW Project Status missing canonical domain ${canonicalDomain.domain}`);
    for (const [key, value] of Object.entries(canonicalDomain)) {
      same(successor[key], value, `canonical domain compatibility ${canonicalDomain.domain}.${key}`);
    }
  }
}
if (projected.source?.authoritySchemaId !== 'status-source-selection/v1') fail('NEW canonical Project Status must identify R1 Status Source authority');
if (projected.readOnly !== true || projected.canonicalJoinRecomputationCount !== 0) fail('NEW canonical Project Status must add explicit safe projection boundaries');

const writerContract = loadProjectStatusWriterContract({ repoRoot });
if (!['CUTOVER_DEFERRED', 'ACTIVE'].includes(writerContract.state)) fail(`unexpected writer state ${writerContract.state}`);
if (allowStaleCanonical && writerContract.state !== 'ACTIVE') fail('stale canonical allowance is valid only for the active writer repair path');
same(writerContract.canonicalTargets, {
  json: 'data/generated/project-status.v1.json',
  markdown: 'PROJECT_STATUS.md',
}, 'writer canonical targets');
if (writerContract.activation?.maximumActiveWriterCount !== 1) fail('Project Status writer must cap active writer count at one');

const writerCheck = writeProjectStatus({}, { repoRoot, contract: writerContract });
if (writerCheck.writePerformed !== false || writerCheck.boundaries.projectStatusWriteCount !== 0) fail('Project Status writer CHECK must not mutate repository');
same(writerCheck.canonicalTargets, ['data/generated/project-status.v1.json', 'PROJECT_STATUS.md'], 'writer check target set');

if (writerContract.state === 'CUTOVER_DEFERRED') {
  let deferredApplyBlocked = false;
  try {
    writeProjectStatus({ apply: true }, {
      repoRoot,
      contract: writerContract,
      readText: () => null,
      writeText: () => fail('deferred writer must not write'),
    });
  } catch (error) {
    deferredApplyBlocked = String(error).includes('apply is disabled');
  }
  if (!deferredApplyBlocked) fail('deferred Project Status writer APPLY must be blocked');
}

const syntheticWrites = [];
const syntheticActiveContract = { ...writerContract, state: 'ACTIVE' };
const syntheticApply = writeProjectStatus({ apply: true }, {
  repoRoot,
  contract: syntheticActiveContract,
  readText: () => 'synthetic-stale',
  writeText: (targetPath, content) => syntheticWrites.push({ targetPath, content }),
});
if (syntheticApply.writePerformed !== true || syntheticApply.boundaries.projectStatusWriteCount !== 2) fail('synthetic active writer must write exactly two canonical targets');
same(syntheticWrites.map(item => item.targetPath), ['data/generated/project-status.v1.json', 'PROJECT_STATUS.md'], 'synthetic writer target set');
if (syntheticApply.boundaries.statusSourceMutationCount !== 0
  || syntheticApply.boundaries.legacyProjectDoctorRuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyD1RuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyD5RuntimeDependencyCount !== 0
  || syntheticApply.boundaries.legacyGeneratedStatusReadCount !== 0
  || syntheticApply.boundaries.rawConfigDataReadCount !== 0
  || syntheticApply.boundaries.semanticRecomputationCount !== 0
  || syntheticApply.boundaries.canonicalJoinRecomputationCount !== 0
  || syntheticApply.boundaries.domainValidatorExecutionCount !== 0) {
  fail('Project Status writer side-effect boundary violated');
}

const runtimeFiles = [
  'tools/project-status/lib/normalize-project-status.mjs',
  'tools/project-status/lib/project-status-view.mjs',
  'tools/project-status/cli/status.mjs',
];
for (const relative of runtimeFiles) {
  const text = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  if (/from\s+['"][^'"]*project-doctor/i.test(text)) fail(`${relative} imports legacy Project Doctor runtime`);
  if (/data\/generated\/project-doctor/i.test(text)) fail(`${relative} reads legacy Doctor generated state`);
  if (/data\/generated\/project-status\.v1\.json/.test(text)) fail(`${relative} reads canonical Project Status generated output`);
  if (/PROJECT_STATUS\.md/.test(text)) fail(`${relative} reads PROJECT_STATUS.md`);
  if (/data\/configdata\//i.test(text)) fail(`${relative} reads raw ConfigData`);
  if (/writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync/.test(text)) fail(`${relative} contains repository writer primitive`);
}

const writerRuntimeText = [
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/lib/write-project-status.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/project-status/cli/write.mjs'), 'utf8'),
].join('\n');
for (const forbidden of [
  'data/generated/project-doctor',
  'data/configdata/',
  'scripts/',
  'doctor:status',
  'run-project-doctor',
  'build-project-status.mjs',
]) {
  if (writerRuntimeText.includes(forbidden)) fail(`Project Status writer runtime must not depend on ${forbidden}`);
}

if (!first.markdown.includes('NEW Status Source authority')) fail('markdown must identify NEW Status Source authority');
if (!first.markdown.includes('raw ConfigData')) fail('markdown must preserve no-raw-ConfigData boundary');

console.log('[project-status-r2] PASS: current parity, canonical compatibility, writer boundary, and runtime independence verified.');
console.log(JSON.stringify({
  projectHealth: projected.projectHealth,
  healthCounts: projected.healthCounts,
  lifecycleCounts: projected.lifecycleCounts,
  reviewTotal: projected.reviewTotal,
  blockerTotal: projected.blockerTotal,
  selectedDomains: Object.fromEntries(projected.domains.map(item => [item.domain, item.activeSourceId])),
  equipment: {
    canonical: equipment.population.canonical,
    public: equipment.population.public,
    general: equipment.population.general,
    exclusive: equipment.population.exclusive,
  },
  skin: {
    lifecycle: skin.lifecycle,
    health: skin.health,
    status: skin.status,
    completion: skin.completion,
    blockerCount: skin.blockerCount,
  },
  writer: {
    state: writerContract.state,
    canonicalTargets: writerCheck.canonicalTargets,
    changedTargetCount: writerCheck.changedTargetCount,
    checkWrites: writerCheck.boundaries.projectStatusWriteCount,
    syntheticApplyWrites: syntheticApply.boundaries.projectStatusWriteCount,
    maxActiveWriterCount: writerContract.activation.maximumActiveWriterCount,
    allowStaleCanonical,
  },
}, null, 2));
