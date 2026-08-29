import fs from 'node:fs';
import path from 'node:path';
import { analyzePaths, buildEffectiveMap } from './analyze-project-doctor-d2-impact.mjs';

const CONTRACT_PATH='data/contracts/project-doctor-d2-impact-contract.v4.json';
const OUTPUT_PATH='data/validation/project-doctor-d2-impact-summary.v4.json';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=v=>[...v].sort();
const contract=readJson(CONTRACT_PATH);
const baseMap=readJson(contract.baseMap);
const effectiveMap=buildEffectiveMap(baseMap,contract);
const failures=[];
const checks=[];
const check=(name,ok,detail=null)=>{const row={name,pass:Boolean(ok),...(detail===null?{}:{detail})};checks.push(row);if(!ok)failures.push(row)};

check('v4 contract frozen',contract.schemaId==='project-doctor-d2-impact-contract/v4'&&contract.status==='DESIGN_FROZEN');
check('v3 superseded without rewrite',contract.supersedes==='data/contracts/project-doctor-d2-impact-contract.v3.json');
check('base map preserved',contract.baseMap==='data/contracts/project-doctor-d2-dependency-map.v1.json'&&baseMap.status==='DESIGN_FROZEN');
check('overlay count',contract.pathRuleOverlays?.length===10,contract.pathRuleOverlays?.map(r=>r.id));
for(const id of ['soldier-webp-assets-post-map','project-doctor-workflow-post-map','project-status-derived-sync','regression-coverage-promotion-v1-meta-contract','localization-audit-stage6-integration','project-doctor-v3-regression-admission-tooling','regression-coverage-promotion-v2-admission','equipment-image-final-owner','skin-assets-final-owner','skin-hero-detail-consumer']) check(`overlay:${id}`,contract.pathRuleOverlays?.some(r=>r.id===id));
const equipmentImage=contract.pathRuleOverlays?.find(r=>r.id==='equipment-image-final-owner');
check('equipment image owner preserved',equipmentImage?.changeClass==='asset-pipeline'&&same(sorted(equipmentImage?.directNodes??[]),['equipment-assets']));
const skinAssets=contract.pathRuleOverlays?.find(r=>r.id==='skin-assets-final-owner');
check('skin final owner scoped',skinAssets?.changeClass==='asset-pipeline'&&same(sorted(skinAssets?.directNodes??[]),['skin-assets']));
const skinConsumer=contract.pathRuleOverlays?.find(r=>r.id==='skin-hero-detail-consumer');
check('skin consumer dual boundary',skinConsumer?.changeClass==='frontend'&&same(sorted(skinConsumer?.directNodes??[]),['hero-frontend','skin-assets']));
check('no graph mutation',contract.overlayPolicy?.mayAddImpactNodes===false&&contract.overlayPolicy?.mayAddPropagationEdges===false&&contract.overlayPolicy?.mayRewriteBaseRules===false&&contract.overlayPolicy?.historicalV3Preserved===true);

const fixtureResults=[];
for(const fixture of contract.fixtures??[]){
  const result=analyzePaths(fixture.paths,effectiveMap);
  const errs=[];
  if(result.status!==fixture.expectedStatus) errs.push({field:'status',expected:fixture.expectedStatus,actual:result.status});
  if(fixture.expectedChangedFileCount!==undefined&&result.changedFileCount!==fixture.expectedChangedFileCount) errs.push({field:'changedFileCount',expected:fixture.expectedChangedFileCount,actual:result.changedFileCount});
  if(!same(result.directNodes,sorted(fixture.expectedDirectNodes??[]))) errs.push({field:'directNodes',expected:sorted(fixture.expectedDirectNodes??[]),actual:result.directNodes});
  if(!same(result.domains,sorted(fixture.expectedDomains??[]))) errs.push({field:'domains',expected:sorted(fixture.expectedDomains??[]),actual:result.domains});
  const pass=errs.length===0;fixtureResults.push({id:fixture.id,pass,errors:errs});if(!pass)failures.push({fixture:fixture.id,errors:errs});
}
const pass=failures.length===0;
const summary={version:4,schemaId:'project-doctor-d2-impact-summary/v4',stage:'D2-IMPACT',checkpoint:'PROJECT_DOCTOR_D2_IMPACT_ANALYZER_V4_SKIN_ASSET_OWNER_ADMISSION',status:pass?'PASS_PROJECT_DOCTOR_D2_IMPACT_V4':'FAIL_PROJECT_DOCTOR_D2_IMPACT_V4',completion:pass?'COMPLETE':'BLOCKED',contract:CONTRACT_PATH,counts:{fixtureCount:fixtureResults.length,fixturePassCount:fixtureResults.filter(x=>x.pass).length,pathRuleOverlayCount:contract.pathRuleOverlays.length,hardErrorCount:failures.length},checks,fixtureResults,failures,hardErrorCount:failures.length};
fs.mkdirSync(path.dirname(OUTPUT_PATH),{recursive:true});
fs.writeFileSync(OUTPUT_PATH,`${JSON.stringify(summary,null,2)}\n`);
console.log(summary.status);
if(!pass)process.exitCode=1;
