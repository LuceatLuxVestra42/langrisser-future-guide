#!/usr/bin/env python3
import json,re,requests
from pathlib import Path
from gdown.download_folder import _GoogleDriveFile,_parse_embedded_folder_view

ANCHORS={5,6,8,12,15}
RARITY_IDS={'LLR':'1_ohdOz7yowi98AE7MuyORMAFkxeGk5GV','SSR':'1LZou2oXpeOwtt2uBHWpesKN4uyMUGoOe','SR':'15Z_wf0wrfX3Bn56WU_Y7vqDvPcS_i8MN','R':'1KIqnv-LEEO2RBYzdF1dr5oGUbfriUPgG','N':'1ShOmvsheoRWl9yeneaMRoXXid6wIrGhX'}
UA='Mozilla/5.0 AppleWebKit/537.36 Chrome/98 Safari/537.36'
def sess(): s=requests.Session(); s.headers.update({'User-Agent':UA}); return s
def ls(s,f): return _parse_embedded_folder_view(sess=s,folder_id=f)
def runtime_stem(p):
 n=Path(p).name
 if n.lower().endswith('.prefab'): n=n[:-7]
 return re.sub(r'(?i)_prefab$','',n)
def child_folder(s,parent,name):
 _,c=ls(s,parent); return [x for x in c if x[2]==_GoogleDriveFile.TYPE_FOLDER and x[1]==name]
def main():
 root=Path('.')
 census=json.loads((root/'data/generated/hero-portrait-stage4-0-source-census.v1.json').read_text())
 char=json.loads((root/'data/validation/hero-portrait-stage4-2b-charimage-bridge.v1.json').read_text())
 char_rows={int(r['heroId']):r for r in char.get('pendingRecords',[])}
 # pendingRecords excludes anchors, derive from raw config for anchors.
 hero=json.loads((root/'data/configdata/ConfigDataHeroInfo.json').read_text()); ci=json.loads((root/'data/configdata/ConfigDataCharImageInfo.json').read_text())
 H={int(r['ID']):r for r in hero}; C={int(r['ID']):r for r in ci}
 base_stem={h:runtime_stem(C[int(H[h]['CharImage_ID'])]['Spine']) for h in ANCHORS}
 records=[]
 for a in census['stage2AnchorContinuity']['records']:
  h=int(a['heroId']); s=sess(); base=a['baseFolderId']; stem=base_stem[h]
  sd=child_folder(s,base,'SD')
  rec={'heroId':h,'baseRuntimeStem':stem,'baseFolderId':base,'sdFolderCount':len(sd),'files':[],'exactStemPrefixMatches':[]}
  if len(sd)==1:
   rec['sdFolderId']=sd[0][0]; _,kids=ls(s,sd[0][0])
   for fid,name,typ in kids:
    if typ==_GoogleDriveFile.TYPE_FOLDER:
     # one extra level only, keep path explicit
     try:
      _,grand=ls(s,fid)
      for gf,gn,gt in grand:
       if gt!=_GoogleDriveFile.TYPE_FOLDER:
        row={'driveFileId':gf,'fileName':gn,'relativePath':f'{name}/{gn}'}; rec['files'].append(row)
        if gn.startswith(stem+'_') or gn.startswith(stem+'.') or gn==stem: rec['exactStemPrefixMatches'].append(row)
     except Exception as e: rec.setdefault('errors',[]).append(f'{name}:{type(e).__name__}:{e}')
    else:
     row={'driveFileId':fid,'fileName':name,'relativePath':name}; rec['files'].append(row)
     if name.startswith(stem+'_') or name.startswith(stem+'.') or name==stem: rec['exactStemPrefixMatches'].append(row)
  records.append(rec)
 summary={'anchorCount':len(records),'sdFolderExactOneCount':sum(r['sdFolderCount']==1 for r in records),'anchorsWithAnyFiles':sum(bool(r['files']) for r in records),'anchorsWithExactBaseRuntimeStemFileMatch':sum(bool(r['exactStemPrefixMatches']) for r in records),'totalSdFilesObserved':sum(len(r['files']) for r in records),'totalExactStemMatches':sum(len(r['exactStemPrefixMatches']) for r in records)}
 out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'SD_BASE_RUNTIME_REPRESENTATIVE_PROOF','status':'PASS' if summary['anchorsWithExactBaseRuntimeStemFileMatch']==5 else 'PASS_WITH_REVIEW','policy':{'heroIdentity':'frozen Stage2 anchor Hero IDs','baseRuntimeKey':'HeroInfo.CharImage_ID -> CharImageInfo.Spine','drivePath':'frozen anchor baseFolderId -> SD','folderOrDisplayNameJoin':False,'bitmapAdmissionPerformed':False},'summary':summary,'records':records}
 (root/'data/validation/hero-portrait-stage4-2b-sd-bridge-proof.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
