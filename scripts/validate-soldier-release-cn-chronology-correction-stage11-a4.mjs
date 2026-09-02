import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const paths = {
  evidence: 'data/soldier-release-cn-chronology-correction-evidence-stage11-a4.v1.json',
  releaseSource: 'data/soldier-release-source.v1.json',
  canonical: 'data/generated/soldier-list-stage5-7.v1.json',
  a1: 'data/soldier-release-official-notice-evidence-stage11-a1.v1.json',
};
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const errors = [];
const fail = message => errors.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isIsoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function indexById(records, label) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!Number.isInteger(record?.soldierId)) { fail(`${label} invalid soldierId`); continue; }
    if (map.has(record.soldierId)) fail(`${label} duplicate soldierId ${record.soldierId}`);
    else map.set(record.soldierId, record);
  }
  return map;
}

const evidence = readJson(paths.evidence);
const releaseSource = readJson(paths.releaseSource);
const canonical = readJson(paths.canonical);
const a1 = readJson(paths.a1);

if (evidence.version !== 1
  || evidence.schemaId !== 'soldier-release-cn-chronology-correction-evidence/v1'
  || evidence.stage !== '11-A4'
  || evidence.status !== 'FROZEN_CORRECTION_READY'
  || evidence.owner !== 'soldier-release-metadata-evidence-acquisition'
  || evidence.scope !== 'EVIDENCE_ONLY_NO_STAGE5_8_MUTATION') {
  fail('Stage 11-A4 evidence identity/status drift');
}
if (releaseSource.schemaId !== 'soldier-release-source/v1' || releaseSource.status !== 'FROZEN_PARTIAL') fail('historical release source must remain FROZEN_PARTIAL');
if (canonical.status !== 'PASS' || canonical.summary?.recordCount !== 224) fail('canonical Soldier Stage 5-7 must remain PASS/224');
if (a1.stage !== '11-A1' || a1.status !== 'FROZEN_ADMITTED' || a1.records?.length !== 40) fail('Stage 11-A1 admitted official evidence predecessor drift');

const decision = evidence.timelineDecision ?? {};
if (decision.targetTimeline !== 'CN_SERVER_RELEASE_CHRONOLOGY'
  || decision.officialCnAuthority !== 'OFFICIAL_CN_RELEASE_NOTICE'
  || decision.historicalGoogleSheetAuthority !== 'REGION_OR_TIMELINE_SCOPE_UNSPECIFIED'
  || decision.historicalGoogleSheetUseForCnChronology !== false
  || decision.coverageChangeAtThisStage !== false
  || decision.samePatchOrderClaimed !== false) {
  fail('Stage 11-A4 timeline decision drift');
}

const observation = evidence.connectedSheetObservation ?? {};
const frozenDateCells = releaseSource.externalSource?.dateCells ?? [];
const expectedDateCells = (observation.dateCells ?? []).map(({ row, storedSerial, storedDate }) => ({ row, serial: storedSerial, releaseDate: storedDate }));
if (observation.spreadsheetId !== releaseSource.externalSource?.spreadsheetId
  || observation.spreadsheetTitle !== releaseSource.externalSource?.spreadsheetTitle
  || observation.sheetName !== releaseSource.externalSource?.sheetName
  || observation.header !== '출시일'
  || observation.serverScopeDeclared !== false
  || observation.notesOrCommentsDeclaringServerScope !== false
  || !same(expectedDateCells, frozenDateCells)) {
  fail('connected Google Sheet observation does not match frozen Stage 5-8 source provenance');
}

const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
const records = Array.isArray(evidence.records) ? evidence.records : [];
if (sources.length !== 5) fail(`expected 5 official CN correction events, got ${sources.length}`);
if (records.length !== 11) fail(`expected 11 correction records, got ${records.length}`);
const sourceMap = new Map();
const sourceUrls = new Set();
let labelCount = 0;
for (const source of sources) {
  if (typeof source?.sourceId !== 'string' || !source.sourceId) { fail('correction source missing sourceId'); continue; }
  if (sourceMap.has(source.sourceId)) fail(`duplicate correction sourceId ${source.sourceId}`);
  sourceMap.set(source.sourceId, source);
  if (!isIsoDate(source.noticePublishedAt) || !isIsoDate(source.releaseDate) || source.noticePublishedAt > source.releaseDate) fail(`${source.sourceId} invalid notice/release date`);
  if (!Array.isArray(source.newSoldierLabels) || !source.newSoldierLabels.length || new Set(source.newSoldierLabels).size !== source.newSoldierLabels.length) fail(`${source.sourceId} invalid Soldier labels`);
  else labelCount += source.newSoldierLabels.length;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'mz.zlongame.com') fail(`${source.sourceId} must use official https mz.zlongame.com source`);
    if (sourceUrls.has(source.url)) fail(`duplicate correction source URL ${source.url}`);
    sourceUrls.add(source.url);
  } catch {
    fail(`${source.sourceId} invalid URL`);
  }
}
if (labelCount !== 11) fail(`official correction labels must total 11, got ${labelCount}`);

