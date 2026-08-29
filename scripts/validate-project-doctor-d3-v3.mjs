import fs from 'node:fs';
import path from 'node:path';
import { loadPlanningContext, planPaths } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH='data/contracts/project-doctor-d3-validator-plan.v3.json';
const OUTPUT_PATH='data/validation/project-doctor-d3-summary.v3.json';
const contract=JSON.parse(fs.readFileSync(CONTRACT_PATH,'utf8'));
const context=loadPlanningContext(CONTRACT_PATH);
const failures=[];
const sameSet=(a=[],b=[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const fixtureResults=[];
for(const fixture of contract.fixtures??[]){
  const plan=planPaths({paths:fixture.paths,source:{mode:'fixture',id:fixture.id},context});
  const actualChecks=plan.selectedChecks.map(x=>x.id);
  const actualManualNodes=plan.manualReviews.filter(x=>x.node).map(x=>x.node);
  const pass=plan.status===fixture.expectedStatus&&sameSet(actualChecks,fixture.expectedChecks)&&sameSet(actualManualNodes,fixture.expectedManualNodes)&&plan.validatorExecutionCount===0;
  fixtureResults.push({id:fixture.id,pass,expectedStatus:fixture.expectedStatus,actualStatus:plan.status,expectedChecks:fixture.expectedChecks,actualChecks,expectedManualNodes:fixture.expectedManualNodes,actualManualNodes});
  if(!pass) failures.push({type:'FIXTURE_FAILURE',...fixtureResults.at(-1)});
}
const v2=JSON.parse(fs.readFileSync('data/contracts/project-doctor-d3-validator-plan.v2.json','utf8'));
const promotionV2Owners=['hero-canonical','soldier-canonical','equipment-canonical','hero-soldier-relation','hero-equipment-relation','banner-data','skin-relation','shared-movement','soldier-assets'];
const expectedAdmitted=[...promotionV2Owners,'equipment-assets'];
const expectedManual=['hero-assets','banner-assets','skin-assets'];
const actualAdmitted=(contract.admittedOwners??[]).map(x=>x.node);
if(!sameSet(actualAdmitted,expectedAdmitted)) failures.push({type:'ADMITTED_OWNER_SET_MISMATCH',actualAdmitted});
if(!sameSet(Object.keys(contract.manualReviewNodes??{}),expectedManual)) failures.push({type:'MANUAL_SCOPE_MISMATCH',actual:Object.keys(contract.manualReviewNodes??{})});
for(const node of expectedManual){ if(v2.manualReviewNodes?.[node]===undefined) failures.push({type:'MANUAL_SCOPE_NOT_FROM_V2',node}); }
for(const row of contract.admittedOwners??[]){
  const catalog=(contract.checkCatalog??[]).find(x=>x.id===row.checkId);
  const expectedPhase=row.node==='equipment-assets'?3:2;
  if(!catalog||!catalog.triggerNodes?.includes(row.node)||catalog.command!==`npm run ${row.packageCommand}`||catalog.phase!==expectedPhase) failures.push({type:'OWNER_CATALOG_MISMATCH',row,catalog,expectedPhase});
}
if((contract.checkCatalog??[]).find(x=>x.id==='regression-coverage-promotion-v2')?.command!=='npm run validate:regression-coverage-promotion:v2') failures.push({type:'V2_AUDIT_CATALOG_MISMATCH'});
if((contract.checkCatalog??[]).find(x=>x.id==='equipment-image-final')?.command!=='npm run validate:equipment-image-final') failures.push({type:'EQUIPMENT_IMAGE_OWNER_CATALOG_MISMATCH'});
if(contract.promotionEvidence?.ownerCount!==9||contract.promotionEvidence?.unresolved!==0||contract.promotionEvidence?.v2AuditFailureCount!==0) failures.push({type:'PROMOTION_EVIDENCE_MISMATCH',evidence:contract.promotionEvidence});
if(contract.equipmentImageOwnerPromotion?.node!=='equipment-assets'||contract.equipmentImageOwnerPromotion?.phase!==3||contract.equipmentImageOwnerPromotion?.publicEquipment!==373||contract.equipmentImageOwnerPromotion?.browserUiFreshness!=='PASS_FRESH_BROWSER_UI_EVIDENCE'||contract.equipmentImageOwnerPromotion?.semanticStageReopened!==false) failures.push({type:'EQUIPMENT_IMAGE_PROMOTION_EVIDENCE_MISMATCH',evidence:contract.equipmentImageOwnerPromotion});
const pass=failures.length===0;
const summary={version:3,schemaId:'project-doctor-d3-summary/v3',stage:'D3',checkpoint:'PROJECT_DOCTOR_D3_VALIDATOR_PLAN_V3_REGRESSION_AND_EQUIPMENT_IMAGE_ADMISSION',status:pass?'PASS_PROJECT_DOCTOR_D3_PLAN_V3':'FAIL_PROJECT_DOCTOR_D3_PLAN_V3',completion:pass?'COMPLETE':'BLOCKED',contract:CONTRACT_PATH,checks:{selectionFixtureCount:fixtureResults.length,selectionFixturePassCount:fixtureResults.filter(x=>x.pass).length,verifiedCatalogEntryCount:contract.checkCatalog.length,admittedOwnerCount:contract.admittedOwners.length,manualReviewNodeCount:Object.keys(contract.manualReviewNodes).length},fixtureResults,failures,hardErrorCount:failures.length};
fs.mkdirSync(path.dirname(OUTPUT_PATH),{recursive:true});
fs.writeFileSync(OUTPUT_PATH,`${JSON.stringify(summary,null,2)}\n`);
console.log(summary.status);
if(!pass) process.exitCode=1;
