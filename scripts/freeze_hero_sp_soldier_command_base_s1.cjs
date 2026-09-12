'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data');
const CONTRACT=path.join(DATA,'contracts','hero-sp-soldier-command-base.v1.json');
const ART=path.join(DATA,'generated','hero-sp-soldier-command-base.v1.json');
const VAL=path.join(DATA,'validation','hero-sp-soldier-command-base-s1.v1.json');
const OUT=path.join(DATA,'validation','hero-sp-soldier-command-base-s1-f.v1.json');
function read(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function blob(f){const b=fs.readFileSync(f);return crypto.createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');}
function write(f,v){fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function fail(m){throw new Error(`[S1-F] ${m}`);}
function main(){
 const c=read(CONTRACT),a=read(ART),v=read(VAL);if(v.status!=='PASS'||v.hardErrors?.length)fail('validator not PASS');if(a.recordCount!==25||a.semanticOwner!==c.owner)fail('artifact contract mismatch');
 write(OUT,{version:1,stage:'S1-F',status:'FINAL_FROZEN',completion:'SP_SOLDIER_COMMAND_BASE_MATERIALIZATION_COMPLETE',owner:c.owner,predecessor:{s0Checkpoint:c.authority.s0Checkpoint,spPredecessor:c.authority.spPredecessor,spPredecessorBlobSha:c.authority.spPredecessorBlobSha},artifact:{path:'data/generated/hero-sp-soldier-command-base.v1.json',gitBlobSha1:blob(ART),sha256:sha256(ART),recordCount:a.recordCount,meaning:a.meaning},validation:{path:'data/validation/hero-sp-soldier-command-base-s1.v1.json',gitBlobSha1:blob(VAL),sha256:sha256(VAL),status:v.status,rawMismatchCount:v.rawMismatchCount,normalizedMismatchCount:v.normalizedMismatchCount,missingFieldMismatchCount:v.missingFieldMismatchCount,fixtureResults:v.fixtureResults,hardErrorCount:v.hardErrors.length},semanticBoundary:{n2Combination:'NONE',r5Combination:'NONE',missingSourceField:'ZERO',normalization:'raw / 100'},blockers:[],review:[],reopenConditions:['S0 frozen semantics change','Stage5-4 SP predecessor/source changes','SP RELEASED population changes','independent S1 validator hard failure','artifact hash mismatch','actual canonical/parity damage'],handoff:{currentOwnerClosed:true,nextOwner:'HERO_SOLDIER_COMMAND_INTEGRATION_CONTRACT',nextStage:'I0',nextStart:'Define effective-base selection without recomputation: non-SP uses frozen N2 Hero-owned base; RELEASED SP uses frozen S1 replacement base; then add frozen R5 Hero3 contribution exactly once. Keep provenance of each component explicit.'}});
 process.stdout.write(`${OUT}\n`);
}
main();
