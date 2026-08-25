import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync('data/generated/equipment_stage2_7_legacy_match.json','utf8'));
const out={expectedGroups:x.expectedGroups,expectedItems:x.expectedItems,bestTotalScore:x.bestTotalScore,maxPossibleScore:x.maxPossibleScore,picks:(x.picks??[]).map(p=>({date:p.date,score:p.score,gap:p.gap,ids:p.ids,names:p.names,signatures:(p.rows??[]).map(r=>({id:r.id,name:r.name,slot:r.slot,label:r.label,stats:r.stats}))}))};
fs.writeFileSync('data/generated/equipment_stage2_7_legacy_match_summary.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));