'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const records = doc => Array.isArray(doc) ? doc : (Array.isArray(doc?.records) ? doc.records : Array.isArray(doc?.rows) ? doc.rows : Array.isArray(doc?.data) ? doc.data : []);
const outDir = path.join(root, 'data', 'generated');
const valDir = path.join(root, 'data', 'validation');
const outPath = path.join(outDir, 'hero-page-stage5-2-exclusive-central.v1.json');
const valPath = path.join(valDir, 'hero-page-stage5-2-final.v1.json');

const canonicalDoc = read('data/hero-name-master.v1.json');
const canonical = canonicalDoc.records || [];
const canonicalById = new Map(canonical.map(x => [Number(x.heroId), x]));
const canonicalIds = new Set(canonicalById.keys());

const heroRows = records(read('data/configdata/ConfigDataHeroInfo.json'));
const heroRowsById = new Map();
for (const row of heroRows) {
  const id = Number(row.ID);
  if (!canonicalIds.has(id)) continue;
  if (!heroRowsById.has(id)) heroRowsById.set(id, []);
  heroRowsById.get(id).push(row);
}

const skillRows = records(read('data/configdata/ConfigDataSkillInfo.json'));
const skillById = new Map(skillRows.map(x => [Number(x.ID), x]));

const acquisition = read('data/generated/equipment_stage2_7_acquisition.json');
const exclusiveAcquisition = (acquisition.records || []).filter(x => x.acquisitionClass === 'exclusive-equipment');
const exclusiveIds = new Set(exclusiveAcquisition.map(x => Number(x.equipmentId)));

const equipmentRows = records(read('data/configdata/ConfigDataEquipmentInfo.json'));
const equipmentById = new Map(equipmentRows.map(x => [Number(x.ID), x]));
const displayDoc = read('data/generated/equipment_stage3_2_display_metadata.json');
const displayById = new Map((displayDoc.records || []).map(x => [Number(x.equipmentId), x]));

const hardErrors = [];
if (canonical.length !== 267) hardErrors.push(`Canonical Hero count is ${canonical.length}, expected 267.`);
if (new Set(canonical.map(x => Number(x.heroId))).size !== canonical.length) hardErrors.push('Canonical Hero IDs are not unique.');

const canonicalHeroRows = new Map();
for (const hero of canonical) {
  const id = Number(hero.heroId);
  const matches = heroRowsById.get(id) || [];
  if (matches.length !== 1) hardErrors.push(`Hero ${id} has ${matches.length} ConfigDataHeroInfo records; expected exactly 1.`);
  if (matches.length) canonicalHeroRows.set(id, matches[0]);
}

const exclusiveRaw = [];
const missingEquipmentIds = [];
for (const acq of exclusiveAcquisition) {
  const equipmentId = Number(acq.equipmentId);
  const raw = equipmentById.get(equipmentId);
  if (!raw) { missingEquipmentIds.push(equipmentId); continue; }
  exclusiveRaw.push({ acq, raw });
}
if (exclusiveAcquisition.length !== 167) hardErrors.push(`Exclusive equipment population is ${exclusiveAcquisition.length}, expected frozen count 167.`);
if (exclusiveIds.size !== exclusiveAcquisition.length) hardErrors.push('Exclusive equipment IDs are not unique.');
if (missingEquipmentIds.length) hardErrors.push(`Missing raw exclusive EquipmentInfo records: ${missingEquipmentIds.join(', ')}`);

const exclusiveByOwner = new Map();
const ownerErrors = [];
let descOwnerNameMatchCount = 0;
for (const { acq, raw } of exclusiveRaw) {
  const equipmentId = Number(acq.equipmentId);
  const ownerHeroId = Number(raw.SkillHero);
  if (!Number.isFinite(ownerHeroId) || ownerHeroId === 0) {
    ownerErrors.push({ equipmentId, issue: 'SkillHero missing/zero', value: raw.SkillHero ?? null });
    continue;
  }
  const owner = canonicalById.get(ownerHeroId);
  if (!owner) {
    ownerErrors.push({ equipmentId, issue: 'SkillHero does not resolve to canonical Hero', ownerHeroId });
    continue;
  }
  if (!exclusiveByOwner.has(ownerHeroId)) exclusiveByOwner.set(ownerHeroId, []);
  exclusiveByOwner.get(ownerHeroId).push({ acq, raw });
  if (String(raw.Desc ?? '').includes(String(owner.nameCn ?? ''))) descOwnerNameMatchCount++;
}
if (ownerErrors.length) hardErrors.push(`Exclusive SkillHero ownership has ${ownerErrors.length} unresolved records.`);
const duplicateExclusiveOwners = [...exclusiveByOwner.entries()]
  .filter(([, xs]) => xs.length !== 1)
  .map(([heroId, xs]) => ({ heroId, equipmentIds: xs.map(x => Number(x.raw.ID)) }));
if (duplicateExclusiveOwners.length) hardErrors.push(`Exclusive ownership is not one-to-one for ${duplicateExclusiveOwners.length} Hero IDs.`);

