import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourceRootArg = process.argv.includes('--source-root')
  ? process.argv[process.argv.indexOf('--source-root') + 1]
  : null;
if (!sourceRootArg) throw new Error('missing --source-root');

const TARGETS = new Set([70110, 70352]);
const configRoot = path.join(path.resolve(sourceRootArg), 'data/configdata');
const outPath = path.join(ROOT, 'heart-fetter-reverse-ref-trace.json');
const refs = [];

function walk(value, file, trail = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walk(value[i], file, `${trail}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childTrail = `${trail}.${key}`;
    if ((typeof child === 'number' || typeof child === 'string') && TARGETS.has(Number(child))) {
      refs.push({ file, trail: childTrail, key, value: child, parent: value });
    }
    if (child && typeof child === 'object') walk(child, file, childTrail);
  }
}

for (const name of fs.readdirSync(configRoot).sort()) {
  if (!name.endsWith('.json')) continue;
  const full = path.join(configRoot, name);
  let json;
  try { json = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
  walk(json, `data/configdata/${name}`);
}

const compact = refs.map((r) => ({
  file: r.file,
  trail: r.trail,
  key: r.key,
  value: r.value,
  parent: r.parent,
}));
fs.writeFileSync(outPath, `${JSON.stringify({ targets:[...TARGETS], refCount:compact.length, refs:compact }, null, 2)}\n`);
console.log(`TRACE_OUTPUT=${path.relative(ROOT, outPath)}`);
console.log(`REF_COUNT=${compact.length}`);
console.log(`FILES=${JSON.stringify([...new Set(compact.map((r) => r.file))])}`);
if (!compact.length) process.exitCode = 1;
