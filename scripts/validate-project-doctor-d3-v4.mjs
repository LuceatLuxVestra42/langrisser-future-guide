import fs from 'node:fs';
import path from 'node:path';
import { loadPlanningContext, planPaths } from './plan-project-doctor-d3.mjs';
const CONTRACT_PATH='data/contracts/project-doctor-d3-validator-plan.v4.json';
const OUTPUT_PATH='data/validation/project-doctor-d3-summary.v4.json';
const c=JSON.parse(fs.readFileSync(CONTRACT_PATH,'utf8')),ctx=loadPlanningContext(CONTRACT_PATH);const failures=[];const results=[];const same=(a=[],b=[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
for(const f of c.fixtures??[]){const p=planPaths({paths:f.paths,source:{mode:'fixture',id:f.id},context:ctx});const checks=p.selectedChecks.map(x=>x.id),manual=p.manualReviews.filter(x=>x.node).map(x=>x.node);const pass=p.status===f.expectedStatus&&same(checks,f.expectedChecks)&&same(manual,f.expectedManualNodes)&&p.validatorExecutionCount===0;results.push({id:f.id,pass,actualStatus:p.status,checks,manual});if(!pass)failures.push(`FIXTURE:${f.id}`)}
if(c.schemaId!=='project-doctor-d3-validator-plan/v4'||c.status!=='DESIGN_FROZEN')failures.push('CONTRACT');
if(c.supersedes!=='data/contracts/project-doctor-d3-validator-plan.v3.json')failures.push('SUPERSEDES');
const owners=(c.admittedOwners??[]).map(x=>x.node);if(!owners.includes('hero-assets')||owners.length!==11)failures.push('OWNER_SET');
if(!same(Object.keys(c.manualReviewNodes??{}),['banner-assets','skin-assets']))failures.push('MANUAL_SET');
const hero=c.checkCatalog.find(x=>x.id==='hero-artwork-final');if(!hero||hero.phase!==3||hero.command!=='npm run validate:hero-artwork-final'||!hero.triggerNodes.includes('hero-assets'))failures.push('HERO_CATALOG');
if(c.heroArtworkOwnerPromotion?.canonicalHeroCount!==267||c.heroArtworkOwnerPromotion?.materializedPngCount!==267||c.heroArtworkOwnerPromotion?.hostedHeadPassCount!==267||c.heroArtworkOwnerPromotion?.browserFailureCount!==0||c.heroArtworkOwnerPromotion?.semanticStageReopened!==false)failures.push('HERO_EVIDENCE');
const pass=failures.length===0;const out={version:4,schemaId:'project-doctor-d3-summary/v4',status:pass?'PASS_PROJECT_DOCTOR_D3_PLAN_V4':'FAIL_PROJECT_DOCTOR_D3_PLAN_V4',completion:pass?'COMPLETE':'BLOCKED',fixtureCount:results.length,fixturePassCount:results.filter(x=>x.pass).length,admittedOwnerCount:owners.length,manualReviewNodeCount:Object.keys(c.manualReviewNodes??{}).length,failures,results};fs.mkdirSync(path.dirname(OUTPUT_PATH),{recursive:true});fs.writeFileSync(OUTPUT_PATH,`${JSON.stringify(out,null,2)}\n`);console.log(out.status);if(!pass)process.exitCode=1;
