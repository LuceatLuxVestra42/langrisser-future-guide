#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
import gdown
from PIL import Image,ImageDraw
PNG_SIG=b'\x89PNG\r\n\x1a\n'
def val(p):
 d=p.read_bytes();o={'byteLength':len(d),'sha256':hashlib.sha256(d).hexdigest(),'pngSignature':d.startswith(PNG_SIG)}
 try:
  with Image.open(p) as im:
   im.load();o.update(decodedFormat=im.format,width=im.width,height=im.height,mode=im.mode);bands=im.getbands();o['alpha']='A' in bands
   if o['alpha']:
    ex=im.getchannel('A').getextrema();o['alphaExtrema']=list(ex);o['realTransparency']=ex[0]<255;o['visiblePixels']=ex[1]>0
   else:o['alphaExtrema']=None;o['realTransparency']=False;o['visiblePixels']=True
 except Exception as e:o.update(decodedFormat=None,width=0,height=0,alpha=False,realTransparency=False,visiblePixels=False,decodeError=f'{type(e).__name__}:{e}')
 o['technicalPass']=all([o['pngSignature'],o.get('decodedFormat')=='PNG',o.get('width',0)>0,o.get('height',0)>0,o.get('alpha') is True,o.get('realTransparency') is True,o.get('visiblePixels') is True,len(o['sha256'])==64])
 return o
def sheet(rows,path):
 tiles=[]
 for r in rows:
  if r['downloadResult']!='PASS':continue
  im=Image.open(r['localPath']).convert('RGBA');c=Image.new('RGBA',(300,380),(245,245,245,255));t=im.copy();t.thumbnail((280,310));c.alpha_composite(t,((300-t.width)//2,5+(310-t.height)//2));d=ImageDraw.Draw(c);d.text((6,322),f"Hero {r['heroId']}",fill=(0,0,0,255));d.text((6,342),r['sourceFileName'][:42],fill=(0,0,0,255));d.text((6,360),f"tech={'PASS' if r['technical']['technicalPass'] else 'FAIL'}",fill=(0,0,0,255));tiles.append(c.convert('RGB'))
 cols=5;rowsn=(len(tiles)+cols-1)//cols;out=Image.new('RGB',(cols*300,rowsn*380),(255,255,255))
 for i,t in enumerate(tiles):out.paste(t,((i%cols)*300,(i//cols)*380))
 if tiles:out.save(path,quality=92)
 return len(tiles)
def main():
 root=Path('.'); work=Path('/tmp/hero42b');review=Path('/tmp/hero42b-review');work.mkdir(exist_ok=True);review.mkdir(exist_ok=True)
 src=json.loads((root/'data/validation/hero-portrait-stage4-2b-sd-bulk-bridge.v1.json').read_text());maps=src['newExactMappings']
 if len(maps)!=25:raise SystemExit(f'expected25 got{len(maps)}')
 out=[]
 for m in maps:
  p=work/f"{m['heroId']}.png";r={'heroId':m['heroId'],'sourceImmutableId':m['driveBasePngId'],'sourceFileName':m['driveBasePngName'],'identityEvidence':'STAGE4_2B_CHARIMAGE_BASE_RUNTIME_SD_OWNERSHIP','sourceProvenance':'SAME_PROVEN_HERO_GROUP_STRUCTURED_SKIN_BASE_PATH'}
  try:
   got=gdown.download(id=m['driveBasePngId'],output=str(p),quiet=True)
   if got and p.exists() and p.stat().st_size>0:r['downloadResult']='PASS';r['localPath']=str(p);r['technical']=val(p)
   else:r['downloadResult']='FAIL';r['error']='no usable file'
  except Exception as e:r['downloadResult']='FAIL';r['error']=f'{type(e).__name__}:{e}'
  out.append(r)
 sha={}
 for r in out:
  if r.get('technical',{}).get('technicalPass'):sha.setdefault(r['technical']['sha256'],[]).append(r['heroId'])
 dup={k:v for k,v in sha.items() if len(v)>1};tiles=sheet(out,review/'hero-stage4-2b-sd-mapped-review.jpg')
 summary={'inputCount':25,'downloadPassCount':sum(r['downloadResult']=='PASS' for r in out),'technicalPassCount':sum(r.get('technical',{}).get('technicalPass') for r in out),'technicalFailureCount':sum(not r.get('technical',{}).get('technicalPass',False) for r in out),'duplicateShaGroupCount':len(dup),'reviewTileCount':tiles,'finalAdmissionPerformed':False}
 doc={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'SD_MAPPED_SOURCE_TECHNICAL_VALIDATION','status':'PASS_TECHNICAL_VISUAL_REVIEW_PENDING' if summary['technicalPassCount']==25 and not dup else 'FAIL_OR_REVIEW','policy':{'immutableDriveIdDirectDownload':True,'stage3PngAlphaHashGates':True,'ownershipRecomputed':False,'visualReviewRequiredBeforeAdmission':True,'materializationPerformed':False},'summary':summary,'duplicateShaGroups':dup,'records':out}
 (root/'data/validation/hero-portrait-stage4-2b-sd-mapped-source-validation.v1.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
