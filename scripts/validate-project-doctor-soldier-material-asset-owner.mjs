import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const A6_MANIFEST_PATH = 'data/manifests/soldier-training-material-assets-a6-webp.v1.json';
const A6_MANIFEST_BLOB = '69af732325de4ddcb0c2ca3bedc5eac9da8edee0';
const A7_VALIDATION_PATH = 'data/validation/soldier-training-material-assets-a7.v1.json';
const HELPER_PATH = 'src/lib/soldier-training-material-assets.ts';
const COMPONENT_PATH = 'src/components/soldier-detail-modal.tsx';
const failures = [];
const fail = (ok, id) => { if (!ok) failures.push(id); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const required of [A6_MANIFEST_PATH, A7_VALIDATION_PATH, HELPER_PATH, COMPONENT_PATH]) {
  fail(fs.existsSync(required), `MISSING:${required}`);
}

if (failures.length === 0) {
  const manifest = JSON.parse(fs.readFileSync(A6_MANIFEST_PATH, 'utf8'));
  const a7 = JSON.parse(fs.readFileSync(A7_VALIDATION_PATH, 'utf8'));
  const helper = fs.readFileSync(HELPER_PATH, 'utf8');
  const component = fs.readFileSync(COMPONENT_PATH, 'utf8');
  const currentBlob = execFileSync('git', ['rev-parse', `HEAD:${A6_MANIFEST_PATH}`], { encoding: 'utf8' }).trim();

  fail(currentBlob === A6_MANIFEST_BLOB, 'A6_MANIFEST_BLOB');
  fail(manifest.status === 'PASS' && manifest.completion === 'COMPLETE', 'A6_STATUS');
  fail(manifest.summary?.target === 24 && manifest.summary?.webpVerified === 24, 'A6_COVERAGE');
  fail(manifest.summary?.losslessPixelParity === 24 && manifest.summary?.alphaParity === 24, 'A6_PARITY');
  fail(manifest.summary?.missing === 0 && manifest.summary?.extras === 0 && manifest.summary?.errors === 0, 'A6_ERRORS');
  fail(Array.isArray(manifest.records) && manifest.records.length === 24, 'A6_RECORD_COUNT');

  const itemIds = new Set();
  const paths = new Set();
  let hashParity = 0;
  for (const record of manifest.records ?? []) {
    itemIds.add(record.itemId);
    paths.add(record.webpPath);
    fail(record.webpPath === `public/images/soldier-training-materials-webp/${record.itemId}.webp`, `PATH_PARITY:${record.itemId}`);
    fail(record.deliveryStatus === 'DELIVERED_LOSSLESS' && record.lossless === true, `LOSSLESS:${record.itemId}`);
    fail(record.pixelParity === true && record.alphaParity === true, `PIXEL_ALPHA:${record.itemId}`);
    fail(record.width === 172 && record.height === 172, `DIMENSIONS:${record.itemId}`);
    if (!fs.existsSync(record.webpPath)) {
      failures.push(`MISSING_WEBP:${record.itemId}`);
      continue;
    }
    const bytes = fs.readFileSync(record.webpPath);
    if (sha256(bytes) === record.webpSha256 && bytes.length === record.webpByteSize) hashParity += 1;
    else failures.push(`HASH_SIZE:${record.itemId}`);
  }
  fail(itemIds.size === 24, 'UNIQUE_ITEM_IDS');
  fail(paths.size === 24, 'UNIQUE_WEBP_PATHS');
  fail(hashParity === 24, 'REPOSITORY_HASH_PARITY');

  fail(a7.status === 'PASS' && a7.completion === 'PREDEPLOY_COMPLETE', 'A7_PREDEPLOY_STATUS');
  fail(a7.gates?.preflight === 'PASS' && a7.gates?.build === 'PASS', 'A7_PREDEPLOY_GATES');
  fail(a7.counts?.repositoryWebpHashParity === 24 && a7.counts?.errors === 0, 'A7_COUNTS');
  fail(a7.boundaries?.semanticRecomputed === false && a7.boundaries?.configDataRuntimeUsed === false, 'A7_SEMANTIC_BOUNDARY');
  fail(a7.boundaries?.nameJoinUsed === false && a7.boundaries?.idArithmeticUsed === false && a7.boundaries?.fuzzyOrVisualMatchingUsed === false, 'A7_IDENTITY_BOUNDARY');

  fail(!helper.includes('ConfigData'), 'HELPER_CONFIGDATA_FALLBACK');
  fail(!helper.includes('nameKr') && !helper.includes('nameCn'), 'HELPER_NAME_IDENTITY');
  fail(helper.includes('new Map(manifest.records.map((record) => [record.itemId, record]))'), 'HELPER_ITEMID_MAP');
  fail(helper.includes('record.webpPath.replace(/^public\\//, "")'), 'HELPER_FROZEN_WEBP_PATH');
  fail(component.includes('getSoldierTrainingMaterialIconUrl(material.itemId)'), 'COMPONENT_ITEMID_CONSUMER');
  fail(component.includes('src={iconUrl}'), 'COMPONENT_IMAGE_CONSUMER');
}

const pass = failures.length === 0;
console.log(JSON.stringify({
  version: 1,
  schemaId: 'project-doctor-soldier-training-material-assets-final/v1',
  status: pass ? 'PASS_SOLDIER_TRAINING_MATERIAL_ASSETS_FINAL' : 'FAIL_SOLDIER_TRAINING_MATERIAL_ASSETS_FINAL',
  expectedA6ManifestBlobSha: A6_MANIFEST_BLOB,
  failures,
}, null, 2));
if (!pass) process.exitCode = 1;
