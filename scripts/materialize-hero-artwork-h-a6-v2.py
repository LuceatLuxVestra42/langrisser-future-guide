import pathlib

source_path = pathlib.Path('scripts/materialize-hero-artwork-h-a6.py')
source = source_path.read_text(encoding='utf-8')

old = '''def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest().upper()
'''
new = '''def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest().upper()


def h_a5_declared_digest(data):
    # H-A5 finalizer ran on Windows and hashed its CRLF working-tree bytes before
    # git normalized text files to LF. Reproduce that declared digest without
    # treating git line-ending normalization as semantic/index drift.
    git_bytes_sha = sha256_bytes(data)
    crlf_bytes = data.replace(b"\\r\\n", b"\\n").replace(b"\\n", b"\\r\\n")
    declared_sha = sha256_bytes(crlf_bytes)
    return git_bytes_sha, declared_sha
'''
if old not in source:
    raise RuntimeError('sha256 helper fragment missing')
source = source.replace(old, new, 1)

old = '''    manifest_bytes = INDEX_MANIFEST.read_bytes()
    manifest_sha = sha256_bytes(manifest_bytes)
    if manifest_sha != EXPECTED_HA5_MANIFEST_SHA256:
        raise RuntimeError(f"H-A5 manifest drift {manifest_sha} != {EXPECTED_HA5_MANIFEST_SHA256}")
'''
new = '''    manifest_bytes = INDEX_MANIFEST.read_bytes()
    manifest_git_sha, manifest_sha = h_a5_declared_digest(manifest_bytes)
    if manifest_sha != EXPECTED_HA5_MANIFEST_SHA256:
        raise RuntimeError(
            f"H-A5 manifest drift declared={manifest_sha} git-bytes={manifest_git_sha} expected={EXPECTED_HA5_MANIFEST_SHA256}"
        )
'''
if old not in source:
    raise RuntimeError('manifest digest fragment missing')
source = source.replace(old, new, 1)

old = '''        data = path.read_bytes()
        actual_sha = sha256_bytes(data)
        if actual_sha != descriptor["sha256"]:
            raise RuntimeError(f"H-A5 shard drift {path}: {actual_sha} != {descriptor['sha256']}")
'''
new = '''        data = path.read_bytes()
        actual_git_sha, actual_sha = h_a5_declared_digest(data)
        if actual_sha != descriptor["sha256"]:
            raise RuntimeError(
                f"H-A5 shard drift {path}: declared={actual_sha} git-bytes={actual_git_sha} expected={descriptor['sha256']}"
            )
'''
if old not in source:
    raise RuntimeError('shard digest fragment missing')
source = source.replace(old, new, 1)

exec(compile(source, str(source_path) + ':v2', 'exec'), {'__name__': '__main__'})
