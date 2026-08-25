'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'configdata');
const FILES = [
  'ConfigDataSoldierInfo.json','ConfigDataSPSoldierInfo.json','ConfigDataTrainingTechInfo.json',
  'ConfigDataTrainingTechLevelInfo.json','ConfigDataMissionInfo.json','ConfigDataMissionSumitItemInfo.json','ConfigDataSPHeroInfo.json',
];
function compact(v) {
  if (Array.isArray(v)) return v.slice(0, 4).map(x => x && typeof x === 'object' ? compact(x) : x);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k, compact(x)]));
  return v;
}
const result = {};
for (const filename of FILES) {
  const raw = JSON.parse(fs.readFileSync(path.join(CONFIG, filename), 'utf8'));
  const records = Array.isArray(raw) ? raw : Array.isArray(raw?.records) ? raw.records : Array.isArray(raw?.data) ? raw.data : [];
  const unionKeys = [...new Set(records.flatMap(r => Object.keys(r || {})))].sort();
  const maxRecord = records.reduce((best, r) => Object.keys(r || {}).length > Object.keys(best || {}).length ? r : best, null);
  result[filename] = { recordCount: records.length, unionKeys, maxRecord: compact(maxRecord) };
}
console.log('PARSED_SOLDIER_UNION_BEGIN');
console.log(JSON.stringify(result, null, 2));
console.log('PARSED_SOLDIER_UNION_END');
