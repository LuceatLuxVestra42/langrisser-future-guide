import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

const paths = {
  manifest: 'data/generated/soldier-portrait-manifest.v9.json',
  audit: 'data/validation/soldier-portrait-v9-source-audit.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
};

const manifest = readJson(paths.manifest);
const audit = readJson(paths.audit);
const soldierMaster = readJson(paths.soldierMaster);
const errors = [];
const fail = (code, detail) => errors.push({ code, detail });

const records = Array.isArray(manifest?.records) ? manifest.records : [];
const canonical = Array.isArray(soldierMaster?.records) ? soldierMaster.records : [];
const canonicalIds = [...new Set(canonical.map((record) => record?.soldierId).filter(Number.isInteger))].sort((a, b) => a - b);
const manifestIds = [...new Set(records.map((record) => record?.soldierId).filter(Number.isInteger))].sort((a, b) => a - b);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (manifest?.version !== 9) fail('manifest-version', manifest?.version ?? null);
if (manifest?.status !== 'PASS' || manifest?.assetsReady !== true) fail('manifest-readiness', { status: manifest?.status ?? null, assetsReady: manifest?.assetsReady ?? null });
if (manifest?.publicRoot !== 'images/soldiers') fail('public-root', manifest?.publicRoot ?? null);
if (manifest?.sources?.sourceAudit !== paths.audit) fail('source-audit-link', manifest?.sources?.sourceAudit ?? null);
if (audit?.status !== 'PASS') fail('source-audit-status', audit?.status ?? null);

const expectedCounts = { canonical: 224, normal: 168, sp: 56 };
if (canonicalIds.length !== expectedCounts.canonical) fail('canonical-soldier-count', canonicalIds.length);
if (records.length !== expectedCounts.canonical || manifestIds.length !== expectedCounts.canonical) fail('manifest-record-count', { records: records.length, uniqueIds: manifestIds.length });
if (!sameJson(manifestIds, canonicalIds)) fail('canonical-id-parity', { canonical: canonicalIds.length, manifest: manifestIds.length });

const coverage = manifest?.coverage || {};
const coverageChecks = {
  canonicalSoldierCount: 224,
  canonicalNormalCount: 168,
  canonicalSpCount: 56,
  resolvedCount: 224,
  unresolvedCount: 0,
  resolvedNormalCount: 168,
  resolvedSpCount: 56,
};
for (const [key, expected] of Object.entries(coverageChecks)) {
  if (coverage[key] !== expected) fail(`coverage-${key}`, { expected, actual: coverage[key] ?? null });
}
if (coverage?.sourceCounts?.BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9 !== 224) {
  fail('coverage-source-family', coverage?.sourceCounts ?? null);
}

const auditChecks = {
  canonicalCount: 224,
  normalCount: 168,
  spCount: 56,
  cleanResolvedCount: 224,
  unresolvedCount: 0,
};
for (const [key, expected] of Object.entries(auditChecks)) {
  if (audit[key] !== expected) fail(`audit-${key}`, { expected, actual: audit[key] ?? null });
}
if (!Array.isArray(audit?.unresolved) || audit.unresolved.length !== 0) fail('audit-unresolved', audit?.unresolved ?? null);

const policy = manifest?.policy || {};
const requiredPolicy = {
  noGuessing: true,
  generatedImageUsed: false,
  backgroundRemovalUsed: false,
  syntheticEditingUsed: false,
  nameSimilarityUsed: false,
  idArithmeticUsed: false,
  normalSpPortraitReuse: false,
  allPortraitsUseOneSourceFamily: true,
};
for (const [key, expected] of Object.entries(requiredPolicy)) {
  if (policy[key] !== expected) fail(`policy-${key}`, { expected, actual: policy[key] ?? null });
}
if (policy?.identityJoin !== 'canonical Soldier ID -> ConfigDataSoldierInfo exact ID -> exact current Chinese Name') {
  fail('identity-join-policy', policy?.identityJoin ?? null);
}

