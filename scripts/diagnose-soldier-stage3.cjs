const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const P=n=>path.join(ROOT,'data/configdata',`${n}.json`);
function payload(n){const o=JSON.parse(fs.readFileSync(P(n),'utf8')); return Buffer.from(o.m_bytes);}
function frames(buf){let p=0,a=[];while(p<buf.length){const n=buf.readUInt32BE(p);p+=4;a.push(buf.subarray(p,p+n));p+=n;}return a;}
function vi(b,p){let v=0n,s=0n;for(;;){const x=BigInt(b[p++]);v|=(x&127n)<<s;if(!(x&128n))return[Number(v),p];s+=7n;}}
function msg(b){let p=0,m=new Map();const add=(f,w,v)=>{if(!m.has(f))m.set(f,[]);m.get(f).push({w,v});};while(p<b.length){let k;[k,p]=vi(b,p);const f=k>>>3,w=k&7;if(w===0){let v;[v,p]=vi(b,p);add(f,w,v);}else if(w===2){let n;[n,p]=vi(b,p);add(f,w,b.subarray(p,p+n));p+=n;}else if(w===1){add(f,w,b.subarray(p,p+8));p+=8;}else if(w===5){add(f,w,b.subarray(p,p+4));p+=4;}else throw Error('wire '+w);}return m;}
const iv=(m,f,d=0)=>m.get(f)?.find(x=>x.w===0)?.v??d;
const sv=(m,f,d='')=>{const x=m.get(f)?.find(x=>x.w===2);return x?x.v.toString('utf8'):d};
function rvi(m,f){const a=[];for(const x of m.get(f)||[]){if(x.w===0)a.push(x.v);else if(x.w===2){let p=0;while(p<x.v.length){let v;[v,p]=vi(x.v,p);a.push(v);}}}return a;}
const master=JSON.parse(fs.readFileSync(path.join(ROOT,'data/hero-name-master.v1.json'),'utf8')).records;
const masterIds=new Set(master.map(x=>x.heroId));
const heroes=frames(payload('ConfigDataHeroInfo')).map((b,i)=>{const m=msg(b);return{idx:i,id:iv(m,2),name:sv(m,3),useable:!!iv(m,10),heroInformationId:iv(m,35)}});
const heroesByInfo=new Map(); for(const h of heroes){if(!heroesByInfo.has(h.heroInformationId))heroesByInfo.set(h.heroInformationId,[]);heroesByInfo.get(h.heroInformationId).push(h);}
const sph=frames(payload('ConfigDataSPHeroInfo')).map((b,i)=>{const m=msg(b);return{idx:i,id:iv(m,2),name:sv(m,3),heroInformationId:iv(m,6),rewardSoldiers:rvi(m,25)}});
console.log('=== SP HERO MAPPING ===');
let uniqueCanonical=0,unmapped=0,ambiguous=0;
for(const s of sph){const c=(heroesByInfo.get(s.heroInformationId)||[]).filter(h=>masterIds.has(h.id)); if(c.length===1)uniqueCanonical++;else if(c.length===0)unmapped++;else ambiguous++; console.log(JSON.stringify({spHeroInfoId:s.id,name:s.name,heroInformationId:s.heroInformationId,rewardSoldiers:s.rewardSoldiers,candidates:c.map(h=>({id:h.id,name:h.name,useable:h.useable}))}));}
console.log(JSON.stringify({uniqueCanonical,unmapped,ambiguous,total:sph.length}));

const soldiers=frames(payload('ConfigDataSoldierInfo')).map((b,i)=>{const m=msg(b);return{idx:i,id:iv(m,2),name:sv(m,3),armyId:iv(m,16),tier:iv(m,53),getSoldierTechId:iv(m,57)}});
const trainings=frames(payload('ConfigDataTrainingTechInfo')).map((b,i)=>{const m=msg(b);return{idx:i,id:iv(m,2),name:sv(m,3),preTechIds:rvi(m,5),preTechLevels:rvi(m,6),roomLevel:iv(m,7),soldierIds:rvi(m,8),armyIds:rvi(m,9),isSummon:!!iv(m,10),techType:iv(m,11),levelIds:rvi(m,12),isLocked:!!iv(m,13)}});
const s=soldiers.find(x=>x.id===134); const links=trainings.filter(t=>t.soldierIds.includes(134));
console.log('=== SOLDIER 134 ==='); console.log(JSON.stringify(s));
console.log(JSON.stringify(links,null,2));
