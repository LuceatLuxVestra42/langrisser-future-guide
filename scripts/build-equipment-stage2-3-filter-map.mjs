import fs from 'node:fs';
import path from 'node:path';

const equipmentPath=path.resolve('data/configdata/ConfigDataEquipmentInfo.json');
const skillPath=path.resolve('data/configdata/ConfigDataSkillInfo.json');
const outputPath=path.resolve('data/generated/equipment_stage2_3_filter_map.json');

function extractRows(doc, preferred=[]) {
  if (Array.isArray(doc)) return doc;
  const arrays=Object.values(doc??{}).filter(Array.isArray).map(v=>({v,s:v.slice(0,100).reduce((n,r)=>n+preferred.filter(k=>r&&typeof r==='object'&&k in r).length,0)})).sort((a,b)=>b.s-a.s||b.v.length-a.v.length);
  if (arrays.length) return arrays[0].v;
  return Object.values(doc??{}).filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
}
const equipment=extractRows(JSON.parse(fs.readFileSync(equipmentPath,'utf8')),['ID','Rank','Label']);
const skills=extractRows(JSON.parse(fs.readFileSync(skillPath,'utf8')),['ID','Desc']);
const skillById=new Map(skills.map(r=>[String(r.ID),r]));
const expected={0:new Set([1,2,3,4,5,6,7]),1:new Set([8,9,10]),2:new Set([11,12,13]),3:new Set([14])};
const labelMap={
  1:{group:'weapon',subtype:'spear'},2:{group:'weapon',subtype:'axe'},3:{group:'weapon',subtype:'sword'},4:{group:'weapon',subtype:'dagger'},5:{group:'weapon',subtype:'hammer'},6:{group:'weapon',subtype:'bow'},7:{group:'weapon',subtype:'staff'},
  8:{group:'armor',subtype:'heavy'},9:{group:'armor',subtype:'light'},10:{group:'armor',subtype:'cloth'},
  11:{group:'headgear',subtype:'heavy'},12:{group:'headgear',subtype:'light'},13:{group:'headgear',subtype:'cloth'}
};
const ko={weapon:'무기',armor:'갑옷',headgear:'투구',accessory:'악세사리',spear:'창',axe:'도끼',sword:'검',dagger:'비수',hammer:'망치',bow:'활',staff:'지팡이',heavy:'중갑',light:'경갑',cloth:'천',attack:'공격',intellect:'지력',defense:'방어',healing:'치료'};
const displayOrder={
  group:['weapon','armor','headgear','accessory'],
  subtype:{
    weapon:['sword','dagger','spear','axe','hammer','bow','staff'],
    armor:['heavy','light','cloth'],
    headgear:['heavy','light','cloth'],
    accessory:['attack','intellect','defense','healing']
  }
};
const healingRe=/治疗效果|治療效果|治疗量|治療量|治疗能力|治療能力|造成的治疗|造成的治療|恢复效果|恢復效果/;
function slot(r){return r.EquipmentType==null?0:Number(r.EquipmentType)}
function canonical(r){const s=slot(r),l=Number(r.Label);return Number(r.Rank)===4&&Object.hasOwn(expected,String(s))&&expected[s].has(l)}
function arr(v){return Array.isArray(v)?v:(v==null?[]:[v])}
function accessorySubtype(r){
  const a=arr(r.SkillIds), sid=a.length?a[a.length-1]:null, desc=sid==null?'':String(skillById.get(String(sid))?.Desc??'');
  if(healingRe.test(desc)) return {subtype:'healing',basis:'maxSkillDesc:healing-effect'};
  const p1=Number(r.Property1_ID??0);
  if(p1===2) return {subtype:'attack',basis:'Property1_ID=2'};
  if(p1===4) return {subtype:'intellect',basis:'Property1_ID=4'};
  if([1,3,5].includes(p1)) return {subtype:'defense',basis:`Property1_ID=${p1}`};
  return {subtype:null,basis:`unhandled Property1_ID=${p1}`};
}
function orderOf(group,subtype){
  const g=displayOrder.group.indexOf(group);
  const s=(displayOrder.subtype[group]??[]).indexOf(subtype);
  return {groupOrder:g,subtypeOrder:s};
}
const records=[]; const counts={}; const unclassified=[];
for(const r of equipment.filter(canonical)){
  const label=Number(r.Label); let cls;
  if(label===14){const a=accessorySubtype(r);cls={group:'accessory',subtype:a.subtype,basis:a.basis};}
  else cls={...labelMap[label],basis:`Label=${label}`};
  if(!cls.group||!cls.subtype) unclassified.push({id:r.ID,name:r.Name,label,property1Id:r.Property1_ID??null,basis:cls.basis});
  const order=orderOf(cls.group,cls.subtype);
  if(order.groupOrder<0||order.subtypeOrder<0) unclassified.push({id:r.ID,name:r.Name,label,basis:'missing display order'});
  const key=`${cls.group}/${cls.subtype}`; counts[key]=(counts[key]??0)+1;
  records.push({id:r.ID,name:r.Name,group:cls.group,groupKo:ko[cls.group],subtype:cls.subtype,subtypeKo:ko[cls.subtype],groupOrder:order.groupOrder,subtypeOrder:order.subtypeOrder,basis:cls.basis});
}
const result={
  source:{equipment:'data/configdata/ConfigDataEquipmentInfo.json',skill:'data/configdata/ConfigDataSkillInfo.json'},
  canonicalCount:records.length,
  decision:{
    labels:{1:'무기/창',2:'무기/도끼',3:'무기/검',4:'무기/비수',5:'무기/망치',6:'무기/활',7:'무기/지팡이',8:'갑옷/중갑',9:'갑옷/경갑',10:'갑옷/천',11:'투구/중갑',12:'투구/경갑',13:'투구/천',14:'악세사리/파생'},
    accessory:['최대 Skill Desc에 치료효과 상승 계열 문구 → 치료','그 외 Property1_ID=2 → 공격','그 외 Property1_ID=4 → 지력','그 외 Property1_ID∈{1,3,5} → 방어'],
    displayOrder:{
      groups:['무기','갑옷','투구','악세사리'],
      weapon:['검','비수','창','도끼','망치','활','지팡이'],
      armor:['중갑','경갑','천'],
      headgear:['중갑','경갑','천'],
      accessory:['공격','지력','방어','치료'],
      note:'Label numeric order is not the page display order; use groupOrder/subtypeOrder.'
    }
  },
  counts,
  unclassified,
  records
};
if(records.length!==390) throw new Error(`Canonical count mismatch: ${records.length}`);
if(unclassified.length) throw new Error(`Unclassified records: ${JSON.stringify(unclassified)}`);
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({canonicalCount:result.canonicalCount,counts:result.counts,unclassified:result.unclassified.length,displayOrder:result.decision.displayOrder},null,2));
