import fs from 'node:fs';
import crypto from 'node:crypto';

const CONTRACT_PATH = 'data/contracts/skin-stage3-0-input-contract.v1.json';
const SUMMARY_PATH = 'data/validation/skin-stage3-0-input-summary.v1.json';

const loadBuffer = path => fs.readFileSync(path);
const loadText = path => loadBuffer(path).toString('utf8');
const load = path => JSON.parse(loadText(path));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const gitBlobSha = buffer => {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
};

const contract = load(CONTRACT_PATH);
const expected = contract.canonicalExpectations;
const checks = [];
const failures = [];

const addCheck = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push({ name, detail });
};

const inputs = {};
for (const [name, spec] of Object.entries(contract.inputs)) {
  const buffer = loadBuffer(spec.path);
  inputs[name] = {
    spec,
    data: JSON.parse(buffer.toString('utf8')),
    gitBlobSha: gitBlobSha(buffer)
  };
  addCheck(`${name} frozen blob SHA`, inputs[name].gitBlobSha === spec.gitBlobSha, inputs[name].gitBlobSha);
}

const sourceMetadata = inputs.sourceMetadata.data;
const stage13 = inputs.stage1SourceMetadataValidation.data;
const stage1Final = inputs.stage1Final.data;
const relation = inputs.relation.data;
const stage2Final = inputs.stage2Final.data;

addCheck('contract accepted', contract.status === 'ACCEPTED', contract.status);
addCheck('contract substage 3-0', contract.substage === '3-0', contract.substage);

addCheck('Stage 1-3 PASS', stage13.status === 'PASS', stage13.status);
addCheck('Stage 1-3 completion', stage13.completion === 'SKIN_STAGE1_3_COMPLETE', stage13.completion);
addCheck('Stage 1 final PASS', stage1Final.status === 'PASS', stage1Final.status);
addCheck('Stage 1 complete', stage1Final.completion === 'SKIN_STAGE1_COMPLETE', stage1Final.completion);
addCheck('Stage 2 final PASS', stage2Final.status === 'PASS', stage2Final.status);
addCheck('Stage 2 complete', stage2Final.completion === 'SKIN_STAGE2_COMPLETE', stage2Final.completion);

const records = sourceMetadata.records;
addCheck('source metadata GENERATED', sourceMetadata.status === 'GENERATED', sourceMetadata.status);
addCheck('source metadata recordCount 540', Number(sourceMetadata.recordCount) === expected.sourceMetadataRecordCount, sourceMetadata.recordCount);
addCheck('source metadata records array', Array.isArray(records), Array.isArray(records) ? records.length : null);
addCheck('source metadata actual record count 540', Array.isArray(records) && records.length === expected.sourceMetadataRecordCount, Array.isArray(records) ? records.length : null);

const requiredFields = inputs.sourceMetadata.spec.requiredFields;
const invalidRequired = [];
const invalidIdentity = [];
const invalidClass = [];
const invalidPopulation = [];
const missingStatic = [];
const missingSpine = [];
const missingModelBinding = [];
const skinIds = [];
let modelBindingTotal = 0;
const modelResourceIds = new Set();

for (const row of records ?? []) {
  const id = Number(row.skinId);
  skinIds.push(id);

  for (const field of requiredFields) {
    if (!hasOwn(row, field)) invalidRequired.push({ skinId: row.skinId ?? null, field });
  }

  if (!Number.isFinite(id) || !Number.isFinite(Number(row.heroId)) || !Number.isFinite(Number(row.sourceOrder))) {
    invalidIdentity.push(row.skinId ?? null);
  }
  if (row.sourceClass !== 'REGULAR_HERO_SKIN') invalidClass.push(id);
  if (row.populationStatus !== 'CANONICAL') invalidPopulation.push(id);

  const image = row.artworkSource?.sourceImagePath;
  const spine = row.artworkSource?.sourceSpinePath;
  if (typeof image !== 'string' || image.length === 0) missingStatic.push(id);
  if (typeof spine !== 'string' || spine.length === 0) missingSpine.push(id);

  const bindings = row.heroSkinSource?.modelBindings;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    missingModelBinding.push(id);
  } else {
    modelBindingTotal += bindings.length;
    for (const binding of bindings) {
      const resourceId = Number(binding?.skinResourceId);
      if (Number.isFinite(resourceId)) modelResourceIds.add(resourceId);
    }
  }
}

