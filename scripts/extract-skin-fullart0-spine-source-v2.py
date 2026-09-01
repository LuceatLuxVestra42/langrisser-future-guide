#!/usr/bin/env python3
import importlib.util
from pathlib import Path

BASE = Path(__file__).with_name('extract-skin-fullart0-spine-source.py')
spec = importlib.util.spec_from_file_location('skin_fullart0_spine_source_base', BASE)
if spec is None or spec.loader is None:
    raise RuntimeError('cannot load Skin FULLART-0 Spine source extractor')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def textasset_bytes_preserve_binary(obj):
    data = obj.read()
    script = getattr(data, 'script', None)
    if script is None:
        tree = module.safe_tree(obj)
        script = tree.get('m_Script') if isinstance(tree, dict) else None
    if isinstance(script, str):
        # UnityPy exposes arbitrary TextAsset bytes through surrogateescape.
        # Re-encode those surrogate codepoints to their exact original bytes.
        return script.encode('utf-8', errors='surrogateescape')
    if isinstance(script, (bytes, bytearray, memoryview)):
        return bytes(script)
    raise RuntimeError(f'unsupported TextAsset payload type: {type(script).__name__}')


module.textasset_bytes = textasset_bytes_preserve_binary

if __name__ == '__main__':
    module.main()
