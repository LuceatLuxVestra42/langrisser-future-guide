import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const A5_PATH = 'data/manifests/soldier-training-material-assets-a5.v1.json';
const A6_PATH = 'data/manifests/soldier-training-material-assets-a6-webp.v1.json';
const A7_PATH = 'data/validation/soldier-training-material-assets-a7.v1.json';
const HELPER_PATH = 'src/lib/soldier-training-material-assets.ts';
const COMPONENT_PATH = 'src/components/soldier-detail-modal.tsx';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function pngDimensions(bytes) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  assert.equal(bytes.subarray(0, 8).equals(signature), true, 'PNG signature mismatch');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', 'PNG IHDR missing');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

for (const path of [A5_PATH, A6_PATH, A7_PATH, HELPER_PATH, COMPONENT_PATH]) {
  assert.equal(fs.existsSync(path), true, `required Soldier training-material artifact missing: ${path}`);
}

const a5 = readJson(A5_PATH);
const a6Bytes = fs.readFileSync(A6_PATH);
const a6 = JSON.parse(a6Bytes.toString('utf8'));
const a7 = readJson(A7_PATH);

assert.equal(a5.schemaId, 'soldier-training-material-assets-a5-repository-admission/v1');
assert.equal(a5.status, 'PASS');
assert.equal(a5.completion, 'COMPLETE');
assert.equal(a5.repository?.root, 'public/images/soldier-training-materials');
assert.equal(a5.repository?.sourceBytesPreservedExactly, true);
assert.equal(Array.isArray(a5.records), true);
assert.equal(a5.records.length, 24);

const a5ById = new Map();
for (const record of a5.records) {
  assert.equal(Number.isInteger(record.itemId), true, `A5 invalid itemId: ${record.itemId}`);
  assert.equal(a5ById.has(record.itemId), false, `A5 duplicate itemId: ${record.itemId}`);
  assert.equal(record.repositoryPath, `public/images/soldier-training-materials/${record.itemId}.png`);
  assert.equal(record.signature, 'PNG');
  assert.equal(record.width, 172);
  assert.equal(record.height, 172);
  assert.equal(record.admissionStatus, 'ADMITTED_EXACT');
  assert.equal(fs.existsSync(record.repositoryPath), true, `A5 repository PNG missing: ${record.itemId}`);
  const bytes = fs.readFileSync(record.repositoryPath);
  assert.equal(bytes.length, record.repositoryByteSize, `A5 PNG byte size mismatch: ${record.itemId}`);
  assert.equal(sha256(bytes), record.repositorySha256, `A5 PNG SHA-256 mismatch: ${record.itemId}`);
  const dimensions = pngDimensions(bytes);
  assert.deepEqual(dimensions, { width: 172, height: 172 }, `A5 PNG dimensions mismatch: ${record.itemId}`);
  assert.equal(record.repositorySha256, record.sourceSha256, `A5 source/repository SHA parity mismatch: ${record.itemId}`);
  assert.equal(record.repositoryByteSize, record.sourceByteSize, `A5 source/repository byte parity mismatch: ${record.itemId}`);
  a5ById.set(record.itemId, record);
}
assert.equal(a5ById.size, 24);

assert.equal(a6.schemaId, 'soldier-training-material-assets-a6-webp-delivery/v1');
assert.equal(a6.status, 'PASS');
assert.equal(a6.completion, 'COMPLETE');
assert.equal(a6.predecessor?.a5Status, 'PASS');
assert.equal(a6.predecessor?.a5RepositoryPng, 24);
assert.equal(a6.delivery?.sourceRoot, 'public/images/soldier-training-materials');
assert.equal(a6.delivery?.webpRoot, 'public/images/soldier-training-materials-webp');
assert.equal(a6.delivery?.lossless, true);
assert.equal(a6.delivery?.decodedPixelParityRequired, true);
assert.equal(Array.isArray(a6.records), true);
assert.equal(a6.records.length, 24);

