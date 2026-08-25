import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const contract = load('data/contracts/equipment-stage2-7-acquisition-reference.v1.json');
const restrictions = load('data/generated/equipment_stage2_6_restrictions.json');
const historical = load('data/generated/equipment_stage2_7_historical_candidates.json');
const legacy = load('data/generated/equipment_stage2_7_legacy_match.json');
const finalData = load('data/generated/equipment_stage2_7_acquisition.json');

const records = finalData.records ?? [];
const ids = records.map(r => Number(r.equipmentId));
const uniqueIds = new Set(ids);
const canonicalIds = new Set(restrictions.records.map(r => Number(r.equipmentId)));
check(records.length === contract.canonicalExpectations.equipmentCount, `record count ${records.length}`);
check(uniqueIds.size === records.length, 'duplicate equipment IDs in final data');
check(uniqueIds.size === canonicalIds.size && [...canonicalIds].every(id => uniqueIds.has(id)), 'canonical ID coverage mismatch');
check(!records.some(r => r.acquisitionClass === 'unclassified'), 'unclassified records remain');

const countClass = value => records.filter(r => r.acquisitionClass === value).length;
check(countClass('launch') === contract.canonicalExpectations.launchCount, 'launch count mismatch');
check(countClass('legacy-additional') === contract.canonicalExpectations.legacyAdditionalCount, 'legacy count mismatch');
check(countClass('current-additional') === contract.canonicalExpectations.currentStandardCount, 'current count mismatch');
check(countClass('unresolved-no-path') === contract.canonicalExpectations.unresolvedNoPathIds.length, 'unresolved no-path count mismatch');
check(countClass('exclusive-equipment') === contract.canonicalExpectations.exclusivePathType46Count, 'exclusive count mismatch');
check(countClass('soul-special') === contract.canonicalExpectations.soulNoPathCount, 'soul count mismatch');

const launch = records.filter(r => r.acquisitionClass === 'launch');
check(Math.max(...launch.map(r => r.equipmentId)) === contract.launch.derivedCanonicalBoundary.maxEquipmentId, 'launch boundary mismatch');
for (const sourceSheet of contract.launch.sheets) {
  check(launch.filter(r => r.equipmentType === sourceSheet.slot).length === sourceSheet.equipmentCount,
    `launch slot count mismatch for ${sourceSheet.title}`);
}

check(historical.genericCandidates.length === contract.canonicalExpectations.genericAcquisitionCount, 'generic acquisition population mismatch');
check((legacy.picks ?? []).length === contract.legacyAdditional.groupCount, 'legacy group count mismatch');
const legacyIds = new Set((legacy.picks ?? []).flatMap(p => p.ids.map(Number)));
check(legacyIds.size === contract.legacyAdditional.equipmentCount, 'legacy unique ID count mismatch');
check(legacy.bestTotalScore === contract.legacyAdditional.expectedSignatureScore, 'legacy signature score changed');
check(legacy.maxPossibleScore === contract.legacyAdditional.maxSignatureScore, 'legacy max signature score changed');
check((legacy.maxPossibleScore - legacy.bestTotalScore) === contract.legacyAdditional.expectedReferenceMismatchFields, 'legacy mismatch-signature count changed');
check((contract.legacyAdditional.knownReferenceMismatches ?? []).length === contract.legacyAdditional.expectedReferenceMismatchFields, 'known mismatch checkpoint count changed');

const unresolved = records.filter(r => r.acquisitionClass === 'unresolved-no-path');
check(unresolved.length === 1 && unresolved[0].equipmentId === 2013, 'unexpected unresolved no-path record');
check(unresolved[0].raw.getPathList.length === 0, 'ID 2013 unexpectedly has acquisition paths');

for (const row of records.filter(r => r.acquisitionClass === 'exclusive-equipment')) {
  check(row.raw.getPathList.length === 1 && Number(row.raw.getPathList[0]?.PathType) === 46,
    `exclusive PathType mismatch: ${row.equipmentId}`);
  check(row.siteTab == null, `exclusive equipment leaked into general tab: ${row.equipmentId}`);
}
for (const row of records.filter(r => r.acquisitionClass === 'soul-special')) {
  check(row.raw.getPathList.length === 0 && /^魂·/.test(String(row.nameCn ?? '')), `soul-special shape mismatch: ${row.equipmentId}`);
  check(row.siteTab == null, `soul-special leaked into general tab: ${row.equipmentId}`);
}

const tabCounts = [1, 2, 3].map(tab => records.filter(r => r.siteTab === tab).length);
check(tabCounts[0] === 94 && tabCounts[1] === 80 && tabCounts[2] === 32, `site tab counts ${tabCounts.join('/')}`);

console.log(JSON.stringify({
  ok: true,
  canonical: records.length,
  classes: Object.fromEntries(['launch','legacy-additional','current-additional','unresolved-no-path','exclusive-equipment','soul-special'].map(k => [k, countClass(k)])),
  siteTabs: { tab1: tabCounts[0], tab2: tabCounts[1], tab3: tabCounts[2] },
  legacySignature: { score: legacy.bestTotalScore, max: legacy.maxPossibleScore, mismatchSignatures: legacy.maxPossibleScore - legacy.bestTotalScore }
}, null, 2));
