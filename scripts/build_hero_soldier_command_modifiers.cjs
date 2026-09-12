'use strict';

const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data');
const CONTRACT=path.join(DATA,'contracts','hero-soldier-command-final.v1.json');
const I0=path.join(DATA,'validation','hero-soldier-command-integration-i0-f.v1.json');
const N2=path.join(DATA,'generated','hero-soldier-command-base.v1.json');
const S1=path.join(DATA,'generated','hero-sp-soldier-command-base.v1.json');
const R5=path.join(DATA,'generated','hero-soldier-bond-command-contribution.v1.json');
const OUT=path.join(DATA,'generated','hero-soldier-command-modifiers.v1.json');
function read(f){return JSON.parse(fs.readFileSync(f,'utf8'));}function write(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function fail(m){throw new Error(`[I1] ${m}`);}function map(rows){const m=new Map();for(const r of rows||[]){const id=Number(r.heroId);if(!Number.isInteger(id)||m.has(id))fail(`invalid/duplicate heroId=${r.heroId}`);m.set(id,r);}return m;}
function add(a,b){const o={};for(const k of ['hp','at','df','magicDf']){if(!Number.isFinite(a?.[k])||!Number.isFinite(b?.[k]))fail(`non-finite component ${k}`);o[k]=a[k]+b[k];}return o;}
function eq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function main(){const c=read(CONTRACT),i0=read(I0),n2=read(N2),s1=read(S1),r5=read(R5);if(i0.status!==c.authority.integrationExpectedStatus)fail(`I0=${i0.status}`);const nm=map(n2.records),sm=map(s1.records),rm=map(r5.records);if(nm.size!==267||rm.size!==267||sm.size!==25)fail(`counts=${nm.size}/${sm.size}/${rm.size}`);if([...nm.keys()].some(id=>!rm.has(id)))fail('N2/R5 hero set mismatch');if([...sm.keys()].some(id=>!nm.has(id)))fail('S1 not subset of N2');
 const records=[...nm.keys()].sort((a,b)=>a-b).map(heroId=>{const base=nm.get(heroId).base,hero3=rm.get(heroId).contribution;const normal={baseSource:'N2_HEROINFO_HERO_OWNED_BASE',base:{...base},hero3Contribution:{...hero3},final:add(base,hero3)};let sp=null;if(sm.has(heroId)){const sb=sm.get(heroId).base;sp={baseSource:'S1_SPHEROINFO_REPLACEMENT_BASE',base:{...sb},hero3Contribution:{...hero3},final:add(sb,hero3)};}return {heroId,spEligible:!!sp,normal,sp};});
 for(const [name,f] of Object.entries(c.fixtures)){const r=records.find(x=>x.heroId===f.heroId);if(!r||!eq(r.normal.final,f.normalFinal)||!r.sp||!eq(r.sp.final,f.spFinal))fail(`${name} fixture mismatch`);}
 write(OUT,{version:1,artifact:'hero-soldier-command-modifiers',stage:'I1',status:'GENERATED_PENDING_I2',semanticOwner:c.owner,meaning:'Final Soldier command modifiers with base and Hero3 contribution preserved separately',source:{integrationCheckpoint:c.authority.integrationCheckpoint,normalBase:c.authority.normalBase,spBase:c.authority.spBase,hero3:c.authority.hero3},composition:c.composition,recordCount:records.length,spVariantCount:records.filter(x=>x.spEligible).length,records});console.log(OUT);}
main();
