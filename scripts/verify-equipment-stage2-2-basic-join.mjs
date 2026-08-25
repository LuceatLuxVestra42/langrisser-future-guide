import fs from 'node:fs';
import path from 'node:path';

const equipmentPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const itemPath = path.resolve('data/configdata/ConfigDataItemInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_2_basic_join.json');

function scoreRows(rows, preferredKeys = []) {
  if (!Array.isArray(rows)) return -1;
  let score = 0;
  for (const row of rows.slice(0, 100)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const key of preferredKeys) if (key in row) score += 2;
    if ('ID' in row || 'Id' in row || 'id' in row) score += 2;
    if ('Name' in row || 'name' in row) score += 1;
  }
  return score;
}

function extractRows(doc, preferredKeys = []) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') throw new Error('Unsupported JSON root');
  const arrays = Object.entries(doc)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => ({ key, value, score: scoreRows(value, preferredKeys) }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length);
  if (arrays.length && arrays[0].score > 0) return arrays[0].value;
  const objectRows = Object.values(doc).filter(v => v && typeof v === 'object' && !Array.isArray(v));
  if (objectRows.length) return objectRows;
  throw new Error('Could not locate record collection');
}

function idOf(row) {
  return row?.ID ?? row?.Id ?? row?.id ?? null;
}

const expectedLabels = {
  0: new Set([1, 2, 3, 4, 5, 6, 7]),
  1: new Set([8, 9, 10]),
  2: new Set([11, 12, 13]),
  3: new Set([14]),
};

function normalizedSlot(row) {
  return row?.EquipmentType === undefined || row?.EquipmentType === null ? 0 : Number(row.EquipmentType);
}

function isCanonicalSsr(row) {
  if (Number(row?.Rank) !== 4) return false;
  const slot = normalizedSlot(row);
  const label = row?.Label === undefined || row?.Label === null ? null : Number(row.Label);
  return Number.isInteger(slot) && Object.hasOwn(expectedLabels, String(slot)) && label !== null && expectedLabels[slot].has(label);
}

const equipmentRows = extractRows(JSON.parse(fs.readFileSync(equipmentPath, 'utf8')), ['Rank', 'Label', 'EquipmentType']);
const itemRows = extractRows(JSON.parse(fs.readFileSync(itemPath, 'utf8')), ['FuncType', 'Icon']);
const canonical = equipmentRows.filter(isCanonicalSsr);
const canonicalIds = new Set(canonical.map(row => String(idOf(row))));

function fieldCoverage(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row ?? {})) {
      if (value !== undefined && value !== null && value !== '') counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function candidateFieldsByPattern(rows, pattern) {
  const coverage = fieldCoverage(rows);
  return Object.entries(coverage)
    .filter(([key]) => pattern.test(key))
    .map(([key, count]) => ({ field: key, count }));
}

function idJoinCandidates(rows, targetIds) {
  const byField = new Map();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      const s = String(value);
      if (!targetIds.has(s)) continue;
      if (!byField.has(key)) byField.set(key, { matchedValues: new Set(), matchedRows: 0 });
      const entry = byField.get(key);
      entry.matchedRows += 1;
      entry.matchedValues.add(s);
    }
  }
  return [...byField.entries()]
    .map(([field, v]) => ({ field, matchedCanonicalIds: v.matchedValues.size, matchedRows: v.matchedRows }))
    .sort((a, b) => b.matchedCanonicalIds - a.matchedCanonicalIds || b.matchedRows - a.matchedRows || a.field.localeCompare(b.field));
}

const joinCandidates = idJoinCandidates(itemRows, canonicalIds);
const bestJoin = joinCandidates[0] ?? null;
let joined = [];
let missingItemIds = [];
let duplicateItemJoinIds = [];

