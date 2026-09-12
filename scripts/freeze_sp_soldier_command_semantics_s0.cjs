'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'), DATA=path.join(ROOT,'data');
const CONTRACT=path.join(DATA,'contracts','sp-soldier-command-semantics.v1.json');
const VALIDATION=path.join(DATA,'validation','sp-soldier-command-semantics-s0.v1.json');
const CHECKPOINT=path.join(DATA,'validation','sp-soldier-command-semantics-s0-f.v1.json');
function readJson(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function gitBlobSha(f){const b=fs.readFileSync(f);return crypto.createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');}
function writeJson(f,v){fs.writeFileSync(f,`${JSON.stringify(v,null,2)}\n`,'utf8');}
function fail(m){throw new Error(`[S0-F] ${m}`);}
function main(){
  const c=readJson(CONTRACT),v=readJson(VALIDATION);
  if(v.status!=='PASS'||v.hardErrors?.length) fail('S0 validation not PASS');
  if(v.spReleasedCount!==25) fail(`SP released count ${v.spReleasedCount}`);
  if(!Array.isArray(v.fixtures)||v.fixtures.length!==2||v.fixtures.some(x=>!x.rawPass||!x.r5Pass||!x.replacementPass||!x.additiveRejected)) fail('fixture gate failed');
  writeJson(CHECKPOINT,{
    version:1,stage:'S0-F',status:'FINAL_FROZEN',completion:'SP_SOLDIER_COMMAND_OVERRIDE_SEMANTICS_COMPLETE',owner:c.owner,
    predecessor:{n2Checkpoint:c.authority.n2Checkpoint,r5Checkpoint:c.authority.r5Checkpoint,spPredecessor:c.authority.spPredecessor,spPredecessorBlobSha:c.authority.spPredecessorBlobSha,configDataSourceCommit:c.authority.configDataSourceCommit},
    frozenSemantics:c.semantics,
    validation:{path:'data/validation/sp-soldier-command-semantics-s0.v1.json',gitBlobSha1:gitBlobSha(VALIDATION),sha256:sha256(VALIDATION),status:v.status,fixtureCount:v.fixtures.length,hardErrorCount:v.hardErrors.length},
    evidenceBoundary:{canonicalAuthority:'Pinned project artifacts and ConfigData projections',behavioralCrossCheckRole:'CORROBORATION_ONLY_NOT_CANONICAL_AUTHORITY'},
    blockers:[],review:v.review||[],
    reopenConditions:['N2 or R5 frozen predecessor is reopened','Stage5-4 SP source/projection or pinned ConfigData snapshot changes','SP command field schema changes','behavioral fixture contradiction','independent S0 validator hard failure','actual canonical/parity damage'],
    handoff:{currentOwnerClosed:true,nextOwner:'SP_SOLDIER_COMMAND_BASE_MATERIALIZATION',nextStage:'S1',nextStart:'Materialize one complete four-component SP command base for each of the 25 RELEASED SP heroes using Stage5-4 stats, zero for absent command fields, raw/100 normalization, and no N2 additive stacking. Preserve N2 as the Normal/non-SP base and R5 separately.'}
  });
  process.stdout.write(`${CHECKPOINT}\n`);
}
main();
