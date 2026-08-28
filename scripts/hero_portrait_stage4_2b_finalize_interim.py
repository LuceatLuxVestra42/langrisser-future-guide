#!/usr/bin/env python3
import json
from pathlib import Path
root=Path('.')
prev=json.loads((root/'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json').read_text())
val=json.loads((root/'data/validation/hero-portrait-stage4-2b-sd-mapped-source-validation.v1.json').read_text())
review=json.loads((root/'data/reviews/hero-portrait-stage4-2b-sd-mapped-visual-review.v1.json').read_text())
if prev['summary']['canonicalAdmittedSourceCount']!=209: raise SystemExit('expected previous 209')
if val['summary']['technicalPassCount']!=25 or review['verdict']['eligibleForStage3Admission']!=25: raise SystemExit('25-source gates not passed')
records=list(prev['records'])
existing_h={int(r['heroId']) for r in records};existing_s={r['sourceImmutableId'] for r in records};existing_sha={r['sha256'] for r in records}
new=[]
for r in val['records']:
 h=int(r['heroId']); t=r['technical']
 if h in existing_h or r['sourceImmutableId'] in existing_s or t['sha256'] in existing_sha: raise SystemExit(f'duplicate admission {h}')
 nr={'heroId':h,'sourceKind':'GOOGLE_DRIVE_BASE_SKIN_PNG','sourceImmutableId':r['sourceImmutableId'],'sourceFileName':r['sourceFileName'],'mimeType':'image/png','byteLength':t['byteLength'],'sha256':t['sha256'],'width':t['width'],'height':t['height'],'alpha':True,'alphaExtrema':t['alphaExtrema'],'sourceProvenance':'PASS_BY_STAGE4_2B_CHARIMAGE_SD_OWNERSHIP_PLUS_STRUCTURED_SKIN_BASE_PATH','uiDecorationContamination':'PASS_NONE_OBSERVED_BY_STAGE4_2B_CONTACT_SHEET_REVIEW','identityEvidence':'HEROINFO_CHARIMAGE_ID_TO_CHARIMAGE_SPINE_BASE_RUNTIME_MATCHED_IN_SAME_DRIVE_GROUP_SD','technicalAdmissionEvidence':'PASS_STAGE3_BYTE_FORMAT_ALPHA_HASH_GATES','visualReviewEvidence':'PASS_STAGE4_2B_BATCH_CONTACT_SHEET_25_OF_25','admissionState':'ADMITTED_SOURCE','admittedAtStage':'HERO_PORTRAIT_STAGE4_2B_EXPLICIT_FALLBACK_SOURCE_ACQUISITION','targetPath':f'public/images/heroes/cards/{h}.png','materializationPerformed':False}
 records.append(nr);new.append(nr);existing_h.add(h);existing_s.add(nr['sourceImmutableId']);existing_sha.add(nr['sha256'])
records.sort(key=lambda r:int(r['heroId']))
canonical=267; admitted=len(records); pending=canonical-admitted
out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','schemaId':'hero-portrait-stage4-2b-interim-admission/v1','status':'PASS_WITH_REVIEW','completion':'IN_PROGRESS_CHECKPOINT','sourcePreviousRegistry':'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json','newSourceEvidence':'data/validation/hero-portrait-stage4-2b-sd-mapped-source-validation.v1.json','visualReview':'data/reviews/hero-portrait-stage4-2b-sd-mapped-visual-review.v1.json','summary':{'canonicalHeroCount':canonical,'previousAdmittedSourceCount':209,'stage42bNewAdmissionCount':25,'canonicalAdmittedSourceCount':admitted,'pendingCanonicalSourceCount':pending,'duplicateHeroIdCount':len(records)-len({r['heroId'] for r in records}),'duplicateImmutableSourceIdCount':len(records)-len({r['sourceImmutableId'] for r in records}),'duplicateShaGroupCount':len(records)-len({r['sha256'] for r in records}),'materializedTargetCount':0,'bulk267Ready':False,'hardErrorCount':0},'newAdmissionHeroIds':sorted(r['heroId'] for r in new),'records':records}
(root/'data/generated/hero-portrait-stage4-2b-interim-admission.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
ck={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','status':'PASS_WITH_REVIEW','completion':'IN_PROGRESS_CHECKPOINT','freezeState':'HERO_PORTRAIT_STAGE4_2B_234_ADMISSIONS_CHECKPOINT','summary':out['summary'],'nextStart':{'goal':'Investigate remaining 33 only; do not reopen 234 admissions','remainingBreakdownExpected':'5 known-ownership role review + 1 known-ownership no-PNG + 2 SD ownership-proven base-role issues + 2 SD-unresolved structured groups + 23 structured-index gap','bulkMaterializationBlockedUntil':'ADMITTED_SOURCE_267_OF_267'}}
(root/'data/checkpoints/hero-portrait-stage4-2b-234-admissions-checkpoint.v1.json').write_text(json.dumps(ck,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
