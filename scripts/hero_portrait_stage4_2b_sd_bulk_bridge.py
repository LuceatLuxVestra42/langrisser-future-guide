#!/usr/bin/env python3
import json,re,requests
from collections import defaultdict
from pathlib import Path
from gdown.download_folder import _GoogleDriveFile,_parse_embedded_folder_view
RARITY_IDS={'LLR':'1_ohdOz7yowi98AE7MuyORMAFkxeGk5GV','SSR':'1LZou2oXpeOwtt2uBHWpesKN4uyMUGoOe','SR':'15Z_wf0wrfX3Bn56WU_Y7vqDvPcS_i8MN','R':'1KIqnv-LEEO2RBYzdF1dr5oGUbfriUPgG','N':'1ShOmvsheoRWl9yeneaMRoXXid6wIrGhX'}
UA='Mozilla/5.0 AppleWebKit/537.36 Chrome/98 Safari/537.36'
def sess(): s=requests.Session();s.headers.update({'User-Agent':UA});return s
def ls(s,f): return _parse_embedded_folder_view(sess=s,folder_id=f)
def cf(s,p,n):
 _,c=ls(s,p);return [x for x in c if x[2]==_GoogleDriveFile.TYPE_FOLDER and x[1]==n]
def match(name,stem): return name==stem or name.startswith(stem+'_') or name.startswith(stem+'.')
def main():
 root=Path('.')
 m=json.loads((root/'data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json').read_text())
 ch=json.loads((root/'data/validation/hero-portrait-stage4-2b-charimage-bridge.v1.json').read_text())
 pending={int(r['heroId']):r['baseRuntimeStem'] for r in ch['pendingRecords']}
 unresolved=[r for r in m['records'] if r['mappingState']=='UNRESOLVED_NO_EXACT_RUNTIME_STEM_EVIDENCE']
 if len(unresolved)!=29: raise SystemExit(f'expected29 got{len(unresolved)}')
 roots={}
 for rarity,fid in RARITY_IDS.items():
  s=sess();_,kids=ls(s,fid);roots[rarity]=[x for x in kids if x[2]==_GoogleDriveFile.TYPE_FOLDER]
 records=[]
 for r in unresolved:
  rarity=r['rarity']; label=r['driveHeroFolderLabel']; hs=[x for x in roots[rarity] if x[1]==label]
  out={'rarity':rarity,'driveGroupPath':r['driveGroupPath'],'frozenGroupLabel':label,'relocationCount':len(hs),'previousBaseCandidates':r.get('baseCandidates',[]),'sdFiles':[],'matchedPendingHeroes':[]}
  if len(hs)!=1: out['result']='RELOCATION_FAIL';records.append(out);continue
  out['heroFolderId']=hs[0][0];s=sess();skin=cf(s,hs[0][0],'스킨');out['skinCount']=len(skin)
  if len(skin)!=1: out['result']='SKIN_FAIL';records.append(out);continue
  base=cf(s,skin[0][0],'기본');out['baseCount']=len(base)
  if len(base)!=1: out['result']='BASE_FAIL';records.append(out);continue
  out['baseFolderId']=base[0][0];sd=cf(s,base[0][0],'SD');out['sdCount']=len(sd)
  if len(sd)!=1: out['result']='SD_MISSING_OR_AMBIGUOUS';records.append(out);continue
  out['sdFolderId']=sd[0][0];_,kids=ls(s,sd[0][0]);files=[]
  for fid,name,typ in kids:
   if typ==_GoogleDriveFile.TYPE_FOLDER:
    try:
     _,grand=ls(s,fid)
     for gf,gn,gt in grand:
      if gt!=_GoogleDriveFile.TYPE_FOLDER: files.append({'driveFileId':gf,'fileName':gn,'relativePath':f'{name}/{gn}'})
    except Exception as e: out.setdefault('errors',[]).append(f'{name}:{type(e).__name__}:{e}')
   else: files.append({'driveFileId':fid,'fileName':name,'relativePath':name})
  out['sdFiles']=files
  hero_matches=[]
  for hid,stem in pending.items():
   hits=[f for f in files if match(f['fileName'],stem)]
   if hits: hero_matches.append({'heroId':hid,'baseRuntimeStem':stem,'matchCount':len(hits),'sampleFiles':hits[:8]})
  out['matchedPendingHeroes']=hero_matches
  if len(hero_matches)==1:
   out['heroId']=hero_matches[0]['heroId'];out['ownershipState']='OWNERSHIP_PROVEN_BY_CHARIMAGE_BASE_RUNTIME_SD';
   if len(out['previousBaseCandidates'])==1: out['result']='SD_BRIDGE_PROVEN_EXACT_BASE_MAPPING'
   elif len(out['previousBaseCandidates'])==0: out['result']='SD_BRIDGE_OWNERSHIP_PROVEN_BASE_MISSING'
   else: out['result']='SD_BRIDGE_OWNERSHIP_PROVEN_BASE_AMBIGUOUS'
  elif len(hero_matches)==0: out['result']='NO_PENDING_BASE_RUNTIME_MATCH_IN_SD'
  else: out['result']='AMBIGUOUS_MULTIPLE_PENDING_BASE_RUNTIME_MATCHES'
  records.append(out)
 state=defaultdict(int)
 for r in records: state[r['result']]+=1
 exact=[r for r in records if r['result']=='SD_BRIDGE_PROVEN_EXACT_BASE_MAPPING']
 heroes=[r['heroId'] for r in exact]; duplicate=len(heroes)-len(set(heroes))
 out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'SD_BASE_RUNTIME_BULK_BRIDGE','status':'PASS_WITH_REVIEW','policy':{'input':'29 frozen Stage4-1B unresolved structured groups','groupRelocationUsesFrozenObservedRarityAndLabelOnly':True,'groupRelocationIsNotOwnershipEvidence':True,'ownershipAuthority':'exact HeroInfo.CharImage_ID -> CharImageInfo.Spine runtime stem present in same group 스킨/기본/SD files','all58PendingRuntimeStemsComparedPerGroup':True,'nameJoinAllowed':False,'bitmapAdmissionPerformed':False},'summary':{'inputGroupCount':len(records),'ownershipProvenGroupCount':sum('OWNERSHIP_PROVEN_BY_CHARIMAGE_BASE_RUNTIME_SD'==r.get('ownershipState') for r in records),'exactBaseMappingCount':len(exact),'remainingUnresolvedGroupCount':len(records)-sum('OWNERSHIP_PROVEN_BY_CHARIMAGE_BASE_RUNTIME_SD'==r.get('ownershipState') for r in records),'duplicateHeroMappingCount':duplicate,'resultCounts':dict(state)},'newExactMappings':[{'heroId':r['heroId'],'baseRuntimeStem':r['matchedPendingHeroes'][0]['baseRuntimeStem'],'driveGroupPath':r['driveGroupPath'],'driveBasePngId':r['previousBaseCandidates'][0]['driveFileId'],'driveBasePngName':r['previousBaseCandidates'][0]['driveFileName'],'heroFolderId':r['heroFolderId'],'baseFolderId':r['baseFolderId'],'sdFolderId':r['sdFolderId']} for r in exact],'records':records}
 (root/'data/validation/hero-portrait-stage4-2b-sd-bulk-bridge.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
