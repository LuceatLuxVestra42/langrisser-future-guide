import fs from 'node:fs';

const CONTRACT = 'data/contracts/skin-stage3-2-resolution-proof.v1.json';
const STAGE31 = 'data/validation/skin-stage3-1-final.v1.json';
const INVENTORY = 'data/generated/skin-stage3-1-asset-inventory.v1.json';
const FIXTURES = 'data/fixtures/skin-stage3-2-resolution-fixtures.v1.json';
const PRIOR_SCAN = 'data/validation/hero-page-stage5-5-2-skins-semantics.v1.json';
const EVIDENCE = 'data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json';
const OUT = 'data/validation/skin-stage3-2-readiness.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const contract = load(CONTRACT);
const stage31 = load(STAGE31);
const inventory = load(INVENTORY);
const fixtureData = load(FIXTURES);
const priorScan = fs.existsSync(PRIOR_SCAN) ? load(PRIOR_SCAN) : null;
const evidencePresent = fs.existsSync(EVIDENCE);
const evidence = evidencePresent ? load(EVIDENCE) : null;
const checks = [];
const failures = [];
const add = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass), detail };
  checks.push(row);
  if (!pass) failures.push(row);
};

add('contract ACCEPTED', contract.status === 'ACCEPTED', contract.status);
add('contract substage 3-2', contract.substage === '3-2', contract.substage);
add('Stage 3-1 PASS', stage31.status === 'PASS', stage31.status);
add('Stage 3-1 complete', stage31.completion === 'SKIN_STAGE3_1_COMPLETE', stage31.completion);
for (const [key, expected] of Object.entries(contract.expectedStage31 ?? {})) {
  const actual = stage31.metrics?.[key];
  add(`Stage 3-1 metric ${key}`, Number(actual) === Number(expected), { expected, actual });
}

const records = Array.isArray(inventory.records) ? inventory.records : [];
const fixtures = Array.isArray(fixtureData.fixtures) ? fixtureData.fixtures : [];
add('inventory record count 540', records.length === 540, records.length);
add('fixtures GENERATED', fixtureData.status === 'GENERATED', fixtureData.status);
add('fixture role count 4', Object.keys(fixtureData.roleSelections ?? {}).length === 4, Object.keys(fixtureData.roleSelections ?? {}).length);
add('fixture skin count within 1..4', fixtures.length >= 1 && fixtures.length <= 4, fixtures.length);

