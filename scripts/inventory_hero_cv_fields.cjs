'use strict';

const fs = require('fs');
const path = require('path');

const configDir = path.join('data', 'configdata');
const heroMasterRoot = JSON.parse(fs.readFileSync(path.join('data', 'hero-name-master.v1.json'), 'utf8'));
const heroRows = Array.isArray(heroMasterRoot) ? heroMasterRoot : (heroMasterRoot.records || []);
const heroIds = new Set(heroRows.map(r => Number(r.heroId)).filter(Number.isFinite));
const outPath = path.join('data', 'validation', 'hero-page-stage5-5-2-cv-field-inventory.v1.json');

const actorFieldRe = /(CV|VoiceActor|Actor|Speaker|Seiyu|Seiyuu|Dubber|Dubbing|Dublador|Cast)/i;
const voiceFieldRe = /(Voice|Sound|Audio|Vocal|Speech)/i;
const tableNameRe = /(CV|Voice|Sound|Audio|Actor|Speaker|Dub|Seiyu|Cast)/i;
const heroFieldRe = /(Hero|Character|Role|Unit).*(ID|Id|Ids|_ID|_IDs)|^(Hero|Character|Role|Unit)(ID|Id|Ids|_ID|_IDs)$/i;

function recordsOf(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  for (const k of ['records', 'data', 'items', 'list', 'values']) if (Array.isArray(root[k])) return root[k];
  return [];
}

function flatten(v, out, depth = 0) {
  if (depth > 2 || v == null) return;
  if (Array.isArray(v)) return v.forEach(x => flatten(x, out, depth + 1));
  if (['string', 'number', 'boolean'].includes(typeof v)) out.push(v);
}

function summarizeField(records, key) {
  const raw = records.filter(r => r && Object.prototype.hasOwnProperty.call(r, key)).map(r => r[key]);
  const flat = [];
  raw.forEach(v => flatten(v, flat));
  const strings = [...new Set(flat.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean))];
  const nums = [...new Set(flat.map(v => typeof v === 'boolean' ? NaN : Number(v)).filter(Number.isFinite))];
  const overlaps = nums.filter(v => heroIds.has(v));
  const kinds = {};
  raw.forEach(v => {
    const k = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
    kinds[k] = (kinds[k] || 0) + 1;
  });
  return {
    field: key,
    presentCount: raw.length,
    kinds,
    distinctStrings: strings.length,
    sampleStrings: strings.slice(0, 15),
    distinctNumeric: nums.length,
    sampleNumeric: nums.slice(0, 15),
    heroIdOverlapCount: overlaps.length,
    sampleHeroIds: overlaps.slice(0, 15)
  };
}

const tables = [];
const skipped = [];
for (const name of fs.readdirSync(configDir).filter(n => n.endsWith('.json'))) {
  const filePath = path.join(configDir, name);
  const size = fs.statSync(filePath).size;
  if (size > 80 * 1024 * 1024) {
    skipped.push({ file: name, size, reason: 'over_80_mib' });
    continue;
  }
  let root;
  try { root = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { skipped.push({ file: name, size, reason: 'parse_error' }); continue; }
  const records = recordsOf(root);
  if (!records.length) continue;
  const keys = [...new Set(records.slice(0, 5000).flatMap(r => r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : []))].sort();
  const actorKeys = keys.filter(k => actorFieldRe.test(k));
  const voiceKeys = keys.filter(k => voiceFieldRe.test(k));
  if (!tableNameRe.test(name) && !actorKeys.length && !voiceKeys.length) continue;
  const heroKeys = keys.filter(k => heroFieldRe.test(k));
  const identityKeys = keys.filter(k => /^(ID|Id|Name|Title|Language|Lang|Type|HeroID|HeroId|Hero_ID|CharacterID|CharacterId)$/i.test(k));
  const actorFields = actorKeys.map(k => summarizeField(records, k));
  const voiceFields = voiceKeys.filter(k => !actorKeys.includes(k)).map(k => summarizeField(records, k));
  const heroFields = heroKeys.map(k => summarizeField(records, k)).filter(f => f.heroIdOverlapCount > 0);
  const identityFields = identityKeys.map(k => summarizeField(records, k));
  const actorStringCount = actorFields.reduce((n, f) => n + f.distinctStrings, 0);
  const actorNumericCount = actorFields.reduce((n, f) => n + f.distinctNumeric, 0);
  const heroOverlap = Math.max(0, ...heroFields.map(f => f.heroIdOverlapCount));
  const score = actorStringCount * 100000 + actorNumericCount * 10000 + heroOverlap * 1000 + (tableNameRe.test(name) ? 100 : 0);
  tables.push({
    file: name,
    size,
    recordCount: records.length,
    score,
    actorSemanticFields: actorFields,
    voiceResourceFields: voiceFields,
    heroReferenceFields: heroFields,
    identityFields,
    fieldNames: keys
  });
}

tables.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

const out = {
  version: 1,
  purpose: 'Compact inventory of CV/voice/actor-related ConfigData fields. Actor-name semantics remain unasserted until joins are validated.',
  playableHeroIdCount: heroIds.size,
  tableCount: tables.length,
  skipped,
  actorSemanticTables: tables.filter(t => t.actorSemanticFields.length > 0),
  voiceOnlyTables: tables.filter(t => t.actorSemanticFields.length === 0 && t.voiceResourceFields.length > 0)
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  tableCount: out.tableCount,
  actorSemanticTables: out.actorSemanticTables.map(t => ({
    file: t.file,
    recordCount: t.recordCount,
    actorFields: t.actorSemanticFields.map(f => ({ field: f.field, strings: f.distinctStrings, numeric: f.distinctNumeric, samples: f.sampleStrings.slice(0, 8) })),
    heroFields: t.heroReferenceFields.map(f => ({ field: f.field, overlap: f.heroIdOverlapCount }))
  })),
  voiceOnlyTableCount: out.voiceOnlyTables.length,
  output: outPath
}, null, 2));
