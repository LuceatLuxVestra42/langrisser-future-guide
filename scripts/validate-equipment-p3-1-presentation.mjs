import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const SOURCE_PATH = 'data/generated/equipment_stage3_3_general_list.json';
const P3_0_V1_PATH = 'data/validation/equipment-p3-0-release-chronology-audit.v1.json';
const P3_0_V2_PATH = 'data/validation/equipment-p3-0-release-chronology-presentation-audit.v2.json';
const PROJECTION_PATH = 'data/presentation/equipment-p3-1-release-metadata.v1.json';

const source = readJson(SOURCE_PATH);
const p30v2 = readJson(P3_0_V2_PATH);
const projection = readJson(PROJECTION_PATH);

assert(fs.existsSync(P3_0_V1_PATH), 'Historical P3-0 v1 audit must remain preserved.');
assert(p30v2.version === 2, 'P3-0 correction must be v2.');
assert(p30v2.coverageAfterCorrection?.target === 32, 'P3-0 v2 target must remain 32.');
assert(p30v2.coverageAfterCorrection?.releaseDateResolved === 32, 'P3-0 v2 must resolve 32/32 dates.');
assert(p30v2.coverageAfterCorrection?.releaseDateUnresolved === 0, 'P3-0 v2 must have zero unresolved dates.');
assert(p30v2.classificationCorrection?.semanticStageReopened === false, 'P3-0 v2 must not reopen semantic Stage 2.');
assert(p30v2.classificationCorrection?.stage2CurrentAdditionalTechnicalMeaningChanged === false, 'P3-0 v2 must not rewrite current-additional semantics.');
assert(p30v2.classificationCorrection?.presentationMeaning === '장비패스', 'P3-0 v2 must preserve 장비패스 presentation meaning.');

assert(projection.status === 'PASS', 'P3-1 projection status must be PASS.');
assert(projection.completion === 'EQUIPMENT_P3_1_RELEASE_PRESENTATION_FROZEN', 'Unexpected P3-1 completion marker.');
assert(projection.scope?.siteTab === 3, 'P3-1 projection must target siteTab 3 only.');
assert(projection.scope?.targetCount === 32, 'P3-1 target must remain 32.');
assert(projection.scope?.releaseDateCoverage === 32, 'P3-1 release date coverage must be 32/32.');
assert(projection.scope?.semanticStageReopened === false, 'P3-1 must not reopen semantics.');
assert(projection.scope?.stage2AcquisitionClassificationChanged === false, 'P3-1 must not change Stage 2 acquisition classification.');
assert(projection.policy?.joinKey === 'equipmentId', 'P3-1 production identity key must be equipmentId.');
assert(projection.policy?.equipmentIdIsNotChronology === true, 'equipmentId must not be used as chronology.');

const sourceTab3 = source.records.filter((record) => record.siteTab === 3);
assert(sourceTab3.length === 32, `Frozen source siteTab 3 must remain 32; got ${sourceTab3.length}.`);
assert(sourceTab3.every((record) => record.acquisitionClass === 'current-additional'), 'Frozen siteTab 3 acquisitionClass changed unexpectedly.');
assert(sourceTab3.every((record) => record.releaseGroupDate === null), 'P3-1 must not mutate Stage 3 source releaseGroupDate fields.');

const projectedEntries = Object.values(projection.byEquipmentId ?? {});
assert(projectedEntries.length === 32, `Projection byEquipmentId must have 32 records; got ${projectedEntries.length}.`);
const projectedIds = projectedEntries.map((record) => record.equipmentId);
assert(new Set(projectedIds).size === 32, 'Projection contains duplicate equipmentId.');
const sourceIds = sourceTab3.map((record) => record.equipmentId).sort((a, b) => a - b);
assert(JSON.stringify([...projectedIds].sort((a, b) => a - b)) === JSON.stringify(sourceIds), 'Projection equipmentId population does not exactly match frozen siteTab 3.');

const sourceById = new Map(sourceTab3.map((record) => [record.equipmentId, record]));
for (const record of projectedEntries) {
  const base = sourceById.get(record.equipmentId);
  assert(base, `Projection references unknown Equipment ${record.equipmentId}.`);
  assert(base.nameCn === record.nameCn, `Equipment ${record.equipmentId} nameCn identity mismatch.`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(record.releaseGroupDate), `Equipment ${record.equipmentId} has invalid releaseGroupDate.`);
  assert(!Number.isNaN(Date.parse(`${record.releaseGroupDate}T00:00:00Z`)), `Equipment ${record.equipmentId} releaseGroupDate is not parseable.`);
}

