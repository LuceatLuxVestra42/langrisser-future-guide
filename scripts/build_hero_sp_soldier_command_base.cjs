'use strict';

const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data');
const CONTRACT=path.join(DATA,'contracts','hero-sp-soldier-command-base.v1.json');
const S0=path.join(DATA,'validation','sp-soldier-command-semantics-s0-f.v1.json');
const SP=path.join(DATA,'generated','hero-page-stage5-4-sp.v1.json');
const OUT=path.join(DATA,'generated','hero-sp-soldier-command-base.v1.json');
function read(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function write(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function fail(m){throw new Error(`[S1] ${m}`);}
function eq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function main(){
  const c=read(CONTRACT),s0=read(S0),sp=read(SP);
  if(s0.status!==c.authority.s0ExpectedStatus||s0.completion!==c.authority.s0ExpectedCompletion) fail(`S0 status/completion ${s0.status}/${s0.completion}`);
  if(sp.status!==c.authority.spExpectedStatus) fail(`SP predecessor=${sp.status}`);
  const released=(sp.records||[]).filter(x=>x?.sp?.status==='RELEASED');
  if(released.length!==c.authority.releasedCount) fail(`released=${released.length}`);
  const seen=new Set(), records=[];
  for(const row of released){
    const heroId=Number(row.heroId); if(!Number.isInteger(heroId)||seen.has(heroId)) fail(`invalid/duplicate heroId=${row.heroId}`); seen.add(heroId);
    const stats=row.sp?.stats||{},raw={},missingSourceFields=[];
    for(const [src,dst] of Object.entries(c.fieldMapping)){
      if(Object.prototype.hasOwnProperty.call(stats,src)){
        const v=Number(stats[src]); if(!Number.isInteger(v)) fail(`heroId ${heroId} invalid ${src}`); raw[dst]=v;
      }else{raw[dst]=0;missingSourceFields.push(src);}
    }
    const base=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/100]));
    records.push({heroId,raw,base,missingSourceFields});
  }
  records.sort((a,b)=>a.heroId-b.heroId);
  for(const [name,fixture] of Object.entries(c.fixtures)){
    const row=records.find(x=>x.heroId===fixture.heroId); if(!row||!eq(row.raw,fixture.raw)||!eq(row.base,fixture.base)) fail(`${name} fixture mismatch`);
  }
  write(OUT,{version:1,artifact:'hero-sp-soldier-command-base',stage:'S1',status:'GENERATED_PENDING_S1_VALIDATION',semanticOwner:c.owner,meaning:'SP-form Hero-owned troop stat modifier base',source:{s0Checkpoint:c.authority.s0Checkpoint,spPredecessor:c.authority.spPredecessor,spPredecessorBlobSha:c.authority.spPredecessorBlobSha},boundary:{n2Combination:'NONE',r5Combination:'NONE'},missingSourceField:'ZERO',normalization:'raw / 100',recordCount:records.length,records});
  process.stdout.write(`${OUT}\n`);
}
main();
