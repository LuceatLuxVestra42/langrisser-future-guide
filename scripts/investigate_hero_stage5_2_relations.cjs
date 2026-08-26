'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cfgDir = path.join(root, 'data', 'configdata');
const outDir = path.join(root, 'data', 'validation');
const outPath = path.join(outDir, 'hero-page-stage5-2-relation-discovery.v1.json');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function rel(p) { return path.relative(root, p).replaceAll('\\', '/'); }
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    if (Array.isArray(v.rows)) return v.rows;
    if (Array.isArray(v.records)) return v.records;
    if (Array.isArray(v.data)) return v.data;
  }
  return [];
}
function nums(v) {
  if (Array.isArray(v)) return v.flatMap(nums);
  if (v && typeof v === 'object') return Object.values(v).flatMap(nums);
  const n = Number(v);
  return Number.isFinite(n) ? [n] : [];
}
function compactValue(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 12).map(compactValue);
  const out = {};
  for (const [k, x] of Object.entries(v).slice(0, 20)) out[k] = compactValue(x);
  return out;
}
function walkObjects(v, cb, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 7) return;
  if (!Array.isArray(v)) cb(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) walkObjects(x, cb, depth + 1);
}

const acquisition = readJson('data/generated/equipment_stage2_7_acquisition.json');
const exclusiveRows = (acquisition.records || []).filter(r => r.acquisitionClass === 'exclusive-equipment');
const exclusiveIds = new Set(exclusiveRows.map(r => Number(r.equipmentId)).filter(Number.isFinite));

const candidateFiles = [];
const allFiles = fs.readdirSync(cfgDir)
  .filter(n => n.endsWith('.json'))
  .map(n => path.join(cfgDir, n));

for (const file of allFiles) {
  const stat = fs.statSync(file);
  const text = fs.readFileSync(file, 'utf8');
  const hasHeroToken = /Hero(?:_?ID|Id|Ids|List|Info)?/i.test(text);
  const hasEquipToken = /Equip(?:ment)?(?:_?ID|Id|Ids|List|Info)?/i.test(text);
  if (!hasHeroToken || !hasEquipToken) continue;

  const entry = {
    file: rel(file),
    bytes: stat.size,
    parsed: false,
    sameObjectHeroEquipShapeCount: 0,
    exclusiveRefObjectCount: 0,
    heroKeys: [],
    equipmentKeys: [],
    samples: [],
  };
  try {
    const doc = JSON.parse(text);
    entry.parsed = true;
    const hKeys = new Set();
    const eKeys = new Set();
    walkObjects(doc, obj => {
      const keys = Object.keys(obj);
      const heroKeys = keys.filter(k => /Hero/i.test(k));
      const equipKeys = keys.filter(k => /Equip/i.test(k));
      if (!heroKeys.length || !equipKeys.length) return;
      entry.sameObjectHeroEquipShapeCount++;
      heroKeys.forEach(k => hKeys.add(k));
      equipKeys.forEach(k => eKeys.add(k));
      const equipNums = equipKeys.flatMap(k => nums(obj[k]));
      const matchedExclusive = [...new Set(equipNums.filter(n => exclusiveIds.has(n)))];
      if (matchedExclusive.length) entry.exclusiveRefObjectCount++;
      if (entry.samples.length < 12) {
        const sample = {};
        for (const k of [...new Set([...keys.filter(k => /^(ID|Name)$/i.test(k)), ...heroKeys, ...equipKeys])])]) {
          sample[k] = compactValue(obj[k]);
        }
        sample._exclusiveEquipmentIds = matchedExclusive;
        entry.samples.push(sample);
      }
    });
    entry.heroKeys = [...hKeys].sort();
    entry.equipmentKeys = [...eKeys].sort();
  } catch (e) {
    entry.parseError = String(e.message || e);
  }
  candidateFiles.push(entry);
}

// Confirm the already-known central-discipline link against the current parsed ConfigData.
let centralDiscipline = { available: false };
try {
  const heroInfo = asArray(readJson('data/configdata/ConfigDataHeroInfo.json'));
  const skillInfo = asArray(readJson('data/configdata/ConfigDataSkillInfo.json'));
  const skillById = new Map(skillInfo.map(r => [Number(r.ID), r]));
  const rowsWithField = heroInfo.filter(r => Object.prototype.hasOwnProperty.call(r, 'CastingLawSkill_ID'));
  const released = rowsWithField
    .map(r => ({ heroId: Number(r.ID), skillId: Number(r.CastingLawSkill_ID) }))
    .filter(r => Number.isFinite(r.skillId) && r.skillId !== 0);
  const missing = released.filter(r => !skillById.has(r.skillId));
  centralDiscipline = {
    available: true,
    heroInfoRecordCount: heroInfo.length,
    recordsWithCastingLawSkillField: rowsWithField.length,
    releasedCount: released.length,
    notReleasedCount: rowsWithField.length - released.length,
    resolvedSkillCount: released.length - missing.length,
    missingSkillRefs: missing,
    samples: released.slice(0, 12).map(x => ({
      heroId: x.heroId,
      skillId: x.skillId,
      skillName: skillById.get(x.skillId)?.Name ?? null,
      skillDesc: skillById.get(x.skillId)?.Desc ?? null,
    })),
  };
} catch (e) {
  centralDiscipline = { available: false, error: String(e.message || e) };
}

const result = {
  version: 1,
  stage: 'hero-page-5-2',
  checkpoint: 'relation-discovery',
  status: 'REVIEW',
  purpose: 'Narrow current ConfigData sources for Hero exclusive-equipment ownership and revalidate the already-confirmed CastingLawSkill_ID -> SkillInfo relation without fabricating joins.',
  exclusiveEquipmentPopulation: {
    source: 'data/generated/equipment_stage2_7_acquisition.json',
    count: exclusiveRows.length,
    uniqueIdCount: exclusiveIds.size,
    firstIds: exclusiveRows.slice(0, 12).map(r => Number(r.equipmentId)),
    classificationRule: 'acquisitionClass=exclusive-equipment, derived from PathType=46 semantics',
  },
  heroEquipmentCandidateScan: {
    scannedConfigFileCount: allFiles.length,
    candidateFileCount: candidateFiles.length,
    candidates: candidateFiles.sort((a, b) => b.exclusiveRefObjectCount - a.exclusiveRefObjectCount || b.sameObjectHeroEquipShapeCount - a.sameObjectHeroEquipShapeCount || a.file.localeCompare(b.file)),
  },
  centralDiscipline,
  decision: 'Do not freeze Hero->exclusive-equipment ownership until a candidate source or runtime resolver proves the Hero ID namespace. CastingLawSkill_ID may be frozen if all nonzero refs resolve in the current snapshot.',
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  exclusiveEquipmentPopulation: result.exclusiveEquipmentPopulation,
  candidateFileCount: candidateFiles.length,
  topCandidates: result.heroEquipmentCandidateScan.candidates.slice(0, 12).map(x => ({ file: x.file, bytes: x.bytes, sameObjectHeroEquipShapeCount: x.sameObjectHeroEquipShapeCount, exclusiveRefObjectCount: x.exclusiveRefObjectCount, heroKeys: x.heroKeys, equipmentKeys: x.equipmentKeys })),
  centralDiscipline: result.centralDiscipline,
  output: rel(outPath),
}, null, 2));
