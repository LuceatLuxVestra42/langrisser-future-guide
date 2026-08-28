#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-pc-launcher-endpoint-probe.v1.json'
PAGES=[
 'https://news.zlongame.com/mzdownload/5473.jhtml',
 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html',
]

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=45) as r:
  raw=r.read()
  return r.geturl(), raw, raw.decode('utf-8',errors='replace')

records=[]
all_candidates=[]
for page in PAGES:
 final,raw,html=get(page)
 attrs=re.findall(r'(?:href|src|data-url|data-href|downloadurl|download-url)\s*=\s*[\"\']([^\"\']+)[\"\']',html,flags=re.I)
 absurls=[]
 for x in attrs:
  u=urllib.parse.urljoin(final,x)
  if u not in absurls: absurls.append(u)
 filelikes=[u for u in absurls if re.search(r'\.(?:zip|rar|7z|exe|msi|apk)(?:\?|$)',u,re.I)]
 downloadish=[u for u in absurls if re.search(r'download|client|pc|mnz|mhmn|launcher|update|patch',u,re.I)]
 text_urls=sorted(set(re.findall(r'https?://[^\"\'<>\s]+',html)))
 text_candidates=[u.rstrip(');,') for u in text_urls if re.search(r'\.(?:zip|rar|7z|exe|msi|apk)(?:\?|$)|download|launcher|update|patch',u,re.I)]
 candidates=[]
 for u in filelikes+downloadish+text_candidates:
  if u not in candidates: candidates.append(u)
 all_candidates.extend(u for u in candidates if u not in all_candidates)
 records.append({
  'pageUrl':page,'finalUrl':final,'htmlByteLength':len(raw),
  'fileLikeUrls':filelikes,'downloadishUrls':downloadish,'textCandidateUrls':text_candidates,
  'candidateUrls':candidates,
  'contexts':[html[max(0,m.start()-700):min(len(html),m.start()+1200)].replace('\r',' ').replace('\n',' ') for m in list(re.finditer(r'22\.4|31A6DB4F224374185E2C498287D3D3F3|1\.1\.72|下载',html,re.I))[:10]]
 })
out={'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_PC_LAUNCHER_ENDPOINT_PROBE','status':'PASS','policy':{'fullClientDownloadPerformed':False,'launcherEndpointDiscoveryOnly':True},'summary':{'pageCount':len(records),'uniqueCandidateUrlCount':len(all_candidates)},'candidateUrls':all_candidates,'records':records}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False))
