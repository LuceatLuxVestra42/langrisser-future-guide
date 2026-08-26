import fs from 'node:fs';

const definitions = JSON.parse(fs.readFileSync('data/generated/banner-definitions.v1.json','utf8'));
const occurrences = JSON.parse(fs.readFileSync('data/generated/banner-occurrences.v1.json','utf8'));
const cardPools = JSON.parse(fs.readFileSync('data/configdata/ConfigDataCardPoolInfo.json','utf8'));
const cardPoolById = new Map(cardPools.map(r => [Number(r.ID), r]));

function clean(s='') {
  return String(s).replace(/<[^>]+>/g,'').replace(/\\n/g,'\n').replace(/\r/g,'').trim();
}

const relationRecords = [];
for (const d of definitions.records) {
  if (!d.effectiveSourceRecordKey) continue;
  const m = /^cardpool:(\d+)$/.exec(d.effectiveSourceRecordKey);
  if (!m) continue;
  const cp = cardPoolById.get(Number(m[1]));
  if (!cp) throw new Error(`Missing CardPool source for ${d.effectiveSourceRecordKey}`);
  const lines = clean(cp.CardPoolDetailDesc ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  let evidenceLine = null;
  let eventLabelCn = null;
  for (const line of lines) {
    const match = /抽取到SSR英雄时.*在「([^」]+)」活动中可以使用的「CP点」/.exec(line);
    if (match) {
      evidenceLine = line;
      eventLabelCn = match[1];
      break;
    }
  }
  if (!evidenceLine) continue;
  relationRecords.push({
    bannerDefinitionId: d.bannerDefinitionId,
    effectiveSourceRecordKey: d.effectiveSourceRecordKey,
    cpContext: {
      relationType: 'CP_RELATED',
      evidenceSourceField: 'CardPoolDetailDesc',
      evidenceText: evidenceLine
    },
    eventTextReference: {
      relationType: 'CP_EVENT_TEXT_REFERENCE',
      labelCn: eventLabelCn,
      canonicalEventId: null,
      resolutionStatus: 'TEXT_REFERENCE_ONLY_REVIEW',
      joinMethod: 'NONE'
    }
  });
}

const cpDefinitionIds = new Set(relationRecords.map(r => r.bannerDefinitionId));
const occurrenceProjections = occurrences.records
  .filter(o => cpDefinitionIds.has(o.bannerDefinitionId))
  .map(o => ({
    bannerOccurrenceId: o.bannerOccurrenceId,
    bannerDefinitionId: o.bannerDefinitionId,
    relationType: 'CP_RELATED',
    derivedFromDefinitionRelation: true
  }));

const eventLabelCounts = {};
for (const r of relationRecords) {
  const label = r.eventTextReference.labelCn;
  eventLabelCounts[label] = (eventLabelCounts[label] ?? 0) + 1;
}

const out = {
  version: 1,
  stage: 'Banner Stage 2-6',
  status: 'CANONICAL_CP_EVENT_REFERENCE_STRUCTURE_MATERIALIZED',
  definitionCount: definitions.records.length,
  cpRelatedDefinitionCount: relationRecords.length,
  nonCpDefinitionCount: definitions.records.length - relationRecords.length,
  cpRelatedOccurrenceCount: occurrenceProjections.length,
  eventTextReferenceCount: relationRecords.length,
  canonicalEventRelationCount: 0,
  eventLabelCounts,
  definitionRelations: relationRecords,
  occurrenceProjections
};

fs.mkdirSync('data/generated',{recursive:true});
fs.writeFileSync('data/generated/banner-cp-event-relations.v1.json', JSON.stringify(out,null,2)+'\n');
