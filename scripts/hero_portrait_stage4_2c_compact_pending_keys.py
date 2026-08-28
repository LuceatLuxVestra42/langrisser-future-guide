#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'data/validation/hero-portrait-stage4-2c-pending-current-asset-key-inventory.v1.json'
out=ROOT/'data/validation/hero-portrait-stage4-2c-pending-current-asset-key-summary.v1.tsv'
data=json.loads(src.read_text(encoding='utf-8'))
lines=['heroId\tnameKr\tnameCn\tnameEn\tpriorState\theroPaintingStem\tbaseSpineStem\tskinStems']
for r in data['records']:
    ident=r.get('identity') or {}
    skins=','.join(x.get('sourceSpineStem') or '' for x in r.get('skinAssets',[]))
    vals=[r.get('heroId'),ident.get('nameKr'),ident.get('nameCn'),ident.get('nameEn'),r.get('priorState'),r.get('heroPaintingStem'),r.get('baseSpineStem'),skins]
    lines.append('\t'.join('' if v is None else str(v) for v in vals))
out.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(f'rows={len(data["records"])}')
