#!/usr/bin/env python3
import argparse, hashlib, importlib.metadata as md, json, os, pathlib, shutil, subprocess, sys

from PIL import Image

BOOTSTRAP=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path.cwd().resolve()
CONTRACT=BOOTSTRAP/'contract'/'hero-sp.v1.json'
EXTRACTOR=BOOTSTRAP/'extractor'/'extract_render_input.py'
RASTER=BOOTSTRAP/'renderer'/'render_spine_geometry.py'
GEOMETRY_SOURCE=BOOTSTRAP/'renderer'/'SpineGeometry.cs'
SPINE_SRC=BOOTSTRAP/'runtime'/'spine-csharp'/'src'
OUTPUT=REPO/'generated'
WORK=OUTPUT/'work'
ASSETS=OUTPUT/'assets'/'heroes'

def sha256(path):
    h=hashlib.sha256()
    with pathlib.Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def run(cmd, cwd=None, env=None):
    print('+',' '.join(str(x) for x in cmd),flush=True)
    subprocess.run([str(x) for x in cmd],cwd=str(cwd or REPO),env=env,check=True)

def ensure_contract():
    if not CONTRACT.is_file(): raise SystemExit('FAIL_MISSING_ASSET_CONTRACT')
    try:return json.loads(CONTRACT.read_text(encoding='utf-8'))
    except Exception as e: raise SystemExit(f'FAIL_ASSET_CONTRACT_PARSE {e}')

def ensure_runtime(contract):
    req={}
    for line in (BOOTSTRAP/'runtime'/'requirements.lock.txt').read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if not line or line.startswith('#'):continue
        name,ver=line.split('==',1);req[name]=ver
    drift={}
    for name,ver in req.items():
        try:actual=md.version(name)
        except md.PackageNotFoundError:actual=None
        if actual!=ver:drift[name]={'expected':ver,'actual':actual}
    if drift: raise RuntimeError(f'FAIL_RUNTIME_PYTHON_PACKAGE_DRIFT {drift}')
    dotnet=subprocess.check_output(['dotnet','--version'],cwd=str(BOOTSTRAP/'runtime'),text=True).strip()
    expected=contract['runtime']['dotnetSdk']
    if dotnet!=expected:raise RuntimeError(f'FAIL_RUNTIME_DOTNET_DRIFT expected={expected} actual={dotnet}')
    if not SPINE_SRC.is_dir():raise RuntimeError('FAIL_VENDORED_SPINE_RUNTIME_MISSING')
    print(json.dumps({'status':'PASS_RUNTIME_OFFLINE_RESOLUTION','dotnet':dotnet,'pythonPackages':len(req)}))

def build_geometry():
    project_dir=REPO/'.build'/'geometry'
    project_dir.mkdir(parents=True,exist_ok=True)
    program=project_dir/'SpineGeometry.cs'
    shutil.copy2(GEOMETRY_SOURCE,program)
    project=project_dir/'SpineGeometry.csproj'
    xml=f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <Nullable>disable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="{SPINE_SRC.as_posix()}/**/*.cs" />
    <Compile Include="{program.as_posix()}" />
  </ItemGroup>
</Project>
"""
    project.write_text(xml,encoding='utf-8')
    run(['dotnet','build',project,'-c','Release'],cwd=BOOTSTRAP/'runtime')
    return project

def materialize_record(record,project):
    hero=int(record['heroId'])
    env=os.environ.copy()
    env['HERO_ID']=str(hero)
    env['CHAR_IMAGE_ID']=str(record['charImageId'])
    env['OUTPUT_ROOT']=str(WORK)
    run([sys.executable,EXTRACTOR],env=env)
    out=WORK/str(hero)
    inp=json.loads((out/'input.json').read_text(encoding='utf-8'))
    geometry=out/'geometry.json'
    run(['dotnet','run','--project',project,'-c','Release','--no-build','--',inp['atlasPath'],inp['skeletonPath'],geometry],cwd=BOOTSTRAP/'runtime')
    render_json=out/'render.json'
    full_png=out/'full.png'
    run([sys.executable,RASTER,'--geometry',geometry,'--texture',inp['texturePath'],'--output',full_png,'--evidence-output',render_json,'--hero-id',str(hero)])
    render=json.loads(render_json.read_text(encoding='utf-8'))
    image=Image.open(full_png).convert('RGBA')
    source_canvas=[image.width,image.height]
    image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
    ASSETS.mkdir(parents=True,exist_ok=True)
    webp=ASSETS/f'{hero}.webp'
    image.save(webp,'WEBP',quality=90,method=6)
    check=Image.open(webp).convert('RGBA')
    amin,amax=check.getchannel('A').getextrema()
    summary={
      'heroId':hero,
      'asset':f'generated/assets/heroes/{hero}.webp',
      'sourceSpinePath':inp['sourceSpinePath'],
      'bundleSha256':inp['bundleSha256'],
      'spineVersion':inp['spineVersion'],
      'pose':render['render']['pose'],
      'sourceCanvas':source_canvas,
      'width':check.width,
      'height':check.height,
      'hasAlpha':amin<255,
      'renderableAttachmentCount':render['render']['renderableAttachmentCount'],
      'triangleCount':render['render']['triangleCount'],
      'sizeBytes':webp.stat().st_size,
      'sha256':sha256(webp)
    }
    expected=record['expected']
    checks={
      'width':summary['width']==expected['width'],
      'height':summary['height']==expected['height'],
      'renderables':summary['renderableAttachmentCount']==expected['renderableAttachmentCount'],
      'triangles':summary['triangleCount']==expected['triangleCount'],
      'sha256':summary['sha256']==expected['sha256'],
      'alpha':summary['hasAlpha']
    }
    if not all(checks.values()):raise RuntimeError(f'FAIL_DETERMINISTIC_PARITY heroId={hero} checks={checks}')
    print(json.dumps({'status':'PASS_BOOTSTRAP_HERO_MATERIALIZATION','heroId':hero,'sha256':summary['sha256']}))
    return summary

def install_frontend():
    src=BOOTSTRAP/'frontend-template'
    dst=REPO/'frontend'
    if dst.exists():shutil.rmtree(dst)
    shutil.copytree(src,dst)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--hero-id',type=int,action='append',dest='hero_ids')
    args=ap.parse_args()
    contract=ensure_contract()
    wanted=set(args.hero_ids or [int(x['heroId']) for x in contract['records']])
    records=[r for r in contract['records'] if int(r['heroId']) in wanted]
    if wanted-{int(r['heroId']) for r in records}:raise RuntimeError('FAIL_UNKNOWN_HERO_ID')
    ensure_runtime(contract)
    if OUTPUT.exists():shutil.rmtree(OUTPUT)
    project=build_geometry()
    summaries=[materialize_record(r,project) for r in records]
    manifest={
      'schemaVersion':1,
      'status':'PASS_SP_BOOTSTRAP_MATERIALIZATION',
      'heroIds':[x['heroId'] for x in summaries],
      'records':summaries
    }
    OUTPUT.mkdir(parents=True,exist_ok=True)
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n',encoding='utf-8')
    install_frontend()
    print(json.dumps({'status':'PASS_SP_BOOTSTRAP_MATERIALIZATION','count':len(summaries),'heroIds':manifest['heroIds']}))

if __name__=='__main__':
    main()
