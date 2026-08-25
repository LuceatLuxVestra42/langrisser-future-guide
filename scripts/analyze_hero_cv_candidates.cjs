'use strict';

const fs = require('fs');
const path = require('path');

const configDir = path.join('data', 'configdata');
const heroMasterPath = path.join('data', 'hero-name-master.v1.json');
const outPath = path.join('data', 'validation', 'hero-page-stage5-5-2-cv-candidates.v1.json');

const heroMasterRoot = JSON.parse(fs.readFileSync(heroMasterPath, 'utf8'));
const heroRows = Array.isArray(heroMasterRoot) ? heroMasterRoot : (heroMasterRoot.records || []);
const heroIds = new Set(heroRows.map(r => Number(r.heroId)).filter(Number.isFinite));

const filenameSemanticRe = /(CV|Voice|Sound|Audio|Actor|Speaker|Dub|Dubbing|Seiyu|Seiyuu|Hero|Character|Biography|Archive|Chat|Dialogue|Dialog|Talk|Language|Japanese|Jp)/i;
const heroFieldRe = /(Hero|Character|Role|Unit).*(ID|Id|Ids|_ID|_IDs)|^(Hero|Character|Role|Unit)(ID|Id|Ids|_ID|_IDs)$/i;
const cvFieldRe = /(^|_)(CV|Voice|VoiceActor|Actor|Speaker|Dub|Dubbing|Seiyu|Seiyuu|Sound|Audio|Japanese|Jp)(_|$)|CV|Voice|VoiceActor|Speaker|Seiyu|Seiyuu|Dubbing/i;
const textualSemanticRe = /(Name|CV|Voice|Actor|Speaker|Seiyu|Seiyuu|Text|Desc|Title|Language|Lang)/i;
const excludedHeroFieldsRe = /(Image|Skin|Fetter|Biography|Information|Production|Skill|Level|Stage|Battle|Event|Reward|Unlock|ArchiveShow)/i;

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
  const presentValues = [];
  for (const row of records) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) presentValues.push(row[key]);
  }
  const flat = [];
  for (const v of presentValues) flattenPrimitive(v, flat);
  const numeric = flat.map(v => typeof v === 'boolean' ? NaN : Number(v)).filter(Number.isFinite);
  const distinctNumeric = [...new Set(numeric)];
  const heroMatches = distinctNumeric.filter(v => heroIds.has(v));
  const strings = flat.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean);
  const distinctStrings = [...new Set(strings)];
  const kinds = {};
  const arrayLengths = {};
  for (const v of presentValues) {
    const kind = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (Array.isArray(v)) arrayLengths[v.length] = (arrayLengths[v.length] || 0) + 1;
  }
  return {
    field: key,
    presentCount: presentValues.length,
    kinds,
    arrayLengths: Object.keys(arrayLengths).length ? arrayLengths : undefined,
    distinctPrimitiveCount: new Set(flat.map(v => JSON.stringify(v))).size,
    numericDistinctCount: distinctNumeric.length,
    heroIdOverlapCount: heroMatches.length,
    heroIdOverlapRate: heroIds.size ? Number((heroMatches.length / heroIds.size).toFixed(4)) : 0,
    sampleHeroIds: heroMatches.slice(0, 20),
    stringDistinctCount: distinctStrings.length,
    sampleStrings: distinctStrings.slice(0, 20),
    sampleValues: [...new Set(flat.map(v => JSON.stringify(v)))].slice(0, 20).map(s => JSON.parse(s))
  };
}

function likelyHumanNameString(s) {
  if (!s || s.length < 2 || s.length > 80) return false;
  if (/^(UI\/|Assets\/|Audio\/|Sound\/|Voice\/|[A-Za-z0-9_./-]+\.(wav|mp3|ogg|png|prefab|asset))$/i.test(s)) return false;
  if (/^[0-9_./:-]+$/.test(s)) return false;
  if (/<color|<size|\\n|\{\d+\}/i.test(s)) return false;
  // Japanese/Chinese/Korean personal-name characters or spaced Latin names are useful diagnostics,
  // but this is only a ranking hint and never a semantic assertion.
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s) || /^[A-Za-z][A-Za-z.' -]{2,40}$/.test(s);
}

const files = fs.readdirSync(configDir)
  .filter(name => name.endsWith('.json'))
  .map(name => ({ name, path: path.join(configDir, name), size: fs.statSync(path.join(configDir, name)).size }));

