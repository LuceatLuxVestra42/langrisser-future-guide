#!/usr/bin/env python3
import json,requests
from pathlib import Path
from gdown.download_folder import _GoogleDriveFile,_parse_embedded_folder_view
UA='Mozilla/5.0 AppleWebKit/537.36 Chrome/98 Safari/537.36'
def ss():s=requests.Session();s.headers.update({'User-Agent':UA});return s
def ls(s,f):return _parse_embedded_folder_view(sess=s,folder_id=f)
def rolematch(name,stem):return name==stem or name.startswith(stem+'_') or name.startswith(stem+'.')
def main():
 root=Path('.');known=json.loads((root/'data/validation/hero-portrait-stage4-2-known-ownership-rescue.v1.json').read_text());sd=json.loads((root/'data/validation/hero-portrait-stage4-2b-sd-bulk-bridge.v1.json').read_text());ch=json.loads((root/'data/validation/hero-portrait-stage4-2b-charimage-bridge.v1.json').read_text());stems={int(r['heroId']):r['baseRuntimeStem'] for r in ch['pendingRecords']}
 cases=[]
 for r in known['records']:
  if r['result']=='MULTIPLE_TECHNICAL_PASS_CANDIDATES_REVIEW_REQUIRED':cases.append({'origin':'STAGE4_2_KNOWN_REVIEW','heroId':int(r['heroId']),'baseFolderId':r['baseFolderId'],'existingCandidates':r['candidates']})
 for r in sd['records']:
  if r['result'] in ('SD_BRIDGE_OWNERSHIP_PROVEN_BASE_MISSING','SD_BRIDGE_OWNERSHIP_PROVEN_BASE_AMBIGUOUS'):
   cases.append({'origin':'STAGE4_2B_SD_ROLE_ISSUE','heroId':int(r['heroId']),'baseFolderId':r['baseFolderId'],'existingCandidates':[]})
 records=[]
 for c in cases:
  h=c['heroId'];stem=stems[h];s=ss();_,kids=ls(s,c['baseFolderId']);files=[{'driveFileId':fid,'fileName':name} for fid,name,typ in kids if typ!=_GoogleDriveFile.TYPE_FOLDER];matches=[f for f in files if rolematch(f['fileName'],stem)]
  records.append({'origin':c['origin'],'heroId':h,'baseRuntimeStem':stem,'baseFolderId':c['baseFolderId'],'directBaseFiles':files,'exactBaseRuntimeStemFileMatches':matches,'matchCount':len(matches),'result':'UNIQUE_EXACT_BASE_RUNTIME_ROLE_CANDIDATE' if len(matches)==1 else ('NO_EXACT_BASE_RUNTIME_ROLE_CANDIDATE' if not matches else 'MULTIPLE_EXACT_BASE_RUNTIME_ROLE_CANDIDATES')})
 out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'BASE_ROLE_EXACT_CHARIMAGE_RUNTIME_PROBE','status':'PASS_WITH_REVIEW','policy':{'ownershipAlreadyProven':True,'roleSelector':'exact CharImageInfo.Spine base runtime stem against direct files in same proven 스킨/기본 folder','filenameSimilarityNotUsed':True,'exactRuntimeKeyOnly':True,'sourceAdmissionPerformed':False},'summary':{'inputCaseCount':len(records),'uniqueRoleCandidateCount':sum(r['matchCount']==1 for r in records),'zeroRoleCandidateCount':sum(r['matchCount']==0 for r in records),'multipleRoleCandidateCount':sum(r['matchCount']>1 for r in records)},'records':records}
 (root/'data/validation/hero-portrait-stage4-2b-base-role-probe.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
