'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'data', 'configdata');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');
const TARGET_IDS = new Set([53, 54, 55, 105, 133, 147]);
const NAME_FILTER = /level|dungeon|story|gate|chapter|fate|plot|stage|battle|task|quest|scenario|episode/i;

function asRecords(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  return [];
}

const allFiles = fs.readdirSync(CONFIG_DIR).filter((name) => name.endsWith('.json')).sort();
const candidateFiles = allFiles.filter((name) => NAME_FILTER.test(name));
const hits = [];
const parseErrors = [];

for (const file of candidateFiles) {
  const full = path.join(CONFIG_DIR, file);
  try {
    const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
    const records = asRecords(raw);
    for (const row of records) {
      if (!row || !TARGET_IDS.has(Number(row.ID))) continue;
      const interesting = {};
      for (const [key, value] of Object.entries(row)) {
        if (/^(ID|Name|Title|Desc|Description|Hero.*|.*Hero.*|.*Level.*|.*Dungeon.*|.*Stage.*|.*Battle.*|.*Chapter.*|.*Story.*|.*Task.*|.*Mission.*|.*Plot.*|.*Type.*|.*Param.*)$/i.test(key)) {
          interesting[key] = value;
        }
      }
      hits.push({ file, id: Number(row.ID), interesting, row });
    }
  } catch (error) {
    parseErrors.push({ file, error: String(error && error.message || error) });
  }
}

const byTarget = {};
for (const id of [...TARGET_IDS].sort((a, b) => a - b)) {
  byTarget[id] = hits.filter((hit) => hit.id === id).map((hit) => ({ file: hit.file, interesting: hit.interesting }));
}

const result = {
  version: 4,
  status: hits.length ? 'FOUND_CANDIDATE_ID_HITS' : 'NO_CANDIDATE_ID_HITS',
  purpose: 'Locate MissionType=5 Param3 stage IDs in likely stage/dungeon ConfigData without scanning large blobs through the API.',
  targetIds: [...TARGET_IDS].sort((a, b) => a - b),
  totalConfigFiles: allFiles.length,
  candidateFileCount: candidateFiles.length,
  candidateFiles,
  hitCount: hits.length,
  byTarget,
  hits,
  parseErrors,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  status: result.status,
  totalConfigFiles: result.totalConfigFiles,
  candidateFileCount: result.candidateFileCount,
  candidateFiles,
  hitCount: result.hitCount,
  byTarget,
  parseErrorCount: parseErrors.length,
}, null, 2));
