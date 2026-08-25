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
const itemRows = extractRows(JSON.parse(fs.readFileSync(itemPath, 'utf8')), ['FuncType', 'FuncTypeParam1', 'Icon']);
const canonical = equipmentRows.filter(isCanonicalSsr);
const canonicalById = new Map(canonical.map(row => [String(idOf(row)), row]));
const canonicalIds = new Set(canonicalById.keys());

function coverage(rows, field) {
  return rows.filter(row => row?.[field] !== undefined && row?.[field] !== null && row?.[field] !== '').length;
}

function groupCount(values) {
  const out = {};
  for (const value of values) {
    const key = String(value ?? '<missing>');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

const directIdMatches = itemRows.filter(row => canonicalIds.has(String(row?.ID)));
const directIdUniqueIds = new Set(directIdMatches.map(row => String(row.ID)));

const param1Rows = itemRows.filter(row => canonicalIds.has(String(row?.FuncTypeParam1)));
const param1ByEquipment = new Map();
for (const row of param1Rows) {
  const id = String(row.FuncTypeParam1);
  if (!param1ByEquipment.has(id)) param1ByEquipment.set(id, []);
  param1ByEquipment.get(id).push(row);
}

let param1ReferencedIds = 0;
let param1MissingIds = [];
let param1OneToOneIds = 0;
let param1MultiIds = 0;
let sameNameRows = 0;
let sameIconRows = 0;
let sameNameAndIconRows = 0;
const idsWithSameNameAndIcon = new Set();
const semanticMatchFuncTypes = [];

for (const [id, equipment] of canonicalById) {
  const refs = param1ByEquipment.get(id) ?? [];
  if (refs.length === 0) {
    param1MissingIds.push(idOf(equipment));
    continue;
  }
  param1ReferencedIds += 1;
  if (refs.length === 1) param1OneToOneIds += 1;
  else param1MultiIds += 1;

  for (const item of refs) {
    const sameName = item?.Name !== undefined && equipment?.Name !== undefined && String(item.Name) === String(equipment.Name);
    const sameIcon = item?.Icon !== undefined && equipment?.Icon !== undefined && String(item.Icon) === String(equipment.Icon);
    if (sameName) sameNameRows += 1;
    if (sameIcon) sameIconRows += 1;
    if (sameName && sameIcon) {
      sameNameAndIconRows += 1;
      idsWithSameNameAndIcon.add(id);
      semanticMatchFuncTypes.push(item?.FuncType ?? null);
    }
  }
}

const missingEquipmentTypeIds = canonical
  .filter(row => row?.EquipmentType === undefined || row?.EquipmentType === null)
  .map(row => idOf(row));

const directBasicComplete = canonical.filter(row =>
  idOf(row) !== null &&
  row?.Name !== undefined && row?.Name !== null && row?.Name !== '' &&
  row?.Icon !== undefined && row?.Icon !== null && row?.Icon !== '' &&
  row?.Rank !== undefined && row?.Rank !== null &&
  row?.Label !== undefined && row?.Label !== null &&
  Number.isInteger(normalizedSlot(row)) && normalizedSlot(row) >= 0 && normalizedSlot(row) <= 3
);

const samples = canonical.slice(0, 8).map(row => ({
  id: idOf(row),
  name: row?.Name ?? null,
  icon: row?.Icon ?? null,
  rank: row?.Rank ?? null,
  rawEquipmentType: row?.EquipmentType ?? null,
  normalizedSlot: normalizedSlot(row),
  label: row?.Label ?? null,
}));

const result = {
  sources: {
    equipment: 'data/configdata/ConfigDataEquipmentInfo.json',
    item: 'data/configdata/ConfigDataItemInfo.json',
  },
  canonicalRule: 'Rank=4 and normalized EquipmentType 0..3 with matching Label',
  decision: {
    basicMetadataMaster: 'ConfigDataEquipmentInfo.ID',
    basicMetadataRequiresItemInfoJoin: false,
    itemInfoDirectIdJoinAccepted: false,
    reason: 'Canonical SSR equipment has complete ID/Name/Icon/Rank/slot metadata directly in ConfigDataEquipmentInfo, while ConfigDataItemInfo.ID does not cover the canonical Equipment IDs. FuncTypeParam1 is a non-unique reference relation and is not a basic-metadata primary-key join.',
  },
  counts: {
    equipmentRecords: equipmentRows.length,
    itemRecords: itemRows.length,
    canonicalSsrEquipment: canonical.length,
    directBasicComplete: directBasicComplete.length,
  },
  directEquipmentFields: {
    ID: coverage(canonical, 'ID'),
    Name: coverage(canonical, 'Name'),
    Icon: coverage(canonical, 'Icon'),
    Rank: coverage(canonical, 'Rank'),
    Label: coverage(canonical, 'Label'),
    EquipmentTypeExplicit: coverage(canonical, 'EquipmentType'),
    EquipmentTypeMissingButNormalizedToWeapon: missingEquipmentTypeIds.length,
    EquipmentTypeMissingIds: missingEquipmentTypeIds,
  },
  itemInfoRelations: {
    directId: {
      matchedCanonicalIds: directIdUniqueIds.size,
      matchedRows: directIdMatches.length,
      coverageOfCanonical: directIdUniqueIds.size / canonical.length,
      acceptedAsCanonicalJoin: false,
    },
    funcTypeParam1Reference: {
      referencedCanonicalIds: param1ReferencedIds,
      referenceRows: param1Rows.length,
      missingCanonicalIds: param1MissingIds.length,
      missingIds: param1MissingIds,
      oneReferenceRowIds: param1OneToOneIds,
      multipleReferenceRowIds: param1MultiIds,
      sameNameRows,
      sameIconRows,
      sameNameAndIconRows,
      idsWithSameNameAndIcon: idsWithSameNameAndIcon.size,
      sameNameAndIconFuncTypeCounts: groupCount(semanticMatchFuncTypes),
      acceptedAsBasicMetadataJoin: false,
      note: 'Reference field exists, but cardinality is not 1:1 and is not required for Stage 2-2 basic metadata.',
    },
  },
  samples,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
