import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const summary = JSON.parse(fs.readFileSync(path.join(root, 'data/validation/equipment-image-stage2-acquisition-summary.v1.json'), 'utf8'));
const display = JSON.parse(fs.readFileSync(path.join(root, 'data/generated/equipment_stage3_2_display_metadata.json'), 'utf8'));
const filterMap = JSON.parse(fs.readFileSync(path.join(root, 'data/generated/equipment_stage2_3_filter_map.json'), 'utf8'));

const displayRows = Array.isArray(display) ? display : (display.records ?? display.items ?? display.equipment ?? []);
const filterRows = Array.isArray(filterMap) ? filterMap : (filterMap.records ?? filterMap.items ?? filterMap.equipment ?? []);

function idOf(row) { return Number(row.equipmentId ?? row.ID ?? row.id); }
const displayById = new Map(displayRows.map(r => [idOf(r), r]));
const filterById = new Map(filterRows.map(r => [idOf(r), r]));

const records = summary.unresolved.map(u => {
  const d = displayById.get(Number(u.equipmentId));
  const f = filterById.get(Number(u.equipmentId));
  if (!d) throw new Error(`Missing display metadata for ${u.equipmentId}`);
  return {
    equipmentId: Number(u.equipmentId),
    nameZh: d.name ?? d.Name ?? d.displayName ?? null,
    sourceIconPath: u.sourceIconPath,
    sourceBasename: u.sourceBasename,
    holdStatus: u.status,
    category: f?.category ?? null,
    group: f?.group ?? null,
    subtype: f?.subtype ?? null,
    label: f?.label ?? d.label ?? d.Label ?? null,
    targetRepositoryPath: u.targetRepositoryPath,
    driveFileId: u.driveFileId ?? null,
    actualFileName: u.actualFileName ?? null,
  };
});

const out = {
  index: 'equipment-image-stage2-hold29-index-v1',
  source: 'Stage2 acquisition summary + frozen display/filter metadata',
  count: records.length,
  records,
};
if (records.length !== 29) throw new Error(`Expected 29 holds, got ${records.length}`);
fs.writeFileSync(path.join(root, 'data/generated/equipment-image-stage2-hold29-index.v1.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
