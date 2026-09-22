#!/usr/bin/env python3
import argparse, hashlib, io, json, os, pathlib, shutil, subprocess, sys, tarfile, tempfile, urllib.request

HERE=pathlib.Path(__file__).resolve().parent
PORTABILITY=HERE.parent/'hero-sp-portability'
PACKAGE_NAME='hero-sp-bootstrap-v1.tar'
SPINE_COMMIT='1c1936532527900f74cfb58f7002998bf157b254'
SPINE_URL=f'https://codeload.github.com/EsotericSoftware/spine-runtimes/tar.gz/{SPINE_COMMIT}'

def sha256(path):
    h=hashlib.sha256()
    with pathlib.Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def copy(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)

def safe_extract_spine(payload,dst):
    with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tf:
        members=[]
        for m in tf.getmembers():
            p=pathlib.PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts:raise RuntimeError(f'unsafe Spine archive member {m.name}')
            members.append(m)
        tf.extractall(dst,members=members)
    roots=[p for p in dst.iterdir() if p.is_dir()]
    if len(roots)!=1:raise RuntimeError(f'unexpected Spine roots {roots}')
    src=roots[0]/'spine-csharp'/'src'
    if not src.is_dir():raise RuntimeError('spine-csharp/src missing')
    return src

def canonical_tar(source_root,out):
    with tarfile.open(out,'w',format=tarfile.PAX_FORMAT) as tf:
        for p in sorted(source_root.rglob('*'),key=lambda x:x.relative_to(source_root).as_posix()):
            rel=p.relative_to(source_root).as_posix()
            arc='bootstrap/'+rel
            if p.is_symlink():raise RuntimeError(f'symlink forbidden: {rel}')
            ti=tarfile.TarInfo(arc)
            ti.mtime=0;ti.uid=0;ti.gid=0;ti.uname='';ti.gname=''
            if p.is_dir():
                ti.type=tarfile.DIRTYPE;ti.mode=0o755;ti.size=0;tf.addfile(ti)
            elif p.is_file():
                ti.type=tarfile.REGTYPE
                ti.mode=0o755 if p.suffix in {'.py','.js'} else 0o644
                ti.size=p.stat().st_size
                with p.open('rb') as f:tf.addfile(ti,f)
            else:raise RuntimeError(f'unsupported file type: {rel}')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output-dir',required=True);args=ap.parse_args()
    outdir=pathlib.Path(args.output_dir).resolve();outdir.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hero-sp-bootstrap-') as td:
        t=pathlib.Path(td);root=t/'payload';root.mkdir()
        contract=json.loads((PORTABILITY/'fixture.v1.json').read_text(encoding='utf-8'))
        contract['status']='FROZEN_SP_BOOTSTRAP_CONTRACT'
        contract['authorityBoundary']='PORTABLE_INPUT_CONTRACT_NOT_DISCOVERY_AUTHORITY'
        (root/'contract').mkdir()
        (root/'contract'/'hero-sp.v1.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        copy(HERE/'bootstrap_extract_render_input.py',root/'extractor'/'extract_render_input.py')
        copy(PORTABILITY/'render_spine_geometry.py',root/'renderer'/'render_spine_geometry.py')
        copy(PORTABILITY/'SpineGeometry.cs',root/'renderer'/'SpineGeometry.cs')
        copy(PORTABILITY/'requirements.lock.txt',root/'runtime'/'requirements.lock.txt')
        copy(PORTABILITY/'global.json',root/'runtime'/'global.json')
        copy(HERE/'materialize.py',root/'materialize.py')
        copy(HERE/'validate_bootstrap.py',root/'validate_bootstrap.py')
        copy(HERE/'validate_output.py',root/'validate_output.py')
        copy(HERE/'frontend-index.html',root/'frontend-template'/'index.html')
        copy(HERE/'frontend-app.js',root/'frontend-template'/'app.js')

        wheelhouse=root/'runtime'/'wheelhouse';wheelhouse.mkdir(parents=True)
        subprocess.run([sys.executable,'-m','pip','wheel','--disable-pip-version-check','--wheel-dir',str(wheelhouse),'-r',str(root/'runtime'/'requirements.lock.txt')],check=True)
        nonwheels=[p.name for p in wheelhouse.iterdir() if p.is_file() and p.suffix!='.whl']
        if nonwheels:raise RuntimeError(f'non-wheel runtime artifacts {nonwheels}')

        print(f'downloading pinned Spine runtime {SPINE_COMMIT}',flush=True)
        with urllib.request.urlopen(SPINE_URL,timeout=120) as r:payload=r.read()
        extract=t/'spine';extract.mkdir()
        src=safe_extract_spine(payload,extract)
        shutil.copytree(src,root/'runtime'/'spine-csharp'/'src')

        rows=[]
        for p in sorted(root.rglob('*'),key=lambda x:x.relative_to(root).as_posix()):
            if p.is_file():
                rel=p.relative_to(root).as_posix()
                rows.append({'path':rel,'sha256':sha256(p)})
        lines=[f"{r['path']}\t{r['sha256']}" for r in rows]
        payload_digest=hashlib.sha256(('\n'.join(lines)+'\n').encode()).hexdigest()
        manifest={
          'schemaVersion':1,
          'package':'hero-sp-bootstrap-v1',
          'authorityBoundary':'FROZEN_MIGRATION_ARTIFACT',
          'allowedRuntimeNetworkHosts':['mhmnzupdate.zlongame.com'],
          'forbiddenDependencies':['asset-intake-runtime','source-repository-history','existing-generated-assets','existing-production-manifest','name-join','id-arithmetic','filename-similarity-mapping'],
          'spineRuntimeCommit':SPINE_COMMIT,
          'payloadDigest':'sha256:'+payload_digest,
          'files':rows
        }
        (root/'bootstrap.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

        tar1=outdir/PACKAGE_NAME
        tar2=t/'recheck.tar'
        canonical_tar(root,tar1);canonical_tar(root,tar2)
        h1=sha256(tar1);h2=sha256(tar2)
        if h1!=h2:raise RuntimeError(f'canonical tar nondeterminism {h1} != {h2}')
        side=outdir/(PACKAGE_NAME+'.sha256')
        side.write_text(f'{h1}  {PACKAGE_NAME}\n',encoding='utf-8')
        meta={'status':'PASS_FROZEN_BOOTSTRAP_PACKAGE_BUILD','package':PACKAGE_NAME,'bootstrapPackageSha256':h1,'payloadDigest':manifest['payloadDigest'],'fileCount':len(rows),'spineRuntimeCommit':SPINE_COMMIT}
        (outdir/'bootstrap-build-result.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(meta))

if __name__=='__main__':main()
