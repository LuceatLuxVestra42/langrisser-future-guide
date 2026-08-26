'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dumpPath = path.join(root, 'data', 'metadata', 'dump.cs');
const outPath = path.join(root, 'data', 'validation', 'hero-page-stage5-2-exclusive-owner-trace.txt');
const sheetOut = path.join(root, 'data', 'validation', 'hero-page-stage5-2-exclusive-sheet-probe.json');

function contexts(text, needle, radius = 900, max = 80) {
  const out = [];
  let from = 0;
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  while (out.length < max) {
    const i = lower.indexOf(n, from);
    if (i < 0) break;
    out.push(text.slice(Math.max(0, i - radius), Math.min(text.length, i + n.length + radius)));
    from = i + n.length;
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

async function probeSheet() {
  const sheetId = '1RZFY2N3RU-vctduO_Tg2e4RVoZvJAAveiMgPnW6VTQg';
  const title = '전용장비';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'langrisser-future-guide-stage5-2' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    const compact = rows.slice(0, 18).map((r, i) => ({ row: i + 1, cells: r.slice(0, 12) }));
    return { status: 'OK', sheet: title, rowCount: rows.length, sampleRows: compact };
  } catch (e) {
    return { status: 'ERROR', sheet: title, error: String(e.message || e) };
  }
}

(async () => {
  const terms = [
    'EquipmentHeroExclusivePopInfo',
    'HeroExclusive',
    'ExclusivePop',
    'ExclusiveEquipment',
    'EquipmentExclusive',
    'PathType',
    'CastingLawSkill'
  ];
  const text = fs.readFileSync(dumpPath, 'utf8');
  const sections = [];
  for (const term of terms) {
    const hits = contexts(text, term);
    sections.push(`===== ${term} | hits=${hits.length}${hits.length === 80 ? '+' : ''} =====`);
    hits.forEach((x, i) => sections.push(`\n--- hit ${i + 1} ---\n${x}`));
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sections.join('\n') + '\n');
  const sheet = await probeSheet();
  fs.writeFileSync(sheetOut, JSON.stringify(sheet, null, 2) + '\n');
  console.log(JSON.stringify({
    dumpBytes: Buffer.byteLength(text),
    termHitCounts: Object.fromEntries(terms.map(t => [t, contexts(text, t, 50, 10000).length])),
    sheet,
    outputs: [path.relative(root, outPath), path.relative(root, sheetOut)]
  }, null, 2));
})();
