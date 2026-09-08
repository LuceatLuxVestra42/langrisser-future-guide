import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourceRootArg = process.argv.includes('--source-root')
  ? process.argv[process.argv.indexOf('--source-root') + 1]
  : null;
if (!sourceRootArg) throw new Error('missing --source-root');

const TARGET_IDS = new Set(Array.from({ length: 18 }, (_, i) => 87 + i));
const sourceRoot = path.resolve(sourceRootArg);
const configRoot = path.join(sourceRoot, 'data/configdata');
const outPath = path.join(ROOT, 'heart-fetter-property-trace.json');
const matches = [];
const propertyNamedFiles = [];

function hasSemanticFields(record) {
  const keys = Object.keys(record);
  return keys.some((k) => /name|comment|desc|describe|property|type/i.test(k));
}

function walk(value, file, trail = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walk(value[i], file, `${trail}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (typeof value.ID === 'number' && TARGET_IDS.has(value.ID) && hasSemanticFields(value)) {
    matches.push({ file, trail, record: value });
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'ID') continue;
    if (child && typeof child === 'object') walk(child, file, `${trail}.${key}`);
  }
}

for (const name of fs.readdirSync(configRoot).sort()) {
  if (!name.endsWith('.json')) continue;
  if (/property|attribute|attr/i.test(name)) propertyNamedFiles.push(`data/configdata/${name}`);

  const full = path.join(configRoot, name);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  walk(json, `data/configdata/${name}`);
}

matches.sort((a, b) => a.record.ID - b.record.ID || a.file.localeCompare(b.file));
const report = {
  targetIds: [...TARGET_IDS],
  propertyNamedFiles,
  matchCount: matches.length,
  matches,
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TRACE_OUTPUT=${path.relative(ROOT, outPath)}`);
console.log(`PROPERTY_NAMED_FILES=${propertyNamedFiles.length}`);
console.log(`MATCH_COUNT=${matches.length}`);
if (matches.length === 0) process.exitCode = 1;
