import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildExtractionPlan } from './skin-stage3-4-build-extraction-plan.mjs';
import { evaluateExtractionResult } from './validate-skin-stage3-4-extraction-result.mjs';
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); return 1; } catch (e) { console.error(`FAIL ${name}: ${e.message}`); return 0; } }
function expectThrow(fn) { let ok=false; try { fn(); } catch { ok=true; } if (!ok) throw new Error('expected throw'); }
const contract = {
  status:'DESIGN_FROZEN', predecessorRequirements:{qaStatus:'PASS_SKIN_STAGE3_3_3_RESOLUTION_QA_FREEZE_READY',requiredTargetCount:2,candidateBundleCount:2},
  acceptedQaClasses:['RESOLVED_EXACT_SINGLE_BUNDLE','RESOLVED_EXACT_IDENTICAL_CAB_ALIAS'], expectedExtractionRequests:{total:2,STATIC:1,CHAR_SPINE:1,MODEL_PRIMARY:0},
  kindToExtractionClass:{STATIC:'STATIC_IMAGE_SOURCE_OBJECT',CHAR_SPINE:'CHAR_SPINE_PREFAB_OBJECT',MODEL_PRIMARY:'MODEL_PRIMARY_PREFAB_OBJECT'}, extractionBoundary:{serializedObjectParserRequired:true}
};
const cab='a'.repeat(64), b1='1'.repeat(64), b2='2'.repeat(64);
const scan={stage:'skin-page-3',substage:'3-3-2',counts:{requiredTargetCount:2,authoritativeCandidateBundleCount:2,bundleErrorCount:0},unscannedCandidateBundles:[],bundleReports:[
  {fileName:'a.b',scanStatus:'OK',sha256:b1,embeddedCabs:[{name:'CAB-x',sha256:cab}]},{fileName:'b.b',scanStatus:'OK',sha256:b2,embeddedCabs:[{name:'CAB-y',sha256:cab}]}
],resolutions:[
  {targetId:'skin:1:static',required:true,kind:'STATIC',skinId:1,frozenPath:'UI/A.png',runtimePath:'assets/gameproject/runtimeassets/ui/a.png',candidateResults:[{bundle:'a.b',exactOccurrenceCount:1,matches:[{embeddedCab:'CAB-x',runtimePathByteOffset:5}]}]},
  {targetId:'skin:1:char',required:true,kind:'CHAR_SPINE',skinId:1,frozenPath:'Spine/A.prefab',runtimePath:'assets/gameproject/runtimeassets/spine/a.prefab',candidateResults:[{bundle:'a.b',exactOccurrenceCount:1,matches:[{embeddedCab:'CAB-x',runtimePathByteOffset:7}]},{bundle:'b.b',exactOccurrenceCount:1,matches:[{embeddedCab:'CAB-y',runtimePathByteOffset:9}]}]}
]};
const qa={stage:'skin-page-3',substage:'3-3-3',status:'PASS_SKIN_STAGE3_3_3_RESOLUTION_QA_FREEZE_READY',finalFreezeReady:true,counts:{acceptedRequiredTargetCount:2,pendingRequiredTargetCount:0,failedRequiredTargetCount:0,reviewRequiredTargetCount:0,accountedCandidateBundleCount:2,bundleScanErrorCount:0},rows:[
  {targetId:'skin:1:static',kind:'STATIC',skinId:1,frozenPath:'UI/A.png',accepted:true,severity:'PASS',qaClass:'RESOLVED_EXACT_SINGLE_BUNDLE'},
  {targetId:'skin:1:char',kind:'CHAR_SPINE',skinId:1,frozenPath:'Spine/A.prefab',accepted:true,severity:'PASS',qaClass:'RESOLVED_EXACT_IDENTICAL_CAB_ALIAS',identicalCabSha256:cab}
]};
let pass=0,total=0;
total++; pass+=test('build single + alias plan',()=>{ const p=buildExtractionPlan(qa,scan,contract); if(p.requests.length!==2) throw new Error('bad count'); if(p.requests[1].sourceProvenance.length!==2) throw new Error('alias provenance lost'); });
total++; pass+=test('partial QA blocked',()=>{ const q=structuredClone(qa); q.finalFreezeReady=false; expectThrow(()=>buildExtractionPlan(q,scan,contract)); });
total++; pass+=test('non-identical alias blocked',()=>{ const s=structuredClone(scan); s.bundleReports[1].embeddedCabs[0].sha256='b'.repeat(64); expectThrow(()=>buildExtractionPlan(qa,s,contract)); });
total++; pass+=test('artifact hash validation',()=>{ const p=buildExtractionPlan(qa,scan,contract); const root=fs.mkdtempSync(path.join(os.tmpdir(),'s34-')); const records=p.requests.map((r,i)=>{ const rel=`x/${i}.bin`; const full=path.join(root,rel); fs.mkdirSync(path.dirname(full),{recursive:true}); const bytes=Buffer.from(`object-${i}`); fs.writeFileSync(full,bytes); return {requestId:r.requestId,status:'EXTRACTED',runtimePath:r.runtimePath,source:r.selectedExtractionSource,artifacts:[{role:'PRIMARY_OBJECT',relativePath:rel,sizeBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}]}; }); const v=evaluateExtractionResult(p,{stage:'skin-page-3',substage:'3-4',records},root,contract); if(!v.finalReady) throw new Error('not ready'); });
total++; pass+=test('wrong source rejected',()=>{ const p=buildExtractionPlan(qa,scan,contract); const root=fs.mkdtempSync(path.join(os.tmpdir(),'s34-')); const r=p.requests[0]; const rel='x.bin', full=path.join(root,rel), bytes=Buffer.from('x'); fs.writeFileSync(full,bytes); const result={stage:'skin-page-3',substage:'3-4',records:[{requestId:r.requestId,status:'EXTRACTED',runtimePath:r.runtimePath,source:{...r.selectedExtractionSource,bundle:'wrong.b'},artifacts:[{role:'PRIMARY_OBJECT',relativePath:rel,sizeBytes:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}]}]}; expectThrow(()=>evaluateExtractionResult(p,result,root,contract)); });
console.log(JSON.stringify({pass,total})); if(pass!==total) process.exitCode=1;
