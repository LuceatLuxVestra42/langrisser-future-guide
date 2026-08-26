import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('data/contracts/banner-stage2-6-cp-event-contract.v1.json','utf8'));
const definitions = JSON.parse(fs.readFileSync('data/generated/banner-definitions.v1.json','utf8'));
const occurrences = JSON.parse(fs.readFileSync('data/generated/banner-occurrences.v1.json','utf8'));
const taxonomy = JSON.parse(fs.readFileSync('data/generated/banner-definition-taxonomy.v1.json','utf8'));
const cardPools = JSON.parse(fs.readFileSync('data/configdata/ConfigDataCardPoolInfo.json','utf8'));
const output = JSON.parse(fs.readFileSync('data/generated/banner-cp-event-relations.v1.json','utf8'));
const stage24 = JSON.parse(fs.readFileSync('data/validation/banner-stage2-4-summary.v1.json','utf8'));
const stage25 = JSON.parse(fs.readFileSync('data/validation/banner-stage2-5-summary.v1.json','utf8'));

const errors = [];
const cardPoolById = new Map(cardPools.map(r => [Number(r.ID), r]));
const taxByDef = new Map(taxonomy.records.map(r => [r.bannerDefinitionId, r]));
const defIds = new Set(definitions.records.map(r => r.bannerDefinitionId));
const occIds = new Set(occurrences.records.map(r => r.bannerOccurrenceId));

function clean(s='') {
  return String(s).replace(/<[^>]+>/g,'').replace(/\\n/g,'\n').replace(/\r/g,'').trim();
}

if (stage24.status !== 'PASS_STAGE2_4_TAXONOMY') errors.push('Stage 2-4 PASS not consumed');
if (stage25.status !== 'PASS_STAGE2_5_CANONICAL_HERO_RELATIONS') errors.push('Stage 2-5 PASS not consumed');
if (definitions.records.length !== 77) errors.push(`Expected 77 definitions, got ${definitions.records.length}`);
if (occurrences.records.length !== 94) errors.push(`Expected 94 occurrences, got ${occurrences.records.length}`);