const canonicalIndex = indexById(canonical.records, 'canonical');
const historicalIndex = indexById(releaseSource.confirmedRecords, 'historical release source');
const correctionIndex = indexById(records, 'Stage 11-A4 correction evidence');
const labelsBySource = new Map();

for (const record of records) {
  const base = canonicalIndex.get(record.soldierId);
  const historical = historicalIndex.get(record.soldierId);
  const source = sourceMap.get(record.sourceId);
  if (!base) { fail(`correction soldierId ${record.soldierId} absent from canonical Soldier list`); continue; }
  if (base.tier !== 3 || base.isSp !== false) fail(`correction soldierId ${record.soldierId} must remain normal tier-3`);
  if (base.nameCn !== record.canonicalNameCn) fail(`correction soldierId ${record.soldierId} canonicalNameCn mismatch`);
  if (!historical) { fail(`correction soldierId ${record.soldierId} absent from 11-record historical source`); continue; }
  if (historical.releaseDate !== record.historicalSheetReleaseDate
    || historical.patchGroup !== record.historicalSheetReleaseDate
    || historical.sourceLabel !== record.historicalSheetSourceLabel) {
    fail(`correction soldierId ${record.soldierId} historical Sheet provenance mismatch`);
  }
  if (!source) fail(`correction soldierId ${record.soldierId} references unknown source ${record.sourceId}`);
  else {
    if (record.officialCnReleaseDate !== source.releaseDate) fail(`correction soldierId ${record.soldierId} official release date differs from source event`);
    if (!source.newSoldierLabels.includes(record.canonicalNameCn)) fail(`${record.sourceId} does not explicitly list ${record.canonicalNameCn}`);
    const labels = labelsBySource.get(record.sourceId) ?? [];
    labels.push(record.canonicalNameCn);
    labelsBySource.set(record.sourceId, labels);
  }
  if (record.mappingStatus !== 'CANONICAL_ID_WITH_EXACT_CN_LABEL_MANUAL_VERIFICATION' || record.samePatchOrder !== null) {
    fail(`correction soldierId ${record.soldierId} mapping/samePatchOrder drift`);
  }
  if (record.officialCnReleaseDate === record.historicalSheetReleaseDate) fail(`correction soldierId ${record.soldierId} does not demonstrate a chronology conflict`);
}
if (historicalIndex.size !== 11) fail(`historical Google Sheet source must remain exactly 11 records, got ${historicalIndex.size}`);
if (correctionIndex.size !== 11) fail(`Stage 11-A4 unique correction IDs must equal 11, got ${correctionIndex.size}`);
for (const source of sources) {
  const declared = [...source.newSoldierLabels].sort();
  const actual = [...(labelsBySource.get(source.sourceId) ?? [])].sort();
  if (!same(actual, declared)) fail(`${source.sourceId} correction records do not exactly exhaust declared labels`);
}

const summary = evidence.summary ?? {};
if (!same(summary, {
  conflictingHistoricalSheetRecords: 11,
  officialCnCorrectionEvents: 5,
  officialCnCorrectionRecords: 11,
  currentConfirmedReleaseRecords: 51,
  currentUnresolvedReleaseRecords: 173,
  projectedConfirmedReleaseRecordsAfterCorrection: 51,
  projectedUnresolvedReleaseRecordsAfterCorrection: 173,
})) fail('Stage 11-A4 summary drift');
for (const [key, value] of Object.entries(evidence.boundaries ?? {})) if (value !== false) fail(`Stage 11-A4 boundary ${key} must remain false`);
if (evidence.handoff?.nextOwner !== 'soldier-release-metadata-promotion-correction') fail('Stage 11-A4 next owner drift');

if (errors.length) {
  console.error(`Soldier Stage 11-A4 CN chronology correction evidence: FAIL (${errors.length})`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}
console.log('Soldier Stage 11-A4 CN chronology correction evidence: PASS');
console.log('correctionEvents=5');
console.log('correctionRecords=11');
console.log('coverageBoundary=51 confirmed / 173 unresolved unchanged by A4 evidence stage');
console.log('downstreamState=independent');
console.log('nextOwner=soldier-release-metadata-promotion-correction');
