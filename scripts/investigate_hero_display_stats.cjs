'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MISSION = path.join(ROOT, 'data', 'configdata', 'ConfigDataMissionInfo.json');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');
const TARGET_IDS = [5001, 5002, 5003, 5004, 5007, 5008, 5010, 5011, 5012];

const raw = JSON.parse(fs.readFileSync(MISSION, 'utf8'));
const records = Array.isArray(raw) ? raw : (raw.records || []);
const targets = records.filter((row) => TARGET_IDS.includes(Number(row.ID))).sort((a, b) => Number(a.ID) - Number(b.ID));
const byId = new Map(targets.map((row) => [Number(row.ID), row]));
const missingIds = TARGET_IDS.filter((id) => !byId.has(id));

const allKeys = [...new Set(targets.flatMap((row) => Object.keys(row)))].sort();
const paramKeys = allKeys.filter((key) => /param|hero|level|mission|task|dungeon|battle|stage|jump/i.test(key));

const compact = targets.map((row) => ({
  ID: row.ID,
  Title: row.Title ?? null,
  Desc: row.Desc ?? null,
  MissionType: row.MissionType ?? null,
  Param1: row.Param1 ?? null,
  Param2: row.Param2 ?? null,
  Param3: row.Param3 ?? null,
  MissionExtentionParm1: row.MissionExtentionParm1 ?? null,
  MissionExtentionParm2: row.MissionExtentionParm2 ?? null,
  MissionExtentionParm3: row.MissionExtentionParm3 ?? null,
  MissionUnlockPreTaskID: row.MissionUnlockPreTaskID ?? null,
  MissionUnlockPlayerLvl: row.MissionUnlockPlayerLvl ?? null,
  MissionPeriod: row.MissionPeriod ?? null,
  MissionColumn: row.MissionColumn ?? null,
}));

const result = {
  version: 3,
  status: missingIds.length ? 'PARTIAL' : 'FOUND_ALL',
  purpose: 'Resolve HeroFetter Mission condition Parm1 values against ConfigDataMissionInfo.ID and expose all mission fields needed for the next required-hero join.',
  source: 'data/configdata/ConfigDataMissionInfo.json',
  sourceRecordCount: records.length,
  targetIds: TARGET_IDS,
  foundIds: targets.map((x) => Number(x.ID)),
  missingIds,
  allKeys,
  paramLikeKeys: paramKeys,
  compact,
  records: targets,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, sourceRecordCount: result.sourceRecordCount, missingIds, compact, paramLikeKeys: paramKeys }, null, 2));