const gate = policy?.transparencyGate || {};
const auditGate = audit?.thresholds || {};
const expectedGate = {
  minimumTransparentPixelRatio: 0.08,
  minimumBorderTransparentPixelRatio: 0.5,
  requiredTransparentCorners: 3,
};
if (gate.sourceMustBePng !== true || gate.sourceMustContainAlpha !== true) fail('source-format-gate', gate);
for (const [key, expected] of Object.entries(expectedGate)) {
  if (gate[key] !== expected) fail(`manifest-gate-${key}`, { expected, actual: gate[key] ?? null });
  if (auditGate[key] !== expected) fail(`audit-gate-${key}`, { expected, actual: auditGate[key] ?? null });
}

let normalCount = 0;
let spCount = 0;
const seenDerivativeNames = new Set();
for (const record of records) {
  const soldierId = record?.soldierId;
  if (!Number.isInteger(soldierId)) {
    fail('record-invalid-soldier-id', soldierId ?? null);
    continue;
  }
  if (record?.isSp === true) spCount += 1;
  else if (record?.isSp === false) normalCount += 1;
  else fail('record-invalid-sp-flag', soldierId);

  if (record?.sourceKind !== 'BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9') fail('record-source-kind', soldierId);
  if (typeof record?.sourceFileName !== 'string' || !record.sourceFileName.endsWith('.png')) fail('record-source-file', soldierId);
  if (typeof record?.sourceUrl !== 'string' || !/^https:\/\//.test(record.sourceUrl)) fail('record-source-url', soldierId);
  if (record?.fileName !== `${soldierId}.png`) fail('record-derivative-filename', { soldierId, fileName: record?.fileName ?? null });
  if (record?.sourceFileName === record?.fileName) fail('source-derivative-name-not-separated', soldierId);
  if (seenDerivativeNames.has(record?.fileName)) fail('duplicate-derivative-filename', record?.fileName ?? null);
  seenDerivativeNames.add(record?.fileName);
  if (record?.resolutionMethod !== 'CANONICAL_ID_TO_CONFIGDATA_EXACT_CN_NAME_TO_BWIKI_EXACT_TRANSPARENT_FILE') fail('record-resolution-method', soldierId);
  if (!Number.isInteger(record?.size) || record.size <= 0) fail('record-size', soldierId);
  if (!Number.isInteger(record?.width) || record.width <= 0 || !Number.isInteger(record?.height) || record.height <= 0) fail('record-dimensions', soldierId);
  if (typeof record?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) fail('record-sha256', soldierId);
  if (record?.sourceHasAlpha !== true) fail('record-alpha', soldierId);
  if (!Number.isFinite(record?.transparentPixelRatio) || record.transparentPixelRatio < expectedGate.minimumTransparentPixelRatio) fail('record-transparent-ratio', soldierId);
  if (!Number.isFinite(record?.borderTransparentPixelRatio) || record.borderTransparentPixelRatio < expectedGate.minimumBorderTransparentPixelRatio) fail('record-border-transparent-ratio', soldierId);
  if (!Number.isInteger(record?.transparentCornerCount) || record.transparentCornerCount < expectedGate.requiredTransparentCorners) fail('record-transparent-corners', soldierId);
}
if (normalCount !== expectedCounts.normal || spCount !== expectedCounts.sp) fail('record-normal-sp-counts', { normalCount, spCount });

if (errors.length) {
  console.error(`SOLDIER PORTRAIT V9 FINAL VALIDATION: FAIL (${errors.length})`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error.code}: ${JSON.stringify(error.detail)}`);
  process.exit(1);
}

console.log('SOLDIER PORTRAIT V9 FINAL VALIDATION: PASS');
console.log(JSON.stringify({ canonical: 224, normal: 168, sp: 56, resolved: 224, unresolved: 0, sourceFamily: 'BWIKI_CURRENT_CN_EXACT_TRANSPARENT_PNG_V9' }, null, 2));
