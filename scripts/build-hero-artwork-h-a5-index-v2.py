import pathlib

source_path=pathlib.Path('scripts/build-hero-artwork-h-a5-index.py')
source=source_path.read_text(encoding='utf-8')

repls=[
("root=int(pre.path_id); q=deque([(root,0)]); seen=set(); sids=set()",
 "root=int(pre.path_id); q=deque([(root,0)]); seen=set(); sids=set(); direct_tids=set()"),
("if typ(o)=='Sprite': sids.add(pid)\n            tr=t(pid)",
 "if typ(o)=='Sprite': sids.add(pid)\n            if typ(o)=='Texture2D': direct_tids.add(pid)\n            tr=t(pid)"),
("c={'spritePathId':sid,'spriteName':str(getattr(sd,'m_Name','')),'texturePathIds':sorted(set(tids)),'width':im.width,'height':im.height,'pngSha256':hashlib.sha256(png).hexdigest().upper(),'rgbaSha256':hashlib.sha256(rgba).hexdigest().upper()}",
 "c={'assetKind':'Sprite','spritePathId':sid,'spriteName':str(getattr(sd,'m_Name','')),'texturePathIds':sorted(set(tids)),'width':im.width,'height':im.height,'pngSha256':hashlib.sha256(png).hexdigest().upper(),'rgbaSha256':hashlib.sha256(rgba).hexdigest().upper()}"),
]
for old,new in repls:
    if old not in source: raise RuntimeError(f'expected v1 fragment missing: {old[:60]}')
    source=source.replace(old,new,1)

old="""        if len(cand)==1:
            c=cand[0]; row.update(status='PASS',selectionStatus='UNIQUE_REFERENCED_SPRITE',prefabPathId=root,spritePathId=c['spritePathId'],texturePathIds=c['texturePathIds'],width=c['width'],height=c['height'],pngSha256=c['pngSha256'],rgbaSha256=c['rgbaSha256'],targetWebPath=f'public/images/heroes/cards/{h[\"heroId\"]}.png',candidates=cand); passed+=1
        else:
            row.update(status='REVIEW',selectionStatus='NO_REFERENCED_SPRITE' if not cand else 'AMBIGUOUS_REFERENCED_SPRITES',prefabPathId=root,candidates=cand)
"""
new="""        if not cand:
            for tid in sorted(direct_tids):
                try:
                    td=objs[tid].read(); im=td.image; buf=io.BytesIO(); im.save(buf,format='PNG'); png=buf.getvalue(); rgba=im.convert('RGBA').tobytes()
                    cand.append({'assetKind':'Texture2D','spritePathId':None,'textureName':str(getattr(td,'m_Name','')),'texturePathIds':[tid],'width':im.width,'height':im.height,'pngSha256':hashlib.sha256(png).hexdigest().upper(),'rgbaSha256':hashlib.sha256(rgba).hexdigest().upper()})
                except Exception: pass
        selected=None; selection=None
        if len(cand)==1:
            selected=cand[0]; selection='UNIQUE_REFERENCED_'+selected['assetKind'].upper()
        elif len(cand)>1:
            ranked=sorted(cand,key=lambda x:x['width']*x['height'],reverse=True); a0=ranked[0]['width']*ranked[0]['height']; a1=ranked[1]['width']*ranked[1]['height']
            if a0>=250000 and a0>=3*a1:
                selected=ranked[0]; selection='DOMINANT_REFERENCED_'+selected['assetKind'].upper()
        if selected:
            c=selected; row.update(status='PASS',selectionStatus=selection,prefabPathId=root,spritePathId=c.get('spritePathId'),texturePathIds=c['texturePathIds'],width=c['width'],height=c['height'],pngSha256=c['pngSha256'],rgbaSha256=c['rgbaSha256'],targetWebPath=f'public/images/heroes/cards/{h[\"heroId\"]}.png',candidates=cand); passed+=1
        else:
            row.update(status='REVIEW',selectionStatus='NO_RENDERABLE_REFERENCED_IMAGE' if not cand else 'NON_DOMINANT_MULTIPLE_REFERENCED_IMAGES',prefabPathId=root,candidates=cand)
"""
if old not in source: raise RuntimeError('expected v1 selection block missing')
source=source.replace(old,new,1)
old_policy="'selectionPolicy':'serialized PPtr traversal only; filename similarity is not used; unique renderable referenced Sprite is auto-selected'"
new_policy="'selectionPolicy':'serialized PPtr traversal only; filename similarity is not used; unique referenced image is selected, or a structurally referenced image is selected only when its rendered pixel area is >=3x the next candidate and >=250000 pixels; Texture2D direct-reference fallback is used only when no Sprite candidate exists'"
if old_policy not in source: raise RuntimeError('expected v1 policy missing')
source=source.replace(old_policy,new_policy,1)
exec(compile(source,str(source_path)+':v2','exec'),{'__name__':'__main__'})
