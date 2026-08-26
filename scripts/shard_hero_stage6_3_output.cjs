'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = 'data/generated/hero-detail.v1.json';
const sharedPath = 'data/generated/hero-detail-shared.v1.json';
const shardDir = 'data/generated/hero-detail/by-id';
const validationPath = 'data/validation/hero-stage6-3-final.v1.json';
const checkpointJsonPath = 'data/checkpoints/hero-stage6-3-full-generation.json';
const checkpointMdPath = 'data/checkpoints/hero-stage6-3-full-generation.md';

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const writeJson = (rel, value, pretty = true) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, pretty ? 2 : 0) + '\n');
};
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

const full = read(manifestPath);
const validation = read(validationPath);
const checkpoint = read(checkpointJsonPath);

if (full?.stage !== 'hero-page-6-3' || full?.completion !== 'COMPLETE') {
  throw new Error(`Stage 6-3 full output is not COMPLETE: ${full?.stage}/${full?.completion}`);
}
if (!Array.isArray(full?.records) || full.records.length !== 267) {
  throw new Error(`Expected 267 materialized Hero records, got ${full?.records?.length ?? null}`);
}
if ((full?.summary?.hardErrorCount ?? 1) !== 0 || (full?.summary?.structuralFailCount ?? 1) !== 0) {
  throw new Error(`Cannot shard failing output: hard=${full?.summary?.hardErrorCount}, structuralFail=${full?.summary?.structuralFailCount}`);
}

const ids = full.records.map(record => Number(record?.heroId));
if (ids.some(id => !Number.isInteger(id))) throw new Error('Invalid Hero ID in materialized records.');
if (new Set(ids).size !== 267) throw new Error('Duplicate Hero IDs in materialized records.');

fs.rmSync(abs(shardDir), { recursive: true, force: true });
fs.mkdirSync(abs(shardDir), { recursive: true });

const byHeroId = {};
let totalShardBytes = 0;
for (const record of full.records.slice().sort((a, b) => Number(a.heroId) - Number(b.heroId))) {
  const heroId = Number(record.heroId);
  const rel = `${shardDir}/${heroId}.json`;
  const text = JSON.stringify(record) + '\n';
  fs.writeFileSync(abs(rel), text);
  totalShardBytes += Buffer.byteLength(text);
  byHeroId[String(heroId)] = {
    path: rel,
    sha256: sha256(text),
    byteLength: Buffer.byteLength(text),
  };
}

const shared = {
  version: 1,
  stage: 'hero-page-6-3',
  schemaId: 'hero-detail-shared/v1',
  status: full.status,
  completion: full.completion,
  soldiersById: full?.shared?.soldiersById || {},
};
const sharedText = JSON.stringify(shared) + '\n';
fs.writeFileSync(abs(sharedPath), sharedText);

const manifest = {
  version: full.version,
  stage: full.stage,
  schemaId: full.schemaId,
  status: full.status,
  completion: full.completion,
  sourcePolicy: full.sourcePolicy,
  sources: full.sources,
  relationState: full.relationState,
  summary: full.summary,
  storage: {
    mode: 'SHARDED_BY_HERO',
    recordCount: 267,
    shardDirectory: shardDir,
    sharedPath,
    sharedSha256: sha256(sharedText),
    sharedByteLength: Buffer.byteLength(sharedText),
    totalShardBytes,
    byHeroId,
  },
};
writeJson(manifestPath, manifest, true);

validation.summary.storageMode = 'SHARDED_BY_HERO';
validation.summary.heroShardCount = 267;
validation.summary.heroShardMissingCount = 0;
validation.summary.heroShardDuplicateCount = 0;
validation.summary.totalHeroShardBytes = totalShardBytes;
validation.storage = {
  manifestPath,
  shardDirectory: shardDir,
  sharedPath,
  manifestRecordCount: 267,
  integrity: 'SHA256_PER_SHARD',
};
validation.decision = `Hero Stage 6-3 COMPLETE. 267/267 Hero details materialized and sharded by Hero ID with ${validation.summary.structuralPassCount} structural PASS, ${validation.summary.publicationReviewCount} publication REVIEW, zero structural FAIL, and zero hard errors.`;
writeJson(validationPath, validation, true);

checkpoint.confirmed.storageMode = 'SHARDED_BY_HERO';
checkpoint.confirmed.heroShardCount = 267;
checkpoint.confirmed.heroShardMissingCount = 0;
checkpoint.outputs = [manifestPath, `${shardDir}/<heroId>.json`, sharedPath, validationPath];
checkpoint.nextStart = 'Hero Stage 6-4 site consumer contract + final Hero data pipeline freeze. Consume the Stage 6-3 manifest and per-Hero shards; do not reopen Stage 4/5 semantics or rebuild confirmed relations.';
writeJson(checkpointJsonPath, checkpoint, true);

const md = fs.readFileSync(abs(checkpointMdPath), 'utf8');
const storageSection = `\n## Storage freeze\n\n- Mode: **SHARDED_BY_HERO**\n- Hero shards: **267**\n- Manifest: \`${manifestPath}\`\n- Shared Soldier metadata: \`${sharedPath}\`\n- Per-Hero path: \`${shardDir}/<heroId>.json\`\n- Integrity: **SHA256 per shard**\n\nThis replaces the temporary monolithic build payload so ordinary site and GitHub consumers do not need to read one very large Hero-detail Blob.\n`;
fs.writeFileSync(abs(checkpointMdPath), md.replace(/\n## Next start\n/, `${storageSection}\n## Next start\n`));

const written = fs.readdirSync(abs(shardDir)).filter(name => name.endsWith('.json'));
if (written.length !== 267) throw new Error(`Shard file count mismatch: ${written.length}`);

console.log(JSON.stringify({
  storageMode: 'SHARDED_BY_HERO',
  heroShardCount: written.length,
  totalShardBytes,
  sharedByteLength: Buffer.byteLength(sharedText),
  manifestPath,
  sharedPath,
}, null, 2));
