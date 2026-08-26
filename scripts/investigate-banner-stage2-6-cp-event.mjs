import fs from 'node:fs';

const definitions = JSON.parse(fs.readFileSync('data/generated/banner-definitions.v1.json','utf8'));
const cardPools = JSON.parse(fs.readFileSync('data/configdata/ConfigDataCardPoolInfo.json','utf8'));
const cardPoolById = new Map(cardPools.map(r => [Number(r.ID), r]));

function clean(s='') {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .trim();
}

const candidates = [];
for (const d of definitions.records) {
  const key = d.effectiveSourceRecordKey;
  if (!key) continue;
  const m = /^cardpool:(\d+)$/.exec(key);
  if (!m) continue;
  const cp = cardPoolById.get(Number(m[1]));
  if (!cp) continue;
  const desc = clean(cp.CardPoolDetailDesc ?? '');
  if (!/CP/i.test(desc)) continue;
  const lines = desc.split('\n').map(x => x.trim()).filter(Boolean);
  const cpLines = lines.filter(x => /CP/i.test(x));
  const quotedLabels = [...new Set([...desc.matchAll(/「([^」]+)」/g)].map(x => x[1]))];
  candidates.push({
    bannerDefinitionId: d.bannerDefinitionId,
    effectiveSourceRecordKey: key,
    cardPoolId: cp.ID,
    cardPoolName: cp.Name ?? null,
    cpLines,
    quotedLabels
  });
}

const quotedLabelCounts = {};
for (const c of candidates) for (const q of c.quotedLabels) quotedLabelCounts[q] = (quotedLabelCounts[q] ?? 0) + 1;

const out = {
  version: 1,
  stage: 'Banner Stage 2-6',
  status: 'CP_EVENT_CENSUS_READY',
  definitionCount: definitions.records.length,
  cpTextCandidateDefinitionCount: candidates.length,
  quotedLabelCounts,
  candidates,
  boundaries: {
    cpTextCandidateIsNotYetCanonicalCpRelation: true,
    eventLabelCandidateIsNotCanonicalEventId: true,
    noNameBasedEventJoin: true
  }
};
fs.mkdirSync('data/investigation',{recursive:true});
fs.writeFileSync('data/investigation/banner-stage2-6-cp-event-census.v1.json', JSON.stringify(out,null,2)+'\n');
