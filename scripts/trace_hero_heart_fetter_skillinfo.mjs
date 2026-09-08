import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_IDS = new Set([70110, 70343, 70344, 70345, 70346, 70347, 70348, 70349, 70350, 70351, 70352]);
const sourcePath = path.join(ROOT, 'data/configdata/ConfigDataSkillInfo.json');

const raw = fs.readFileSync(sourcePath, 'utf8');
const json = JSON.parse(raw);
const matches = [];

function walk(value, trail = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walk(value[i], `${trail}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (typeof value.ID === 'number' && TARGET_IDS.has(value.ID)) {
    matches.push({ trail, record: value });
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ID') continue;
    if (child && typeof child === 'object') walk(child, `${trail}.${key}`);
  }
}

walk(json);
matches.sort((a, b) => a.record.ID - b.record.ID);

console.log(`SOURCE=${path.relative(ROOT, sourcePath)}`);
console.log(`TARGET_COUNT=${TARGET_IDS.size}`);
console.log(`MATCH_COUNT=${matches.length}`);
for (const match of matches) {
  console.log(`\n=== ID ${match.record.ID} @ ${match.trail} ===`);
  console.log(JSON.stringify(match.record, null, 2));
}

const found = new Set(matches.map((m) => m.record.ID));
const missing = [...TARGET_IDS].filter((id) => !found.has(id));
if (missing.length) {
  console.error(`MISSING_IDS=${missing.join(',')}`);
  process.exitCode = 1;
}