if (bestJoin) {
  const map = new Map();
  for (const row of itemRows) {
    const v = row?.[bestJoin.field];
    if (v === undefined || v === null || v === '') continue;
    const key = String(v);
    if (!canonicalIds.has(key)) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const equipment of canonical) {
    const id = String(idOf(equipment));
    const matches = map.get(id) ?? [];
    if (matches.length === 0) missingItemIds.push(idOf(equipment));
    if (matches.length > 1) duplicateItemJoinIds.push({ id: idOf(equipment), count: matches.length });
    if (matches.length === 1) joined.push({ equipment, item: matches[0] });
  }
}

function pick(row, keys) {
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return { field: key, value: row[key] };
  return null;
}

const nameCandidateKeys = ['Name', 'name', 'ItemName', 'EquipmentName'];
const iconCandidateKeys = ['Icon', 'icon', 'IconPath', 'IconName', 'ResIcon'];

let equipmentNamePresent = 0;
let itemNamePresent = 0;
let bothNamePresent = 0;
let sameName = 0;
let equipmentIconPresent = 0;
let itemIconPresent = 0;
let bothIconPresent = 0;
let sameIcon = 0;
const samples = [];

for (const { equipment, item } of joined) {
  const en = pick(equipment, nameCandidateKeys);
  const inn = pick(item, nameCandidateKeys);
  const ei = pick(equipment, iconCandidateKeys);
  const ii = pick(item, iconCandidateKeys);
  if (en) equipmentNamePresent += 1;
  if (inn) itemNamePresent += 1;
  if (en && inn) {
    bothNamePresent += 1;
    if (String(en.value) === String(inn.value)) sameName += 1;
  }
  if (ei) equipmentIconPresent += 1;
  if (ii) itemIconPresent += 1;
  if (ei && ii) {
    bothIconPresent += 1;
    if (String(ei.value) === String(ii.value)) sameIcon += 1;
  }
  if (samples.length < 8) {
    samples.push({
      id: idOf(equipment),
      equipment: {
        name: en,
        icon: ei,
        rank: equipment?.Rank ?? null,
        rawEquipmentType: equipment?.EquipmentType ?? null,
        normalizedSlot: normalizedSlot(equipment),
        label: equipment?.Label ?? null,
      },
      item: {
        joinField: bestJoin?.field ?? null,
        name: inn,
        icon: ii,
        funcType: item?.FuncType ?? null,
      },
    });
  }
}

const result = {
  sources: {
    equipment: 'data/configdata/ConfigDataEquipmentInfo.json',
    item: 'data/configdata/ConfigDataItemInfo.json',
  },
  canonicalRule: 'Rank=4 and normalized EquipmentType 0..3 with matching Label',
  counts: {
    equipmentRecords: equipmentRows.length,
    itemRecords: itemRows.length,
    canonicalSsrEquipment: canonical.length,
  },
  directEquipmentFields: {
    nameCandidates: candidateFieldsByPattern(canonical, /name/i),
    iconCandidates: candidateFieldsByPattern(canonical, /icon|image|res/i),
    rankCoverage: canonical.filter(r => r?.Rank !== undefined && r?.Rank !== null).length,
    equipmentTypeCoverage: canonical.filter(r => r?.EquipmentType !== undefined && r?.EquipmentType !== null).length,
    labelCoverage: canonical.filter(r => r?.Label !== undefined && r?.Label !== null).length,
  },
  itemJoin: {
    candidates: joinCandidates.slice(0, 20),
    selectedCandidate: bestJoin,
    joinedExactlyOnce: joined.length,
    missing: missingItemIds.length,
    duplicate: duplicateItemJoinIds.length,
    missingIds: missingItemIds.slice(0, 100),
    duplicateIds: duplicateItemJoinIds.slice(0, 100),
  },
  fieldAgreementOnJoinedRows: {
    equipmentNamePresent,
    itemNamePresent,
    bothNamePresent,
    sameName,
    equipmentIconPresent,
    itemIconPresent,
    bothIconPresent,
    sameIcon,
  },
  schemaCoverage: {
    equipment: fieldCoverage(canonical),
    item: fieldCoverage(itemRows),
  },
  samples,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
