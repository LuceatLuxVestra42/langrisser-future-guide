import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectStatus } from '../lib/project-status-view.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const fixture = readJson('tools/project-status/fixtures/current-project-status.v1.json');

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
if (skin.lifecycle !== 'IN_PROGRESS' || skin.health !== 'REVIEW' || skin.blockerCount !== 1) {
  fail('Skin asset-evidence blocker must remain IN_PROGRESS/REVIEW with one blocker');
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
  if (/data\/generated\/project-status\.v1\.json/.test(text)) fail(`${relative} reads legacy Project Status generated output`);
  if (/PROJECT_STATUS\.md/.test(text)) fail(`${relative} reads PROJECT_STATUS.md`);
  if (/data\/configdata\//i.test(text)) fail(`${relative} reads raw ConfigData`);
  if (/writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync/.test(text)) fail(`${relative} contains repository writer primitive`);
}

if (!first.markdown.includes('NEW Status Source authority')) fail('markdown must identify NEW Status Source authority');
if (!first.markdown.includes('raw ConfigData')) fail('markdown must preserve no-raw-ConfigData boundary');

console.log('[project-status-r2] PASS: current parity, deterministic projection, and runtime independence verified.');
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
}, null, 2));
