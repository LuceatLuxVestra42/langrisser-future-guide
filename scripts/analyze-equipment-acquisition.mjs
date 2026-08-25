import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p,'utf8'));
const equipment = load('data/configdata/ConfigDataEquipmentInfo.json');
const restrictions = load('data/generated/equipment_stage2_6_restrictions.json');
const ids = new Set(restrictions.records.map(r=>Number(r.equipmentId)));
const rows = equipment.filter(r=>ids.has(Number(r.ID)));

const norm = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
const key = v => JSON.stringify(v ?? null);
const countMap = new Map();
const descMap = new Map();
const listMap = new Map();
const records = [];
for (const r of rows) {
  const list = norm(r.GetPathList);
  const desc = r.GetPathDesc ?? null;
  const sig = key({list,desc});
  countMap.set(sig,(countMap.get(sig)||0)+1);
  const lk=key(list); listMap.set(lk,(listMap.get(lk)||0)+1);
  const dk=key(desc); descMap.set(dk,(descMap.get(dk)||0)+1);
  records.push({equipmentId:Number(r.ID),name:r.Name,slot:r.EquipmentType??0,label:r.Label??null,getPathList:list,getPathDesc:desc});
}
const sortCounts = m => [...m.entries()].map(([value,count])=>({value:JSON.parse(value),count})).sort((a,b)=>b.count-a.count);
const result={
  source:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',canonicalIds:'data/generated/equipment_stage2_6_restrictions.json'},
  canonicalCount:rows.length,
  counts:{
    emptyGetPathList:records.filter(r=>r.getPathList.length===0).length,
    emptyGetPathDesc:records.filter(r=>r.getPathDesc==null||r.getPathDesc==='').length,
    distinctGetPathLists:listMap.size,
    distinctGetPathDescs:descMap.size,
    distinctCombinedSignatures:countMap.size
  },
  topGetPathLists:sortCounts(listMap).slice(0,40),
  topGetPathDescs:sortCounts(descMap).slice(0,80),
  records
};
fs.mkdirSync('data/generated',{recursive:true});
fs.writeFileSync('data/generated/equipment_acquisition_path_analysis.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({canonicalCount:result.canonicalCount,counts:result.counts,topGetPathLists:result.topGetPathLists.slice(0,20),topGetPathDescs:result.topGetPathDescs.slice(0,30)},null,2));