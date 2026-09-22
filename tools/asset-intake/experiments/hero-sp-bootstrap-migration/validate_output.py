#!/usr/bin/env python3
import hashlib, json, pathlib, sys
from PIL import Image

repo=pathlib.Path.cwd()
manifest=repo/'generated'/'manifest.json'
if not manifest.is_file(): raise SystemExit('FAIL_GENERATED_MANIFEST_MISSING')
m=json.loads(manifest.read_text(encoding='utf-8'))
if m.get('status')!='PASS_SP_BOOTSTRAP_MATERIALIZATION': raise SystemExit('FAIL_GENERATED_MANIFEST_STATUS')
ids=[int(r['heroId']) for r in m.get('records',[])]
if ids!=[6,13,29,37,56]: raise SystemExit(f'FAIL_GENERATED_POPULATION {ids}')
for r in m['records']:
    p=repo/r['asset']
    if not p.is_file(): raise SystemExit(f"FAIL_ASSET_MISSING heroId={r['heroId']}")
    h=hashlib.sha256(p.read_bytes()).hexdigest()
    if h!=r['sha256']: raise SystemExit(f"FAIL_ASSET_HASH heroId={r['heroId']}")
    with Image.open(p) as im:
        if im.width!=r['width'] or im.height!=r['height']: raise SystemExit(f"FAIL_ASSET_DIMENSIONS heroId={r['heroId']}")
app=(repo/'frontend'/'app.js')
if not app.is_file(): raise SystemExit('FAIL_FRONTEND_CONSUMER_MISSING')
code=app.read_text(encoding='utf-8')
for token in ['charImageId','sourceSpinePath','contract/','hero-sp.v1.json']:
    if token in code: raise SystemExit(f'FAIL_FRONTEND_SEMANTIC_LEAK token={token}')
if 'heroId' not in code or 'generated/manifest.json' not in code:
    raise SystemExit('FAIL_FRONTEND_CONSUMER_CONTRACT')
print(json.dumps({'status':'PASS_MINIMAL_FRONTEND_CONSUMER','heroIds':ids}))
