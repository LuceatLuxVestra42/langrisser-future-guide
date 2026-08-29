import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executePlan } from './run-project-doctor-d4.mjs';

const d3=JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v5.json','utf8'));
const d4=JSON.parse(fs.readFileSync('data/contracts/project-doctor-d4-execution.v5.json','utf8'));
const by=id=>d3.checkCatalog.find(x=>x.id===id);
const plan=(status,ids=[],manualReviews=[])=>({version:5,stage:'D3',status,changedFileCount:status==='NO_CHANGES'?0:1,selectedChecks:ids.map(id=>({...by(id),execution:'PLANNED'})),manualReviews});
const done=[];const run=(id,fn)=>{fn();done.push(id)};
run('HERO_AND_SKIN_EXECUTE',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['hero-artwork-final','skin-assets-final','production-build']),d3Contract:d3,d4Contract:d4,executor:x=>{seen.push(x.id);return{status:0}}});assert.equal(r.status,'PASS_EXECUTED');assert.deepEqual(seen,['hero-artwork-final','skin-assets-final','production-build'])});
run('SKIN_FAIL_FAST',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['skin-assets-final','localization-audit','production-build']),d3Contract:d3,d4Contract:d4,executor:x=>{seen.push(x.id);return{status:x.id==='skin-assets-final'?6:0}}});assert.equal(r.status,'FAIL_CHECK');assert.equal(r.failedCheckId,'skin-assets-final');assert.deepEqual(seen,['skin-assets-final'])});
run('BANNER_MANUAL_PRESERVED',()=>{const r=executePlan({plan:plan('MANUAL_REVIEW',['production-build'],[{node:'banner-assets'}]),d3Contract:d3,d4Contract:d4,executor:()=>({status:0})});assert.equal(r.status,'REVIEW_MANUAL');assert.equal(r.exitCode,3)});
run('STRICT_COMMAND',()=>{const p=plan('PLAN_READY',['skin-assets-final']);p.selectedChecks[0].command='node scripts/validate-skin-assets-final.mjs';const r=executePlan({plan:p,d3Contract:d3,d4Contract:d4,executor:()=>({status:0})});assert.equal(r.status,'INVALID_PLAN')});
run('DRY_RUN',()=>{let calls=0;const r=executePlan({plan:plan('PLAN_READY',['hero-artwork-final','skin-assets-final']),d3Contract:d3,d4Contract:d4,dryRun:true,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'PASS_DRY_RUN');assert.equal(calls,0)});
assert.equal(d4.schemaId,'project-doctor-d4-execution/v5');assert.equal(d4.status,'DESIGN_FROZEN');assert.deepEqual([...new Set(d4.allowedCheckIds)].sort(),d3.checkCatalog.map(x=>x.id).sort());
console.log(JSON.stringify({status:'PASS_PROJECT_DOCTOR_D4_V5_EXECUTION_FIXTURES',fixturePassCount:done.length,fixtureCount:done.length,fixtures:done,allowedCheckCount:d4.allowedCheckIds.length},null,2));
