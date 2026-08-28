import assert from 'node:assert/strict';
import { executePlan } from './run-project-doctor-d4.mjs';

const catalog = [
  { id: 'configdata-integrity', phase: 1, command: 'npm run check:configdata' },
  { id: 'localization-audit', phase: 4, command: 'npm run audit:localization:check' },
  { id: 'production-build', phase: 5, command: 'npm run build' },
  { id: 'doctor-health-gate', phase: 6, command: 'npm run doctor:validate' },
  { id: 'doctor-impact-self-test', phase: 6, command: 'npm run doctor:impact:validate' },
  { id: 'doctor-plan-self-test', phase: 6, command: 'npm run doctor:plan:validate' },
];
const d3Contract = { checkCatalog: catalog };
const d4Contract = { allowedCheckIds: catalog.map(item => item.id) };
const check = id => ({ ...catalog.find(item => item.id === id), execution: 'PLANNED' });
const plan = (status, ids = [], manualReviews = []) => ({ version: 2, stage: 'D3', status, changedFileCount: status === 'NO_CHANGES' ? 0 : 1, selectedChecks: ids.map(check), manualReviews });
const fixtures = [];
const runFixture = (id, fn) => { fn(); fixtures.push(id); };

runFixture('NO_CHANGES_ZERO_EXEC', () => { let calls=0; const r=executePlan({plan:plan('NO_CHANGES'),d3Contract,d4Contract,executor:()=>{calls+=1;return{status:0}}}); assert.equal(r.status,'PASS_NO_CHANGES'); assert.equal(calls,0); });
runFixture('DRY_RUN_ZERO_EXEC', () => { let calls=0; const r=executePlan({plan:plan('PLAN_READY',['localization-audit','production-build']),d3Contract,d4Contract,dryRun:true,executor:()=>{calls+=1;return{status:0}}}); assert.equal(r.status,'PASS_DRY_RUN'); assert.equal(calls,0); });
runFixture('LOCALIZATION_EXECUTES', () => { const seen=[]; const r=executePlan({plan:plan('PLAN_READY',['localization-audit']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}}); assert.equal(r.status,'PASS_EXECUTED'); assert.deepEqual(seen,['localization-audit']); });
runFixture('LOCALIZATION_BEFORE_BUILD', () => { const seen=[]; const r=executePlan({plan:plan('PLAN_READY',['production-build','localization-audit']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}}); assert.equal(r.status,'PASS_EXECUTED'); assert.deepEqual(seen,['localization-audit','production-build']); });
runFixture('FULL_PHASE_ORDER', () => { const seen=[]; const r=executePlan({plan:plan('PLAN_READY',['doctor-health-gate','production-build','localization-audit','configdata-integrity']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:0}}}); assert.equal(r.status,'PASS_EXECUTED'); assert.deepEqual(seen,['configdata-integrity','localization-audit','production-build','doctor-health-gate']); });
runFixture('LOCALIZATION_FAIL_FAST_BLOCKS_BUILD', () => { const seen=[]; const r=executePlan({plan:plan('PLAN_READY',['localization-audit','production-build']),d3Contract,d4Contract,executor:item=>{seen.push(item.id);return{status:item.id==='localization-audit'?9:0}}}); assert.equal(r.status,'FAIL_CHECK'); assert.equal(r.failedCheckId,'localization-audit'); assert.deepEqual(seen,['localization-audit']); });
runFixture('TAMPER_BLOCKS_ALL', () => { let calls=0; const p=plan('PLAN_READY',['localization-audit']); p.selectedChecks[0].command='npm run evil'; const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>{calls+=1;return{status:0}}}); assert.equal(r.status,'INVALID_PLAN'); assert.equal(calls,0); });
runFixture('UNKNOWN_CHECK_BLOCKS_ALL', () => { let calls=0; const p=plan('PLAN_READY'); p.selectedChecks=[{id:'unknown',phase:4,command:'npm run audit:localization:check'}]; const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>{calls+=1;return{status:0}}}); assert.equal(r.status,'INVALID_PLAN'); assert.equal(calls,0); });
runFixture('MANUAL_REVIEW_PRESERVED', () => { let calls=0; const r=executePlan({plan:plan('MANUAL_REVIEW',['localization-audit'],[{type:'UNCATALOGED_DEDICATED_CHECK',node:'soldier-canonical'}]),d3Contract,d4Contract,executor:()=>{calls+=1;return{status:0}}}); assert.equal(r.status,'REVIEW_MANUAL'); assert.equal(r.exitCode,3); assert.equal(calls,1); });
runFixture('STRICT_NPM_ALIAS_SHAPE', () => { const p=plan('PLAN_READY',['localization-audit']); p.selectedChecks[0].command='npm run audit:localization -- --check'; const r=executePlan({plan:p,d3Contract,d4Contract,executor:()=>({status:0})}); assert.equal(r.status,'INVALID_PLAN'); });

console.log(JSON.stringify({ status:'PASS_PROJECT_DOCTOR_D4_V2_EXECUTION_FIXTURES', fixturePassCount:fixtures.length, fixtureCount:10, fixtures, actualRepositoryCommandExecutionCount:0 }, null, 2));
