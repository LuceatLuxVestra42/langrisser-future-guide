import fs from 'node:fs';
import path from 'node:path';
import { loadPlanningContext, planPaths } from './plan-project-doctor-d3.mjs';

const CONTRACT_PATH='data/contracts/project-doctor-d3-validator-plan.v5.json';
const OUTPUT_PATH='data/validation/project-doctor-d3-summary.v5.json';
const c=JSON.parse(fs.readFileSync(CONTRACT_PATH,'utf8'));
const ctx=loadPlanningContext(CONTRACT_PATH);
const failures=[];const results=[];
const same=(a=[],b=[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
for(const f of c.fixtures??[]){
  const p=planPaths({paths:f.paths,source:{mode:'fixture',id:f.id},context:ctx});
  const checks=p.selectedChecks.map(x=>x.id),manual=p.manualReviews.filter(x=>x.node).map(x=>x.node);
  const pass=p.status===f.expectedStatus&&same(checks,f.expectedChecks)&&same(manual,f.expectedManualNodes)&&p.validatorExecutionCount===0;
  results.push({id:f.id,pass,actualStatus:p.status,checks,manual});
  if(!pass)failures.push(`FIXTURE:${f.id}`);
}
if(c.schemaId!=='project-doctor-d3-validator-plan/v5'||c.status!=='DESIGN_FROZEN')failures.push('CONTRACT');
if(c.supersedes!=='data/contracts/project-doctor-d3-validator-plan.v4.json')failures.push('SUPERSEDES');
const owners=(c.admittedOwners??[]).map(x=>x.node);
for(const node of ['equipment-assets','hero-assets','skin-assets']) if(!owners.includes(node)) failures.push(`OWNER:${node}`);
if(owners.length!==12)failures.push('OWNER_COUNT');
if(!same(Object.keys(c.manualReviewNodes??{}),['banner-assets']))failures.push('MANUAL_SET');
for(const [id,node] of [['hero-artwork-final','hero-assets'],['skin-assets-final','skin-assets']]){
  const row=c.checkCatalog.find(x=>x.id===id);
  if(!row||row.phase!==3||!row.triggerNodes.includes(node)) failures.push(`CATALOG:${id}`);
}
const pass=failures.length===0;
const out={version:5,schemaId:'project-doctor-d3-summary/v5',status:pass?'PASS_PROJECT_DOCTOR_D3_PLAN_V5':'FAIL_PROJECT_DOCTOR_D3_PLAN_V5',completion:pass?'COMPLETE':'BLOCKED',fixtureCount:results.length,fixturePassCount:results.filter(x=>x.pass).length,admittedOwnerCount:owners.length,manualReviewNodeCount:Object.keys(c.manualReviewNodes??{}).length,failures,results};
fs.mkdirSync(path.dirname(OUTPUT_PATH),{recursive:true});fs.writeFileSync(OUTPUT_PATH,`${JSON.stringify(out,null,2)}\n`);console.log(JSON.stringify(out,null,2));if(!pass)process.exitCode=1;
