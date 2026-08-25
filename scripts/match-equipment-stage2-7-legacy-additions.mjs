import fs from 'node:fs';

const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const focus=load('data/generated/equipment_stage2_7_focus.json');
const stats=load('data/generated/equipment_stage2_4_stats.json');
const statById=new Map(stats.records.map(r=>[Number(r.id),r.stats]));

const S=(slot,label,...pairs)=>({slot,label,stats:pairs});
const groups=[
  ['2019-09-04',[S(3,14,['공격',75],['마방',43]),S(2,13,['생명',364],['마방',65]),S(1,8,['생명',437],['방어',65]),S(0,5,['생명',583],['지력',85])]],
  ['2019-10-09',[S(0,1,['생명',583],['공격',85]),S(0,3,['공격',107],['기술',43]),S(0,7,['생명',437],['지력',107]),S(3,14,['방어',48],['마방',43])]],
  ['2020-02-05',[S(1,9,['생명',509],['방어',59]),S(2,12,['생명',437],['마방',59]),S(0,3,['공격',107],['기술',43]),S(3,14,['생명',509],['지력',75])]],
  ['2020-06-03',[S(2,11,['생명',583],['마방',48]),S(1,8,['생명',437],['방어',65]),S(0,5,['생명',583],['공격',85]),S(1,10,['생명',583],['방어',54])]],
  ['2020-09-16',[S(0,2,['생명',364],['공격',118]),S(1,9,['생명',509],['방어',59]),S(3,14,['공격',75],['지력',75]),S(2,13,['생명',364],['마방',65])]],
  ['2021-01-06',[S(0,7,['생명',437],['지력',107]),S(1,8,['생명',437],['방어',65]),S(3,14,['공격',75],['기술',37]),S(2,13,['생명',364],['마방',65])]],
  ['2021-05-26',[S(0,4,['공격',96],['기술',54]),S(1,10,['생명',583],['방어',64]),S(2,12,['생명',437],['마방',59]),S(3,14,['공격',75],['방어',43])]],
  ['2021-09-15',[S(0,3,['생명',437],['공격',107]),S(1,8,['생명',437],['방어',65]),S(2,13,['생명',364],['마방',65]),S(3,14,['생명',509],['공격',75])]],
  ['2022-01-05',[S(0,7,['생명',437],['지력',107]),S(1,10,['생명',583],['방어',54]),S(2,13,['생명',364],['마방',65]),S(3,14,['방어',48],['마방',43])]],
  ['2022-04-27',[S(0,1,['생명',583],['공격',85]),S(1,9,['생명',509],['방어',59]),S(2,13,['생명',364],['마방',65]),S(3,14,['지력',75],['마방',43])]],
  ['2022-08-17',[S(0,5,['생명',583],['공격',85]),S(1,8,['생명',437],['방어',65]),S(2,11,['생명',583],['마방',48]),S(3,14,['공격',75],['방어',43])]],
  ['2022-12-14',[S(0,6,['공격',107],['기술',43]),S(1,10,['생명',583],['방어',54]),S(2,12,['생명',439],['마방',59]),S(3,14,['생명',509],['지력',75])]],
  ['2023-04-12',[S(0,1,['생명',583],['공격',85]),S(1,9,['생명',509],['방어',59]),S(2,13,['생명',364],['마방',65]),S(3,14,['생명',509],['지력',75])]],
  ['2023-07-19',[S(0,7,['생명',437],['지력',107]),S(1,8,['생명',437],['방어',65]),S(2,11,['생명',583],['마방',48]),S(3,14,['생명',509],['방어',48])]],
  ['2023-11-08',[S(0,3,['공격',107],['기술',43]),S(1,10,['생명',583],['방어',54]),S(2,12,['생명',439],['마방',59]),S(3,14,['공격',75],['방어',43])]],
  ['2024-02-21',[S(0,3,['생명',437],['공격',107]),S(1,9,['생명',509],['방어',59]),S(2,13,['생명',364],['마방',65]),S(3,14,['공격',75],['지력',75])]],
  ['2024-06-12',[S(0,1,['생명',583],['공격',85]),S(1,8,['생명',437],['방어',65]),S(2,11,['생명',583],['마방',48]),S(3,14,['생명',509],['공격',75])]],
  ['2024-09-25',[S(0,6,['공격',107],['기술',43]),S(1,10,['생명',583],['방어',54]),S(2,12,['생명',439],['마방',59]),S(3,14,['방어',48],['마방',43])]],
  ['2025-01-22',[S(0,7,['생명',437],['지력',107]),S(1,9,['생명',509],['방어',59]),S(2,11,['생명',583],['마방',48]),S(3,14,['공격',75],['지력',75])]],
  ['2025-05-27',[S(0,4,['공격',96],['기술',54]),S(1,8,['생명',437],['방어',65]),S(2,13,['생명',364],['마방',65]),S(3,14,['생명',509],['지력',75])]],
];

