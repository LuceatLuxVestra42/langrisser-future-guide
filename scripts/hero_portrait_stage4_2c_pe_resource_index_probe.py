#!/usr/bin/env python3
import json, struct, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-pe-resource-index-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
TOTAL=308744656
TYPE_NAMES={1:'CURSOR',2:'BITMAP',3:'ICON',4:'MENU',5:'DIALOG',6:'STRING',7:'FONTDIR',8:'FONT',9:'ACCELERATOR',10:'RCDATA',11:'MESSAGETABLE',12:'GROUP_CURSOR',14:'GROUP_ICON',16:'VERSION',17:'DLGINCLUDE',19:'PLUGPLAY',20:'VXD',21:'ANICURSOR',22:'ANIICON',23:'HTML',24:'MANIFEST'}

def rng(start,size):
 req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={start}-{start+size-1}','Accept':'*/*'})
 with urllib.request.urlopen(req,timeout=30) as r:
  return r.read(size)

head=rng(0,131072)
pe=struct.unpack_from('<I',head,0x3c)[0]
nsec=struct.unpack_from('<H',head,pe+6)[0]
optsz=struct.unpack_from('<H',head,pe+20)[0]
opt=pe+24
magic=struct.unpack_from('<H',head,opt)[0]
dd=opt+(112 if magic==0x20b else 96)
res_rva,res_size=struct.unpack_from('<II',head,dd+8*2)
sec0=opt+optsz
sections=[]
for i in range(nsec):
 p=sec0+i*40
 name=head[p:p+8].split(b'\0',1)[0].decode('ascii','replace')
 vsize,va,rawsize,rawptr=struct.unpack_from('<IIII',head,p+8)
 sections.append({'name':name,'virtualAddress':va,'virtualSize':vsize,'rawPointer':rawptr,'rawSize':rawsize})
res_sec=next(s for s in sections if s['virtualAddress'] <= res_rva < s['virtualAddress']+max(s['virtualSize'],s['rawSize']))
res_root_file=res_sec['rawPointer']+(res_rva-res_sec['virtualAddress'])
# Resource directory structures are normally clustered at the start. Read bounded 4 MiB index window only.
idx_size=min(4*1024*1024,res_size)
idx=rng(res_root_file,idx_size)

def u16(o): return struct.unpack_from('<H',idx,o)[0]
def u32(o): return struct.unpack_from('<I',idx,o)[0]
def name_value(raw):
 if raw & 0x80000000:
  off=raw & 0x7fffffff
  if off+2>len(idx): return {'stringOffset':off,'value':None}
  n=u16(off); end=off+2+n*2
  if end>len(idx): return {'stringOffset':off,'value':None}
  return {'stringOffset':off,'value':idx[off+2:end].decode('utf-16le','replace')}
 return {'id':raw & 0xffff,'value':TYPE_NAMES.get(raw & 0xffff) if raw & 0xffff in TYPE_NAMES else None}

entries=[]; errors=[]; visited=set()
def walk(dir_rel,path,depth=0):
 if depth>5 or dir_rel in visited: return
 visited.add(dir_rel)
 if dir_rel+16>len(idx):
  errors.append({'path':path,'error':'directory_outside_index','relativeOffset':dir_rel}); return
 named=u16(dir_rel+12); ids=u16(dir_rel+14); count=named+ids
 for i in range(count):
  p=dir_rel+16+i*8
  if p+8>len(idx):
   errors.append({'path':path,'error':'entry_outside_index','relativeOffset':p}); break
  name_raw=u32(p); child=u32(p+4); nm=name_value(name_raw)
  label=nm.get('value') or (str(nm.get('id')) if 'id' in nm else f"name@{nm.get('stringOffset')}")
  newpath=path+[{'raw':name_raw,**nm,'label':label}]
  if child & 0x80000000:
   walk(child & 0x7fffffff,newpath,depth+1)
  else:
   de=child
   if de+16>len(idx):
    errors.append({'path':newpath,'error':'data_entry_outside_index','relativeOffset':de}); continue
   data_rva,size,codepage,reserved=struct.unpack_from('<IIII',idx,de)
   # Map RVA to file offset.
   sec=next((s for s in sections if s['virtualAddress'] <= data_rva < s['virtualAddress']+max(s['virtualSize'],s['rawSize'])),None)
   file_off=None
   if sec: file_off=sec['rawPointer']+(data_rva-sec['virtualAddress'])
   entries.append({'path':newpath,'dataEntryRelativeOffset':de,'dataRva':data_rva,'size':size,'codePage':codepage,'fileOffset':file_off,'section':sec['name'] if sec else None})
walk(0,[])
entries.sort(key=lambda e:e['size'],reverse=True)
# Sample only first/tail 4 KiB of largest 40 resources for identity tokens/magic.
samples=[]
for e in entries[:40]:
 off=e['fileOffset']; size=e['size']
 if off is None or size<=0 or off>=TOTAL: continue
 first=rng(off,min(4096,size))
 last=b''
 if size>4096:
  last=rng(off+max(0,size-4096),min(4096,size))
 blob=first+last
 toks=[]
 for tok in [b'PGUpdate.exe',b'baseFileList.json',b'updateURI',b'mhmnzupdate',b'MHMNZ',b'Langrisser.exe',b'filelist',b'dest\\']:
  if tok.lower() in blob.lower(): toks.append(tok.decode('ascii','replace'))
 magic=None
 for sig,n in [(b'MZ','MZ'),(b'PK\x03\x04','ZIP'),(b'7z\xbc\xaf\x27\x1c','7Z'),(b'Rar!\x1a\x07','RAR')]:
  if first.startswith(sig): magic=n; break
 samples.append({'size':size,'fileOffset':off,'path':e['path'],'firstMagic':magic,'tokenHits':toks,'firstHex':first[:32].hex(),'lastHex':last[-32:].hex() if last else ''})

out={'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_LAUNCHER_PE_RESOURCE_INDEX_PROBE','status':'PASS','sourceUrl':URL,'resourceDirectory':{'rva':res_rva,'declaredSize':res_size,'rootFileOffset':res_root_file,'indexWindowBytes':idx_size,'section':res_sec},'summary':{'resourceLeafCount':len(entries),'directoryNodeCount':len(visited),'parseErrorCount':len(errors),'largestResourceSize':entries[0]['size'] if entries else None,'sampledLargestResourceCount':len(samples)},'largestResources':entries[:100],'largestResourceBoundarySamples':samples,'parseErrors':errors[:100],'policy':{'fullLauncherDownloadPerformed':False,'resourceIndexWindowMaxBytes':4*1024*1024,'resourcePayloadBoundarySampleBytesPerEnd':4096,'fullClientDownloadPerformed':False}}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
