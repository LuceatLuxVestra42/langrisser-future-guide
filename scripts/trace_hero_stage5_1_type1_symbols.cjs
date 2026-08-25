'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'metadata', 'dump.cs');
const OUTPUT = path.join(ROOT, 'data', 'validation', 'hero-page-stage5-1-type1-dump-symbols.txt');

const MATCH = /fetter|completionconditions/i;
const MAX_HITS = 2000;
const BEFORE = 3;
const AFTER = 3;

async function main() {
  const stream = fs.createReadStream(INPUT, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const before = [];
  const blocks = [];
  let lineNo = 0;
  let pending = null;
  let hitCount = 0;

  for await (const line of rl) {
    lineNo += 1;

    if (pending) {
      pending.lines.push([lineNo, line]);
      pending.afterRemaining -= 1;
      if (pending.afterRemaining <= 0) {
        blocks.push(pending);
        pending = null;
      }
    }

    if (hitCount < MAX_HITS && MATCH.test(line)) {
      hitCount += 1;
      if (pending) {
        // Nearby hits belong to the same context block; extend the tail.
        pending.hitLines.push(lineNo);
        pending.afterRemaining = AFTER;
      } else {
        pending = {
          hitLines: [lineNo],
          lines: [...before, [lineNo, line]],
          afterRemaining: AFTER,
        };
      }
    }

    before.push([lineNo, line]);
    if (before.length > BEFORE) before.shift();
  }

  if (pending) blocks.push(pending);

  const deduped = [];
  let lastEnd = -1;
  for (const b of blocks) {
    const filtered = b.lines.filter(([n]) => n > lastEnd);
    if (!filtered.length) continue;
    deduped.push({ hitLines: b.hitLines, lines: filtered });
    lastEnd = filtered[filtered.length - 1][0];
  }

  const out = [];
  out.push('Hero Stage 5-1 ConditionType=1 dump.cs symbol trace');
  out.push(`input=${path.relative(ROOT, INPUT).replaceAll('\\\\', '/')}`);
  out.push(`pattern=${MATCH}`);
  out.push(`hitCount=${hitCount}`);
  out.push(`blockCount=${deduped.length}`);
  out.push(`maxHits=${MAX_HITS}`);
  out.push('');

  for (const b of deduped) {
    out.push(`===== hit lines: ${b.hitLines.join(', ')} =====`);
    for (const [n, text] of b.lines) out.push(`${n}: ${text}`);
    out.push('');
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, out.join('\n') + '\n');
  console.log(JSON.stringify({ hitCount, blockCount: deduped.length, output: path.relative(ROOT, OUTPUT).replaceAll('\\\\', '/') }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