const sig=o=>`${o.slot}:${o.label}:`+[...o.stats].map(([k,v])=>`${k}=${v}`).sort().join('|');
const candidate=focus.tail40; // includes recent region; not enough for old history, so reconstruct from historical candidates below
const hist=load('data/generated/equipment_stage2_7_historical_candidates.json').genericCandidates.slice().sort((a,b)=>a.id-b.id).map(r=>({
  ...r,
  stats:(statById.get(Number(r.id))??[]).map(s=>[s.propertyKo,Number(s.maxValue)])
}));
const windows=[];
for(let i=0;i<=hist.length-4;i++){
  const rows=hist.slice(i,i+4);
  const gap=rows.at(-1).id-rows[0].id;
  windows.push({i,rows,gap,sigs:rows.map(sig)});
}
const score=(expected,window)=>{
  const counts=new Map(); for(const s of window.sigs) counts.set(s,(counts.get(s)??0)+1);
  let n=0; for(const e of expected){const s=sig(e);const c=counts.get(s)??0;if(c){n++;counts.set(s,c-1);}}
  return n;
};
const candidatesByGroup=groups.map(([date,expected])=>windows.map(w=>({date,i:w.i,score:score(expected,w),gap:w.gap,ids:w.rows.map(r=>r.id),names:w.rows.map(r=>r.name)})).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score||a.gap-b.gap||a.i-b.i).slice(0,30));

// Dynamic programming: chronological, non-overlapping windows. Prioritize total signature score, then compact ID gaps.
let states=new Map([[-4,{total:0,gapPenalty:0,picks:[]}]]);
for(let g=0;g<groups.length;g++){
  const opts=windows.map(w=>({w,s:score(groups[g][1],w)})).filter(x=>x.s>=2);
  const next=new Map();
  for(const [prevEnd,st] of states){
    for(const o of opts){
      if(o.w.i<=prevEnd) continue;
      const ns={total:st.total+o.s,gapPenalty:st.gapPenalty+o.w.gap,picks:[...st.picks,{date:groups[g][0],i:o.w.i,score:o.s,gap:o.w.gap,ids:o.w.rows.map(r=>r.id),names:o.w.rows.map(r=>r.name),rows:o.w.rows}]};
      const end=o.w.i+3; const old=next.get(end);
      if(!old||ns.total>old.total||(ns.total===old.total&&ns.gapPenalty<old.gapPenalty)) next.set(end,ns);
    }
  }
  states=next;
}
const best=[...states.values()].sort((a,b)=>b.total-a.total||a.gapPenalty-b.gapPenalty)[0]??null;
const matchedIds=new Set(best?.picks.flatMap(p=>p.ids)??[]);
const result={
  source:{history:'Google Sheet 추가장비 A2:G102 (encoded signatures)',stats:'data/generated/equipment_stage2_4_stats.json',population:'data/generated/equipment_stage2_7_historical_candidates.json'},
  expectedGroups:groups.length,
  expectedItems:groups.length*4,
  bestTotalScore:best?.total??null,
  maxPossibleScore:groups.length*4,
  picks:best?.picks??[],
  unmatchedGenericAfterLegacy:hist.filter(r=>!matchedIds.has(r.id)).map(r=>({id:r.id,name:r.name,slot:r.slot,label:r.label,sortIndex:r.sortIndex,paths:r.paths})),
  candidatesByGroup
};
fs.writeFileSync('data/generated/equipment_stage2_7_legacy_match.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({expectedGroups:result.expectedGroups,bestTotalScore:result.bestTotalScore,maxPossibleScore:result.maxPossibleScore,picks:result.picks.map(p=>({date:p.date,score:p.score,gap:p.gap,ids:p.ids,names:p.names}))},null,2));