const distinctSkinIds = new Set(skinIds);
addCheck('distinct source skinId 540', distinctSkinIds.size === expected.canonicalSkinCount, distinctSkinIds.size);
addCheck('required source fields complete', invalidRequired.length === 0, invalidRequired.length);
addCheck('source identity fields valid', invalidIdentity.length === 0, invalidIdentity.length);
addCheck('sourceClass regular-only', invalidClass.length === 0, invalidClass.length);
addCheck('populationStatus canonical-only', invalidPopulation.length === 0, invalidPopulation.length);
addCheck('static artwork locator coverage 540', (records?.length ?? 0) - missingStatic.length === expected.staticArtworkLocatorCoverage, (records?.length ?? 0) - missingStatic.length);
addCheck('Spine locator coverage 540', (records?.length ?? 0) - missingSpine.length === expected.spineLocatorCoverage, (records?.length ?? 0) - missingSpine.length);
addCheck('model binding skin coverage 540', (records?.length ?? 0) - missingModelBinding.length === expected.modelBindingSkinCount, (records?.length ?? 0) - missingModelBinding.length);
addCheck('model binding edge count 2277', modelBindingTotal === expected.modelBindingTotalCount, modelBindingTotal);
addCheck('unique model resource ID count 789', modelResourceIds.size === expected.uniqueModelSkinResourceIdCount, modelResourceIds.size);

addCheck('Stage 1-3 critical failures zero', Number(stage13.metrics?.criticalFailureCount) === 0, stage13.metrics?.criticalFailureCount);
addCheck('Stage 1-3 binding edge count 2277', Number(stage13.metrics?.modelBindingTotalCount) === expected.modelBindingTotalCount, stage13.metrics?.modelBindingTotalCount);
addCheck('Stage 1-3 unique model resource count 789', Number(stage13.metrics?.uniqueModelSkinResourceIdCount) === expected.uniqueModelSkinResourceIdCount, stage13.metrics?.uniqueModelSkinResourceIdCount);
addCheck('Stage 1 final canonical count 540', Number(stage1Final.summary?.canonicalSkinCount) === expected.canonicalSkinCount, stage1Final.summary?.canonicalSkinCount);
addCheck('Stage 1 final hard blockers zero', Number(stage1Final.summary?.hardBlockingIssueCount) === 0, stage1Final.summary?.hardBlockingIssueCount);

addCheck('relation ACCEPTED', relation.status === 'ACCEPTED', relation.status);
addCheck('relation completion 2-3', relation.completion === 'SKIN_STAGE2_3_COMPLETE', relation.completion);
addCheck('Skin->Hero EXACTLY_ONE', relation.cardinality?.skinToHero === 'EXACTLY_ONE', relation.cardinality?.skinToHero);
addCheck('Hero->Skin ZERO_OR_MANY', relation.cardinality?.heroToSkin === 'ZERO_OR_MANY', relation.cardinality?.heroToSkin);
addCheck('relation metadata bySkinId 540', Number(relation.counts?.bySkinId) === expected.canonicalSkinCount, relation.counts?.bySkinId);
addCheck('relation metadata byHeroId 267', Number(relation.counts?.byHeroId) === expected.canonicalHeroCount, relation.counts?.byHeroId);
addCheck('relation metadata edge 540', Number(relation.counts?.edgeCount) === expected.relationEdgeCount, relation.counts?.edgeCount);

const bySkinId = relation.bySkinId ?? {};
const byHeroId = relation.byHeroId ?? {};
const relationSkinIds = Object.keys(bySkinId).map(Number);
const heroIds = Object.keys(byHeroId).map(Number);
const reverseSkinIds = Object.values(byHeroId).flat().map(Number);
const reverseDistinct = new Set(reverseSkinIds);
const zeroSkinHeroes = Object.values(byHeroId).filter(value => Array.isArray(value) && value.length === 0).length;

addCheck('actual bySkinId 540', relationSkinIds.length === expected.canonicalSkinCount, relationSkinIds.length);
addCheck('actual byHeroId 267', heroIds.length === expected.canonicalHeroCount, heroIds.length);
addCheck('actual reverse edge 540', reverseSkinIds.length === expected.relationEdgeCount, reverseSkinIds.length);
addCheck('zero-skin Hero 32', zeroSkinHeroes === expected.zeroSkinHeroCount, zeroSkinHeroes);
addCheck('distinct reverse skinId 540', reverseDistinct.size === expected.canonicalSkinCount, reverseDistinct.size);
addCheck('duplicate reverse skinId zero', reverseSkinIds.length === reverseDistinct.size, reverseSkinIds.length - reverseDistinct.size);

