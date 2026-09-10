import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const MANIFEST_PATH = 'data/generated/hero-skill-icon-assets.v1.json';
const MATERIALIZATION_PATH = 'data/generated/hero-awakening-icon-materialization.v1.json';
const CHECKPOINT_PATH = 'data/generated/hero-awakening-icon-asset-validation.v1.json';
const EXPECTED_A7_2_COMMIT = 'b5e78892880e402e3a993acaac29651b4a9ae5db';
const EXPECTED_AWAKENING_MAP_SHA = 'def7582c48e99b48f0a0f8b1608f13a8c22ca3aa7cf287055787e1d39661563e';
const EXPECTED_MATERIALIZATION_SHA = '2e7697a496ab54332de850baee8ab1d3637d568ced8e8db0b573d1da9fe196f6';
const LEON_SOURCE = 'UI/Icon/Skill_ABS/Skill_Super4.png';
const LEON_PUBLIC = '/images/heroes/skill-icons/Skill_Super4.png';
const args = new Set(process.argv.slice(2));
const write = args.has('--write');

const fail = (message) => { throw new Error(message); };
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const sha256Bytes = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const compactSha = (value) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const fileSha = (relative) => sha256Bytes(fs.readFileSync(path.join(repoRoot, relative)));
const publicToFs = (publicPath) => path.join('public', publicPath.replace(/^\//, ''));
const sourcePathOrder = (a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0;

const manifest = readJson(MANIFEST_PATH);
const materialization = readJson(MATERIALIZATION_PATH);

if (manifest.schemaId !== 'hero-skill-icon-assets/v1' || manifest.status !== 'FROZEN') fail('manifest contract mismatch');
const admission = manifest.awakeningAdmission;
if (!admission || admission.status !== 'FROZEN' || admission.completion !== 'COMPLETE' || admission.semanticReopen !== false) fail('A7-2 admission contract mismatch');
if (admission.stage !== 'A7_2_MANIFEST_ADMISSION' || admission.predecessor?.commit !== '2dcd64fe4d1e9aa5801b8fb27030f23e0bc9a7fd') fail('A7-2 predecessor mismatch');
if (admission.lookupAuthority !== 'exact sourcePath only' || admission.awakeningMapSha256 !== EXPECTED_AWAKENING_MAP_SHA) fail('A7-2 lookup/hash contract mismatch');
if (admission.legacyLeonAwakeningRecordCount !== 1 || admission.admittedNowCount !== 256 || admission.totalAwakeningAdmittedCount !== 257) fail('A7-2 population mismatch');
if (admission.publicMissingCount !== 0 || admission.publicPathCollisionCount !== 0) fail('A7-2 frozen parity summary mismatch');

if (materialization.schemaId !== 'hero-awakening-icon-materialization/v1' || materialization.status !== 'FROZEN' || materialization.completion !== 'COMPLETE') fail('A7-1 materialization contract mismatch');
if (materialization.materializationSetSha256 !== EXPECTED_MATERIALIZATION_SHA) fail('A7-1 materialization hash mismatch');
if (materialization.summary?.materializedCount !== 256 || materialization.summary?.missingCount !== 0 || materialization.summary?.hashMismatchCount !== 0 || materialization.summary?.publicPathCollisionCount !== 0) fail('A7-1 materialization summary mismatch');

const legacyAwakening = (manifest.records ?? []).filter((row) => row?.role === 'awakening');
if (legacyAwakening.length !== 1 || legacyAwakening[0].sourcePath !== LEON_SOURCE || legacyAwakening[0].publicPath !== LEON_PUBLIC) fail('legacy Leon awakening record mismatch');
const admitted = manifest.awakeningRecords;
if (!Array.isArray(admitted) || admitted.length !== 256) fail('awakeningRecords count mismatch');
const materialRows = materialization.records;
if (!Array.isArray(materialRows) || materialRows.length !== 256) fail('materialization rows count mismatch');

const matBySource = new Map(materialRows.map((row) => [row.sourcePath, row]));
if (matBySource.size !== 256) fail('materialization sourcePath duplicate');
const seenSources = new Set();
const seenPublic = new Set();
const validationRows = [];
let missingCount = 0;
let hashMismatchCount = 0;
let sizeMismatchCount = 0;
let materializationMismatchCount = 0;

const all = [...legacyAwakening, ...admitted];
for (const row of all) {
  if (!row?.sourcePath || !row?.publicPath) fail('asset record missing exact lookup key');
  if (seenSources.has(row.sourcePath)) fail(`duplicate sourcePath ${row.sourcePath}`);
  if (seenPublic.has(row.publicPath)) fail(`duplicate publicPath ${row.publicPath}`);
  seenSources.add(row.sourcePath);
  seenPublic.add(row.publicPath);
  if (!row.publicPath.startsWith('/images/heroes/skill-icons/')) fail(`publicPath outside skill icon root ${row.publicPath}`);
  const fsPath = publicToFs(row.publicPath);
  const absolute = path.join(repoRoot, fsPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    missingCount += 1;
    continue;
  }
  const bytes = fs.statSync(absolute).size;
  const digest = fileSha(fsPath);
  if (bytes !== row.pngBytes) sizeMismatchCount += 1;
  if (digest !== row.pngSha256) hashMismatchCount += 1;
  validationRows.push({ sourcePath: row.sourcePath, publicPath: row.publicPath, pngBytes: row.pngBytes, pngSha256: row.pngSha256 });
}

for (const row of admitted) {
  if (row.role !== 'awakening') fail(`non-awakening role in awakeningRecords ${row.sourcePath}`);
  const mat = matBySource.get(row.sourcePath);
  if (!mat) { materializationMismatchCount += 1; continue; }
  const pairs = [
    ['publicPath', row.publicPath, mat.publicPath],
    ['pngBytes', row.pngBytes, mat.pngBytes],
    ['pngSha256', row.pngSha256, mat.pngSha256],
    ['bundleSha256', row.bundleSha256, mat.bundleSha256],
    ['rawObjectSha256', row.rawObjectSha256, mat.rawObjectSha256],
    ['rgbaSha256', row.rgbaSha256, mat.rgbaSha256],
    ['width', row.width, mat.width],
    ['height', row.height, mat.height],
  ];
  for (const [, a, b] of pairs) if (a !== b) materializationMismatchCount += 1;
}

if (seenSources.size !== 257 || seenPublic.size !== 257) fail('total awakening uniqueness mismatch');
if (missingCount || hashMismatchCount || sizeMismatchCount || materializationMismatchCount) {
  fail(`asset parity failure missing=${missingCount} hash=${hashMismatchCount} size=${sizeMismatchCount} materialization=${materializationMismatchCount}`);
}

validationRows.sort(sourcePathOrder);
const awakeningMap = validationRows.map(({sourcePath, publicPath, pngSha256}) => ({sourcePath, publicPath, pngSha256}));
const awakeningMapSha256 = compactSha(awakeningMap);
if (awakeningMapSha256 !== EXPECTED_AWAKENING_MAP_SHA) fail(`manifest awakening map hash mismatch ${awakeningMapSha256}`);
const validationSetSha256 = compactSha(validationRows);

const checkpoint = {
  version: 1,
  schemaId: 'hero-awakening-icon-asset-validation/v1',
  status: 'FROZEN',
  completion: 'COMPLETE',
  semanticReopen: false,
  stage: 'A7_3_ASSET_VALIDATOR',
  predecessor: {
    stage: 'A7_2_MANIFEST_ADMISSION',
    commit: EXPECTED_A7_2_COMMIT,
    awakeningMapSha256: EXPECTED_AWAKENING_MAP_SHA,
    materializationSetSha256: EXPECTED_MATERIALIZATION_SHA,
  },
  authority: {
    lookupKey: 'sourcePath',
    lookupRule: 'exact sourcePath only',
    manifestPath: MANIFEST_PATH,
    materializationPath: MATERIALIZATION_PATH,
    publicRoot: 'public/images/heroes/skill-icons',
  },
  summary: {
    totalAwakeningCount: 257,
    legacyLeonCount: 1,
    admittedMaterializedCount: 256,
    manifestSourcePathCount: 257,
    uniquePublicPathCount: 257,
    publicFileCount: 257,
    missingCount: 0,
    hashMismatchCount: 0,
    sizeMismatchCount: 0,
    materializationMismatchCount: 0,
  },
  awakeningMapSha256,
  validationSetSha256,
  hashContract: 'sha256(UTF-8 compact JSON of sourcePath-sorted [{sourcePath,publicPath,pngBytes,pngSha256}])',
  blocker: null,
  review: null,
  nextStage: 'A8_FRONTEND_INTEGRATION',
};

const checkpointAbs = path.join(repoRoot, CHECKPOINT_PATH);
if (write) fs.writeFileSync(checkpointAbs, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
if (!fs.existsSync(checkpointAbs)) fail('A7-3 checkpoint missing');
const currentCheckpoint = readJson(CHECKPOINT_PATH);
if (JSON.stringify(currentCheckpoint) !== JSON.stringify(checkpoint)) fail('A7-3 checkpoint drift');

console.log(JSON.stringify({
  checkpoint: 'AWAKENING_ICON_A7_3_ASSET_VALIDATOR',
  status: 'PASS',
  completion: 'COMPLETE',
  totalAwakeningCount: 257,
  publicFileCount: 257,
  missingCount,
  hashMismatchCount,
  sizeMismatchCount,
  materializationMismatchCount,
  awakeningMapSha256,
  validationSetSha256,
  semanticReopen: false,
}, null, 2));
