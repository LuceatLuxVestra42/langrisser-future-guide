#!/usr/bin/env python3
import argparse
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALLOWLIST = [
    'fixture.v1.json',
    'requirements.lock.txt',
    'global.json',
    'extract_render_input.py',
    'render_spine_geometry.py',
    'SpineGeometry.cs',
    'run_cleanroom.py',
]

def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workspace', default='/tmp/langrisser-asset-portability-sp')
    args = ap.parse_args()
    target = Path(args.workspace).expanduser().resolve()
    if target.exists():
        raise SystemExit(f'refusing existing workspace: {target}')
    target.mkdir(parents=True)
    files = []
    for name in ALLOWLIST:
        src = HERE / name
        if not src.is_file():
            raise SystemExit(f'missing source file: {name}')
        dst = target / name
        shutil.copy2(src, dst)
        files.append({'path': name, 'sha256': sha256(dst)})
    if any((p / '.git').exists() for p in [target, *target.parents]):
        raise SystemExit('clean-room workspace must not be inside a Git checkout')
    forbidden = [b'git' + b' show ', b'langrisser-' + b'future-guide', b'public/images/heroes/' + b'sp']
    for row in files:
        if not row['path'].endswith(('.py', '.cs')):
            continue
        data = (target / row['path']).read_bytes()
        for token in forbidden:
            if token in data:
                raise SystemExit(f"forbidden runtime dependency in {row['path']}: {token!r}")
    setup = {
        'schemaVersion': 1,
        'status': 'PASS_CLEANROOM_PREPARED',
        'fileCount': len(files),
        'files': files,
        'guardrails': {
            'gitCheckoutPresent': False,
            'repositoryHistoryRuntimeDependency': False,
            'existingGeneratedWebpCopied': False,
            'existingManifestCopied': False,
        },
        'nextCommand': 'python run_cleanroom.py --execute',
    }
    (target / 'SETUP.json').write_text(json.dumps(setup, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': setup['status'], 'workspace': str(target), 'fileCount': len(files)}))

if __name__ == '__main__':
    main()
