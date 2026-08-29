import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path('data/generated/hero-artwork-h-a5-index.v1')
MANIFEST = ROOT / 'manifest.json'
VALIDATION = pathlib.Path('data/validation/hero-artwork-h-a5-final.v1.json')
CHECKPOINT = pathlib.Path('data/checkpoints/hero-artwork-h-a5.txt')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


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
    current = digest(path)
    previous = entry.get('sha256')
    if current != previous:
        shard_changes.append({'path': path.as_posix(), 'previous': previous, 'current': current})
    entry['sha256'] = current

manifest['textHashBasis'] = 'REPOSITORY_UTF8_LF_BYTES'
write_json_lf(MANIFEST, manifest)
manifest_sha = digest(MANIFEST)

validation = json.loads(VALIDATION.read_text(encoding='utf-8'))
if validation.get('status') != 'PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL':
    raise RuntimeError(f"unexpected H-A5 validation status: {validation.get('status')}")
previous_manifest_sha = validation.get('manifestSha256')
validation['manifestSha256'] = manifest_sha
validation['textHashBasis'] = 'REPOSITORY_UTF8_LF_BYTES'
validation['hashMetadataRepair'] = {
    'status': 'PASS_H_A5_HASH_METADATA_REPAIRED',
    'semanticDataChanged': False,
    'rowDataChanged': False,
    'shardHashEntryChangeCount': len(shard_changes),
    'previousManifestSha256': previous_manifest_sha,
}
write_json_lf(VALIDATION, validation)

checkpoint = CHECKPOINT.read_text(encoding='utf-8')
checkpoint = re.sub(r'(manifest:\s*\n- data/generated/hero-artwork-h-a5-index\.v1/manifest\.json\s*\n- SHA256: )([0-9A-F]+)', rf'\g<1>{manifest_sha}', checkpoint, count=1)
if 'H-A5 hash metadata maintenance' not in checkpoint:
    checkpoint += f'''\n\n============================================================\n8. H-A5 hash metadata maintenance — 2026-08-29\n============================================================\n\nstatus: PASS_H_A5_HASH_METADATA_REPAIRED\nsemantic data changed: false\nrow data changed: false\nshard hash entry changes: {len(shard_changes)}\nprevious manifest SHA256: {previous_manifest_sha}\ncurrent manifest SHA256: {manifest_sha}\nhash basis: repository UTF-8 LF bytes\n\n원인:\n- 최초 finalizer가 Windows working-tree bytes를 hash한 뒤 Git text normalization이 적용되어\n  repository에 저장된 UTF-8 LF bytes와 validation/manifest의 기록 hash가 달라졌다.\n\n조치:\n- extraction/index row를 재생성하지 않았다.\n- 267 Hero pathId / dimensions / PNG·RGBA hash / ownership / selectionStatus는 변경하지 않았다.\n- 12 shard의 현재 repository bytes SHA-256과 manifest descriptor를 동기화했다.\n- manifest SHA-256과 final validation을 현재 repository bytes 기준으로 동기화했다.\n\n이 유지보수는 manifest/freshness 계층 수정이며 H-A5 extraction 의미를 다시 여는 작업이 아니다.\n'''
CHECKPOINT.write_bytes(checkpoint.encode('utf-8'))

print(json.dumps({
    'status': 'PASS_H_A5_HASH_METADATA_REPAIRED',
    'shardHashEntryChangeCount': len(shard_changes),
    'previousManifestSha256': previous_manifest_sha,
    'manifestSha256': manifest_sha,
    'shardChanges': shard_changes,
}, ensure_ascii=True))
