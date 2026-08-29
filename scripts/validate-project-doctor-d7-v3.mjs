import fs from 'node:fs';

const CONTRACT_PATH='data/contracts/project-doctor-d7-pr-guard.v3.json';
const WORKFLOW_PATH='.github/workflows/project-doctor-d7-pr-guard.yml';
const PACKAGE_PATH='package.json';
const CLOSEOUT_PATH='scripts/run-project-doctor-closeout.mjs';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const readText=p=>fs.readFileSync(p,'utf8');
const sameSet=(a=[],b=[])=>a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);
const contract=readJson(CONTRACT_PATH),workflow=readText(WORKFLOW_PATH),pkg=readJson(PACKAGE_PATH),closeout=readText(CLOSEOUT_PATH);
const d2=readJson(contract.doctorRuntime.d2Contract),d3=readJson(contract.doctorRuntime.d3Contract),d4=readJson(contract.doctorRuntime.d4Contract);
const failures=[];let checkCount=0;const check=(ok,code)=>{checkCount++;if(!ok)failures.push(code)};

check(contract.schemaId==='project-doctor-d7-pr-guard/v3'&&contract.status==='DESIGN_FROZEN','CONTRACT_V3');
check(contract.targetBaseBranch==='main','TARGET_BASE_MAIN');
check(contract.checkIdentity?.requiredStatusCheckContext==='pr-guard'&&contract.checkIdentity?.githubActionsAppId===15368,'REQUIRED_CHECK_IDENTITY');
check(sameSet(contract.events?.pull_request?.types,['opened','synchronize','reopened','ready_for_review']),'PR_TYPES');
check(contract.permissions?.contents==='read','CONTENTS_READ');
check(contract.changedFilePolicy?.manualReviewMustFailWorkflow===true&&contract.changedFilePolicy?.manualReviewExitCode===3,'MANUAL_REVIEW_FAIL_CLOSED');
check(contract.securityPolicy?.freshnessRefreshInWorkflow===false,'NO_RESEAL');
check(/^name:\s*Project Doctor PR Guard\s*$/m.test(workflow),'WORKFLOW_NAME');
check(/\bpull_request:\s*\n/.test(workflow)&&!/\bpull_request_target:\s*\n/.test(workflow),'SAFE_PR_EVENT');
check(/permissions:\s*\n\s*contents:\s*read/m.test(workflow)&&!/contents:\s*write/.test(workflow),'WORKFLOW_READ_ONLY');
check(/fetch-depth:\s*0/.test(workflow),'FULL_HISTORY');
check(workflow.includes('github.event.pull_request.base.ref')&&workflow.includes('github.event.pull_request.head.sha')&&!workflow.includes('github.event.pull_request.base.sha'),'LIVE_PR_DIFF');
check(!workflow.includes('doctor:freshness:refresh'),'NO_FRESHNESS_REFRESH');
for(const marker of ['npm run doctor:pr-guard:validate','npm run doctor:freshness:validate','npm run doctor:status','npm run doctor -- --dry-run --base "$DOCTOR_BASE" --head "$DOCTOR_HEAD"','npm run doctor -- --base "$DOCTOR_BASE" --head "$DOCTOR_HEAD"']) check(workflow.includes(marker),`WORKFLOW_STEP_${marker}`);
check(workflow.includes('Validate Regression Coverage Promotion V1 admission')&&workflow.includes('node scripts/validate-regression-coverage-promotion.mjs'),'PROMOTION_V1_GATE_PRESERVED');

