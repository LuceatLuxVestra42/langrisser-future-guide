import fs from 'node:fs';
import path from 'node:path';

const inputPath = path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const outputPath = path.resolve('data/generated/equipment_stage2_1_census.json');

const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function scoreRows(rows) {
  if (!Array.isArray(rows)) return -1;
  let score = 0;
  for (const row of rows.slice(0, 100)) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      if ('Rank' in row) score += 3;
      if ('ID' in row || 'Id' in row || 'id' in row) score += 2;
      if ('Label' in row) score += 1;
      if ('EquipmentType' in row) score += 1;
    }
  }
  return score;
}

function extractRows(doc) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') {
    throw new Error('Unsupported ConfigDataEquipmentInfo JSON root');
  }

  const arrayCandidates = Object.entries(doc)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => ({ key, value, score: scoreRows(value) }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length);

  if (arrayCandidates.length && arrayCandidates[0].score > 0) {
    return arrayCandidates[0].value;
  }

  const objectRows = Object.values(doc).filter(
    value => value && typeof value === 'object' && !Array.isArray(value) && 'Rank' in value,
  );
  if (objectRows.length) return objectRows;

  throw new Error('Could not locate equipment record array');
}

const rows = extractRows(document);
const rankCounts = {};
for (const row of rows) {
  const rank = String(row?.Rank ?? '<missing>');
  rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
}

const ssr = rows.filter(row => Number(row?.Rank) === 4);
const slotCounts = {};
const labelCounts = {};
const slotLabelCounts = {};
const missingEquipmentTypeIds = [];
const missingIds = [];
const invalidSlots = [];
const labelMismatches = [];
const duplicateIds = [];
const ids = new Map();

const expectedLabels = {
  0: new Set([1, 2, 3, 4, 5, 6, 7]),
  1: new Set([8, 9, 10]),
  2: new Set([11, 12, 13]),
  3: new Set([14]),
};

function idOf(row) {
  return row?.ID ?? row?.Id ?? row?.id ?? null;
}

for (const row of ssr) {
  const id = idOf(row);
  const name = row?.Name ?? null;
  const equipmentTypeMissing = row?.EquipmentType === undefined || row?.EquipmentType === null;
  const slot = equipmentTypeMissing ? 0 : Number(row.EquipmentType);
  const label = row?.Label === undefined || row?.Label === null ? null : Number(row.Label);

  if (id === null || id === '') {
    missingIds.push({ name });
  } else if (ids.has(String(id))) {
    duplicateIds.push({ id, firstName: ids.get(String(id)), duplicateName: name });
  } else {
    ids.set(String(id), name);
  }

  if (equipmentTypeMissing) missingEquipmentTypeIds.push(id);

  const slotKey = String(slot);
  const labelKey = label === null ? '<missing>' : String(label);
  slotCounts[slotKey] = (slotCounts[slotKey] ?? 0) + 1;
  labelCounts[labelKey] = (labelCounts[labelKey] ?? 0) + 1;
  slotLabelCounts[slotKey] ??= {};
  slotLabelCounts[slotKey][labelKey] = (slotLabelCounts[slotKey][labelKey] ?? 0) + 1;

  if (!Number.isInteger(slot) || !Object.hasOwn(expectedLabels, slotKey)) {
    invalidSlots.push({ id, name, rawEquipmentType: row?.EquipmentType ?? null, normalizedSlot: slot, label });
    continue;
  }

  if (label === null || !expectedLabels[slot].has(label)) {
    labelMismatches.push({ id, name, slot, label });
  }
}

const result = {
  source: 'data/configdata/ConfigDataEquipmentInfo.json',
  rule: {
    ssrRank: 4,
    equipmentTypeDefaultWhenMissing: 0,
    expectedLabelsBySlot: {
      0: [1, 2, 3, 4, 5, 6, 7],
      1: [8, 9, 10],
      2: [11, 12, 13],
      3: [14],
    },
  },
  counts: {
    allEquipmentRecords: rows.length,
    rankCounts,
    ssrRecords: ssr.length,
    slotCounts,
    labelCounts,
    slotLabelCounts,
    missingEquipmentType: missingEquipmentTypeIds.length,
    missingId: missingIds.length,
    duplicateId: duplicateIds.length,
    invalidSlot: invalidSlots.length,
    labelMismatch: labelMismatches.length,
  },
  anomalies: {
    missingIds,
    duplicateIds,
    invalidSlots,
    labelMismatches,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
