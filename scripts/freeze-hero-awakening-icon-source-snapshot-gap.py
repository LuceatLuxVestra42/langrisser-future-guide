#!/usr/bin/env python3
import argparse, concurrent.futures, hashlib, importlib.util, json, pathlib

BULK_PATH=pathlib.Path('data/generated/hero-awakening-icon-official-bulk-verification.v1.json')
PKG_PATH=pathlib.Path('data/generated/hero-awakening-icon-official-package-inventory.v1.json')
OUTPUT=pathlib.Path('data/generated/hero-awakening-icon-source-snapshot-gap.v1.json')
VERIFIER_PATH=pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_BULK='b0a594ab0a2c2ae31c61534915ffdc1581e751a56b27d70c9cd8be861b8d0365'
EXPECTED_PKG='2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1'
REVIEW_PATHS=['UI/Icon/Skill2_ABS/Skill_CaptainBaby_3.png','UI/Icon/Skill_ABS/Skill_Super140.png','UI/Icon/Skill_ABS/Skill_Super15.png']
MAX_WORKERS=6

def load_json(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(v): return hashlib.sha256(json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def load_verifier():
    spec=importlib.util.spec_from_file_location('a6_verifier',VERIFIER_PATH); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

def validate_inputs():
    bulk=load_json(BULK_PATH); pkg=load_json(PKG_PATH)
    if bulk.get('schemaId')!='hero-awakening-icon-official-bulk-verification/v1' or bulk.get('completion')!='COMPLETE' or bulk.get('bulkResultSha256')!=EXPECTED_BULK: raise RuntimeError('A6-6 bulk contract mismatch')
    actual=sorted(r['sourcePath'] for r in bulk['results'] if r['status']=='REVIEW')
    if actual!=sorted(REVIEW_PATHS): raise RuntimeError(f'A6-6 review set mismatch: {actual}')
    if pkg.get('schemaId')!='hero-awakening-icon-official-package-inventory/v1' or pkg.get('completion')!='COMPLETE' or pkg.get('packageInventorySha256')!=EXPECTED_PKG: raise RuntimeError('A6-3 package inventory mismatch')
    if len(pkg.get('packages',[]))!=68: raise RuntimeError('package count mismatch')
    return bulk,pkg

def scan_package(p, verifier, target_norms):
    import UnityPy
    local_hits=[]; errors=[]; bundle_count=0
    try: entries=verifier.zip_directory(p['url'],p['contentLength'])
    except Exception as e:
        return {'part':p['part'],'bundleCount':0,'hits':[],'errors':[{'packagePart':p['part'],'reason':f'PACKAGE_CATALOG_INCOMPLETE:{type(e).__name__}:{e}'}]}
    for e in entries:
        if not verifier.norm(e['name']).endswith('.b'): continue
        bundle_count+=1
        try:
            raw=verifier.fetch_zip_entry(p['url'],e); env=UnityPy.load(raw)
        except Exception as ex:
            errors.append({'packagePart':p['part'],'bundleEntry':e['name'],'reason':f'BUNDLE_OR_UNITY_DECODE_FAIL:{type(ex).__name__}:{ex}'}); continue
        for container_path,value in env.container.items():
            rel=verifier.runtime_relative(container_path)
            if rel not in target_norms: continue
            target=target_norms[rel]
            try:
                reader=verifier.reader_of(value); typ=getattr(getattr(reader,'type',None),'name',None)
                row={'sourcePath':target,'packagePart':p['part'],'packageName':p['packageName'],'bundleEntry':e['name'],'bundleSha256':verifier.sha256_bytes(raw),'runtimeContainerPath':str(container_path).replace('\\','/'),'objectType':typ}
                if typ=='Sprite':
                    raw_obj=reader.get_raw_data(); image=reader.read().image.convert('RGBA'); alpha=image.getchannel('A').getbbox()
                    row.update({'pathId':int(getattr(reader,'path_id',0) or 0),'width':image.width,'height':image.height,'rawObjectSha256':verifier.sha256_bytes(raw_obj),'rgbaSha256':verifier.sha256_bytes(image.tobytes()),'nonEmptyAlpha':alpha is not None})
                local_hits.append(row)
            except Exception as ex:
                errors.append({'packagePart':p['part'],'bundleEntry':e['name'],'runtimeContainerPath':str(container_path),'reason':f'EXACT_HIT_DECODE_FAIL:{type(ex).__name__}:{ex}'})
    return {'part':p['part'],'bundleCount':bundle_count,'hits':local_hits,'errors':errors}

def run_scan(pkg, verifier):
    target_norms={verifier.norm(x):x for x in REVIEW_PATHS}
    package_results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures=[pool.submit(scan_package,p,verifier,target_norms) for p in pkg['packages']]
        for future in concurrent.futures.as_completed(futures): package_results.append(future.result())
    package_results.sort(key=lambda x:x['part'])
    hits={x:[] for x in REVIEW_PATHS}; errors=[]; bundle_count=0
    for r in package_results:
        bundle_count+=r['bundleCount']; errors.extend(r['errors'])
        for h in r['hits']:
            hits[h['sourcePath']].append({k:v for k,v in h.items() if k!='sourcePath'})
    for path in hits: hits[path].sort(key=lambda h:(h['packagePart'],h['bundleEntry'],h['runtimeContainerPath'],h.get('objectType') or ''))
    errors.sort(key=lambda e:(e.get('packagePart',0),e.get('bundleEntry',''),e.get('runtimeContainerPath',''),e.get('reason','')))
    return len(package_results),bundle_count,hits,errors

def build():
    bulk,pkg=validate_inputs(); verifier=load_verifier(); package_count,bundle_count,hits,errors=run_scan(pkg,verifier)
    results=[]
    for path in REVIEW_PATHS:
        exact=hits[path]; sprites=[h for h in exact if h.get('objectType')=='Sprite' and h.get('nonEmptyAlpha')]
        if errors: status='BLOCKER'; reason='EXHAUSTIVE_SCAN_GAP'
        elif sprites: status='VERIFIED'; reason=None
        elif exact: status='BLOCKER'; reason='TYPE_MISMATCH_NO_VALID_SPRITE_EXACT_HIT'
        else: status='NOT_IN_SOURCE_SNAPSHOT'; reason='NO_EXACT_RUNTIME_PATH_HIT_AFTER_EXHAUSTIVE_ALL_BUNDLES'
        results.append({'sourcePath':path,'status':status,'reason':reason,'exactHits':exact})
    blockers=sum(r['status']=='BLOCKER' for r in results)
    result={'version':1,'schemaId':'hero-awakening-icon-source-snapshot-gap/v1','status':'BLOCKER' if blockers else 'PASS','completion':'INCOMPLETE' if blockers else 'COMPLETE','semanticReopen':False,'stage':'A6_7_SOURCE_SNAPSHOT_GAP_CLASSIFICATION','predecessor':{'stage':'A6_6_BULK_256_VERIFICATION','commit':'9e3d4050e463885b65666e5c8efebc27176217aa','bulkResultSha256':EXPECTED_BULK},'source':{'kind':'OFFICIAL_INSTALLER','installVersion':'1.1.113','packageInventorySha256':EXPECTED_PKG,'searchCoverage':'EXHAUSTIVE_ALL_BUNDLES'},'scanPolicy':{'packageParallelism':MAX_WORKERS,'allBundleEntriesRequired':True,'absenceRequiresZeroScanErrors':True},'summary':{'reviewInputCount':3,'packageScanCount':package_count,'bundleScanCount':bundle_count,'verifiedCount':sum(r['status']=='VERIFIED' for r in results),'notInSourceSnapshotCount':sum(r['status']=='NOT_IN_SOURCE_SNAPSHOT' for r in results),'blockerCount':blockers,'scanErrorCount':len(errors)},'results':results,'scanErrors':errors,'nextStage':'A6_8_NEWER_OFFICIAL_SOURCE_SNAPSHOT_IF_NEEDED'}
    result['gapResultSha256']=sha(results); return result

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); a=ap.parse_args(); expected=build()
    if a.write: OUTPUT.write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if not OUTPUT.exists() or load_json(OUTPUT)!=expected: raise RuntimeError('frozen A6-7 result drift/missing')
    print(json.dumps({'checkpoint':'AWAKENING_ICON_A6_7_SOURCE_SNAPSHOT_GAP','status':expected['status'],'completion':expected['completion'],**expected['summary'],'gapPaths':[{'sourcePath':r['sourcePath'],'status':r['status']} for r in expected['results']],'gapResultSha256':expected['gapResultSha256'],'semanticReopen':False},ensure_ascii=False,indent=2))
    if expected['status']=='BLOCKER': raise SystemExit(2)
if __name__=='__main__': main()
