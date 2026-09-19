'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const catalog = readJson('data/generated/hero-casting-law-materials.v1.json');
const manifest = readJson('data/manifests/hero-casting-law-material-icons.v1.json');
const errors = [];

if (catalog?.status !== 'PASS' || !Array.isArray(catalog?.templates) || catalog.templates.length !== 50) {
  errors.push('Casting Law material catalog is not PASS/50 templates.');
}
if (
  manifest?.version !== 1 ||
  manifest?.schemaId !== 'hero-casting-law-material-icons/v1' ||
  manifest?.status !== 'PASS' ||
  manifest?.completion !== 'MAPPED_EXTERNAL' ||
  !Array.isArray(manifest?.records)
) {
  errors.push('Casting Law material icon manifest identity/status mismatch.');
}

const expected = new Map();
for (const template of catalog.templates || []) {
  for (const level of template.levels || []) {
    for (const material of level.materials || []) {
      const row = {
        itemId: material.id,
        nameCn: material.item?.nameCn ?? null,
        rank: material.item?.rank ?? null,
        sourceIconPath: material.item?.icon ?? null,
      };
      const prior = expected.get(row.itemId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(row)) {
        errors.push(`Catalog item ${row.itemId} has conflicting icon metadata.`);
      } else {
        expected.set(row.itemId, row);
      }
    }
  }
}

const actual = new Map();
const driveIds = new Set();
for (const record of manifest.records || []) {
  if (!Number.isSafeInteger(record?.itemId) || record.itemId <= 0 || actual.has(record.itemId)) {
    errors.push(`Manifest invalid/duplicate itemId=${String(record?.itemId)}`);
    continue;
  }
  const sourceBase = typeof record.sourceIconPath === 'string' ? record.sourceIconPath.split('/').pop() : null;
  if (sourceBase !== record.sourceIconFileName) {
    errors.push(`Item ${record.itemId}: source basename mismatch.`);
  }
  if (record.driveFolderId !== '1YtHeEsA4RUB8dMNyQHypGVXWJCL3Ur1j') {
    errors.push(`Item ${record.itemId}: Drive folder provenance mismatch.`);
  }
  if (!record.driveFileId || driveIds.has(record.driveFileId)) {
    errors.push(`Item ${record.itemId}: missing/duplicate Drive file ID.`);
  } else {
    driveIds.add(record.driveFileId);
  }
  if (!Number.isSafeInteger(record.driveFileSize) || record.driveFileSize <= 0) {
    errors.push(`Item ${record.itemId}: invalid Drive file size.`);
  }
  if (
    record.deliveryMode !== 'GOOGLE_DRIVE_PUBLIC_IMAGE' ||
    record.deliveryUrl !== `https://drive.google.com/uc?export=view&id=${record.driveFileId}`
  ) {
    errors.push(`Item ${record.itemId}: delivery locator mismatch.`);
  }
  actual.set(record.itemId, record);
}

if (expected.size !== 45) errors.push(`Catalog distinct material item count=${expected.size}, expected=45.`);
if (actual.size !== expected.size) errors.push(`Manifest record count=${actual.size}, expected=${expected.size}.`);

for (const [itemId, source] of expected) {
  const record = actual.get(itemId);
  if (!record) {
    errors.push(`Catalog item ${itemId}: icon mapping missing.`);
    continue;
  }
  if (
    record.nameCn !== source.nameCn ||
    record.rank !== source.rank ||
    record.sourceIconPath !== source.sourceIconPath
  ) {
    errors.push(`Catalog item ${itemId}: frozen item/icon parity mismatch.`);
  }
}

for (const itemId of actual.keys()) {
  if (!expected.has(itemId)) errors.push(`Manifest extra itemId=${itemId}.`);
}

const summary = manifest.summary || {};
if (
  summary.required !== 45 ||
  summary.matched !== 45 ||
  summary.unresolved !== 0 ||
  summary.uniqueItemIds !== 45 ||
  summary.uniqueDriveFileIds !== 45
) {
  errors.push('Manifest summary mismatch.');
}

console.log(`HERO CASTING LAW MATERIAL ICON VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
console.log(`catalogItems=${expected.size} manifestItems=${actual.size} driveIds=${driveIds.size} errors=${errors.length}`);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
