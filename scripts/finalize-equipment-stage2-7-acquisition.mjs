import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const contract = load('data/contracts/equipment-stage2-7-acquisition-reference.v1.json');
const equipment = load('data/configdata/ConfigDataEquipmentInfo.json');
const restrictions = load('data/generated/equipment_stage2_6_restrictions.json');
const historical = load('data/generated/equipment_stage2_7_historical_candidates.json');
const legacy = load('data/generated/equipment_stage2_7_legacy_match.json');

const canonicalIds = new Set(restrictions.records.map(r => Number(r.equipmentId)));
const equipmentById = new Map(equipment.filter(r => canonicalIds.has(Number(r.ID))).map(r => [Number(r.ID), r]));
const generic = historical.genericCandidates.slice().sort((a, b) => a.id - b.id);

const launchMaxId = Number(contract.launch.derivedCanonicalBoundary.maxEquipmentId);
const launchRows = generic.filter(r => r.id <= launchMaxId);
const launchIds = new Set(launchRows.map(r => r.id));
assert(launchRows.length === contract.launch.equipmentCount, `launch count mismatch: ${launchRows.length}`);

const launchSlotCounts = Object.fromEntries([0, 1, 2, 3].map(slot => [slot, launchRows.filter(r => r.slot === slot).length]));
for (const sourceSheet of contract.launch.sheets) {
  assert(launchSlotCounts[sourceSheet.slot] === sourceSheet.equipmentCount,
    `launch slot ${sourceSheet.slot} mismatch: ${launchSlotCounts[sourceSheet.slot]}`);
}

const legacyPicks = legacy.picks ?? [];
const legacyIds = new Set(legacyPicks.flatMap(p => p.ids.map(Number)));
assert(legacyIds.size === contract.legacyAdditional.equipmentCount, `legacy unique count mismatch: ${legacyIds.size}`);
for (const id of legacyIds) assert(!launchIds.has(id), `launch/legacy overlap: ${id}`);

const releaseDateById = new Map();
for (const pick of legacyPicks) {
  for (const id of pick.ids) releaseDateById.set(Number(id), pick.date);
}

const postLegacyRows = generic.filter(r => !launchIds.has(r.id) && !legacyIds.has(r.id));
assert(postLegacyRows.length === contract.canonicalExpectations.postLegacyRemainderCount,
  `post-legacy remainder mismatch: ${postLegacyRows.length}`);

const unresolvedNoPathIds = new Set(contract.canonicalExpectations.unresolvedNoPathIds.map(Number));
const currentStandardRows = postLegacyRows.filter(r => !unresolvedNoPathIds.has(r.id));
assert(currentStandardRows.length === contract.canonicalExpectations.currentStandardCount,
  `current standard count mismatch: ${currentStandardRows.length}`);
const currentIds = new Set(currentStandardRows.map(r => r.id));

