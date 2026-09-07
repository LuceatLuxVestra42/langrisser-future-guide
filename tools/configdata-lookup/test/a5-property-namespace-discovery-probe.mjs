import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.env.CONFIGDATA_SOURCE_ROOT;
if (!root) throw new Error('CONFIGDATA_SOURCE_ROOT is required');
const configDir = path.join(root, 'data', 'configdata');
const names = (await fs.readdir(configDir)).filter((name) => name.endsWith('.json')).sort();

const namePattern = /(property|attribute|attr|stat|parameter|param|define|enum|common|buff)/i;
const candidates = names.filter((name) => namePattern.test(name));
const targetIds = new Set([93,94,95,96,99,100,101,102,103,104]);

function extractRecords(parsed) {
  if (Array.isArray(parsed)) return { containerPath: '$', records: parsed };
  if (parsed && typeof parsed === 'object') {
    for (const key of ['Data','data','Items','items','List','list']) {
      if (Array.isArray(parsed[key])) return { containerPath: `$.${key}`, records: parsed[key] };
    }
  }
  return { containerPath: null, records: [] };
}

const inspected = [];
for (const name of candidates) {
  const text = await fs.readFile(path.join(configDir, name), 'utf8');
  const parsed = JSON.parse(text);
  const { containerPath, records } = extractRecords(parsed);
  const first = records.find((row) => row && typeof row === 'object') ?? null;
  const exactIdMatches = records
    .map((row, recordIndex) => ({ row, recordIndex }))
    .filter(({ row }) => row && typeof row === 'object' && targetIds.has(row.ID))
    .map(({ row, recordIndex }) => ({ ID: row.ID, recordIndex, keys: Object.keys(row).sort() }));
  inspected.push({
    name,
    containerPath,
    recordCount: records.length,
    firstRecordKeys: first ? Object.keys(first).sort() : [],
    exactTargetIdMatches: exactIdMatches,
  });
}

console.log(JSON.stringify({
  status: 'PASS',
  purpose: 'A5-1j1c-1/2 CANDIDATE DISCOVERY ONLY',
  configDataFileCount: names.length,
  candidateFileCount: candidates.length,
  candidates: inspected,
  boundaries: {
    meaningMappingPerformed: false,
    valueScaleInterpreted: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    relationAssumed: false,
  },
}, null, 2));