const derive = row => {
  const bindings = Array.isArray(row.modelBindings) ? row.modelBindings : [];
  const ids = Array.isArray(row.modelResourceIds) ? row.modelResourceIds.map(Number) : [...new Set(bindings.map(x => Number(x.skinResourceId)))];
  const counts = new Map();
  for (const b of bindings) {
    const id = Number(b.skinResourceId);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return { ids, resourceCount: ids.length, bindingCount: bindings.length, maxRepeated: Math.max(0, ...counts.values()) };
};
const decorated = records.map((row, index) => ({ row, index, m: derive(row) }));
const single = decorated.filter(x => x.m.resourceCount === 1);
const minSingle = Math.min(...single.map(x => x.m.bindingCount));
const maxResources = Math.max(...decorated.map(x => x.m.resourceCount));
const maxBindings = Math.max(...decorated.map(x => x.m.bindingCount));
const maxRepeated = Math.max(...decorated.map(x => x.m.maxRepeated));
const expectedRoles = {
  SIMPLE_SINGLE_RESOURCE_MIN_BINDINGS: Number(single.find(x => x.m.bindingCount === minSingle)?.row.skinId),
  MAX_DISTINCT_MODEL_RESOURCES: Number(decorated.find(x => x.m.resourceCount === maxResources)?.row.skinId),
  MAX_TOTAL_MODEL_BINDINGS: Number(decorated.find(x => x.m.bindingCount === maxBindings)?.row.skinId),
  MAX_BINDINGS_PER_RESOURCE: Number(decorated.find(x => x.m.maxRepeated === maxRepeated)?.row.skinId)
};
for (const role of contract.fixtureRoles ?? []) {
  add(`fixture role ${role} exact`, Number(fixtureData.roleSelections?.[role]) === expectedRoles[role], {
    expected: expectedRoles[role], actual: fixtureData.roleSelections?.[role] ?? null
  });
}

const inventoryById = new Map(records.map(row => [Number(row.skinId), row]));
const fixtureIds = new Set();
for (const fixture of fixtures) {
  const id = Number(fixture.skinId);
  const src = inventoryById.get(id);
  add(`fixture ${id} exists in Stage 3-1`, Boolean(src), Boolean(src));
  add(`fixture ${id} unique`, !fixtureIds.has(id), id);
  fixtureIds.add(id);
  if (!src) continue;
  add(`fixture ${id} heroId parity`, Number(fixture.heroId) === Number(src.heroId), { fixture: fixture.heroId, source: src.heroId });
  add(`fixture ${id} sourceOrder parity`, Number(fixture.sourceOrder) === Number(src.sourceOrder), { fixture: fixture.sourceOrder, source: src.sourceOrder });
  add(`fixture ${id} static path parity`, fixture.static?.sourceImagePath === src.static?.sourceImagePath, fixture.static?.sourceImagePath ?? null);
  add(`fixture ${id} Spine path parity`, fixture.spine?.sourceSpinePath === src.spine?.sourceSpinePath, fixture.spine?.sourceSpinePath ?? null);
  add(`fixture ${id} model resource parity`, JSON.stringify((fixture.modelResourceIds ?? []).map(Number)) === JSON.stringify(derive(src).ids), fixture.modelResourceIds ?? []);
}

const forbiddenKeys = new Set(['localExtractPath','exportPath','webPath','releaseStatus','releaseDate','nameKr','acquisition']);
const forbidden = [];
const walk = (node, path = '') => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}[${i}]`));
  for (const [key, value] of Object.entries(node)) {
    if (forbiddenKeys.has(key)) forbidden.push(path ? `${path}.${key}` : key);
    walk(value, path ? `${path}.${key}` : key);
  }
};
walk(fixtureData);
add('fixtures contain no Stage 3-2 prohibited enrichment/path fields', forbidden.length === 0, forbidden);
add('prior semantic scan available as candidate-only context', Boolean(priorScan), priorScan?.status ?? null);
add('prior semantic scan has no structural errors', !priorScan || (priorScan.structuralErrors ?? []).length === 0, priorScan?.structuralErrors?.length ?? null);

let proofState = 'READY_FOR_ASSET_EVIDENCE';
const evidenceIssues = [];
if (evidencePresent) {
  const evidenceFixtures = Array.isArray(evidence.fixtures) ? evidence.fixtures : [];
  const byId = new Map(evidenceFixtures.map(x => [Number(x.skinId), x]));
  for (const fixture of fixtures) {
    const id = Number(fixture.skinId);
    const ev = byId.get(id);
    if (!ev) { evidenceIssues.push({ skinId: id, issue: 'missing fixture evidence' }); continue; }
    const staticOk = ev.static?.resolved === true && ev.static?.sourceImagePath === fixture.static?.sourceImagePath && typeof ev.static?.resolvedSourcePath === 'string' && ev.static.resolvedSourcePath.length > 0 && Number(ev.static?.sizeBytes) > 0;
    if (!staticOk) evidenceIssues.push({ skinId: id, issue: 'invalid static resolution evidence' });
    const spineOk = ev.spine?.resolved === true && ev.spine?.sourceSpinePath === fixture.spine?.sourceSpinePath && typeof ev.spine?.resolvedPrefabPath === 'string' && ev.spine.resolvedPrefabPath.length > 0 && Number(ev.spine?.sizeBytes) > 0 && Array.isArray(ev.spine?.dependencies) && ev.spine.dependencies.length > 0 && ev.spine.dependencies.every(d => typeof d?.path === 'string' && d.path.length > 0 && typeof d?.type === 'string' && d.type.length > 0);
    if (!spineOk) evidenceIssues.push({ skinId: id, issue: 'invalid Spine resolution/dependency evidence' });
    const modelRows = Array.isArray(ev.model?.resources) ? ev.model.resources : [];
    const modelById = new Map(modelRows.map(x => [Number(x.skinResourceId), x]));
    for (const resourceId of fixture.modelResourceIds ?? []) {
      const m = modelById.get(Number(resourceId));
      const modelOk = m?.resolved === true && typeof m?.resolvedSource === 'string' && m.resolvedSource.length > 0;
      if (!modelOk) evidenceIssues.push({ skinId: id, skinResourceId: Number(resourceId), issue: 'missing/invalid model resource resolution evidence' });
    }
  }
  add('supplied asset-resolution evidence valid', evidenceIssues.length === 0, evidenceIssues);
  proofState = evidenceIssues.length === 0 && failures.length === 0 ? 'PASS' : 'FAIL';
}

if (!evidencePresent) add('authoritative asset evidence intentionally not claimed', true, 'evidence file absent');
if (failures.length > 0 && !evidencePresent) proofState = 'FAIL';
const completion = proofState === 'PASS' ? 'SKIN_STAGE3_2_COMPLETE' : null;
const blocker = proofState === 'READY_FOR_ASSET_EVIDENCE'
  ? 'ASSET_BYTES_OR_AUTHENTIC_RESOLUTION_EVIDENCE_NOT_AVAILABLE_IN_REPOSITORY'
  : null;

const result = {
  version: 1,
  stage: 'skin-page-3',
  substage: '3-2',
  checkpoint: 'representative-asset-resolution-proof-readiness',
  status: proofState,
  completion,
  purpose: contract.purpose,
  metrics: {
    checkCount: checks.length,
    passedCheckCount: checks.filter(x => x.pass).length,
    failedCheckCount: failures.length,
    fixtureRoleCount: Object.keys(fixtureData.roleSelections ?? {}).length,
    uniqueFixtureSkinCount: fixtures.length,
    evidencePresent,
    evidenceIssueCount: evidenceIssues.length
  },
  fixtureSelection: fixtureData.roleSelections,
  selectionMetrics: fixtureData.selectionMetrics,
  priorScanUse: {
    path: PRIOR_SCAN,
    status: priorScan?.status ?? 'ABSENT',
    authority: 'CANDIDATE_CONTEXT_ONLY',
    note: 'Numeric/path overlap from this prior scan is not treated as model asset resolution proof.'
  },
  evidence: {
    expectedPath: EVIDENCE,
    present: evidencePresent,
    blocker,
    issues: evidenceIssues
  },
  checks,
  failures: { failedChecks: failures, forbiddenFixtureFields: forbidden },
  nextAction: proofState === 'PASS' ? contract.nextActionOnPass : contract.nextActionWhenReady
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (proofState === 'FAIL') process.exitCode = 1;
