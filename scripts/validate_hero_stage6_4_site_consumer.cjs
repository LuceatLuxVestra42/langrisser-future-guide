'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-stage6-4-site-consumer.v1.json',
  manifest: 'data/generated/hero-detail.v1.json',
  shared: 'data/generated/hero-detail-shared.v1.json',
  stage63: 'data/validation/hero-stage6-3-final.v1.json',
  stageBFinal: 'data/validation/hero-exclusive-equipment-relation-stageB-final.v1.json',
  stageBAdmission: 'data/generated/hero-exclusive-equipment-consumer-admission.v1.json',
  byHero: 'data/generated/hero-exclusive-equipment-by-hero.v1.json',
  byEquipment: 'data/generated/hero-exclusive-equipment-by-equipment.v1.json',
  equipmentMetadata: 'data/generated/equipment_stage3_5_exclusive_consumer.json',
  validation: 'data/validation/hero-stage6-4-final.v1.json',
  checkpointJson: 'data/checkpoints/hero-stage6-4-site-consumer.json',
  checkpointMd: 'data/checkpoints/hero-stage6-4-site-consumer.md',
};

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const writeJson = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};
const writeText = (rel, text) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), text.endsWith('\n') ? text : text + '\n');
};
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const blobSha = rel => {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const contract = read(P.contract);
const manifest = read(P.manifest);
const sharedBuffer = fs.readFileSync(abs(P.shared));
const shared = JSON.parse(sharedBuffer.toString('utf8'));
const stage63 = read(P.stage63);
const stageBFinal = read(P.stageBFinal);
const stageBAdmission = read(P.stageBAdmission);
const byHero = read(P.byHero);
const byEquipment = read(P.byEquipment);
const equipmentMetadata = read(P.equipmentMetadata);

const hardErrors = [];
const checks = [];
const check = (name, pass, detail = null) => {
  const row = { name, pass: Boolean(pass) };
  if (detail !== null) row.detail = detail;
  checks.push(row);
  if (!row.pass) hardErrors.push(`${name}${detail ? `: ${detail}` : ''}`);
};

check('contract-frozen',
  contract?.version === 1 && contract?.stage === 'hero-page-6-4' && contract?.status === 'FROZEN',
  `${contract?.version}/${contract?.stage}/${contract?.status}`);

check('stage6-3-complete',
  stage63?.completion === 'COMPLETE' &&
  stage63?.summary?.canonicalHeroCount === 267 &&
  stage63?.summary?.generatedHeroCount === 267 &&
  stage63?.summary?.structuralFailCount === 0 &&
  stage63?.summary?.siteUsableCount === 267 &&
  stage63?.summary?.hardErrorCount === 0,
  JSON.stringify({
    completion: stage63?.completion,
    canonical: stage63?.summary?.canonicalHeroCount,
    generated: stage63?.summary?.generatedHeroCount,
    structuralFail: stage63?.summary?.structuralFailCount,
    siteUsable: stage63?.summary?.siteUsableCount,
    hard: stage63?.summary?.hardErrorCount,
  }));

check('stage-b-final-closed',
  stageBFinal?.stage === 'B-FINAL' &&
  stageBFinal?.status === 'PASS_ACCEPTED' &&
  stageBFinal?.closureDecision?.stageBClosed === true &&
  stageBFinal?.validationSummary?.hardErrors === 0,
  `${stageBFinal?.stage}/${stageBFinal?.status}/closed=${stageBFinal?.closureDecision?.stageBClosed}/hard=${stageBFinal?.validationSummary?.hardErrors}`);

check('stage-b-consumer-admitted',
  stageBAdmission?.stage === 'B-6' &&
  stageBAdmission?.status === 'COMPLETE' &&
  stageBAdmission?.summary?.heroCount === 267 &&
  stageBAdmission?.summary?.heroOwnershipKeys === 167 &&
  stageBAdmission?.summary?.heroesWithoutExclusiveKey === 100 &&
  stageBAdmission?.summary?.ownershipPairCount === 167 &&
  stageBAdmission?.summary?.hardErrorCount === 0,
  JSON.stringify(stageBAdmission?.summary || null));

check('manifest-stage6-3',
  manifest?.stage === 'hero-page-6-3' &&
  manifest?.completion === 'COMPLETE' &&
  manifest?.storage?.mode === 'SHARDED_BY_HERO' &&
  manifest?.storage?.recordCount === 267,
  `${manifest?.stage}/${manifest?.completion}/${manifest?.storage?.mode}/records=${manifest?.storage?.recordCount}`);

const manifestIndex = manifest?.storage?.byHeroId || {};
const manifestHeroIds = Object.keys(manifestIndex).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
check('manifest-267-unique-hero-keys',
  manifestHeroIds.length === 267 && new Set(manifestHeroIds).size === 267,
  `keys=${manifestHeroIds.length}`);

const actualSharedSha = sha256(sharedBuffer);
check('shared-payload-integrity',
  actualSharedSha === manifest?.storage?.sharedSha256,
  `expected=${manifest?.storage?.sharedSha256 || null}, actual=${actualSharedSha}`);
check('shared-soldier-metadata-present',
  shared?.soldiersById && typeof shared.soldiersById === 'object' && !Array.isArray(shared.soldiersById),
  `count=${Object.keys(shared?.soldiersById || {}).length}`);

const byHeroMap = byHero?.byHeroId || {};
const byEquipmentMap = byEquipment?.byEquipmentId || {};
const heroKeys = Object.keys(byHeroMap);
const equipmentKeys = Object.keys(byEquipmentMap);

check('b-byhero-cardinality',
  byHero?.summary?.keyCount === 167 &&
  byHero?.summary?.relationCount === 167 &&
  byHero?.summary?.canonicalHeroesWithoutKey === 100 &&
  heroKeys.length === 167,
  `summary=${JSON.stringify(byHero?.summary || null)}, keys=${heroKeys.length}`);

check('b-byequipment-cardinality',
  byEquipment?.summary?.keyCount === 167 &&
  byEquipment?.summary?.relationCount === 167 &&
  equipmentKeys.length === 167,
  `summary=${JSON.stringify(byEquipment?.summary || null)}, keys=${equipmentKeys.length}`);

let crossIndexMismatchCount = 0;
for (const [heroKey, values] of Object.entries(byHeroMap)) {
  if (!Array.isArray(values) || values.length !== 1) {
    crossIndexMismatchCount += 1;
    continue;
  }
  const equipmentId = Number(values[0]);
  const inverse = byEquipmentMap[String(equipmentId)];
  if (!Array.isArray(inverse) || inverse.length !== 1 || Number(inverse[0]) !== Number(heroKey)) {
    crossIndexMismatchCount += 1;
  }
}
for (const [equipmentKey, values] of Object.entries(byEquipmentMap)) {
  if (!Array.isArray(values) || values.length !== 1) {
    crossIndexMismatchCount += 1;
    continue;
  }
  const heroId = Number(values[0]);
  const inverse = byHeroMap[String(heroId)];
  if (!Array.isArray(inverse) || inverse.length !== 1 || Number(inverse[0]) !== Number(equipmentKey)) {
    crossIndexMismatchCount += 1;
  }
}
check('b-index-roundtrip', crossIndexMismatchCount === 0, `mismatch=${crossIndexMismatchCount}`);

const equipmentDetailRows = Array.isArray(equipmentMetadata?.detailRecords)
  ? equipmentMetadata.detailRecords
  : (Array.isArray(equipmentMetadata?.records) ? equipmentMetadata.records : []);
const equipmentListRows = Array.isArray(equipmentMetadata?.listRecords)
  ? equipmentMetadata.listRecords
  : [];
const equipmentMetaIds = new Set(equipmentDetailRows.map(row => Number(row?.equipmentId)).filter(Number.isInteger));
const equipmentListIds = new Set(equipmentListRows.map(row => Number(row?.equipmentId)).filter(Number.isInteger));
let equipmentMetadataMissingCount = 0;
for (const equipmentKey of equipmentKeys) {
  const equipmentId = Number(equipmentKey);
  if (!equipmentMetaIds.has(equipmentId)) equipmentMetadataMissingCount += 1;
}
check('exclusive-equipment-metadata-coverage',
  equipmentDetailRows.length === 167 &&
  equipmentListRows.length === 167 &&
  equipmentMetaIds.size === 167 &&
  equipmentListIds.size === 167 &&
  equipmentMetadataMissingCount === 0,
  `detail=${equipmentDetailRows.length}, list=${equipmentListRows.length}, detailUnique=${equipmentMetaIds.size}, missing=${equipmentMetadataMissingCount}`);

let shardMissingCount = 0;
let shardIntegrityMismatchCount = 0;
let shardHeroIdMismatchCount = 0;
let shardStructuralMismatchCount = 0;
let exclusiveSnapshotMismatchCount = 0;
let soldierMetadataMissingRefCount = 0;
let releasedExclusiveHeroCount = 0;
let absentExclusiveHeroCount = 0;
let spReleasedCount = 0;
let spNotReleasedCount = 0;
let totalShardBytes = 0;
const failedHeroIds = [];

for (const heroId of manifestHeroIds) {
  const locator = manifestIndex[String(heroId)];
  const heroFailures = [];
  if (!locator?.path || !fs.existsSync(abs(locator.path))) {
    shardMissingCount += 1;
    failedHeroIds.push(heroId);
    continue;
  }

  const buffer = fs.readFileSync(abs(locator.path));
  totalShardBytes += buffer.length;
  const actualHash = sha256(buffer);
  if (actualHash !== locator.sha256 || buffer.length !== locator.byteLength) {
    shardIntegrityMismatchCount += 1;
    heroFailures.push('SHARD_INTEGRITY');
  }

  let shard;
  try {
    shard = JSON.parse(buffer.toString('utf8'));
  } catch {
    shardIntegrityMismatchCount += 1;
    failedHeroIds.push(heroId);
    continue;
  }

  if (Number(shard?.heroId) !== heroId) {
    shardHeroIdMismatchCount += 1;
    heroFailures.push('HERO_ID_MISMATCH');
  }
  if (shard?.validation?.structuralStatus !== 'PASS' || shard?.validation?.siteUsable !== true) {
    shardStructuralMismatchCount += 1;
    heroFailures.push('STRUCTURAL_OR_SITE_USABLE');
  }

  const expectedEquipmentValues = byHeroMap[String(heroId)] || [];
  const expectedEquipmentId = expectedEquipmentValues.length === 1 ? Number(expectedEquipmentValues[0]) : null;
  const embeddedStatus = shard?.exclusiveEquipment?.status;
  const embeddedRawId = Number(shard?.exclusiveEquipment?.equipmentId);
  const embeddedEquipmentId = embeddedStatus === 'RELEASED' && Number.isInteger(embeddedRawId) && embeddedRawId > 0
    ? embeddedRawId : null;

  if (expectedEquipmentId !== embeddedEquipmentId) {
    exclusiveSnapshotMismatchCount += 1;
    heroFailures.push('EXCLUSIVE_B_PARITY');
  }
  if (expectedEquipmentId === null) absentExclusiveHeroCount += 1;
  else releasedExclusiveHeroCount += 1;

  if (shard?.sp?.status === 'RELEASED') spReleasedCount += 1;
  else if (shard?.sp?.status === 'NOT_RELEASED') spNotReleasedCount += 1;

  for (const soldierIdValue of Array.isArray(shard?.soldiers?.ids) ? shard.soldiers.ids : []) {
    const soldierId = Number(soldierIdValue);
    if (!Object.prototype.hasOwnProperty.call(shared?.soldiersById || {}, String(soldierId))) {
      soldierMetadataMissingRefCount += 1;
      heroFailures.push(`SOLDIER_METADATA_${soldierId}`);
    }
  }

  if (heroFailures.length) failedHeroIds.push(heroId);
}

check('all-shards-present', shardMissingCount === 0, `missing=${shardMissingCount}`);
check('all-shards-integrity-pass',
  shardIntegrityMismatchCount === 0 && shardHeroIdMismatchCount === 0,
  `hashOrSize=${shardIntegrityMismatchCount}, heroId=${shardHeroIdMismatchCount}`);
check('all-shards-site-usable', shardStructuralMismatchCount === 0, `mismatch=${shardStructuralMismatchCount}`);
check('all-soldier-metadata-resolves', soldierMetadataMissingRefCount === 0, `missingRefs=${soldierMetadataMissingRefCount}`);
check('exclusive-b-adoption-parity',
  exclusiveSnapshotMismatchCount === 0 && releasedExclusiveHeroCount === 167 && absentExclusiveHeroCount === 100,
  `mismatch=${exclusiveSnapshotMismatchCount}, released=${releasedExclusiveHeroCount}, absent=${absentExclusiveHeroCount}`);
check('sp-population-preserved',
  spReleasedCount === 25 && spNotReleasedCount === 242,
  `released=${spReleasedCount}, notReleased=${spNotReleasedCount}`);
check('total-shard-bytes-preserved',
  totalShardBytes === manifest?.storage?.totalShardBytes,
  `expected=${manifest?.storage?.totalShardBytes}, actual=${totalShardBytes}`);

const forbiddenProductionPathPrefixes = [
  'data/configdata/',
  'data/generated/hero-basic-combat',
  'data/generated/hero-page-stage5-',
  'data/generated/hero-detail-stage6-1',
];
const productionPathStrings = JSON.stringify(contract?.productionInputs || {});
const forbiddenProductionInputMatches = forbiddenProductionPathPrefixes.filter(prefix => productionPathStrings.includes(prefix));
check('production-input-boundary', forbiddenProductionInputMatches.length === 0, JSON.stringify(forbiddenProductionInputMatches));

const summary = {
  canonicalHeroCount: manifestHeroIds.length,
  heroShardCount: manifestHeroIds.length - shardMissingCount,
  shardMissingCount,
  shardIntegrityMismatchCount,
  shardHeroIdMismatchCount,
  shardStructuralMismatchCount,
  siteUsableHeroCount: 267 - shardStructuralMismatchCount - shardMissingCount,
  sharedSoldierMetadataCount: Object.keys(shared?.soldiersById || {}).length,
  soldierMetadataMissingRefCount,
  stageBStatus: stageBFinal?.status || null,
  stageBClosed: stageBFinal?.closureDecision?.stageBClosed === true,
  exclusiveOwnershipRelationCount: byHero?.summary?.relationCount ?? null,
  heroesWithExclusive: releasedExclusiveHeroCount,
  heroesWithoutExclusive: absentExclusiveHeroCount,
  crossIndexMismatchCount,
  equipmentMetadataMissingCount,
  exclusiveSnapshotMismatchCount,
  spReleasedCount,
  spNotReleasedCount,
  productionBoundaryViolationCount: forbiddenProductionInputMatches.length,
  hardErrorCount: hardErrors.length,
};

const status = hardErrors.length === 0 ? 'PASS_WITH_REVIEW' : 'FAIL';
const completion = hardErrors.length === 0 ? 'COMPLETE' : 'BLOCKED';
const heroDataPipelineStatus = hardErrors.length === 0 ? 'FINAL_FROZEN' : 'NOT_FROZEN';

const nonBlockingReviews = [
  {
    owner: 'Hero Stage 6-3 publication metadata',
    issue: 'Hero records may retain presentation-only REVIEW (Soldier Korean names, CV/faction/origin/skin localization, source asset delivery).',
    blockingStage64Completion: false,
  },
  {
    owner: 'frontend/asset integration',
    issue: 'Source asset paths still require web-delivery conversion and final responsive rendering. This is outside Hero semantic-data Stage 6.',
    blockingStage64Completion: false,
  },
];

const sourcePaths = [P.contract, P.manifest, P.shared, P.stage63, P.stageBFinal, P.stageBAdmission, P.byHero, P.byEquipment, P.equipmentMetadata];
const sources = Object.fromEntries(sourcePaths.map(rel => [rel, { gitBlobSha: blobSha(rel) }]));

const validation = {
  version: 1,
  stage: 'hero-page-6-4',
  checkpoint: 'site-consumer-contract-final-freeze',
  status,
  completion,
  heroDataPipelineStatus,
  contract: P.contract,
  sources,
  summary,
  checks,
  productionConsumerContract: {
    detailRoute: '/hero/$heroId',
    routeKey: 'heroId',
    heroDetailLookup: 'data/generated/hero-detail.v1.json#storage.byHeroId -> shard path',
    soldierMetadata: 'data/generated/hero-detail-shared.v1.json#soldiersById',
    exclusiveOwnership: 'data/generated/hero-exclusive-equipment-by-hero.v1.json#byHeroId',
    exclusiveMetadata: 'data/generated/equipment_stage3_5_exclusive_consumer.json#detailRecords',
    embeddedShardExclusiveBlockRole: 'PARITY_ONLY_MATERIALIZED_SNAPSHOT',
    configDataRuntimeReadsAdmitted: false,
    stage4Or5RuntimeReadsAdmitted: false,
    relationReDerivationAdmitted: false,
  },
  nonBlockingReviews,
  failedHeroIds: [...new Set(failedHeroIds)].sort((a, b) => a - b),
  hardErrors,
  decision: hardErrors.length === 0
    ? 'Hero Stage 6-4 COMPLETE. The 267 sharded Hero publication is the final Hero detail payload, Stage B byHero is the production exclusive-equipment ownership lookup, all shard/inverse-index/metadata parity checks pass, and the Hero semantic data pipeline is FINAL_FROZEN for frontend consumption.'
    : 'Hero Stage 6-4 BLOCKED. Fix the listed consumer-boundary or integrity failures before final Hero pipeline freeze.',
  nextStartPoint: hardErrors.length === 0
    ? 'Hero frontend/UI and web-asset integration. Consume the Stage 6-4 contract; do not reopen Stage 4/5 or Stage B semantics unless a new source snapshot or explicit contradiction requires the owning stage to reopen.'
    : 'Resolve Stage 6-4 validation failures, then rerun this exact consumer gate.',
};

writeJson(P.validation, validation);

const checkpoint = {
  stage: 'hero-page-6-4',
  status,
  completion,
  heroDataPipelineStatus,
  confirmed: {
    heroRouteKey: 'heroId',
    heroDetailManifest: P.manifest,
    heroShardPattern: 'data/generated/hero-detail/by-id/{heroId}.json',
    heroShardCount: summary.heroShardCount,
    heroSoldierMembership: 'frozen in each Hero shard; metadata resolves through hero-detail-shared.v1.json',
    exclusiveEquipmentOwnership: 'B-5 byHeroId',
    exclusiveEquipmentMetadata: P.equipmentMetadata,
    stageBFinal: `${summary.stageBStatus}/closed=${summary.stageBClosed}`,
  },
  completedScope: 'Stage 6-4 site consumer boundary, all 267 shard integrity/admission checks, Stage B byHero/byEquipment adoption parity, Equipment Stage 3-5 metadata coverage, and final Hero semantic-pipeline freeze.',
  reviews: nonBlockingReviews,
  nextStartPoint: validation.nextStartPoint,
};
writeJson(P.checkpointJson, checkpoint);

const md = `# Hero Stage 6-4 Site Consumer Checkpoint

- status: **${status}**
- completion: **${completion}**
- Hero data pipeline: **${heroDataPipelineStatus}**
- Hero shards: **${summary.heroShardCount}/267**
- site-usable Hero: **${summary.siteUsableHeroCount}/267**
- shard integrity mismatch: **${summary.shardIntegrityMismatchCount}**
- Stage B: **${summary.stageBStatus} / closed=${summary.stageBClosed}**
- exclusive ownership: **${summary.exclusiveOwnershipRelationCount}**
- Hero↔exclusive parity mismatch: **${summary.exclusiveSnapshotMismatchCount}**
- B cross-index mismatch: **${summary.crossIndexMismatchCount}**
- exclusive metadata missing: **${summary.equipmentMetadataMissingCount}**
- hard errors: **${summary.hardErrorCount}**

## Frozen consumer path

\`/hero/$heroId\`
→ \`hero-detail.v1.json#storage.byHeroId\`
→ one \`hero-detail/by-id/<heroId>.json\` shard

Soldier display:
\`shard.soldiers.ids\`
→ \`hero-detail-shared.v1.json#soldiersById\`

Exclusive Equipment:
\`heroId\`
→ \`hero-exclusive-equipment-by-hero.v1.json#byHeroId\`
→ \`equipmentId\`
→ \`equipment_stage3_5_exclusive_consumer.json#detailRecords\`

The embedded Hero-shard \`exclusiveEquipment\` block is parity-only materialized evidence after Stage 6-4 and is not the ownership authority.

## Forbidden runtime fallbacks

- ConfigData reads
- Stage 4 / Stage 5 producer reads
- Stage 6-1 locator reads
- direct SkillHero ownership re-derivation
- Hero-Soldier relation re-derivation
- heuristic ownership from names/icons/restrictions/order

## Next start point

${validation.nextStartPoint}
`;
writeText(P.checkpointMd, md);

console.log(JSON.stringify({
  status,
  completion,
  heroDataPipelineStatus,
  summary,
  hardErrors,
}, null, 2));

if (hardErrors.length) process.exitCode = 1;
