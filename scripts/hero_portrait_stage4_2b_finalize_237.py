#!/usr/bin/env python3
import json
from pathlib import Path
root=Path('.')
prev=json.loads((root/'data/generated/hero-portrait-stage4-2b-interim-admission.v1.json').read_text())
val=json.loads((root/'data/validation/hero-portrait-stage4-2b-role-rescue-validation.v1.json').read_text())
rev=json.loads((root/'data/reviews/hero-portrait-stage4-2b-role-rescue-visual-review.v1.json').read_text())
assert prev['summary']['canonicalAdmittedSourceCount']==234
assert val['summary']['technicalPassCount']==3 and rev['verdict']['eligibleForStage3Admission']==3
recs=list(prev['records']);eh={int(r['heroId']) for r in recs};es={r['sourceImmutableId'] for r in recs};esh={r['sha256'] for r in recs}
new=[]
for r in val['records']:
 h=int(r['heroId']);t=r['technical'];assert h not in eh and r['sourceImmutableId'] not in es and t['sha256'] not in esh
 nr={'heroId':h,'sourceKind':'GOOGLE_DRIVE_BASE_SKIN_PNG','sourceImmutableId':r['sourceImmutableId'],'sourceFileName':r['sourceFileName'],'mimeType':'image/png','byteLength':t['byteLength'],'sha256':t['sha256'],'width':t['width'],'height':t['height'],'alpha':True,'alphaExtrema':t['alphaExtrema'],'sourceProvenance':'PASS_BY_STAGE4_2B_EXACT_CHARIMAGE_BASE_RUNTIME_ROLE_IN_PROVEN_BASE_FOLDER','uiDecorationContamination':'PASS_NONE_OBSERVED_BY_STAGE4_2B_ROLE_RESCUE_REVIEW','identityEvidence':'HEROINFO_CHARIMAGE_ID_TO_CHARIMAGE_SPINE_EXACT_BASE_RUNTIME_ROLE','technicalAdmissionEvidence':'PASS_STAGE3_BYTE_FORMAT_ALPHA_HASH_GATES','visualReviewEvidence':'PASS_STAGE4_2B_ROLE_RESCUE_3_OF_3','admissionState':'ADMITTED_SOURCE','admittedAtStage':'HERO_PORTRAIT_STAGE4_2B_EXPLICIT_FALLBACK_SOURCE_ACQUISITION','targetPath':f'public/images/heroes/cards/{h}.png','materializationPerformed':False}
 recs.append(nr);new.append(nr);eh.add(h);es.add(nr['sourceImmutableId']);esh.add(nr['sha256'])
recs.sort(key=lambda x:int(x['heroId']))
summary={'canonicalHeroCount':267,'previousAdmittedSourceCount':234,'stage42bRoleRescueAdmissionCount':3,'canonicalAdmittedSourceCount':237,'pendingCanonicalSourceCount':30,'duplicateHeroIdCount':len(recs)-len({r['heroId'] for r in recs}),'duplicateImmutableSourceIdCount':len(recs)-len({r['sourceImmutableId'] for r in recs}),'duplicateShaGroupCount':len(recs)-len({r['sha256'] for r in recs}),'materializedTargetCount':0,'bulk267Ready':False,'hardErrorCount':0}
out={'version':2,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','status':'PASS_WITH_REVIEW','completion':'IN_PROGRESS_CHECKPOINT','summary':summary,'newRoleRescueHeroIds':sorted(r['heroId'] for r in new),'records':recs}
(root/'data/generated/hero-portrait-stage4-2b-237-admission.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
ck={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','status':'PASS_WITH_REVIEW','completion':'IN_PROGRESS_CHECKPOINT','freezeState':'HERO_PORTRAIT_STAGE4_2B_237_ADMISSIONS_CHECKPOINT','summary':summary,'remainingKnownCategories':{'multipleExactBaseRuntimeRoleCases':4,'knownOwnershipNoStage3Png':1,'sdStructuredGroupsWithoutBaseRuntimeMatch':2,'structuredIndexGap':23},'nextStart':{'goal':'Investigate remaining 30 only; do not reopen 237 admissions','bulkMaterializationBlockedUntil':'ADMITTED_SOURCE_267_OF_267'}}
(root/'data/checkpoints/hero-portrait-stage4-2b-237-admissions-checkpoint.v1.json').write_text(json.dumps(ck,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
