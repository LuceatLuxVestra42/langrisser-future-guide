'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'configdata');
const FILES = [
  'ConfigDataSoldierInfo.json',
  'ConfigDataSPSoldierInfo.json',
  'ConfigDataTrainingTechInfo.json',
  'ConfigDataTrainingTechLevelInfo.json',
  'ConfigDataMissionInfo.json',
  'ConfigDataMissionSumitItemInfo.json',
  'ConfigDataSPHeroInfo.json',
];

function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (depth >= 3) return `array(${value.length})`;
    return { type: 'array', length: value.length, item: value.length ? shape(value[0], depth + 1) : null };
  }
  if (typeof value !== 'object') return typeof value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (Array.isArray(v)) out[key] = depth >= 3 ? `array(${v.length})` : shape(v, depth + 1);
    else if (v && typeof v === 'object') out[key] = depth >= 3 ? 'object' : shape(v, depth + 1);
    else out[key] = v === null ? 'null' : typeof v;
  }
  return out;
}

function sample(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === null || ['string','number','boolean'].includes(typeof v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 2);
    else out[k] = v;
  }
  return out;
}

const result = {};
for (const filename of FILES) {
  const raw = JSON.parse(fs.readFileSync(path.join(CONFIG, filename), 'utf8'));
  const records = Array.isArray(raw) ? raw : Array.isArray(raw?.records) ? raw.records : Array.isArray(raw?.data) ? raw.data : null;
  result[filename] = {
    rootType: Array.isArray(raw) ? 'array' : typeof raw,
    rootKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw).sort() : [],
    recordCount: records?.length ?? null,
    firstRecordShape: records?.length ? shape(records[0]) : shape(raw),
    firstRecordValues: records?.length ? sample(records[0]) : sample(raw),
  };
}

console.log('PARSED_SOLDIER_SCHEMA_BEGIN');
console.log(JSON.stringify(result, null, 2));
console.log('PARSED_SOLDIER_SCHEMA_END');