check(d2.schemaId==='project-doctor-d2-impact-contract/v3','D2_V3');
const v2Overlay=(d2.pathRuleOverlays??[]).find(r=>r.id==='regression-coverage-promotion-v2-admission');
check(v2Overlay?.changeClass==='regression-coverage-promotion-v2'&&sameSet(v2Overlay?.directNodes,['project-doctor']),'PROMOTION_V2_D2_OVERLAY');
const equipmentOverlay=(d2.pathRuleOverlays??[]).find(r=>r.id==='equipment-image-final-owner');
check(equipmentOverlay?.changeClass==='asset-pipeline'&&sameSet(equipmentOverlay?.directNodes,['equipment-assets']),'EQUIPMENT_IMAGE_D2_OVERLAY');
check(d3.schemaId==='project-doctor-d3-validator-plan/v3','D3_V3');
check(d4.schemaId==='project-doctor-d4-execution/v3','D4_V3');
const promotionV2Nodes=contract.promotionV2Admission.requiredOwnerNodes;
const equipmentNode=contract.equipmentImageFinalOwnerAdmission.node;
const expectedNodes=[...promotionV2Nodes,equipmentNode];
const expectedManual=contract.equipmentImageFinalOwnerAdmission.remainingManualNodes;
check(sameSet((d3.admittedOwners??[]).map(x=>x.node),expectedNodes),'OWNER_NODE_SET');
check(sameSet(Object.keys(d3.manualReviewNodes??{}),expectedManual),'MANUAL_NODE_SET');
check((d3.admittedOwners??[]).length===10&&contract.promotionV2Admission.ownerCount===9&&contract.equipmentImageFinalOwnerAdmission.ownerCountAfterAdmission===10,'OWNER_COUNT');
for(const row of d3.admittedOwners??[]){
  const catalog=(d3.checkCatalog??[]).find(x=>x.id===row.checkId);
  const expectedPhase=row.node==='equipment-assets'?3:2;
  check(Boolean(catalog&&catalog.phase===expectedPhase&&catalog.triggerNodes?.includes(row.node)&&catalog.command===`npm run ${row.packageCommand}`),`OWNER_CATALOG_${row.node}`);
  check(Boolean(pkg.scripts?.[row.packageCommand]),`OWNER_PACKAGE_ALIAS_${row.node}`);
}
const audit=(d3.checkCatalog??[]).find(x=>x.id===contract.promotionV2Admission.v2AuditCheckId);
check(audit?.command===`npm run ${contract.promotionV2Admission.v2AuditPackageAlias}`&&audit?.phase===3,'PROMOTION_V2_AUDIT_CATALOG');
check(Boolean(pkg.scripts?.[contract.promotionV2Admission.v2AuditPackageAlias]),'PROMOTION_V2_AUDIT_ALIAS');
const equipmentCheck=(d3.checkCatalog??[]).find(x=>x.id===contract.equipmentImageFinalOwnerAdmission.checkId);
check(equipmentCheck?.command===`npm run ${contract.equipmentImageFinalOwnerAdmission.packageAlias}`&&equipmentCheck?.phase===3&&equipmentCheck?.triggerNodes?.includes('equipment-assets'),'EQUIPMENT_IMAGE_CATALOG');
check(pkg.scripts?.[contract.equipmentImageFinalOwnerAdmission.packageAlias]==='node scripts/validate-equipment-image-final.mjs','EQUIPMENT_IMAGE_PACKAGE_ALIAS');
check((d4.allowedCheckIds??[]).includes(contract.promotionV2Admission.v2AuditCheckId)&&d3.admittedOwners.every(x=>d4.allowedCheckIds.includes(x.checkId)),'D4_V3_ALLOWLIST');

check(pkg.scripts?.['doctor:impact']==='node scripts/analyze-project-doctor-d2-impact.mjs --contract data/contracts/project-doctor-d2-impact-contract.v3.json','DOCTOR_IMPACT_V3');
check(pkg.scripts?.['doctor:impact:validate']==='node scripts/validate-project-doctor-d2-impact-v3.mjs','DOCTOR_IMPACT_VALIDATE_V3');
check(pkg.scripts?.['doctor:plan']==='node scripts/plan-project-doctor-d3.mjs --contract data/contracts/project-doctor-d3-validator-plan.v3.json','DOCTOR_PLAN_V3');
check(pkg.scripts?.['doctor:plan:validate']==='node scripts/validate-project-doctor-d3-v3.mjs','DOCTOR_PLAN_VALIDATE_V3');
check(pkg.scripts?.['doctor:run']==='node scripts/run-project-doctor-d4-v3.mjs','DOCTOR_RUN_V3');
check(pkg.scripts?.['doctor:run:validate']==='node scripts/validate-project-doctor-d4-v3.mjs','DOCTOR_RUN_VALIDATE_V3');
check(pkg.scripts?.['doctor:pr-guard:validate']==='node scripts/validate-project-doctor-d7-v3.mjs','D7_PACKAGE_V3');
check(closeout.includes("script: 'scripts/validate-project-doctor-d4-v3.mjs'")&&closeout.includes("script: 'scripts/run-project-doctor-d4-v3.mjs'"),'CLOSEOUT_V3');

const result={version:3,schemaId:'project-doctor-d7-validation-result/v3',stage:'D7',status:failures.length===0?'PASS_PROJECT_DOCTOR_D7_GUARD_V3':'FAIL_PROJECT_DOCTOR_D7_GUARD_V3',exitCode:failures.length===0?0:1,checkCount,failureCount:failures.length,failures};
console.log(JSON.stringify(result,null,2));process.exitCode=result.exitCode;
