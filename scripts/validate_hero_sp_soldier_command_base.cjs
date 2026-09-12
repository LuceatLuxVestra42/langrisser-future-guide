'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data');
const CONTRACT=path.join(DATA,'contracts','hero-sp-soldier-command-base.v1.json');
const S0=path.join(DATA,'validation','sp-soldier-command-semantics-s0-f.v1.json');
const SP=path.join(DATA,'generated','hero-page-stage5-4-sp.v1.json');
const ART=path.join(DATA,'generated','hero-sp-soldier-command-base.v1.json');
const OUT=path.join(DATA,'validation','hero-sp-soldier-command-base-s1.v1.json');
function read(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function write(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function eq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function main(){
 const c=read(CONTRACT),s0=read(S0),sp=read(SP),art=read(ART),errors=[];
 if(s0.status!==c.authority.s0ExpectedStatus||s0.completion!==c.authority.s0ExpectedCompletion)errors.push(`S0 ${s0.status}/${s0.completion}`);
 if(sp.status!==c.authority.spExpectedStatus)errors.push(`SP ${sp.status}`);
 const released=(sp.records||[]).filter(x=>x?.sp?.status==='RELEASED');
 if(released.length!==25)errors.push(`released=${released.length}`);
 if(art.semanticOwner!==c.owner||art.recordCount!==25||!Array.isArray(art.records)||art.records.length!==25)errors.push('artifact owner/count mismatch');
 const src=new Map(),dst=new Map();
 for(const r of released){const id=Number(r.heroId);if(src.has(id))errors.push(`duplicate source ${id}`);src.set(id,r);}
 for(const r of art.records||[]){const id=Number(r.heroId);if(dst.has(id))errors.push(`duplicate artifact ${id}`);dst.set(id,r);}
 if(src.size!==dst.size||[...src.keys()].some(id=>!dst.has(id)))errors.push('heroId set mismatch');
 let rawMismatchCount=0,normalizedMismatchCount=0,missingFieldMismatchCount=0;
 for(const [id,row] of src){
   const stats=row.sp?.stats||{},got=dst.get(id),expectedRaw={},expectedMissing=[];
   for(const [sk,tk] of Object.entries(c.fieldMapping)){
     if(Object.prototype.hasOwnProperty.call(stats,sk)){const v=Number(stats[sk]);if(!Number.isInteger(v))errors.push(`hero ${id} invalid ${sk}`);expectedRaw[tk]=v;}
     else{expectedRaw[tk]=0;expectedMissing.push(sk);}
   }
   if(!got||!eq(got.raw,expectedRaw))rawMismatchCount++;
   const expectedBase=Object.fromEntries(Object.entries(expectedRaw).map(([k,v])=>[k,v/100]));
   if(!got||!eq(got.base,expectedBase))normalizedMismatchCount++;
   if(!got||!eq(got.missingSourceFields,expectedMissing))missingFieldMismatchCount++;
 }
 const fixtureResults={};
 for(const [name,f] of Object.entries(c.fixtures)){const row=dst.get(f.heroId);fixtureResults[name]=!!row&&eq(row.raw,f.raw)&&eq(row.base,f.base);if(!fixtureResults[name])errors.push(`${name} fixture failed`);}
 if(rawMismatchCount)errors.push(`rawMismatchCount=${rawMismatchCount}`);if(normalizedMismatchCount)errors.push(`normalizedMismatchCount=${normalizedMismatchCount}`);if(missingFieldMismatchCount)errors.push(`missingFieldMismatchCount=${missingFieldMismatchCount}`);
 if(art?.boundary?.n2Combination!=='NONE'||art?.boundary?.r5Combination!=='NONE')errors.push('artifact crossed N2/R5 boundary');
 const result={version:1,stage:'S1',status:errors.length?'FAIL':'PASS',owner:c.owner,sourceReleasedCount:released.length,artifactRecordCount:art.records?.length||0,rawMismatchCount,normalizedMismatchCount,missingFieldMismatchCount,fixtureResults,artifactSha256:sha256(ART),hardErrors:errors,blockers:errors.length?['S1_VALIDATION_FAILED']:[],review:[]};
 write(OUT,result);console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
}
main();