const classCounts = new Map();
const records = [...canonicalIds].sort((a, b) => a - b).map(id => {
  const row = equipmentById.get(id);
  assert(row, `missing ConfigDataEquipmentInfo row: ${id}`);
  const paths = norm(row.GetPathList);

  let acquisitionClass;
  let siteTab = null;
  let confidencePercent = 100;
  let classificationBasis;

  if (launchIds.has(id)) {
    acquisitionClass = 'launch';
    siteTab = 1;
    confidencePercent = contract.launch.derivedCanonicalBoundary.confidencePercent;
    classificationBasis = 'legacy-launch-sheet-count-and-canonical-boundary';
  } else if (legacyIds.has(id)) {
    acquisitionClass = 'legacy-additional';
    siteTab = 2;
    confidencePercent = 99;
    classificationBasis = 'legacy-additional-sheet-date-group-match';
  } else if (currentIds.has(id)) {
    acquisitionClass = 'current-additional';
    siteTab = 3;
    confidencePercent = 99;
    classificationBasis = 'canonical-generic-complement-after-launch-and-legacy';
  } else if (unresolvedNoPathIds.has(id)) {
    acquisitionClass = 'unresolved-no-path';
    confidencePercent = contract.semanticDecisions.id2013.confidencePercent;
    classificationBasis = 'empty-GetPathList-no-global-meaning-inferred';
  } else if (paths.length === 1 && Number(paths[0]?.PathType) === 46) {
    acquisitionClass = 'exclusive-equipment';
    confidencePercent = contract.semanticDecisions.pathType46.confidencePercent;
    classificationBasis = 'PathType46-only-and-exclusive-sheet-sentinel-match';
  } else if (paths.length === 0 && /^魂·/.test(String(row.Name ?? ''))) {
    acquisitionClass = 'soul-special';
    confidencePercent = contract.semanticDecisions.emptyPathSoulPrefix.confidencePercent;
    classificationBasis = 'empty-GetPathList-and-soul-name-prefix';
  } else {
    acquisitionClass = 'unclassified';
    confidencePercent = 0;
    classificationBasis = 'no-final-rule';
  }

  classCounts.set(acquisitionClass, (classCounts.get(acquisitionClass) ?? 0) + 1);

  return {
    equipmentId: id,
    nameCn: row.Name ?? null,
    equipmentType: Number(row.EquipmentType ?? 0),
    label: row.Label ?? null,
    sortIndex: row.SortIndex ?? null,
    acquisitionClass,
    siteTab,
    releaseGroupDate: releaseDateById.get(id) ?? null,
    confidencePercent,
    classificationBasis,
    raw: {
      getPathList: paths,
      getPathDesc: row.GetPathDesc ?? null,
      randomDropRewardId: row.RandomDropRewardId ?? null,
      archiveDisplay: row.ArchiveDisplay ?? null
    }
  };
});

const counts = Object.fromEntries([...classCounts.entries()].sort(([a], [b]) => a.localeCompare(b)));
const siteTabCounts = {
  tab1Launch: records.filter(r => r.siteTab === 1).length,
  tab2LegacyAdditional: records.filter(r => r.siteTab === 2).length,
  tab3CurrentAdditional: records.filter(r => r.siteTab === 3).length,
  excludedOrPending: records.filter(r => r.siteTab == null).length
};

const result = {
  stage: '2-7',
  status: 'complete-with-explicit-no-path-exception',
  sources: {
    canonicalPopulation: 'data/generated/equipment_stage2_6_restrictions.json',
    equipmentConfig: 'data/configdata/ConfigDataEquipmentInfo.json',
    historicalCandidates: 'data/generated/equipment_stage2_7_historical_candidates.json',
    legacyMatch: 'data/generated/equipment_stage2_7_legacy_match.json',
    referenceContract: 'data/contracts/equipment-stage2-7-acquisition-reference.v1.json'
  },
  decisions: {
    generalTabs: {
      tab1: 'launch',
      tab2: 'legacy-additional',
      tab3: 'current-additional'
    },
    emptyPathPolicy: 'An empty GetPathList is not interpreted as unrestricted acquisition. ID 2013 remains explicit unresolved-no-path.',
    referenceMismatchPolicy: contract.legacyAdditional.referenceMismatchPolicy
  },
  counts: {
    canonical: records.length,
    ...counts,
    siteTabs: siteTabCounts
  },
  legacyMatchDiagnostics: {
    groupCount: legacy.expectedGroups,
    itemCount: legacy.expectedItems,
    signatureScore: legacy.bestTotalScore,
    maxSignatureScore: legacy.maxPossibleScore,
    mismatchSignatureCount: legacy.maxPossibleScore - legacy.bestTotalScore,
    knownReferenceMismatches: contract.legacyAdditional.knownReferenceMismatches
  },
  records
};

fs.writeFileSync('data/generated/equipment_stage2_7_acquisition.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, counts: result.counts, legacyMatchDiagnostics: result.legacyMatchDiagnostics }, null, 2));