const a6ById = new Map();
for (const record of a6.records) {
  assert.equal(Number.isInteger(record.itemId), true, `A6 invalid itemId: ${record.itemId}`);
  assert.equal(a6ById.has(record.itemId), false, `A6 duplicate itemId: ${record.itemId}`);
  const a5Record = a5ById.get(record.itemId);
  assert.ok(a5Record, `A6 itemId absent from A5: ${record.itemId}`);
  assert.equal(record.sourcePngPath, a5Record.repositoryPath, `A6/A5 PNG path mismatch: ${record.itemId}`);
  assert.equal(record.sourcePngByteSize, a5Record.repositoryByteSize, `A6/A5 PNG size mismatch: ${record.itemId}`);
  assert.equal(record.sourcePngSha256, a5Record.repositorySha256, `A6/A5 PNG hash mismatch: ${record.itemId}`);
  assert.equal(record.webpPath, `public/images/soldier-training-materials-webp/${record.itemId}.webp`);
  assert.equal(record.width, 172);
  assert.equal(record.height, 172);
  assert.equal(record.lossless, true);
  assert.equal(record.pixelParity, true);
  assert.equal(record.alphaParity, true);
  assert.equal(record.deliveryStatus, 'DELIVERED_LOSSLESS');
  assert.equal(record.webpDecodedPixelSha256, record.sourcePixelSha256, `A6 decoded/source pixel evidence mismatch: ${record.itemId}`);
  assert.equal(fs.existsSync(record.webpPath), true, `A6 repository WebP missing: ${record.itemId}`);
  const bytes = fs.readFileSync(record.webpPath);
  assert.equal(bytes.length, record.webpByteSize, `A6 WebP byte size mismatch: ${record.itemId}`);
  assert.equal(sha256(bytes), record.webpSha256, `A6 WebP SHA-256 mismatch: ${record.itemId}`);
  a6ById.set(record.itemId, record);
}
assert.equal(a6ById.size, 24);
assert.deepEqual([...a6ById.keys()].sort((a, b) => a - b), [...a5ById.keys()].sort((a, b) => a - b));

assert.equal(a7.schemaId, 'soldier-training-material-assets-a7-frontend-integration/v1');
assert.equal(a7.status, 'PASS');
assert.equal(a7.completion, 'PREDEPLOY_COMPLETE');
assert.equal(a7.predecessor?.a6ManifestPath, A6_PATH);
const currentA6Blob = gitBlobSha1(a6Bytes);
assert.equal(a7.predecessor?.expectedA6ManifestBlobSha, currentA6Blob, 'A7 expected A6 blob mismatch');
assert.equal(a7.predecessor?.currentA6ManifestBlobSha, currentA6Blob, 'A7 current A6 blob mismatch');
assert.equal(a7.predecessor?.a6Status, 'PASS');
assert.equal(a7.predecessor?.a6Completion, 'COMPLETE');
assert.equal(a7.gates?.preflight, 'PASS');
assert.equal(a7.gates?.build, 'PASS');
assert.equal(a7.gates?.deploymentHosted, 'BLOCKED_AWAITING_AUTHORITATIVE_PAGES_DEPLOY');
assert.equal(a7.gates?.browserUi, 'BLOCKED_UNTIL_HOSTED_PASS');
assert.equal(a7.counts?.target, 24);
assert.equal(a7.counts?.uniqueItemIds, 24);
assert.equal(a7.counts?.uniqueWebpPaths, 24);
assert.equal(a7.counts?.repositoryWebpHashParity, 24);
assert.equal(a7.counts?.dimensions172x172, 24);
assert.equal(a7.counts?.manifestPixelParity, 24);
assert.equal(a7.counts?.manifestAlphaParity, 24);
assert.equal(a7.counts?.missing, 0);
assert.equal(a7.counts?.errors, 0);
assert.equal(a7.consumer?.identity, 'itemId');
assert.equal(a7.consumer?.assetRoot, 'public/images/soldier-training-materials-webp');
for (const key of ['semanticRecomputed', 'configDataRuntimeUsed', 'nameJoinUsed', 'idArithmeticUsed', 'fuzzyOrVisualMatchingUsed', 'a5PngChanged', 'a6WebpChanged']) {
  assert.equal(a7.boundaries?.[key], false, `A7 boundary must remain false: ${key}`);
}

const helper = fs.readFileSync(HELPER_PATH, 'utf8');
const component = fs.readFileSync(COMPONENT_PATH, 'utf8');
assert.equal(helper.includes('ConfigData'), false, 'training-material helper must not read raw ConfigData');
assert.equal(helper.includes('nameKr'), false, 'training-material helper must not use Korean name identity');
assert.equal(helper.includes('nameCn'), false, 'training-material helper must not use Chinese name identity');
assert.equal(helper.includes('new Map(manifest.records.map((record) => [record.itemId, record]))'), true, 'training-material helper must use direct itemId map');
assert.equal(helper.includes('record.webpPath.replace(/^public\\//, "")'), true, 'training-material helper must consume frozen WebP paths');
assert.equal(component.includes('getSoldierTrainingMaterialIconUrl'), true, 'Soldier detail must use training-material helper');
assert.equal(component.includes('getSoldierTrainingMaterialIconUrl(material.itemId)'), true, 'Soldier detail must use itemId identity');

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'SOLDIER_TRAINING_MATERIAL_ASSETS_READ_ONLY',
  counts: {
    a5Png: a5ById.size,
    a6Webp: a6ById.size,
    a7ItemIds: a7.counts.uniqueItemIds,
    errors: 0,
  },
  gates: {
    a5: 'PASS',
    a6: 'PASS',
    a7Predeploy: 'PASS',
    hosted: a7.gates.deploymentHosted,
    browserUi: a7.gates.browserUi,
  },
  boundaries: {
    readOnly: true,
    rawConfigDataRead: false,
    nameJoin: false,
    idArithmetic: false,
    semanticRecomputation: false,
  },
}, null, 2));
