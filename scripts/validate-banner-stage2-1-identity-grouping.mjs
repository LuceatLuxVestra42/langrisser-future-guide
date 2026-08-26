import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const scheduleDoc = readJson('data/kr-banner-schedule.v1.json');
const effectiveDoc = readJson('data/generated/banner-stage2-0-effective-occurrences.v1.json');
const stage20 = readJson('data/validation/banner-stage2-0-input-summary.v1.json');
const policy = readJson('data/contracts/banner-stage2-1-identity-grouping-policy.v1.json');
const plan = readJson('data/generated/banner-stage2-1-grouping-plan.v1.json');

const schedule = scheduleDoc.records ?? [];
const overlay = new Map((effectiveDoc.correctionOverlay ?? []).map(x => [x.occurrenceRecordKey, x]));
const errors = [];
const reviews = [];

if (stage20.status !== 'PASS_STAGE2_0_INPUT_CONTRACT') errors.push('Stage 2-0 predecessor is not PASS');
if (schedule.length !== 94) errors.push(`schedule count ${schedule.length} != 94`);

const sourceByRecordKey = row => overlay.get(row.recordKey)?.effectiveValue ?? row.sourceRecordKey ?? null;
const occurrenceId = row => `bocc:${row.recordKey}`;
const groupKey = row => {
  const source = sourceByRecordKey(row);
  return source === null ? `manual-occurrence:${row.recordKey}` : `source:${source}`;
};
const definitionIdFromGroup = key => {
  const digest = crypto.createHash('sha256').update(`banner-definition:v1|${key}`).digest('hex').slice(0, 24);
  return `bdef:v1:${digest}`;
};

const recordByKey = new Map();
const occurrenceIds = new Set();
const groupToDefinitionId = new Map();
const definitionIdToGroup = new Map();
const groupToOccurrenceKeys = new Map();
let sourceLinkedOccurrenceCount = 0;
let sourceNullOccurrenceCount = 0;
let definitionIdCollisionCount = 0;

for (const row of schedule) {
  if (!row.recordKey) {
    errors.push('occurrence missing recordKey');
    continue;
  }
  if (recordByKey.has(row.recordKey)) errors.push(`duplicate recordKey ${row.recordKey}`);
  recordByKey.set(row.recordKey, row);

  const occId = occurrenceId(row);
  if (occurrenceIds.has(occId)) errors.push(`duplicate bannerOccurrenceId ${occId}`);
  occurrenceIds.add(occId);

  const source = sourceByRecordKey(row);
  if (source === null) sourceNullOccurrenceCount += 1;
  else sourceLinkedOccurrenceCount += 1;

  const key = groupKey(row);
  const defId = definitionIdFromGroup(key);
  groupToDefinitionId.set(key, defId);
  if (definitionIdToGroup.has(defId) && definitionIdToGroup.get(defId) !== key) {
    definitionIdCollisionCount += 1;
    errors.push(`definition ID collision ${defId}`);
  }
  definitionIdToGroup.set(defId, key);
  const list = groupToOccurrenceKeys.get(key) ?? [];
  list.push(row.recordKey);
  groupToOccurrenceKeys.set(key, list);
}

for (const fixture of plan.fixtures ?? []) {
  const rows = fixture.occurrenceRecordKeys.map(k => recordByKey.get(k));
  if (rows.some(x => !x)) {
    errors.push(`fixture occurrence missing for ${fixture.definitionGroupKey}`);
    continue;
  }
  const actualKeys = new Set(rows.map(groupKey));
  if (actualKeys.size !== 1 || !actualKeys.has(fixture.definitionGroupKey)) {
    errors.push(`fixture grouping mismatch ${fixture.definitionGroupKey}`);
  }
  const actualId = definitionIdFromGroup(fixture.definitionGroupKey);
  if (actualId !== fixture.bannerDefinitionId) errors.push(`fixture definition ID mismatch ${fixture.definitionGroupKey}`);
}

const corrected7001 = recordByKey.get('kr-banner:20270331:4');
if (!corrected7001) errors.push('7001 correction fixture missing');
else {
  if (corrected7001.sourceRecordKey !== 'cardpool:263') errors.push('7001 recorded source is not cardpool:263');
  if (sourceByRecordKey(corrected7001) !== 'cardpool:265') errors.push('7001 effective source is not cardpool:265');
  if (groupKey(corrected7001) !== 'source:cardpool:265') errors.push('7001 grouping did not consume correction');
}

const manualA = recordByKey.get('kr-manual-wish-langrisser-1-5-20260909');
const manualB = recordByKey.get('kr-manual-wish-langrisser-1-5-20270317');
if (!manualA || !manualB) errors.push('manual separation fixture missing');
else if (groupKey(manualA) === groupKey(manualB)) errors.push('source-null manual fixtures were merged');

const summary = {
  version: 1,
  stage: 'Banner Stage 2-1',
  status: errors.length === 0 ? 'PASS_STAGE2_1_IDENTITY_GROUPING' : 'FAIL_STAGE2_1_IDENTITY_GROUPING',
  sourceOccurrenceCount: schedule.length,
  sourceLinkedOccurrenceCount,
  sourceNullOccurrenceCount,
  uniqueBannerOccurrenceIdCount: occurrenceIds.size,
  distinctDefinitionGroupCount: groupToDefinitionId.size,
  uniqueBannerDefinitionIdCount: definitionIdToGroup.size,
  definitionIdCollisionCount,
  errorCount: errors.length,
  reviewCount: reviews.length,
  errors,
  reviews,
  invariants: {
    predecessorStage20Pass: stage20.status === 'PASS_STAGE2_0_INPUT_CONTRACT',
    occurrenceCoverage94: schedule.length === 94,
    occurrenceIdsUnique: occurrenceIds.size === schedule.length,
    everyOccurrenceExactlyOneGroup: groupToOccurrenceKeys.size > 0 && [...groupToOccurrenceKeys.values()].reduce((a, xs) => a + xs.length, 0) === schedule.length,
    definitionIdCollisionsAbsent: definitionIdCollisionCount === 0,
    corrected7001GroupsToCardpool265: corrected7001 ? groupKey(corrected7001) === 'source:cardpool:265' : false,
    sourceNullManualFixturesRemainSeparate: manualA && manualB ? groupKey(manualA) !== groupKey(manualB) : false,
    approvedCrossSourceEquivalenceCount: (plan.currentApprovedCrossSourceEquivalenceMappings ?? []).length,
    approvedManualDefinitionMappingCount: (plan.currentApprovedManualDefinitionMappings ?? []).length,
    finalDefinitionsNotMaterializedInStage21: true
  },
  nextStageReady: errors.length === 0,
  nextStartPoint: 'Banner Stage 2-2 canonical bannerDefinition materialization'
};

const out = path.join(ROOT, 'data/validation/banner-stage2-1-summary.v1.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
console.log(`${summary.status}: groups=${summary.distinctDefinitionGroupCount}, errors=${summary.errorCount}`);
if (errors.length) process.exitCode = 1;
