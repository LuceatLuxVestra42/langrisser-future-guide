#!/usr/bin/env python3
import json
import urllib.request
import zipfile
from pathlib import Path

EVIDENCE = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
TARGETS = {
    'InstallPage_1.1.113_27.zip': ['begin_ui_icon_heroskin_abs.b'],
    'InstallPage_1.1.113_61.zip': ['ui_icon_heroskin2_abs.b', 'ui_icon_heroskin_abs.b'],
}

def norm(value: str) -> str:
    return value.replace('\\', '/').strip('/').lower()


def main():
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    base = evidence['source']['base'].rstrip('/')
    work = Path('.skin-stage3-3-zip-diagnostic')
    work.mkdir(exist_ok=True)
    for package, bundles in TARGETS.items():
        target = work / package
        req = urllib.request.Request(
            f'{base}/{package}',
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
                'Accept-Encoding': 'identity',
            },
        )
        with urllib.request.urlopen(req, timeout=180) as response, target.open('wb') as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        with zipfile.ZipFile(target) as archive:
            names = archive.namelist()
            print(json.dumps({
                'package': package,
                'entryCount': len(names),
                'targets': [
                    {
                        'bundle': bundle,
                        'exactNormalizedPathMatches': [name for name in names if norm(name) == norm(f'PC/AssetBundle/{bundle}')],
                        'exactBasenameMatches': [name for name in names if norm(name).rsplit('/', 1)[-1] == norm(bundle)],
                    }
                    for bundle in bundles
                ],
            }, indent=2))

if __name__ == '__main__':
    main()
