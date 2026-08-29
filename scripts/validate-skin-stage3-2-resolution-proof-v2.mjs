import fs from 'node:fs';

const CONTRACT = 'data/contracts/skin-stage3-2-resolution-proof.v2.json';
const LEGACY_CONTRACT = 'data/contracts/skin-stage3-2-resolution-proof.v1.json';
const LEGACY_READINESS = 'data/validation/skin-stage3-2-readiness.v1.json';
const STAGE31 = 'data/validation/skin-stage3-1-final.v1.json';
const INVENTORY = 'data/generated/skin-stage3-1-asset-inventory.v1.json';
const FIXTURES = 'data/fixtures/skin-stage3-2-resolution-fixtures.v1.json';
const EVIDENCE = 'data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json';
const OUT = 'data/validation/skin-stage3-2-final.v2.json';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => fs.existsSync(p);
const contract = load(CONTRACT);
const legacyContract = load(LEGACY_CONTRACT);
const legacyReadiness = load(LEGACY_READINESS);
const stage31 = load(STAGE31);
const inventory = load(INVENTORY);
const fixtures = load(FIXTURES);
const evidence = load(EVIDENCE);

const checks = [];
const failures = [];
const add = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass), detail };
  checks.push(row);
  if (!pass) failures.push(row);
};

add('v2 contract ACCEPTED', contract.status === 'ACCEPTED', contract.status);
add('v2 contract version 2', Number(contract.version) === 2, contract.version);
add('v2 contract substage 3-2', contract.substage === '3-2', contract.substage);
add('legacy v1 contract preserved', exists(LEGACY_CONTRACT) && Number(legacyContract.version) === 1, legacyContract.version);
add('legacy readiness preserved as pre-evidence state', legacyReadiness.status === 'READY_FOR_ASSET_EVIDENCE' && legacyReadiness.completion == null, {
  status: legacyReadiness.status,
  completion: legacyReadiness.completion
});
add('legacy readiness authority downgraded only by v2 contract', contract.supersession?.historicalAuthority === 'HISTORICAL_PRE_EVIDENCE_ONLY', contract.supersession?.historicalAuthority);
add('historical files preserved', contract.supersession?.preserveHistoricalFiles === true && contract.supersession?.replaceHistoricalFilesInPlace === false, contract.supersession);

add('Stage 3-1 PASS', stage31.status === 'PASS', stage31.status);
add('Stage 3-1 complete', stage31.completion === 'SKIN_STAGE3_1_COMPLETE', stage31.completion);
for (const key of ['skinCount','uniqueStaticPathCount','uniqueSpinePathCount','modelBindingEdgeCount','uniqueModelResourceIdCount']) {
  const expected = Number(contract.frozenExpected?.[key]);
  const actual = Number(stage31.metrics?.[key]);
  add(`Stage 3-1 frozen metric ${key}`, actual === expected, { expected, actual });
}

const inventoryRecords = Array.isArray(inventory.records) ? inventory.records : [];
add('inventory records 540', inventoryRecords.length === Number(contract.frozenExpected?.skinCount), inventoryRecords.length);

const fixtureRecords = Array.isArray(fixtures.fixtures) ? fixtures.fixtures : [];
const fixtureIds = fixtureRecords.map(x => Number(x.skinId)).sort((a,b) => a-b);
const expectedFixtureIds = (contract.frozenExpected?.fixtureSkinIds ?? []).map(Number).sort((a,b) => a-b);
add('representative fixture IDs exact', JSON.stringify(fixtureIds) === JSON.stringify(expectedFixtureIds), { expected: expectedFixtureIds, actual: fixtureIds });
add('representative fixture count exact', fixtureRecords.length === Number(contract.frozenExpected?.representativeExpected), fixtureRecords.length);

