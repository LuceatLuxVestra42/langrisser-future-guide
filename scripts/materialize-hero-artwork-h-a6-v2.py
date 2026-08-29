import pathlib

source_path = pathlib.Path('scripts/materialize-hero-artwork-h-a6.py')
source = source_path.read_text(encoding='utf-8')

source = source.replace('import struct\n', 'import struct\nimport subprocess\n', 1)

old = '''def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))
'''
new = '''def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def git_blob_bytes(path):
    result = subprocess.run(
        ["git", "show", f"HEAD:{path.as_posix()}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git blob read failed for {path}: {result.stderr.decode('utf-8', 'replace').strip()}"
        )
    return result.stdout
'''
if old not in source:
    raise RuntimeError('read_json fragment missing')
source = source.replace(old, new, 1)

old = '''    manifest_bytes = INDEX_MANIFEST.read_bytes()
    manifest_sha = sha256_bytes(manifest_bytes)
'''
new = '''    manifest_bytes = INDEX_MANIFEST.read_bytes()
    manifest_sha = sha256_bytes(git_blob_bytes(INDEX_MANIFEST))
'''
if old not in source:
    raise RuntimeError('manifest hash fragment missing')
source = source.replace(old, new, 1)

old = '''        data = path.read_bytes()
        actual_sha = sha256_bytes(data)
'''
new = '''        data = path.read_bytes()
        actual_sha = sha256_bytes(git_blob_bytes(path))
'''
if old not in source:
    raise RuntimeError('shard hash fragment missing')
source = source.replace(old, new, 1)

exec(compile(source, str(source_path) + ':v2', 'exec'), {'__name__': '__main__'})