const expectedSpecial = new Map([
  [299, ['斩魔刀', '灵剑荒鹰']],
  [400, ['逆矢外壳', '华击团制服']],
  [401, ['鲜花礼帽', '红色缎带']],
  [402, ['Q巨拉', '小熊玩偶']],
]);
for (const [equipmentId, [currentName, previousName]] of expectedSpecial) {
  const record = projection.byEquipmentId[String(equipmentId)];
  assert(record?.nameCn === currentName, `Equipment ${equipmentId} current name mismatch.`);
  assert(record?.previousDisplayNameCn === previousName, `Equipment ${equipmentId} previous display name mismatch.`);
  assert(record?.releaseGroupDate === '2019-05-09', `Equipment ${equipmentId} must use 2019-05-09 release date.`);
  assert(record?.releaseFamily === 'LEGACY_COLLAB_RENAMED_CONTINUITY', `Equipment ${equipmentId} must preserve identity continuity family.`);
}

for (const equipmentId of [265, 266, 267, 268]) {
  const record = projection.byEquipmentId[String(equipmentId)];
  assert(record?.releaseGroupDate === '2019-02-07', `Equipment ${equipmentId} must keep the 2019-02-07 date.`);
  assert(record?.evidenceStatus === 'SECONDARY_DATE_VERIFIED', `Equipment ${equipmentId} must retain secondary provenance.`);
}

const familyCounts = projectedEntries.reduce((counts, record) => {
  counts[record.releaseFamily] = (counts[record.releaseFamily] ?? 0) + 1;
  return counts;
}, {});
assert(familyCounts.ETERNAL_FLAME_FORGE === 24, 'Expected 24 Eternal Flame Forge records.');
assert(familyCounts.LEGACY_COLLAB_LIMITED === 4, 'Expected 4 legacy collaboration limited records.');
assert(familyCounts.LEGACY_COLLAB_RENAMED_CONTINUITY === 4, 'Expected 4 renamed collaboration continuity records.');

const expectedOrder = [...sourceTab3]
  .sort((left, right) => {
    const leftDate = projection.byEquipmentId[String(left.equipmentId)].releaseGroupDate;
    const rightDate = projection.byEquipmentId[String(right.equipmentId)].releaseGroupDate;
    return left.groupOrder - right.groupOrder
      || left.subtypeOrder - right.subtypeOrder
      || rightDate.localeCompare(leftDate)
      || left.sortIndex - right.sortIndex
      || left.equipmentId - right.equipmentId;
  })
  .map((record) => record.equipmentId);

assert(Array.isArray(projection.defaultOrderEquipmentIds), 'defaultOrderEquipmentIds must be an array.');
assert(projection.defaultOrderEquipmentIds.length === 32, 'defaultOrderEquipmentIds must contain 32 records.');
assert(new Set(projection.defaultOrderEquipmentIds).size === 32, 'defaultOrderEquipmentIds contains duplicates.');
assert(JSON.stringify(projection.defaultOrderEquipmentIds) === JSON.stringify(expectedOrder), 'P3-1 default order does not match group/subtype/release-date policy.');

const output = {
  stage: 'Equipment P3-1 Release Metadata Projection Validation',
  status: 'PASS_EQUIPMENT_P3_1_RELEASE_PRESENTATION',
  semanticStageReopened: false,
  source: {
    siteTab3: sourceTab3.length,
    frozenReleaseGroupDateStillNull: sourceTab3.filter((record) => record.releaseGroupDate === null).length,
  },
  projection: {
    records: projectedEntries.length,
    releaseDateResolved: projectedEntries.filter((record) => record.releaseGroupDate).length,
    releaseDateUnresolved: projectedEntries.filter((record) => !record.releaseGroupDate).length,
    familyCounts,
    defaultOrderEquipmentIds: projection.defaultOrderEquipmentIds,
  },
  correctedIdentityContinuityIds: [...expectedSpecial.keys()],
  secondaryProvenanceIds: [265, 266, 267, 268],
  blockers: [],
};

console.log(JSON.stringify(output, null, 2));
