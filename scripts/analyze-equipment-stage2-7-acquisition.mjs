import fs from 'node:fs';
import path from 'node:path';

const load = p => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
const stable = v => JSON.stringify(v ?? null);
const addSig = (map, value, row) => {
  const sig = stable(value);
  if (!map.has(sig)) map.set(sig, { signature: sig, count: 0, examples: [] });
  const x = map.get(sig);
  x.count++;
  if (x.examples.length < 6) x.examples.push({ equipmentId: Number(row.ID), name: row.Name ?? null });
};
const shapeOf = v => {
  if (v == null) return 'nullish';
  if (Array.isArray(v)) return `array:${v.length}:${[...new Set(v.map(x => x == null ? 'null' : Array.isArray(x) ? 'array' : typeof x))].sort().join('|')}`;
  return typeof v;
};
const addCount = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

const restrictions = load('data/generated/equipment_stage2_6_restrictions.json');
const equipment = load('data/configdata/ConfigDataEquipmentInfo.json');
const ids = new Set((restrictions.records ?? []).map(r => Number(r.equipmentId)));
const rows = equipment.filter(r => ids.has(Number(r.ID)));
if (ids.size !== 390 || rows.length !== 390) throw new Error(`Stage2-6 checkpoint mismatch: ids=${ids.size}, equipmentRows=${rows.length}`);

const listSigs = new Map();
const descSigs = new Map();
const listShapes = {}, descShapes = {};
const listValues = new Map();
const descValues = new Map();
const pairSigs = new Map();
const fieldPresence = {
  getPathListNonEmpty: 0,
  getPathDescNonEmpty: 0,
  randomDropRewardIdNonZero: 0,
  archiveDisplayTruthy: 0
};

for (const r of rows) {
  const list = r.GetPathList ?? null;
  const desc = r.GetPathDesc ?? null;
  addSig(listSigs, list, r);
  addSig(descSigs, desc, r);
  addSig(pairSigs, { list, desc }, r);
  addCount(listShapes, shapeOf(list));
  addCount(descShapes, shapeOf(desc));
  if (Array.isArray(list) && list.length) fieldPresence.getPathListNonEmpty++;
  else if (!Array.isArray(list) && list != null && list !== '' && list !== 0) fieldPresence.getPathListNonEmpty++;
  if (Array.isArray(desc) && desc.length) fieldPresence.getPathDescNonEmpty++;
  else if (!Array.isArray(desc) && desc != null && desc !== '' && desc !== 0) fieldPresence.getPathDescNonEmpty++;
  if (Number(r.RandomDropRewardID ?? 0) !== 0) fieldPresence.randomDropRewardIdNonZero++;
  if (Boolean(r.ArchiveDisplay)) fieldPresence.archiveDisplayTruthy++;

  if (Array.isArray(list)) for (const v of list) {
    const k = stable(v); if (!listValues.has(k)) listValues.set(k, { value: v, count: 0, examples: [] });
    const x = listValues.get(k); x.count++; if (x.examples.length < 5) x.examples.push({ equipmentId:Number(r.ID), name:r.Name??null });
  }
  if (Array.isArray(desc)) for (const v of desc) {
    const k = stable(v); if (!descValues.has(k)) descValues.set(k, { value: v, count: 0, examples: [] });
    const x = descValues.get(k); x.count++; if (x.examples.length < 5) x.examples.push({ equipmentId:Number(r.ID), name:r.Name??null });
  }
}

const ranked = m => [...m.values()].sort((a,b)=>b.count-a.count || a.signature?.localeCompare?.(b.signature ?? '') || 0);
const rankedValues = m => [...m.values()].sort((a,b)=>b.count-a.count || stable(a.value).localeCompare(stable(b.value)));

const result = {
  source: {
    population: 'data/generated/equipment_stage2_6_restrictions.json',
    equipment: 'data/configdata/ConfigDataEquipmentInfo.json'
  },
  canonicalCount: rows.length,
  fieldPresence,
  shapes: { GetPathList: listShapes, GetPathDesc: descShapes },
  uniqueCounts: {
    getPathListSignatures: listSigs.size,
    getPathDescSignatures: descSigs.size,
    combinedSignatures: pairSigs.size,
    getPathListAtomicValues: listValues.size,
    getPathDescAtomicValues: descValues.size
  },
  getPathListAtomicValues: rankedValues(listValues),
  getPathDescAtomicValues: rankedValues(descValues),
  topGetPathListSignatures: ranked(listSigs).slice(0, 60),
  topGetPathDescSignatures: ranked(descSigs).slice(0, 60),
  topCombinedSignatures: ranked(pairSigs).slice(0, 80),
  representativeRows: rows.slice().sort((a,b)=>Number(a.ID)-Number(b.ID)).filter((r,i,a)=>i<12 || i>=a.length-12).map(r=>({
    equipmentId:Number(r.ID), name:r.Name??null, sortIndex:r.SortIndex??null, archiveDisplay:r.ArchiveDisplay??null,
    getPathList:r.GetPathList??null, getPathDesc:r.GetPathDesc??null, randomDropRewardId:r.RandomDropRewardID??null
  }))
};

fs.mkdirSync('data/generated',{recursive:true});
fs.writeFileSync('data/generated/equipment_stage2_7_acquisition_analysis.json', JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({canonicalCount:result.canonicalCount, fieldPresence:result.fieldPresence, shapes:result.shapes, uniqueCounts:result.uniqueCounts, getPathListAtomicValues:result.getPathListAtomicValues, getPathDescAtomicValues:result.getPathDescAtomicValues, topCombinedSignatures:result.topCombinedSignatures.slice(0,25)},null,2));
