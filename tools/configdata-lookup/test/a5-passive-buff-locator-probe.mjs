import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = process.env.CONFIGDATA_SOURCE_ROOT;
if (!sourceRoot) throw new Error('CONFIGDATA_SOURCE_ROOT is required');

const logicalRoot = 'data/configdata';
const physicalRoot = path.join(sourceRoot, logicalRoot);
const targetIds = new Set(['70009', '70069', '70088', '70089', '70099', '70109']);
const names = (await fs.readdir(physicalRoot))
  .filter((name) => /buff/i.test(name) && name.endsWith('.json'))
  .sort();

function extractRecords(root) {
  if (Array.isArray(root)) return { records: root, containerPath: '$' };
  for (const key of ['records', 'data', 'items']) {
    if (root && typeof root === 'object' && Array.isArray(root[key])) {
      return { records: root[key], containerPath: `$.${key}` };
    }
  }
  return null;
}

const candidates = [];
const matches = [];
for (const name of names) {
  const physicalPath = path.join(physicalRoot, name);
  const text = await fs.readFile(physicalPath, 'utf8');
  const sha256 = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  const parsed = JSON.parse(text);
  const extracted = extractRecords(parsed);
  if (!extracted) {
    candidates.push({ name, sha256, supportedContainer: false });
    continue;
  }
  candidates.push({
    name,
    sha256,
    supportedContainer: true,
    containerPath: extracted.containerPath,
    recordCount: extracted.records.length,
  });
  extracted.records.forEach((record, recordIndex) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const id = String(record.ID ?? '');
    if (!targetIds.has(id)) return;
    matches.push({
      id,
      source: `${logicalRoot}/${name}`,
      sourceSha256: sha256,
      containerPath: extracted.containerPath,
      recordIndex,
      keys: Object.keys(record),
    });
  });
}

const matchedIds = [...new Set(matches.map((match) => match.id))].sort();
const missingIds = [...targetIds].filter((id) => !matchedIds.includes(id));
console.log(JSON.stringify({
  status: missingIds.length === 0 ? 'PASS' : 'REVIEW',
  checkpoint: 'A5_PASSIVE_BUFF_LOCATOR_PROBE',
  targetIds: [...targetIds],
  candidateFileCount: names.length,
  candidates,
  matches,
  matchedIds,
  missingIds,
  boundaries: {
    filenameFilter: 'buff case-insensitive',
    exactRecordField: 'ID',
    semanticInterpretation: false,
    nameJoin: false,
    idArithmetic: false,
    broadAllConfigDataRecordScan: false,
  },
}, null, 2));
