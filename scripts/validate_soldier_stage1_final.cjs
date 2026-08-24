const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function load(n){return JSON.parse(fs.readFileSync(path.join(root,'data/configdata',n),'utf8'))}
function rv(b,s){let v=0n,q=0n,o=s;while(o<b.length&&q<=63n){const x=b[o++];v|=BigInt(x&127)<<q;if(!(x&128))return{v:Number(v),o};q+=7n}throw Error('varint')}
function pf(b){const m=new Map();let o=0;while(o<b.length){let r=rv(b,o),t=r.v;o=r.o;const f=t>>>3,w=t&7;let v;if(w===0){r=rv(b,o);o=r.o;v=r.v}else if(w===1){if(o+8>b.length)throw Error('fixed64');v=b.subarray(o,o+8);o+=8}else if(w===2){r=rv(b,o);o=r.o;if(o+r.v>b.length)throw Error('len');v=b.subarray(o,o+r.v);o+=r.v}else if(w===5){if(o+4>b.length)throw Error('fixed32');v=b.subarray(o,o+4);o+=4}else throw Error('wire='+w);const a=m.get(f)||[];a.push({w,v});m.set(f,a)}return m}
function frames(asset,name){if(!Array.isArray(asset.m_bytes)||asset.m_bytes.length!==asset.m_size)throw Error(`${name}: structural mismatch size=${asset.m_size} bytes=${asset.m_bytes?.length}`);const b=Buffer.from(asset.m_bytes),out=[];let o=0;while(o<b.length){if(o+4>b.length)throw Error(`${name}: truncated header @${o}`);const n=b.readUInt32BE(o);o+=4;if(n<=0||o+n>b.length)throw Error(`${name}: invalid frame length=${n} @${o-4}`);out.push(pf(b.subarray(o,o+n)));o+=n}return out}
function fv(m,f,d=null){const e=(m.get(f)||[]).find(x=>x.w===0);return e?e.v:d}
function dup(xs){const s=new Set(),d=new Set();for(const x of xs){if(s.has(x))d.add(x);s.add(x)}return[...d].sort((a,b)=>a-b)}
let failed=false;function ck(label,cond,detail=''){console.log(`[${cond?'PASS':'FAIL'}] ${label}${detail?' -> '+detail:''}`);if(!cond)failed=true}
const soldierA=load('ConfigDataSoldierInfo.json'),spA=load('ConfigDataSPSoldierInfo.json'),armyA=load('ConfigDataArmyInfo.json');
const soldier=frames(soldierA,'SoldierInfo'),sp=frames(spA,'SPSoldierInfo'),army=frames(armyA,'ArmyInfo');
console.log(`[INFO] parsed SoldierInfo=${soldier.length} SPSoldierInfo=${sp.length} ArmyInfo=${army.length}`);
const soldiers=soldier.map(r=>({id:fv(r,2),army:fv(r,16,0),rank:fv(r,53,0),enemy:fv(r,54,0),use:fv(r,59,0)}));
const sps=sp.map(r=>({id:fv(r,2),normalId:fv(r,3)}));
const soldierIds=soldiers.map(x=>x.id).filter(Number.isInteger), soldierSet=new Set(soldierIds), armySet=new Set(army.map(r=>fv(r,2)).filter(Number.isInteger));
const spIds=sps.map(x=>x.id).filter(Number.isInteger), normalRefs=sps.map(x=>x.normalId).filter(Number.isInteger), spSet=new Set(spIds);
ck('Soldier records = 777',soldiers.length===777,`actual=${soldiers.length}`);
ck('Soldier ID duplicate = 0',dup(soldierIds).length===0,`dup=${dup(soldierIds).join(',')}`);
ck('SP records = 56',sps.length===56,`actual=${sps.length}`);
ck('SP ID present on all rows',spIds.length===sps.length,`${spIds.length}/${sps.length}`);
ck('NormalSoliderId present on all rows',normalRefs.length===sps.length,`${normalRefs.length}/${sps.length}`);
ck('SP ID duplicate = 0',dup(spIds).length===0,`dup=${dup(spIds).join(',')}`);
ck('NormalSoliderId duplicate = 0',dup(normalRefs).length===0,`dup=${dup(normalRefs).join(',')}`);
const orphanSp=spIds.filter(id=>!soldierSet.has(id)),orphanNormal=normalRefs.filter(id=>!soldierSet.has(id));
ck('every SP ID resolves to SoldierInfo',orphanSp.length===0,`orphan=${orphanSp.join(',')}`);
ck('every NormalSoliderId resolves to SoldierInfo',orphanNormal.length===0,`orphan=${orphanNormal.join(',')}`);
ck('SP ID never equals NormalSoliderId',sps.every(x=>x.id!==x.normalId),'');
const display=soldiers.filter(x=>x.use===1&&x.enemy!==1),displaySet=new Set(display.map(x=>x.id));
const spOutside=spIds.filter(id=>!displaySet.has(id));ck('all SP SoldierInfo are displayable',spOutside.length===0,`outside=${spOutside.join(',')}`);
const normalOutside=normalRefs.filter(id=>!displaySet.has(id));ck('all SP normal counterparts are displayable',normalOutside.length===0,`outside=${normalOutside.join(',')}`);
const normals=display.filter(x=>!spSet.has(x.id));
const badRank=normals.filter(x=>![1,2,3].includes(x.rank));ck('normal displayable Rank in {1,2,3}',badRank.length===0,`bad=${badRank.map(x=>x.id+':'+x.rank).join(',')}`);
const badArmy=normals.filter(x=>!armySet.has(x.army));ck('normal displayable Army_ID resolves',badArmy.length===0,`bad=${badArmy.map(x=>x.id+':'+x.army).join(',')}`);
ck('displayable total = 224',display.length===224,`actual=${display.length}`);
ck('normal total = 168',normals.length===168,`actual=${normals.length}`);
const r1=normals.filter(x=>x.rank===1).length,r2=normals.filter(x=>x.rank===2).length,r3=normals.filter(x=>x.rank===3).length;
ck('normal Rank1 = 12',r1===12,`actual=${r1}`);ck('normal Rank2 = 27',r2===27,`actual=${r2}`);ck('normal Rank3 = 129',r3===129,`actual=${r3}`);
const unclassified=display.filter(x=>!spSet.has(x.id)&&!normals.some(n=>n.id===x.id));ck('displayable unclassified = 0',unclassified.length===0,`ids=${unclassified.map(x=>x.id).join(',')}`);
const summary={soldierRecords:soldiers.length,spRecords:sps.length,armyRecords:army.length,displayable:display.length,normal: normals.length,rankCounts:{1:r1,2:r2,3:r3},duplicateSoldierIds:dup(soldierIds),duplicateSpIds:dup(spIds),duplicateNormalRefs:dup(normalRefs),orphanSp,orphanNormal,spOutsideDisplayable:spOutside,normalOutsideDisplayable:normalOutside,badRank:badRank.map(x=>x.id),badArmy:badArmy.map(x=>x.id)};
console.log('SUMMARY_JSON='+JSON.stringify(summary));console.log(`STAGE1_FINAL=${failed?'FAIL':'PASS'}`);if(failed)process.exit(1);