const tables = [];
const skipped = [];
for (const file of files) {
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
  if (!records.length || !records.some(r => r && typeof r === 'object' && !Array.isArray(r))) continue;

  const sampleRecords = records.slice(0, 5000);
  const keys = [...new Set(sampleRecords.flatMap(r => r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : []))].sort();
  const filenameSemantic = filenameSemanticRe.test(file.name);
  const semanticKeys = keys.filter(k => heroFieldRe.test(k) || cvFieldRe.test(k) || textualSemanticRe.test(k));
  if (!filenameSemantic && semanticKeys.length === 0) continue;

  const analyzed = new Map();
  const getField = key => {
    if (!analyzed.has(key)) analyzed.set(key, analyzeField(records, key));
    return analyzed.get(key);
  };

  const heroFields = keys
    .filter(k => heroFieldRe.test(k) && !excludedHeroFieldsRe.test(k))
    .map(getField)
    .filter(f => f.heroIdOverlapCount > 0)
    .sort((a, b) => b.heroIdOverlapCount - a.heroIdOverlapCount || b.presentCount - a.presentCount);

  const cvFields = keys
    .filter(k => cvFieldRe.test(k))
    .map(getField)
    .sort((a, b) => b.stringDistinctCount - a.stringDistinctCount || b.presentCount - a.presentCount);

  const textFields = keys
    .filter(k => textualSemanticRe.test(k))
    .map(getField)
    .filter(f => f.stringDistinctCount > 0)
    .map(f => ({
      ...f,
      humanNameLikeSampleCount: f.sampleStrings.filter(likelyHumanNameString).length,
      humanNameLikeSamples: f.sampleStrings.filter(likelyHumanNameString).slice(0, 12)
    }))
    .filter(f => f.humanNameLikeSampleCount > 0 || cvFieldRe.test(f.field))
    .sort((a, b) => b.humanNameLikeSampleCount - a.humanNameLikeSampleCount || b.stringDistinctCount - a.stringDistinctCount);

  const bestHeroOverlap = heroFields[0]?.heroIdOverlapCount || 0;
  const cvStringFields = cvFields.filter(f => f.stringDistinctCount > 0);
  const cvNumericFields = cvFields.filter(f => f.numericDistinctCount > 0 && f.stringDistinctCount === 0);
  const semanticScore =
    bestHeroOverlap * 1000 +
    cvStringFields.length * 50000 +
    cvNumericFields.length * 5000 +
    textFields.reduce((sum, f) => sum + Math.min(f.humanNameLikeSampleCount, 10) * 500, 0) +
    (filenameSemantic ? 1000 : 0);

  if (heroFields.length || cvFields.length || (filenameSemantic && textFields.length)) {
    tables.push({
      file: file.name,
      size: file.size,
      recordCount: records.length,
      semanticScore,
      bestHeroIdOverlapCount: bestHeroOverlap,
      bestHeroIdOverlapRate: heroIds.size ? Number((bestHeroOverlap / heroIds.size).toFixed(4)) : 0,
      heroReferenceFields: heroFields.slice(0, 12),
      cvSemanticFields: cvFields.slice(0, 20),
      textCandidateFields: textFields.slice(0, 20),
      fieldNames: keys
    });
  }
}

tables.sort((a, b) => b.semanticScore - a.semanticScore || b.bestHeroIdOverlapCount - a.bestHeroIdOverlapCount || a.file.localeCompare(b.file));

const strongCandidates = tables.filter(t =>
  t.bestHeroIdOverlapCount >= 3 &&
  (t.cvSemanticFields.length > 0 || t.textCandidateFields.some(f => f.humanNameLikeSampleCount > 0))
).slice(0, 60);

const out = {
  version: 1,
  purpose: 'Find authoritative Hero CV/voice-actor source candidates without converting numeric resource IDs into actor names.',
  policy: {
    numericVoiceIdsArePointersOnly: true,
    requireAuthoritativeNameMappingBeforeCvEmission: true,
    rankingIsDiagnosticNotSemanticProof: true
  },
  playableHeroIdCount: heroIds.size,
  configJsonFileCount: files.length,
  analyzedTableCount: tables.length,
  skipped,
  strongCandidates,
  rankedTables: tables.slice(0, 100)
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

console.log(JSON.stringify({
  playableHeroIdCount: out.playableHeroIdCount,
  configJsonFileCount: out.configJsonFileCount,
  analyzedTableCount: out.analyzedTableCount,
  skippedCount: out.skipped.length,
  strongCandidates: out.strongCandidates.slice(0, 15).map(t => ({
    file: t.file,
    recordCount: t.recordCount,
    bestHeroIdOverlapCount: t.bestHeroIdOverlapCount,
    heroReferenceFields: t.heroReferenceFields.slice(0, 3).map(f => ({ field: f.field, overlap: f.heroIdOverlapCount })),
    cvSemanticFields: t.cvSemanticFields.slice(0, 5).map(f => ({ field: f.field, strings: f.stringDistinctCount, numeric: f.numericDistinctCount, samples: f.sampleStrings.slice(0, 5) })),
    textCandidateFields: t.textCandidateFields.slice(0, 5).map(f => ({ field: f.field, samples: f.humanNameLikeSamples.slice(0, 5) }))
  })),
  output: outPath
}, null, 2));
