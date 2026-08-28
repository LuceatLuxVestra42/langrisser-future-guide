#!/usr/bin/env python3
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://mz.zlongame.com/main.shtml'
OUT = ROOT / 'data/validation/hero-portrait-stage4-2c-official-html-identity-probe.v1.json'
req = urllib.request.Request(URL, headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=45) as r:
    raw = r.read()
html = raw.decode('utf-8', errors='replace')
patterns = [
    {'key':'99265','needle':'99265'},
    {'key':'reiga_cn','needle':'黎加'},
    {'key':'reiga_roman','needle':'Reiga'},
    {'key':'reiga_asset','needle':'h209_big.png'},
    {'key':'necromblade_cn','needle':'魔骸剑使'},
    {'key':'necromblade_roman','needle':'Necroblade'},
    {'key':'necromblade_asset','needle':'h231_big.png'},
    {'key':'gai_asset','needle':'h229_big.png'},
    {'key':'shurato_asset','needle':'h228_big.png'},
]
records=[]
for p in patterns:
    positions=[m.start() for m in re.finditer(re.escape(p['needle']), html, flags=re.I)]
    excerpts=[]
    for pos in positions[:5]:
        lo=max(0,pos-1000); hi=min(len(html),pos+1800)
        excerpt=html[lo:hi].replace('\r',' ').replace('\n',' ')
        excerpts.append(excerpt)
    records.append({'key':p['key'],'needle':p['needle'],'count':len(positions),'excerpts':excerpts})

# Extract any data-* attributes and nearby numeric ids from blocks containing hero asset prefixes.
asset_blocks=[]
for asset in ('h209_big.png','h231_big.png','h229_big.png','h228_big.png'):
    pos=html.find(asset)
    if pos >= 0:
        lo=max(0, html.rfind('<li', 0, pos))
        hi=html.find('</li>', pos)
        if hi < 0 or hi-pos > 12000:
            lo=max(0,pos-3000); hi=min(len(html),pos+5000)
        else:
            hi += 5
        block=html[lo:hi]
        asset_blocks.append({
            'asset':asset,
            'blockLength':len(block),
            'dataAttributes':re.findall(r'\b(data-[\w-]+)=[\"\']([^\"\']+)[\"\']', block, flags=re.I),
            'idAttributes':re.findall(r'\bid=[\"\']([^\"\']+)[\"\']', block, flags=re.I),
            'numericTokens':sorted(set(re.findall(r'(?<!\d)\d{3,6}(?!\d)', block))),
            'block':block.replace('\r',' ').replace('\n',' '),
        })

out={
  'version':1,
  'stage':'hero-portrait-stage4-2c-current-unity-source-proof',
  'phase':'OFFICIAL_HTML_IDENTITY_METADATA_PROBE',
  'status':'PASS',
  'sourceUrl':URL,
  'htmlByteLength':len(raw),
  'containsCanonicalHeroId99265': '99265' in html,
  'records':records,
  'assetBlocks':asset_blocks,
  'policy':{
    'officialHtmlOnly':True,
    'nameJoinPerformed':False,
    'sourceAdmissionPerformed':False
  }
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'htmlByteLength':len(raw),'contains99265':out['containsCanonicalHeroId99265'],'assetBlockCount':len(asset_blocks)},ensure_ascii=False))