const centralMissingSkillRefs = [];
let centralReleasedCount = 0;
for (const hero of canonical) {
  const id = Number(hero.heroId);
  const raw = canonicalHeroRows.get(id);
  const skillId = Number(raw?.CastingLawSkill_ID ?? 0);
  if (!skillId) continue;
  centralReleasedCount++;
  if (!skillById.has(skillId)) centralMissingSkillRefs.push({ heroId: id, skillId });
}
if (centralMissingSkillRefs.length) hardErrors.push(`Central-discipline SkillInfo has ${centralMissingSkillRefs.length} unresolved refs.`);

const outputRecords = canonical.map(hero => {
  const heroId = Number(hero.heroId);
  const rawHero = canonicalHeroRows.get(heroId) || null;
  const owned = exclusiveByOwner.get(heroId) || [];
  const ex = owned.length === 1 ? owned[0] : null;
  const display = ex ? displayById.get(Number(ex.raw.ID)) : null;
  const centralSkillId = Number(rawHero?.CastingLawSkill_ID ?? 0);
  const centralSkill = centralSkillId ? skillById.get(centralSkillId) : null;

  return {
    heroId,
    nameKr: hero.nameKr ?? null,
    nameCn: hero.nameCn ?? rawHero?.Name ?? null,
    nameEn: hero.nameEn ?? rawHero?.Name_Eng ?? null,
    exclusiveEquipment: ex ? {
      status: 'RELEASED',
      equipmentId: Number(ex.raw.ID),
      ownerHeroId: Number(ex.raw.SkillHero),
      ownerResolver: 'ConfigDataEquipmentInfo.SkillHero',
      nameCn: ex.raw.Name ?? ex.acq.nameCn ?? null,
      nameKr: display?.nameKr ?? null,
      nameKrStatus: display?.nameKrStatus ?? 'NOT_IN_STAGE3_2_DISPLAY_MASTER',
      descCn: ex.raw.Desc ?? null,
      icon: ex.raw.Icon ?? display?.icon ?? null,
      equipmentType: ex.raw.EquipmentType ?? ex.acq.equipmentType ?? null,
      effectSkillIds: Array.isArray(ex.raw.SkillIds) ? ex.raw.SkillIds.map(Number) : [],
      acquisitionClass: ex.acq.acquisitionClass,
      acquisitionPathTypes: Array.isArray(ex.raw.GetPathList) ? ex.raw.GetPathList.map(x => Number(x.PathType)).filter(Number.isFinite) : []
    } : {
      status: 'NOT_RELEASED',
      equipmentId: null,
      ownerHeroId: heroId
    },
    centralDiscipline: centralSkillId ? {
      status: centralSkill ? 'RELEASED' : 'BROKEN_REF',
      skillId: centralSkillId,
      nameCn: centralSkill?.Name ?? null,
      descCn: centralSkill?.Desc ?? null,
      icon: centralSkill?.Icon ?? centralSkill?.IconName ?? null,
      templates: Array.isArray(rawHero?.CastingLawTemplates_ID) ? rawHero.CastingLawTemplates_ID.map(Number) : [],
      unlock: {
        equipmentLevel: rawHero?.CastingLawSkillUnlockEquipmentLevel ?? null,
        heroStarLevel: rawHero?.CastingLawSkillUnlockHeroStartLevel ?? null,
        castingLawLevel: rawHero?.CastingLawSkillUnlockCastingLawLevel ?? null,
        materials: rawHero?.CastingLawSkillUnlockMaterialsCost ?? []
      },
      resolver: 'ConfigDataHeroInfo.CastingLawSkill_ID -> ConfigDataSkillInfo.ID'
    } : {
      status: 'NOT_RELEASED',
      skillId: null
    }
  };
});

const exclusiveReleasedCount = outputRecords.filter(x => x.exclusiveEquipment.status === 'RELEASED').length;
const exclusiveNotReleasedCount = outputRecords.length - exclusiveReleasedCount;
const centralNotReleasedCount = outputRecords.length - centralReleasedCount;
const uniqueOutputHeroIds = new Set(outputRecords.map(x => x.heroId)).size;
const allExclusivePath46 = outputRecords
  .filter(x => x.exclusiveEquipment.status === 'RELEASED')
  .every(x => x.exclusiveEquipment.acquisitionPathTypes.includes(46));
if (!allExclusivePath46) hardErrors.push('At least one frozen exclusive-equipment record does not preserve PathType=46.');
if (exclusiveReleasedCount !== exclusiveByOwner.size) hardErrors.push('Exclusive released count differs from resolved owner count.');
if (uniqueOutputHeroIds !== 267) hardErrors.push(`Output unique Hero count is ${uniqueOutputHeroIds}, expected 267.`);

