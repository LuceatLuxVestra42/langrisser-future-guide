import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executePlan } from './run-project-doctor-d4.mjs';

const d3Contract=JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v3.json','utf8'));
const d4Contract=JSON.parse(fs.readFileSync('data/contracts/project-doctor-d4-execution.v3.json','utf8'));
const catalog=d3Contract.checkCatalog;
const byId=id=>catalog.find(x=>x.id===id);
const check=id=>({...byId(id),execution:'PLANNED'});
const plan=(status,ids=[],manualReviews=[])=>({version:3,stage:'D3',status,changedFileCount:status==='NO_CHANGES'?0:1,selectedChecks:ids.map(check),manualReviews});
const fixtures=[];
const runFixture=(id,fn)=>{fn();fixtures.push(id)};

runFixture('NO_CHANGES_ZERO_EXEC',()=>{let calls=0;const r=executePlan({plan:plan('NO_CHANGES'),d3Contract,d4Contract,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'PASS_NO_CHANGES');assert.equal(calls,0)});
runFixture('DRY_RUN_ZERO_EXEC',()=>{let calls=0;const r=executePlan({plan:plan('PLAN_READY',['coverage-hero-canonical','equipment-image-final','localization-audit','production-build']),d3Contract,d4Contract,dryRun:true,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'PASS_DRY_RUN');assert.equal(calls,0)});
runFixture('PROMOTED_OWNER_EXECUTES',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['coverage-soldier-canonical','coverage-hero-soldier-relation']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}});assert.equal(r.status,'PASS_EXECUTED');assert.deepEqual(seen,['coverage-hero-soldier-relation','coverage-soldier-canonical'])});
runFixture('EQUIPMENT_IMAGE_OWNER_EXECUTES',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['equipment-image-final','production-build']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}});assert.equal(r.status,'PASS_EXECUTED');assert.deepEqual(seen,['equipment-image-final','production-build'])});
runFixture('PHASE_ORDER',()=>{const seen=[];const ids=['doctor-health-gate','production-build','localization-audit','regression-coverage-promotion-v2','equipment-image-final','coverage-hero-canonical','configdata-integrity'];const r=executePlan({plan:plan('PLAN_READY',ids),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}});assert.equal(r.status,'PASS_EXECUTED');assert.deepEqual(seen,['configdata-integrity','coverage-hero-canonical','equipment-image-final','regression-coverage-promotion-v2','localization-audit','production-build','doctor-health-gate'])});
runFixture('OWNER_FAIL_FAST',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['coverage-hero-canonical','localization-audit','production-build']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:item.id==='coverage-hero-canonical'?9:0}}});assert.equal(r.status,'FAIL_CHECK');assert.equal(r.failedCheckId,'coverage-hero-canonical');assert.deepEqual(seen,['coverage-hero-canonical'])});
runFixture('EQUIPMENT_IMAGE_FAIL_FAST',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['equipment-image-final','localization-audit','production-build']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:item.id==='equipment-image-final'?7:0}}});assert.equal(r.status,'FAIL_CHECK');assert.equal(r.failedCheckId,'equipment-image-final');assert.deepEqual(seen,['equipment-image-final'])});
runFixture('V2_AUDIT_FAIL_FAST',()=>{const seen=[];const r=executePlan({plan:plan('PLAN_READY',['regression-coverage-promotion-v2','production-build']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:item.id==='regression-coverage-promotion-v2'?8:0}}});assert.equal(r.status,'FAIL_CHECK');assert.equal(r.failedCheckId,'regression-coverage-promotion-v2');assert.deepEqual(seen,['regression-coverage-promotion-v2'])});
runFixture('TAMPER_BLOCKS_ALL',()=>{let calls=0;const p=plan('PLAN_READY',['equipment-image-final']);p.selectedChecks[0].command='npm run evil';const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'INVALID_PLAN');assert.equal(calls,0)});
runFixture('UNKNOWN_CHECK_BLOCKS_ALL',()=>{let calls=0;const p=plan('PLAN_READY');p.selectedChecks=[{id:'unknown',phase:2,command:'npm run validate:coverage:hero-canonical'}];const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'INVALID_PLAN');assert.equal(calls,0)});
runFixture('REMAINING_MANUAL_REVIEW_PRESERVED',()=>{let calls=0;const r=executePlan({plan:plan('MANUAL_REVIEW',['production-build'],[{type:'UNCATALOGED_DEDICATED_CHECK',node:'hero-assets'}]),d3Contract,d4Contract,executor:()=>{calls++;return{status:0}}});assert.equal(r.status,'REVIEW_MANUAL');assert.equal(r.exitCode,3);assert.equal(calls,1)});
runFixture('STRICT_NPM_ALIAS_SHAPE',()=>{const p=plan('PLAN_READY',['equipment-image-final']);p.selectedChecks[0].command='node scripts/validate-equipment-image-final.mjs';const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>({status:0})});assert.equal(r.status,'INVALID_PLAN')});

assert.equal(d4Contract.schemaId,'project-doctor-d4-execution/v3');
assert.equal(d4Contract.status,'DESIGN_FROZEN');
assert.deepEqual([...new Set(d4Contract.allowedCheckIds)].sort(),catalog.map(x=>x.id).sort());
console.log(JSON.stringify({status:'PASS_PROJECT_DOCTOR_D4_V3_EXECUTION_FIXTURES',fixturePassCount:fixtures.length,fixtureCount:fixtures.length,fixtures,allowedCheckCount:d4Contract.allowedCheckIds.length,actualRepositoryCommandExecutionCount:0},null,2));
