#!/usr/bin/env python3
import importlib.util
import sys
import zipfile
from pathlib import Path

BASE = Path(__file__).with_name('run-skin-stage3-3-static-batch.py')
spec = importlib.util.spec_from_file_location('skin_stage33_batch_base', BASE)
if spec is None or spec.loader is None:
    raise RuntimeError('cannot load bounded Skin batch extractor')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

ARCHIVE_ROOT = 'Client/Langrisser_Data/StreamingAssets/ExportAssetBundle'


def extract_bundle_exact_physical_entry(package_path: Path, bundle_name: str, destination: Path) -> None:
    expected = module.normalized(f'{ARCHIVE_ROOT}/{bundle_name}')
    with zipfile.ZipFile(package_path) as archive:
        matches = [name for name in archive.namelist() if module.normalized(name) == expected]
        if len(matches) != 1:
            module.fail(
                f'exact physical bundle entry count must be 1, got {len(matches)}: '
                f'{ARCHIVE_ROOT}/{bundle_name}'
            )
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(matches[0]) as source, destination.open('wb') as output:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
    if not destination.is_file() or destination.stat().st_size <= 0:
        module.fail(f'extracted bundle is empty: {bundle_name}')


module.extract_bundle = extract_bundle_exact_physical_entry

if __name__ == '__main__':
    try:
        raise SystemExit(module.main())
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise SystemExit(1)