add('final representative evidence status PASS', evidence.status === contract.completionPolicy?.passStatus, evidence.status);
add('final representative evidence class', evidence.evidenceClass === 'FINAL_REPRESENTATIVE_ASSET_RESOLUTION_EVIDENCE', evidence.evidenceClass);
add('final representative evidence has no blockers', Array.isArray(evidence.blockers) && evidence.blockers.length === 0, evidence.blockers ?? null);

for (const key of [
  'representativeExpected',
  'representativeResolved',
  'staticAuthoritativeUnityPathResolved',
  'spineAuthoritativePathResolved',
  'modelResourceIdsExpected',
  'modelResourceIdsMappedToPrefabPath',
  'modelResourceIdsAuthoritativeAssetEntryResolved',
  'pendingRepresentativeRecords'
]) {
  const expected = Number(contract.frozenExpected?.[key]);
  const actual = Number(evidence.coverage?.[key]);
  add(`evidence coverage ${key}`, actual === expected, { expected, actual });
}

const evidenceRecords = Array.isArray(evidence.records) ? evidence.records : [];
const evidenceIds = evidenceRecords.map(x => Number(x.canonicalKey)).sort((a,b) => a-b);
add('evidence representative IDs exact', JSON.stringify(evidenceIds) === JSON.stringify(expectedFixtureIds), { expected: expectedFixtureIds, actual: evidenceIds });

const fixtureById = new Map(fixtureRecords.map(x => [Number(x.skinId), x]));
let staticResolved = 0;
let spineResolved = 0;
let modelExpected = 0;
let modelResolved = 0;
for (const row of evidenceRecords) {
  const skinId = Number(row.canonicalKey);
  const fixture = fixtureById.get(skinId);
  add(`evidence ${skinId} has frozen fixture`, Boolean(fixture), Boolean(fixture));
  if (!fixture) continue;

  const staticOk = row.static?.authoritativeUnityPathResolved === true && row.static?.frozenLocator === fixture.static?.sourceImagePath;
  add(`evidence ${skinId} static authoritative locator exact`, staticOk, {
    expected: fixture.static?.sourceImagePath ?? null,
    actual: row.static?.frozenLocator ?? null,
    resolved: row.static?.authoritativeUnityPathResolved ?? null
  });
  if (staticOk) staticResolved += 1;

  const spineOk = row.spine?.authoritativeUnityPathResolved === true && row.spine?.frozenLocator === fixture.spine?.sourceSpinePath;
  add(`evidence ${skinId} char Spine authoritative locator exact`, spineOk, {
    expected: fixture.spine?.sourceSpinePath ?? null,
    actual: row.spine?.frozenLocator ?? null,
    resolved: row.spine?.authoritativeUnityPathResolved ?? null
  });
  if (spineOk) spineResolved += 1;

  const expectedModelIds = (fixture.modelResourceIds ?? []).map(Number).sort((a,b) => a-b);
  const modelRows = Array.isArray(row.modelResources) ? row.modelResources : [];
  const actualModelIds = modelRows.map(x => Number(x.skinResourceId)).sort((a,b) => a-b);
  add(`evidence ${skinId} model resource IDs exact`, JSON.stringify(actualModelIds) === JSON.stringify(expectedModelIds), {
    expected: expectedModelIds,
    actual: actualModelIds
  });
  modelExpected += expectedModelIds.length;
  for (const model of modelRows) {
    const ok = model.authoritativeBundleEntryResolved === true && typeof model.prefabPath === 'string' && model.prefabPath.startsWith('Spine/General/') && model.prefabPath.endsWith('.prefab');
    add(`evidence ${skinId}/${Number(model.skinResourceId)} model Prefab authoritative`, ok, {
      prefabPath: model.prefabPath ?? null,
      resolved: model.authoritativeBundleEntryResolved ?? null
    });
    if (ok) modelResolved += 1;
  }

  add(`evidence ${skinId} normalized RESOLVED`, row.normalizedResolutionClass === 'RESOLVED', row.normalizedResolutionClass);
}

