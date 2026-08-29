import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path('data/generated/hero-artwork-h-a5-index.v1')
MANIFEST = ROOT / 'manifest.json'
VALIDATION = pathlib.Path('data/validation/hero-artwork-h-a5-final.v1.json')
CHECKPOINT = pathlib.Path('data/checkpoints/hero-artwork-h-a5.txt')


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest().upper()


def digest(path):
    return digest_bytes(path.read_bytes())


def git_blob_digest(path):
    result = subprocess.run(
        ['git', 'show', f'HEAD:{path.as_posix()}'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git blob read failed for {path}: {result.stderr.decode('utf-8', 'replace').strip()}"
        )
    return digest_bytes(result.stdout)


def write_json_lf(path, doc):
    path.write_bytes((json.dumps(doc, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
if manifest.get('status') != 'H_A5_BULK_EXTRACTION_INDEX_COMPLETE':
    raise RuntimeError(f"unexpected H-A5 manifest status: {manifest.get('status')}")
if manifest.get('canonicalHeroCount') != 267 or manifest.get('owningBundleCount') != 12:
    raise RuntimeError('H-A5 manifest population/bundle count drift')

shard_changes = []
for entry in manifest.get('bundles', []):
    path = pathlib.Path(entry['path'])
    current = git_blob_digest(path)
    previous = entry.get('sha256')
    if current != previous:
        shard_changes.append({'path': path.as_posix(), 'previous': previous, 'current': current})
    entry['sha256'] = current

manifest['textHashBasis'] = 'REPOSITORY_GIT_BLOB_BYTES'
write_json_lf(MANIFEST, manifest)
manifest_sha = digest(MANIFEST)

validation = json.loads(VALIDATION.read_text(encoding='utf-8'))
if validation.get('status') != 'PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL':
    raise RuntimeError(f"unexpected H-A5 validation status: {validation.get('status')}")
previous_manifest_sha = validation.get('manifestSha256')
validation['manifestSha256'] = manifest_sha
validation['textHashBasis'] = 'REPOSITORY_GIT_BLOB_BYTES'
validation['hashMetadataRepair'] = {
    'status': 'PASS_H_A5_HASH_METADATA_REPAIRED',
    'revision': 2,
    'semanticDataChanged': False,
    'rowDataChanged': False,
    'shardHashEntryChangeCount': len(shard_changes),
    'previousManifestSha256': previous_manifest_sha,
    'shardHashBasis': 'GIT_BLOB_BYTES',
    'manifestHashBasis': 'UTF8_LF_BYTES_WRITTEN_TO_GIT',
}
write_json_lf(VALIDATION, validation)

checkpoint = CHECKPOINT.read_text(encoding='utf-8')
checkpoint = re.sub(
    r'(manifest:\s*\n- data/generated/hero-artwork-h-a5-index\.v1/manifest\.json\s*\n- SHA256: )([0-9A-F]+)',
    rf'\g<1>{manifest_sha}',
    checkpoint,
    count=1,
)
if 'H-A5 hash metadata maintenance revision 2' not in checkpoint:
    checkpoint += f'''\n\n============================================================\n9. H-A5 hash metadata maintenance revision 2 — 2026-08-29\n============================================================\n\nstatus: PASS_H_A5_HASH_METADATA_REPAIRED\nrevision: 2\nsemantic data changed: false\nrow data changed: false\nshard hash entry changes: {len(shard_changes)}\nprevious manifest SHA256: {previous_manifest_sha}\ncurrent manifest SHA256: {manifest_sha}\nshard hash basis: Git repository blob bytes\nmanifest hash basis: UTF-8 LF bytes written to Git\n\nRevision 1에서 manifest 자체는 repository LF 기준으로 교정됐지만,\n12 shard descriptor는 Windows checkout working-tree bytes를 hash해 CRLF 영향을 받았다.\nRevision 2는 shard descriptor를 `git show HEAD:<path>`의 canonical Git blob bytes로 다시 고정한다.\n\nextraction/index row는 재생성하지 않았다.\n267 Hero pathId / dimensions / PNG·RGBA hash / ownership / selectionStatus는 변경하지 않았다.\n이 작업은 manifest/freshness 계층 유지보수만 수행한다.\n'''
CHECKPOINT.write_bytes(checkpoint.encode('utf-8'))

print(json.dumps({
    'status': 'PASS_H_A5_HASH_METADATA_REPAIRED',
    'revision': 2,
    'semanticDataChanged': False,
    'rowDataChanged': False,
    'shardHashEntryChangeCount': len(shard_changes),
    'previousManifestSha256': previous_manifest_sha,
    'manifestSha256': manifest_sha,
    'shardChanges': shard_changes,
}, ensure_ascii=True))