const output = {
  version: 1,
  stage: 'hero-page-5-2',
  status: hardErrors.length ? 'FAIL' : 'COMPLETE',
  sourcePolicy: 'Canonical Hero IDs come from hero-name-master. Exclusive ownership is source-resolved only through ConfigDataEquipmentInfo.SkillHero for the frozen acquisitionClass=exclusive-equipment population. Central discipline is source-resolved through ConfigDataHeroInfo.CastingLawSkill_ID -> ConfigDataSkillInfo.ID. Missing features are preserved as NOT_RELEASED; no name/pattern/JobIds inference is used.',
  sources: [
    'data/hero-name-master.v1.json',
    'data/configdata/ConfigDataHeroInfo.json',
    'data/configdata/ConfigDataSkillInfo.json',
    'data/configdata/ConfigDataEquipmentInfo.json',
    'data/generated/equipment_stage2_7_acquisition.json',
    'data/generated/equipment_stage3_2_display_metadata.json'
  ],
  summary: {
    canonicalHeroCount: canonical.length,
    outputHeroCount: outputRecords.length,
    exclusiveReleasedCount,
    exclusiveNotReleasedCount,
    centralDisciplineReleasedCount: centralReleasedCount,
    centralDisciplineNotReleasedCount: centralNotReleasedCount,
    hardErrorCount: hardErrors.length
  },
  records: outputRecords
};

const validation = {
  version: 1,
  stage: 'hero-page-5-2',
  checkpoint: 'final',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  purpose: 'Freeze the 267-Hero exclusive-equipment + central-discipline block from current ConfigData with explicit NOT_RELEASED states and no inferred ownership.',
  checks: {
    canonicalHeroCount: { expected: 267, actual: canonical.length, pass: canonical.length === 267 },
    outputHeroCount: { expected: 267, actual: outputRecords.length, pass: outputRecords.length === 267 },
    uniqueOutputHeroIds: { expected: 267, actual: uniqueOutputHeroIds, pass: uniqueOutputHeroIds === 267 },
    exclusivePopulation: { expected: 167, actual: exclusiveAcquisition.length, pass: exclusiveAcquisition.length === 167 && exclusiveIds.size === 167 },
    exclusiveRawResolution: { expected: 167, actual: exclusiveRaw.length, pass: exclusiveRaw.length === 167 && missingEquipmentIds.length === 0 },
    exclusiveSkillHeroResolution: { expected: exclusiveRaw.length, actual: exclusiveRaw.length - ownerErrors.length, pass: ownerErrors.length === 0 },
    exclusiveOwnerUniqueness: { duplicateOwnerCount: duplicateExclusiveOwners.length, pass: duplicateExclusiveOwners.length === 0 },
    exclusivePathType46: { pass: allExclusivePath46 },
    centralDisciplineSkillResolution: { releasedCount: centralReleasedCount, resolvedCount: centralReleasedCount - centralMissingSkillRefs.length, pass: centralMissingSkillRefs.length === 0 },
    hardErrors: { expected: 0, actual: hardErrors.length, pass: hardErrors.length === 0 }
  },
  ownershipEvidence: {
    resolver: 'ConfigDataEquipmentInfo.SkillHero -> canonical Hero ID',
    resolvedExclusiveCount: exclusiveRaw.length - ownerErrors.length,
    resolvedUniqueOwnerCount: exclusiveByOwner.size,
    descContainsCanonicalOwnerNameCount: descOwnerNameMatchCount,
    representative: {
      equipmentId: 273,
      equipmentNameCn: equipmentById.get(273)?.Name ?? null,
      skillHero: equipmentById.get(273)?.SkillHero ?? null,
      canonicalOwner: canonicalById.get(Number(equipmentById.get(273)?.SkillHero ?? 0)) ?? null,
      descCn: equipmentById.get(273)?.Desc ?? null
    },
    rejectedFallbacks: [
      'JobIds/ArmyIds equipability restrictions are not treated as owner identity.',
      'Equipment name/description text parsing is not used to assign owner IDs.',
      'PathType=46 identifies exclusive-equipment population but is not treated as an owner resolver.'
    ]
  },
  centralDisciplineEvidence: {
    resolver: 'ConfigDataHeroInfo.CastingLawSkill_ID -> ConfigDataSkillInfo.ID',
    releasedCount: centralReleasedCount,
    unresolvedSkillRefs: centralMissingSkillRefs,
    representative: outputRecords.find(x => x.heroId === 6)?.centralDiscipline ?? null
  },
  diagnostics: {
    missingEquipmentIds,
    ownerErrors,
    duplicateExclusiveOwners,
    centralMissingSkillRefs,
    hardErrors
  },
  summary: output.summary,
  decision: hardErrors.length
    ? 'Do not close Hero Stage 5-2 until all hard errors are resolved.'
    : 'Hero Stage 5-2 is source-resolved and may be frozen as COMPLETE. Stage 5 integration may promote 5-2 without reopening equipment ownership or central-discipline semantics.'
};

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(valDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(valPath, JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify({ status: validation.status, completion: validation.completion, summary: validation.summary, checks: validation.checks, ownershipEvidence: validation.ownershipEvidence, hardErrors }, null, 2));
if (hardErrors.length) process.exitCode = 1;