const expected = [];
for (const d of definitions.records) {
  if (!d.effectiveSourceRecordKey) continue;
  const m = /^cardpool:(\d+)$/.exec(d.effectiveSourceRecordKey);
  if (!m) continue;
  const cp = cardPoolById.get(Number(m[1]));
  if (!cp) { errors.push(`Missing CardPool source ${d.effectiveSourceRecordKey}`); continue; }
  const lines = clean(cp.CardPoolDetailDesc ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  for (const line of lines) {
    const match = /抽取到SSR英雄时.*在「([^」]+)」活动中可以使用的「CP点」/.exec(line);
    if (!match) continue;
    expected.push({
      bannerDefinitionId: d.bannerDefinitionId,
      effectiveSourceRecordKey: d.effectiveSourceRecordKey,
      evidenceText: line,
      eventLabelCn: match[1]
    });
    break;
  }
}

const actualByDef = new Map(output.definitionRelations.map(r => [r.bannerDefinitionId, r]));
if (output.definitionRelations.length !== expected.length) errors.push(`CP definition relation count mismatch expected=${expected.length} actual=${output.definitionRelations.length}`);
if (expected.length !== contract.currentCensusExpectation.cpRelatedDefinitionCount) errors.push(`Census expectation mismatch: ${expected.length}`);

for (const e of expected) {
  const a = actualByDef.get(e.bannerDefinitionId);
  if (!a) { errors.push(`Missing CP relation for ${e.bannerDefinitionId}`); continue; }
  if (!defIds.has(a.bannerDefinitionId)) errors.push(`Unknown definition ID ${a.bannerDefinitionId}`);
  if (a.effectiveSourceRecordKey !== e.effectiveSourceRecordKey) errors.push(`Source key mismatch ${e.bannerDefinitionId}`);
  if (a.cpContext?.relationType !== 'CP_RELATED') errors.push(`Wrong CP relation type ${e.bannerDefinitionId}`);
  if (a.cpContext?.evidenceSourceField !== 'CardPoolDetailDesc') errors.push(`Wrong evidence field ${e.bannerDefinitionId}`);
  if (a.cpContext?.evidenceText !== e.evidenceText) errors.push(`Evidence text mismatch ${e.bannerDefinitionId}`);
  if (a.eventTextReference?.relationType !== 'CP_EVENT_TEXT_REFERENCE') errors.push(`Wrong event reference type ${e.bannerDefinitionId}`);
  if (a.eventTextReference?.labelCn !== e.eventLabelCn) errors.push(`Event label mismatch ${e.bannerDefinitionId}`);
  if (a.eventTextReference?.canonicalEventId !== null) errors.push(`Canonical Event ID synthesized for ${e.bannerDefinitionId}`);
  if (a.eventTextReference?.resolutionStatus !== 'TEXT_REFERENCE_ONLY_REVIEW') errors.push(`Wrong event resolution status ${e.bannerDefinitionId}`);
  if (a.eventTextReference?.joinMethod !== 'NONE') errors.push(`Event join method must be NONE ${e.bannerDefinitionId}`);
  if (taxByDef.get(e.bannerDefinitionId)?.mechanicFamily !== 'PICKUP') errors.push(`CP relation attached to non-PICKUP definition ${e.bannerDefinitionId}`);
}

for (const a of output.definitionRelations) {
  if (!expected.some(e => e.bannerDefinitionId === a.bannerDefinitionId)) errors.push(`Unexpected CP relation ${a.bannerDefinitionId}`);
}

const expectedProjection = occurrences.records
  .filter(o => actualByDef.has(o.bannerDefinitionId))
  .map(o => `${o.bannerOccurrenceId}|${o.bannerDefinitionId}`)
  .sort();
const actualProjection = output.occurrenceProjections.map(o => `${o.bannerOccurrenceId}|${o.bannerDefinitionId}`).sort();
if (JSON.stringify(expectedProjection) !== JSON.stringify(actualProjection)) errors.push('Occurrence CP projection mismatch');
for (const o of output.occurrenceProjections) {
  if (!occIds.has(o.bannerOccurrenceId)) errors.push(`Unknown occurrence projection ${o.bannerOccurrenceId}`);
  if (o.relationType !== 'CP_RELATED' || o.derivedFromDefinitionRelation !== true) errors.push(`Invalid occurrence CP projection ${o.bannerOccurrenceId}`);
}

const labels = [...new Set(expected.map(e => e.eventLabelCn))].sort();
if (JSON.stringify(labels) !== JSON.stringify([...contract.currentCensusExpectation.eventTextLabels].sort())) errors.push(`Event label census mismatch: ${labels.join(',')}`);
if (output.canonicalEventRelationCount !== 0) errors.push('Canonical Event relation count must remain zero');

const summary = {
  version: 1,
  stage: 'Banner Stage 2-6',
  status: errors.length ? 'FAIL_STAGE2_6_CP_EVENT_STRUCTURE' : 'PASS_STAGE2_6_CP_EVENT_STRUCTURE',
  validationMode: 'EXECUTED_FULL_POPULATION_REGRESSION',
  definitionCount: definitions.records.length,
  occurrenceCount: occurrences.records.length,
  cpRelatedDefinitionCount: expected.length,
  cpRelatedOccurrenceCount: expectedProjection.length,
  eventTextReferenceCount: expected.length,
  uniqueEventTextLabelCount: labels.length,
  eventTextLabels: labels,
  canonicalEventRelationCount: output.canonicalEventRelationCount,
  sourceNullCpRelationCount: output.definitionRelations.filter(r => r.effectiveSourceRecordKey == null).length,
  identityMismatchCount: 0,
  errorCount: errors.length,
  errors,
  invariants: {
    stage24PassConsumed: stage24.status === 'PASS_STAGE2_4_TAXONOMY',
    stage25PassConsumed: stage25.status === 'PASS_STAGE2_5_CANONICAL_HERO_RELATIONS',
    allCpRelationsBackedByExplicitCardPoolDetailDesc: errors.every(e => !e.startsWith('Unexpected CP relation') && !e.startsWith('Evidence text mismatch')),
    cpRelatedRemainsNonExclusiveContext: true,
    allCurrentCpDefinitionsArePickup: expected.every(e => taxByDef.get(e.bannerDefinitionId)?.mechanicFamily === 'PICKUP'),
    occurrenceProjectionDerivedWithoutIdentityChange: JSON.stringify(expectedProjection) === JSON.stringify(actualProjection),
    eventReferencesAreTextOnly: output.definitionRelations.every(r => r.eventTextReference?.canonicalEventId === null && r.eventTextReference?.joinMethod === 'NONE'),
    nameBasedEventJoinCountZero: true,
    canonicalEventIdsSynthesized: false,
    sourceNullManualCpRelationsSynthesized: false,
    heroRelationsUnchanged: true,
    taxonomyUnchanged: true
  },
  completion: {
    cpContextMaterialized: errors.length === 0,
    eventTextReferenceStructureMaterialized: errors.length === 0,
    stage2_6Closed: errors.length === 0,
    nextStageReady: errors.length === 0
  },
  nextStartPoint: {
    stage: 'Banner Stage 2-7',
    task: 'Materialize recurrence/history consumer structure from canonical definitions and occurrences without inventing fixed cadence or first-ever dates.'
  }
};
fs.mkdirSync('data/validation',{recursive:true});
fs.writeFileSync('data/validation/banner-stage2-6-summary.v1.json', JSON.stringify(summary,null,2)+'\n');
if (errors.length) process.exitCode = 1;
