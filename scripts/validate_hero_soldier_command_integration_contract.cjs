'use strict';

const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data');
const C=path.join(DATA,'contracts','hero-soldier-command-integration.v1.json');
const N2C=path.join(DATA,'validation','hero-soldier-command-base-n2-f.v1.json'),N2=path.join(DATA,'generated','hero-soldier-command-base.v1.json');
const S1C=path.join(DATA,'validation','hero-sp-soldier-command-base-s1-f.v1.json'),S1=path.join(DATA,'generated','hero-sp-soldier-command-base.v1.json');
const R5C=path.join(DATA,'validation','hero-soldier-bond-command-contribution-r5-f.v1.json'),R5=path.join(DATA,'generated','hero-soldier-bond-command-contribution.v1.json');
const OUT=path.join(DATA,'validation','hero-soldier-command-integration-i0.v1.json');
function read(f){return JSON.parse(fs.readFileSync(f,'utf8'));}function write(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function map(rows){const m=new Map();for(const r of rows||[]){const id=Number(r.heroId);if(!Number.isInteger(id)||m.has(id))throw new Error(`invalid/duplicate heroId=${r.heroId}`);m.set(id,r);}return m;}
function add(a,b){const o={};for(const k of ['hp','at','df','magicDf'])o[k]=Number(a?.[k]||0)+Number(b?.[k]||0);return o;}function eq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function main(){const c=read(C),n2c=read(N2C),n2=read(N2),s1c=read(S1C),s1=read(S1),r5c=read(R5C),r5=read(R5),errors=[];
 if(n2c.status!==c.authority.normalBaseExpectedStatus)errors.push(`N2=${n2c.status}`);if(s1c.status!==c.authority.spBaseExpectedStatus)errors.push(`S1=${s1c.status}`);if(r5c.status!==c.authority.hero3ExpectedStatus||r5c.completion!==c.authority.hero3ExpectedCompletion)errors.push(`R5=${r5c.status}/${r5c.completion}`);
 const nm=map(n2.records),sm=map(s1.records),rm=map(r5.records);if(nm.size!==267||rm.size!==267)errors.push(`N2/R5 sizes=${nm.size}/${rm.size}`);if(sm.size!==25)errors.push(`S1 size=${sm.size}`);if([...nm.keys()].some(id=>!rm.has(id)))errors.push('N2/R5 hero set mismatch');if([...sm.keys()].some(id=>!nm.has(id)))errors.push('S1 not subset of N2');
 const fixtureResults={};for(const [name,f] of Object.entries(c.fixtures)){const nb=nm.get(f.heroId)?.base,h3=rm.get(f.heroId)?.contribution,sb=sm.get(f.heroId)?.base;const nr=add(nb,h3),sr=add(sb,h3);const normalPass=eq(nb,f.normal.base)&&eq(h3,f.normal.hero3)&&eq(nr,f.normal.final);const spPass=eq(sb,f.sp.base)&&eq(h3,f.sp.hero3)&&eq(sr,f.sp.final);fixtureResults[name]={normalPass,spPass};if(!normalPass||!spPass)errors.push(`${name} fixture failed`);}
 const result={version:1,stage:'I0',status:errors.length?'FAIL':'PASS',owner:c.owner,normalBaseCount:nm.size,spBaseCount:sm.size,hero3Count:rm.size,fixtureResults,composition:c.composition,hardErrors:errors,blockers:errors.length?['I0_VALIDATION_FAILED']:[],review:[]};write(OUT,result);console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;}
main();
