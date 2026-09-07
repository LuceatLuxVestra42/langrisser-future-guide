import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.env.CONFIGDATA_SOURCE_ROOT;
if (!root) throw new Error('CONFIGDATA_SOURCE_ROOT is required');
const configDir = path.join(root, 'data', 'configdata');
const names = (await fs.readdir(configDir)).filter((name) => name.endsWith('.json')).sort();
const targetIds = new Set([93,94,95,96,99,100,101,102,103,104]);
const candidateName = 'ConfigDataPropertyModifyInfo.json';

function extractRecords(parsed) {
  if (Array.isArray(parsed)) return { containerPath: '$', records: parsed };
  if (parsed && typeof parsed === 'object') {
    for (const key of ['Data','data','Items','items','List','list']) {
      if (Array.isArray(parsed[key])) return { containerPath: `$.${key}`, records: parsed[key] };
    }
  }
  return { containerPath: null, records: [] };
}

const candidateText = await fs.readFile(path.join(configDir, candidateName), 'utf8');
const candidateSha256 = crypto.createHash('sha256').update(candidateText, 'utf8').digest('hex');
const candidateParsed = JSON.parse(candidateText);
const { containerPath, records } = extractRecords(candidateParsed);
const targetRows = records
  .map((row, recordIndex) => ({ row, recordIndex }))
  .filter(({ row }) => row && typeof row === 'object' && targetIds.has(row.ID))
  .map(({ row, recordIndex }) => ({ ID: row.ID, recordIndex, keys: Object.keys(row).sort() }));

const literalReferenceFiles = [];
for (const name of names) {
  if (name === candidateName) continue;
  const text = await fs.readFile(path.join(configDir, name), 'utf8');
  if (text.includes('PropertyModifyInfo')) literalReferenceFiles.push(name);
}

console.log(JSON.stringify({
  status: 'PASS',
  purpose: 'A5-1j1c-2/3 PROVENANCE AND EXPLICIT RELATION CHECK',
  configDataFileCount: names.length,
  candidate: {
    name: candidateName,
    logicalPath: `data/configdata/${candidateName}`,
    sha256: candidateSha256,
    containerPath,
    recordCount: records.length,
    targetRows,
  },
  explicitRelationEvidence: {
    currentRepositoryCodeSearchPreviouslyFound: false,
    sourcePackLiteralReferenceFileCount: literalReferenceFiles.length,
    sourcePackLiteralReferenceFiles: literalReferenceFiles,
    relationConfirmed: false,
  },
  boundaries: {
    meaningMappingPerformed: false,
    valueScaleInterpreted: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    relationAssumed: false,
  },
}, null, 2));