const sourceIdSet = new Set(skinIds);
const relationIdSet = new Set(relationSkinIds);
const missingRelationSkinIds = [...sourceIdSet].filter(id => !relationIdSet.has(id));
const extraRelationSkinIds = [...relationIdSet].filter(id => !sourceIdSet.has(id));
const ownerMismatchSkinIds = [];
const sourceOrderMismatchSkinIds = [];

for (const row of records ?? []) {
  const rel = bySkinId[String(row.skinId)];
  if (!rel) continue;
  if (Number(rel.heroId) !== Number(row.heroId)) ownerMismatchSkinIds.push(Number(row.skinId));
  if (Number(rel.sourceOrder) !== Number(row.sourceOrder)) sourceOrderMismatchSkinIds.push(Number(row.skinId));
}

addCheck('source metadata and relation skin set exact', missingRelationSkinIds.length === 0 && extraRelationSkinIds.length === 0, {
  missing: missingRelationSkinIds.length,
  extra: extraRelationSkinIds.length
});
addCheck('owner parity exact', ownerMismatchSkinIds.length === 0, ownerMismatchSkinIds.length);
addCheck('sourceOrder parity exact', sourceOrderMismatchSkinIds.length === 0, sourceOrderMismatchSkinIds.length);

addCheck('Stage 2 final failed checks zero', Number(stage2Final.metrics?.failedCheckCount) === 0, stage2Final.metrics?.failedCheckCount);
addCheck('Stage 2 final bySkinId 540', Number(stage2Final.metrics?.bySkinIdCount) === expected.canonicalSkinCount, stage2Final.metrics?.bySkinIdCount);
addCheck('Stage 2 final byHeroId 267', Number(stage2Final.metrics?.byHeroIdCount) === expected.canonicalHeroCount, stage2Final.metrics?.byHeroIdCount);
addCheck('Stage 2 final edge 540', Number(stage2Final.metrics?.reverseEdgeCount) === expected.relationEdgeCount, stage2Final.metrics?.reverseEdgeCount);
addCheck('Stage 2 owner mismatch zero', stage2Final.checks?.stage24OwnerMismatchZero === true, stage2Final.checks?.stage24OwnerMismatchZero);
addCheck('Stage 2 sourceOrder mismatch zero', stage2Final.checks?.stage24SourceOrderMismatchZero === true, stage2Final.checks?.stage24SourceOrderMismatchZero);

const status = failures.length === 0 ? 'PASS' : 'FAIL';
const summary = {
  version: 1,
  stage: 'skin-page-3',
  substage: '3-0',
  checkpoint: 'stage3-input-freeze',
  status,
  completion: status === 'PASS' ? 'SKIN_STAGE3_0_COMPLETE' : null,
  purpose: contract.purpose,
  metrics: {
    checkCount: checks.length,
    passedCheckCount: checks.filter(row => row.pass).length,
    failedCheckCount: failures.length,
    canonicalSkinCount: distinctSkinIds.size,
    canonicalHeroCount: heroIds.length,
    sourceMetadataRecordCount: records?.length ?? 0,
    staticArtworkLocatorCoverage: (records?.length ?? 0) - missingStatic.length,
    spineLocatorCoverage: (records?.length ?? 0) - missingSpine.length,
    modelBindingSkinCount: (records?.length ?? 0) - missingModelBinding.length,
    modelBindingTotalCount: modelBindingTotal,
    uniqueModelSkinResourceIdCount: modelResourceIds.size,
    relationEdgeCount: reverseSkinIds.length,
    zeroSkinHeroCount: zeroSkinHeroes,
    ownerMismatchCount: ownerMismatchSkinIds.length,
    sourceOrderMismatchCount: sourceOrderMismatchSkinIds.length,
    missingRelationSkinCount: missingRelationSkinIds.length,
    extraRelationSkinCount: extraRelationSkinIds.length
  },
  frozenInputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [
    name,
    {
      path: input.spec.path,
      role: input.spec.role,
      gitBlobSha: input.gitBlobSha
    }
  ])),
  authority: contract.authority,
  policy: {
    rawConfigDataRelationRediscoveryAllowed: false,
    canonicalPopulationRecomputationAllowed: false,
    assetExistenceMayDefineReleaseStatus: false,
    filenameOrPathMayDefineOwnership: false,
    nextStage: 'Skin Stage 3-1 asset locator/resource inventory'
  },
  checks,
  failures: {
    failedChecks: failures,
    invalidRequired,
    invalidIdentity,
    invalidClass,
    invalidPopulation,
    missingStatic,
    missingSpine,
    missingModelBinding,
    missingRelationSkinIds,
    extraRelationSkinIds,
    ownerMismatchSkinIds,
    sourceOrderMismatchSkinIds
  }
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (status !== 'PASS') process.exitCode = 1;
