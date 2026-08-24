'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'configdata');

const FILES = [
  'ConfigDataHeroInfo.json',
  'ConfigDataJobInfo.json',
  'ConfigDataJobConnectionInfo.json',
  'ConfigDataJobLevelInfo.json',
  'ConfigDataSkillInfo.json',
  'ConfigDataAwakenInfo.json',
  'ConfigDataSPHeroInfo.json',
  'ConfigDataMissionExtSPHeroInfo.json',
  'ConfigDataMissionInfo.json',
];

function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (depth >= 2) return `array(${value.length})`;
    return {
      type: 'array',
      length: value.length,
      item: value.length ? shape(value[0], depth + 1) : null,
    };
  }
  if (typeof value !== 'object') return typeof value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (Array.isArray(v)) out[key] = depth >= 2 ? `array(${v.length})` : shape(v, depth + 1);
    else if (v && typeof v === 'object') out[key] = depth >= 2 ? 'object' : shape(v, depth + 1);
    else out[key] = v === null ? 'null' : typeof v;
  }
  return out;
}

function sampleScalarValues(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const out = {};
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    if (['string', 'number', 'boolean'].includes(typeof v) || v === null) out[key] = v;
    else if (Array.isArray(v)) out[key] = `[array:${v.length}]`;
    else out[key] = '[object]';
  }
  return out;
}

const result = {};
for (const filename of FILES) {
  const file = path.join(CONFIG, filename);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.records)
      ? raw.records
      : Array.isArray(raw?.data)
        ? raw.data
        : null;
  result[filename] = {
    rootType: Array.isArray(raw) ? 'array' : typeof raw,
    rootKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw).sort() : [],
    recordCount: records ? records.length : null,
    firstRecordShape: records?.length ? shape(records[0]) : shape(raw),
    firstRecordValues: records?.length ? sampleScalarValues(records[0]) : sampleScalarValues(raw),
  };
}

console.log('PARSED_CONFIGDATA_SCHEMA_BEGIN');
console.log(JSON.stringify(result, null, 2));
console.log('PARSED_CONFIGDATA_SCHEMA_END');
