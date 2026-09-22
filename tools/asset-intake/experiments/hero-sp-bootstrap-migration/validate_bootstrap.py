#!/usr/bin/env python3
import hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
MANIFEST = ROOT / 'bootstrap.manifest.json'
if not MANIFEST.is_file():
    raise SystemExit('FAIL_BOOTSTRAP_MANIFEST_MISSING')

def sha256(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

m=json.loads(MANIFEST.read_text(encoding='utf-8'))
expected={row['path']:row['sha256'] for row in m['files']}
actual={}
for p in sorted(ROOT.rglob('*')):
    if p.is_file() and p!=MANIFEST:
        rel=p.relative_to(ROOT).as_posix()
        actual[rel]=sha256(p)
if set(actual)!=set(expected):
    missing=sorted(set(expected)-set(actual)); extra=sorted(set(actual)-set(expected))
    raise SystemExit(f'FAIL_BOOTSTRAP_FILESET missing={missing} extra={extra}')
bad=[p for p in expected if actual[p]!=expected[p]]
if bad: raise SystemExit(f'FAIL_BOOTSTRAP_FILE_HASH paths={bad}')
lines=[f"{p}\t{expected[p]}" for p in sorted(expected)]
payload=hashlib.sha256(('\n'.join(lines)+'\n').encode()).hexdigest()
if payload!=m['payloadDigest'].removeprefix('sha256:'):
    raise SystemExit('FAIL_BOOTSTRAP_PAYLOAD_DIGEST')

scan_roots=['extractor','renderer','frontend-template']
scan_files=[ROOT/'materialize.py',ROOT/'validate_output.py']
for d in scan_roots:
    scan_files.extend(p for p in (ROOT/d).rglob('*') if p.is_file() and p.suffix in {'.py','.cs','.js','.html'})
for p in scan_files:
    data=p.read_text(encoding='utf-8',errors='ignore')
    forbidden=['tools/asset-intake','git'+' show ','langrisser-'+'future-guide','api.github.com','raw.githubusercontent.com','pypi.org','files.pythonhosted.org']
    for token in forbidden:
        if token in data:
            raise SystemExit(f'FAIL_FORBIDDEN_RUNTIME_DEPENDENCY file={p.relative_to(ROOT)} token={token}')
print(json.dumps({'status':'PASS_BOOTSTRAP_PACKAGE_INTEGRITY','fileCount':len(expected),'payloadDigest':m['payloadDigest']}))
