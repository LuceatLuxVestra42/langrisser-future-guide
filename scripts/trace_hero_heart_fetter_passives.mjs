import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourceRootArg = process.argv.includes('--source-root')
  ? process.argv[process.argv.indexOf('--source-root') + 1]
  : null;
if (!sourceRootArg) throw new Error('missing --source-root');

const TARGET_IDS = new Set([70110, 9970110, 70352]);
const sourceRoot = path.resolve(sourceRootArg);
const configRoot = path.join(sourceRoot, 'data/configdata');
const outPath = path.join(ROOT, 'heart-fetter-passive-trace.json');
const matches = [];

function walk(value, file, trail = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walk(value[i], file, `${trail}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.ID === 'number' && TARGET_IDS.has(value.ID)) {
    matches.push({ file, trail, record: value });
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ID') continue;
    if (child && typeof child === 'object') walk(child, file, `${trail}.${key}`);
  }
}

for (const name of fs.readdirSync(configRoot).sort()) {
  if (!name.endsWith('.json')) continue;
  const full = path.join(configRoot, name);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  walk(json, `data/configdata/${name}`);
}

matches.sort((a, b) => a.file.localeCompare(b.file) || a.record.ID - b.record.ID);
const report = {
  targetIds: [...TARGET_IDS],
  matchCount: matches.length,
  matches,
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TRACE_OUTPUT=${path.relative(ROOT, outPath)}`);
console.log(`MATCH_COUNT=${matches.length}`);
if (matches.length === 0) process.exitCode = 1;
