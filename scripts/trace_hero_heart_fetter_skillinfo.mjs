import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_IDS = new Set([70110, 70343, 70344, 70345, 70346, 70347, 70348, 70349, 70350, 70351, 70352]);
const sourcePath = path.join(ROOT, 'data/configdata/ConfigDataSkillInfo.json');
const outPath = path.join(ROOT, 'heart-fetter-skillinfo-trace.json');

const raw = fs.readFileSync(sourcePath, 'utf8');
const json = JSON.parse(raw);
const matches = [];

function walk(value, trail = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walk(value[i], `${trail}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.ID === 'number' && TARGET_IDS.has(value.ID)) matches.push({ trail, record: value });
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ID') continue;
    if (child && typeof child === 'object') walk(child, `${trail}.${key}`);
  }
}

walk(json);
matches.sort((a, b) => a.record.ID - b.record.ID);
const found = new Set(matches.map((m) => m.record.ID));
const missing = [...TARGET_IDS].filter((id) => !found.has(id));
const report = {
  source: path.relative(ROOT, sourcePath),
  targetIds: [...TARGET_IDS],
  matchCount: matches.length,
  missing,
  matches,
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TRACE_OUTPUT=${path.relative(ROOT, outPath)}`);
console.log(`MATCH_COUNT=${matches.length}`);
if (missing.length) {
  console.error(`MISSING_IDS=${missing.join(',')}`);
  process.exitCode = 1;
}
