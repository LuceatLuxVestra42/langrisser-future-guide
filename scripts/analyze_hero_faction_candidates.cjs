'use strict';

const fs = require('fs');
const path = require('path');

const configDir = path.join('data', 'configdata');
const heroMaster = JSON.parse(fs.readFileSync(path.join('data', 'hero-name-master.v1.json'), 'utf8'));
const masterRows = Array.isArray(heroMaster) ? heroMaster : heroMaster.records;
const heroIds = new Set(masterRows.map(r => Number(r.heroId)).filter(Number.isFinite));

const filenameRe = /(Hero|Camp|Faction|Team|Party|Battle|Group|Relation|Actor|Clause|Force|Army|Power|League|Bond|Tag|Belong|Production|Story|Type)/i;
const files = fs.readdirSync(configDir)
  .filter(name => name.endsWith('.json'))
  .map(name => ({
    name,
    path: path.join(configDir, name),
    size: fs.statSync(path.join(configDir, name)).size
  }));

const shortlisted = files.filter(f => filenameRe.test(f.name));

function recordsOf(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  for (const k of ['records', 'data', 'items', 'list', 'values']) {
    if (Array.isArray(root[k])) return root[k];
  }
  return [];
}

function flattenPrimitive(v, out, depth = 0) {
  if (depth > 2 || v === null || v === undefined) return;
  if (Array.isArray(v)) {
    for (const x of v) flattenPrimitive(x, out, depth + 1);
    return;
  }
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out.push(v);
}

function analyzeField(records, key) {
  const present = records.filter(r => r && Object.prototype.hasOwnProperty.call(r, key));
  const values = present.map(r => r[key]);
  const flat = [];
  for (const v of values) flattenPrimitive(v, flat);

  const numeric = flat.map(Number).filter(Number.isFinite);
  const distinctNumeric = [...new Set(numeric)];
  const heroMatches = distinctNumeric.filter(v => heroIds.has(v));

  const serialized = [...new Set(flat.map(v => JSON.stringify(v)))];
  const kinds = {};
  for (const v of values) {
    const kind = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
    kinds[kind] = (kinds[kind] || 0) + 1;
  }
  const arrayLengths = {};
  for (const v of values.filter(Array.isArray)) arrayLengths[v.length] = (arrayLengths[v.length] || 0) + 1;

  return {
    field: key,
    presentCount: present.length,
    kinds,
    arrayLengths: Object.keys(arrayLengths).length ? arrayLengths : undefined,
    distinctPrimitiveCount: serialized.length,
    sampleValues: serialized.slice(0, 12).map(s => JSON.parse(s)),
    numericDistinctCount: distinctNumeric.length,
    heroIdOverlapCount: heroMatches.length,
    heroIdOverlapRate: heroIds.size ? Number((heroMatches.length / heroIds.size).toFixed(4)) : 0,
    sampleHeroIds: heroMatches.slice(0, 20)
  };
}

const tableResults = [];
const skipped = [];
for (const file of shortlisted) {
  // Large candidate tables are still allowed up to 80 MiB; beyond that, skip rather than risk the workflow.
  if (file.size > 80 * 1024 * 1024) {
    skipped.push({ file: file.name, size: file.size, reason: 'over_80_mib' });
    continue;
  }
  let root;
  try {
    root = JSON.parse(fs.readFileSync(file.path, 'utf8'));
  } catch (error) {
    skipped.push({ file: file.name, size: file.size, reason: 'parse_error', error: String(error.message || error) });
    continue;
  }
  const records = recordsOf(root);
  if (!records.length || typeof records[0] !== 'object') {
    tableResults.push({ file: file.name, size: file.size, recordCount: records.length, fields: [], note: 'no_object_records' });
    continue;
  }

  const keys = [...new Set(records.slice(0, 5000).flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))].sort();
  const fields = keys.map(key => analyzeField(records, key));
  const heroRefFields = fields
    .filter(f => f.heroIdOverlapCount > 0)
    .sort((a, b) => b.heroIdOverlapCount - a.heroIdOverlapCount || b.presentCount - a.presentCount);
  const compactClassifiers = fields
    .filter(f => f.distinctPrimitiveCount > 1 && f.distinctPrimitiveCount <= 40)
    .sort((a, b) => a.distinctPrimitiveCount - b.distinctPrimitiveCount || a.field.localeCompare(b.field));

  const bestOverlap = heroRefFields[0]?.heroIdOverlapCount || 0;
  tableResults.push({
    file: file.name,
    size: file.size,
    recordCount: records.length,
    bestHeroIdOverlapCount: bestOverlap,
    bestHeroIdOverlapRate: heroIds.size ? Number((bestOverlap / heroIds.size).toFixed(4)) : 0,
    heroReferenceFields: heroRefFields.slice(0, 12),
    compactClassifierFields: compactClassifiers.slice(0, 30),
    fieldNames: keys
  });
}

tableResults.sort((a, b) => b.bestHeroIdOverlapCount - a.bestHeroIdOverlapCount || a.file.localeCompare(b.file));

const topCandidates = tableResults
  .filter(t => t.bestHeroIdOverlapCount >= 3)
  .slice(0, 40);

const out = {
  version: 1,
  purpose: 'Find faction/camp relation candidates without asserting semantics.',
  playableHeroIdCount: heroIds.size,
  configJsonFileCount: files.length,
  shortlistedFileCount: shortlisted.length,
  shortlistRegex: String(filenameRe),
  skipped,
  topCandidates,
  shortlistedFiles: shortlisted.map(f => ({ file: f.name, size: f.size }))
};

const outPath = path.join('data', 'validation', 'hero-page-stage5-5-2-faction-candidates.v1.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

console.log(JSON.stringify({
  playableHeroIdCount: out.playableHeroIdCount,
  configJsonFileCount: out.configJsonFileCount,
  shortlistedFileCount: out.shortlistedFileCount,
  skippedCount: out.skipped.length,
  topCandidates: topCandidates.slice(0, 12).map(t => ({
    file: t.file,
    recordCount: t.recordCount,
    bestHeroIdOverlapCount: t.bestHeroIdOverlapCount,
    bestHeroIdOverlapRate: t.bestHeroIdOverlapRate,
    heroReferenceFields: t.heroReferenceFields.slice(0, 3).map(f => ({ field: f.field, overlap: f.heroIdOverlapCount }))
  })),
  output: outPath
}, null, 2));