add('computed representative static resolved 3', staticResolved === Number(contract.frozenExpected?.staticAuthoritativeUnityPathResolved), staticResolved);
add('computed representative Spine resolved 3', spineResolved === Number(contract.frozenExpected?.spineAuthoritativePathResolved), spineResolved);
add('computed representative model expected 7', modelExpected === Number(contract.frozenExpected?.modelResourceIdsExpected), modelExpected);
add('computed representative model resolved 7', modelResolved === Number(contract.frozenExpected?.modelResourceIdsAuthoritativeAssetEntryResolved), modelResolved);

const policy = evidence.resolutionPolicy ?? {};
add('frozen locator reuse enforced', policy.reuseFrozenLocators === true, policy.reuseFrozenLocators);
add('frozen model IDs reused', policy.reuseFrozenModelBindingIds === true, policy.reuseFrozenModelBindingIds);
add('ownership not recomputed', policy.ownershipRecomputed === false, policy.ownershipRecomputed);
add('sourceOrder not recomputed', policy.sourceOrderRecomputed === false, policy.sourceOrderRecomputed);
add('fuzzy matching disabled', policy.fuzzyMatching === false, policy.fuzzyMatching);
add('numeric ID arithmetic disabled', policy.numericIdArithmetic === false, policy.numericIdArithmetic);
add('cross-root fallback disabled', policy.crossRootFallback === false, policy.crossRootFallback);

add('Stage 3-3 handoff allowed', contract.stage33Handoff?.allowed === true, contract.stage33Handoff?.allowed);
const targetCounts = contract.stage33Handoff?.requiredTargetCounts ?? {};
add('Stage 3-3 target arithmetic 1869', Number(targetCounts.static) + Number(targetCounts.charSpine) + Number(targetCounts.modelPrimaryPrefab) === Number(targetCounts.total) && Number(targetCounts.total) === 1869, targetCounts);
add('representative completion does not claim bulk completion', typeof contract.completionPolicy?.bulkClaim === 'string' && contract.completionPolicy.bulkClaim.includes('does not claim'), contract.completionPolicy?.bulkClaim ?? null);

const pass = failures.length === 0;
const result = {
  version: 2,
  stage: 'skin-page-3',
  substage: '3-2',
  checkpoint: 'representative-asset-resolution-proof-final-v2',
  status: pass ? 'PASS' : 'FAIL',
  completion: pass ? contract.completionPolicy.completion : null,
  freezeState: pass ? contract.completionPolicy.freezeState : null,
  downstreamGate: pass ? contract.completionPolicy.downstreamGate : 'BLOCKED',
  legacyReadiness: {
    path: LEGACY_READINESS,
    status: legacyReadiness.status,
    authority: contract.supersession.historicalAuthority
  },
  evidence: {
    path: EVIDENCE,
    status: evidence.status,
    representativeResolved: evidence.coverage?.representativeResolved ?? null,
    blockers: evidence.blockers ?? null
  },
  stage33Handoff: contract.stage33Handoff,
  metrics: {
    checkCount: checks.length,
    passedCheckCount: checks.filter(x => x.pass).length,
    failedCheckCount: failures.length,
    representativeSkinCount: evidenceRecords.length,
    representativeStaticResolved: staticResolved,
    representativeSpineResolved: spineResolved,
    representativeModelResourceExpected: modelExpected,
    representativeModelResourceResolved: modelResolved
  },
  checks,
  failures,
  conclusion: pass
    ? 'Skin Stage 3-2 representative authoritative asset resolution is complete and frozen. The historical READY_FOR_ASSET_EVIDENCE checkpoint is retained only as pre-evidence history. Stage 3-3 bulk resolution is allowed without reopening Skin identity, ownership, or sourceOrder.'
    : 'Skin Stage 3-2 v2 completion contract failed validation.'
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!pass) process.exitCode = 1;
