import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadPlanningContext, planPaths } from './plan-project-doctor-d3.mjs';

const CONTRACT='data/contracts/localization-audit-stage6.v1.json';
const SNAPSHOT='data/validation/localization-audit-stage6.v1.json';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const readText=p=>fs.readFileSync(p,'utf8');
const stable=v=>Array.isArray(v)?v.map(stable):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v);
const gitBlobSha=p=>{const b=fs.readFileSync(p);return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')};
const runNode=(script,args=[])=>{const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});return{status:r.status??1,stdout:r.stdout??'',stderr:r.stderr??''}};
const runNpm=args=>{const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{encoding:'utf8'});return{status:r.status??1,stdout:r.stdout??'',stderr:r.stderr??''}};
const sameSet=(a=[],b=[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

function buildResult(){
  const c=readJson(CONTRACT), stage5c=readJson(c.predecessor.stage5Contract), stage5=readJson(c.predecessor.stage5Snapshot), pkg=readJson('package.json');
  const d2=readJson(c.doctorIntegration.d2Contract), d3=readJson(c.doctorIntegration.d3Contract), d4=readJson(c.doctorIntegration.d4Contract), d7=readJson(c.doctorIntegration.d7Contract);
  const promotion=readJson(c.historicalPreservation.regressionPromotionV1), closeout=readText('scripts/run-project-doctor-closeout.mjs');
  const errors=[]; const add=(code,message,context={})=>errors.push({severity:'FAIL',code,message,context});
  if(c.status!=='FROZEN'||c.schemaId!=='localization-audit-stage6-contract/v1') add('STAGE6_CONTRACT_MISMATCH','Stage 6 contract must remain frozen.');
  if(stage5c.status!==c.predecessor.requiredStatus||stage5.status!==c.predecessor.requiredSnapshotStatus) add('STAGE5_STATUS_MISMATCH','Stage 5 predecessor is not accepted.');
  const stage5ContractHash=gitBlobSha(c.predecessor.stage5Contract), stage5SnapshotHash=gitBlobSha(c.predecessor.stage5Snapshot);
  if(stage5ContractHash!==c.predecessor.contractGitBlobSha) add('STAGE5_CONTRACT_DRIFT','Stage 5 contract bytes changed.',{actual:stage5ContractHash});
  if(stage5SnapshotHash!==c.predecessor.snapshotGitBlobSha) add('STAGE5_SNAPSHOT_DRIFT','Stage 5 snapshot bytes changed.',{actual:stage5SnapshotHash});
  const d3v1Hash=gitBlobSha(c.historicalPreservation.d3V1), d4v1Hash=gitBlobSha(c.historicalPreservation.d4V1);
  if(d3v1Hash!==c.historicalPreservation.d3V1GitBlobSha) add('D3_V1_DRIFT','Frozen D3 v1 bytes changed.',{actual:d3v1Hash});
  if(d4v1Hash!==c.historicalPreservation.d4V1GitBlobSha) add('D4_V1_DRIFT','Frozen D4 v1 bytes changed.',{actual:d4v1Hash});
  if(promotion.baseline?.activation!=='NOT_WIRED_TO_D3_D4'||promotion.futurePromotionGate?.thisVersionActivatesChecks!==false) add('PROMOTION_V1_BOUNDARY_CHANGED','Regression Promotion V1 boundary changed.');
  if(pkg.scripts?.['audit:localization']!==c.predecessor.formalCommand) add('STAGE5_COMMAND_CHANGED','Formal Stage 5 command changed.');
  if(pkg.scripts?.[c.doctorIntegration.packageAlias]!==c.doctorIntegration.packageCommand) add('DOCTOR_ALIAS_MISMATCH','Doctor localization alias mismatch.');
  const overlay=(d2.pathRuleOverlays??[]).find(r=>r.id==='localization-audit-stage6-integration');
  if(!overlay||overlay.changeClass!=='localization-tooling'||!sameSet(overlay.directNodes,['project-doctor'])) add('D2_LOCALIZATION_OVERLAY_MISMATCH','D2 v2 localization tooling overlay mismatch.');
  const loc=(d3.checkCatalog??[]).find(x=>x.id===c.doctorIntegration.d3CheckId);
  if(!loc||loc.command!==`npm run ${c.doctorIntegration.packageAlias}`||loc.phase!==c.doctorIntegration.phase||!sameSet(loc.triggerChangeClasses,c.doctorIntegration.selectionChangeClasses)) add('D3_LOCALIZATION_CHECK_MISMATCH','D3 v2 localization check mismatch.');
  const d3v1=readJson(c.historicalPreservation.d3V1);
  if(!sameSet(Object.keys(d3v1.manualReviewNodes??{}),Object.keys(d3.manualReviewNodes??{}))) add('MANUAL_REVIEW_BOUNDARY_CHANGED','D3 manual-review node set changed.');
  if(!(d4.allowedCheckIds??[]).includes(c.doctorIntegration.d3CheckId)) add('D4_LOCALIZATION_NOT_ALLOWED','D4 v2 does not allow localization audit.');
  if(!closeout.includes("scripts/validate-project-doctor-d4-v2.mjs")||!closeout.includes("scripts/run-project-doctor-d4-v2.mjs")) add('CLOSEOUT_NOT_V2','Project Doctor closeout is not using D4 v2.');
  if(d7.localizationIntegration?.d3CheckId!==c.doctorIntegration.d3CheckId||d7.doctorRuntime?.d4Contract!==c.doctorIntegration.d4Contract) add('D7_INTEGRATION_MISMATCH','D7 v2 is not bound to Stage 6 contracts.');

  const context=loadPlanningContext(c.doctorIntegration.d3Contract);
  const cases=[
    ['soldierPresentation',['data/presentation/soldier-lower-tier-name-kr.v1.json'],true],
    ['equipmentFrontend',['src/lib/equipment-page.localized.server.ts'],true],
    ['localizationTooling',['scripts/audit-localization.mjs'],true],
    ['assetOnly',['public/images/soldiers-webp/5102.webp'],false],
    ['sharedFrontendOnly',['src/components/stage6-fixture.tsx'],false],
  ].map(([id,paths,expected])=>{const p=planPaths({paths,source:{mode:'stage6-fixture',id},context});const selected=p.selectedChecks.some(x=>x.id===c.doctorIntegration.d3CheckId);if(selected!==expected)add('SELECTION_BOUNDARY_MISMATCH',`Selection boundary mismatch: ${id}`,{expected,selected,checks:p.selectedChecks.map(x=>x.id)});return{id,status:p.status,selected,expected,checks:p.selectedChecks.map(x=>x.id),manualNodes:p.manualReviews.filter(x=>x.node).map(x=>x.node)};});

  const stage5Run=runNode('scripts/audit-localization.mjs',['--check']);
  if(stage5Run.status!==0)add('STAGE5_LIVE_GATE_FAILED','Stage 5 live gate failed.',{stdout:stage5Run.stdout,stderr:stage5Run.stderr});
  const promotionRun=runNode('scripts/validate-regression-coverage-promotion.mjs');
  if(promotionRun.status!==0)add('PROMOTION_V1_VALIDATION_FAILED','Regression Promotion V1 validation failed.',{stdout:promotionRun.stdout,stderr:promotionRun.stderr});
  const status=errors.length?'FAIL':stage5.status;
  return {version:1,schemaId:'localization-audit-stage6/v1',stage:6,status,mode:'PROJECT_DOCTOR_INTEGRATION',predecessor:{stage5Status:stage5.status,stage5ContractGitBlobSha:stage5ContractHash,stage5SnapshotGitBlobSha:stage5SnapshotHash,errors:stage5.summary?.errors??null,reviews:stage5.summary?.reviews??null},doctor:{d2SchemaId:d2.schemaId,d3SchemaId:d3.schemaId,d4SchemaId:d4.schemaId,d7SchemaId:d7.schemaId,packageAlias:c.doctorIntegration.packageAlias,checkId:c.doctorIntegration.d3CheckId,phase:c.doctorIntegration.phase,manualReviewNodeCount:Object.keys(d3.manualReviewNodes??{}).length,selectionCases:cases},historical:{d3V1GitBlobSha:d3v1Hash,d4V1GitBlobSha:d4v1Hash,promotionV1Validation:promotionRun.status===0?'PASS':'FAIL'},checks:{stage5LiveGate:stage5Run.status===0,promotionV1LiveGate:promotionRun.status===0,stage5BytesPreserved:stage5ContractHash===c.predecessor.contractGitBlobSha&&stage5SnapshotHash===c.predecessor.snapshotGitBlobSha,doctorV1BytesPreserved:d3v1Hash===c.historicalPreservation.d3V1GitBlobSha&&d4v1Hash===c.historicalPreservation.d4V1GitBlobSha,d2OverlayReady:Boolean(overlay),d3SelectionReady:Boolean(loc),d4ExecutionReady:(d4.allowedCheckIds??[]).includes(c.doctorIntegration.d3CheckId),d7GuardReady:d7.status==='DESIGN_FROZEN',readOnlyLocalizationSemantics:true},summary:{errors:errors.length,reviews:stage5.summary?.reviews??0,selectionCaseCount:cases.length,selectionCasePassCount:cases.filter(x=>x.selected===x.expected).length},errors,readOnlyExecution:true};
}

function selfTest(){
 const tests=[]; const t=(name,run)=>{const r=run();tests.push({name,passed:r.status===0,stdout:r.stdout.trim().slice(-500),stderr:r.stderr.trim().slice(-500)});};
 t('stage5-check',()=>runNode('scripts/audit-localization.mjs',['--check']));
 t('promotion-v1',()=>runNode('scripts/validate-regression-coverage-promotion.mjs'));
 t('d2-v2',()=>runNode('scripts/validate-project-doctor-d2-impact-v2.mjs'));
 t('d3-v2',()=>runNode('scripts/validate-project-doctor-d3-v2.mjs'));
 t('d4-v2',()=>runNode('scripts/validate-project-doctor-d4-v2.mjs'));
 t('d7-v2',()=>runNode('scripts/validate-project-doctor-d7-v2.mjs'));
 t('formal-alias',()=>runNpm(['run','audit:localization:check']));
 return {status:tests.every(x=>x.passed)?'PASS':'FAIL',passed:tests.filter(x=>x.passed).length,total:tests.length,tests};
}

const args=new Set(process.argv.slice(2));
if(args.has('--self-test')){const r=selfTest();console.log(`Localization Audit Stage 6 self-test: ${r.status} (${r.passed}/${r.total})`);for(const x of r.tests)console.log(`${x.passed?'PASS':'FAIL'} ${x.name}`);if(r.status!=='PASS')process.exitCode=1;}
else {const result=buildResult(); if(args.has('--check')){const expected=readJson(SNAPSHOT);if(JSON.stringify(stable(result))!==JSON.stringify(stable(expected))){console.error('Localization Audit Stage 6 snapshot mismatch.');console.error(JSON.stringify(result,null,2));process.exit(1);}console.log(`Localization Audit Stage 6: ${result.status}`);console.log(`selection ${result.summary.selectionCasePassCount}/${result.summary.selectionCaseCount}, errors ${result.summary.errors}, reviews ${result.summary.reviews}`);} else if(args.has('--json')) console.log(JSON.stringify(result,null,2)); else {console.log('LOCALIZATION AUDIT — Stage 6 / Project Doctor integration');console.log(`status: ${result.status}`);console.log(`selection: ${result.summary.selectionCasePassCount}/${result.summary.selectionCaseCount}`);console.log(`errors: ${result.summary.errors}`);console.log(`reviews: ${result.summary.reviews}`);} if(result.status==='FAIL')process.exitCode=1;}
