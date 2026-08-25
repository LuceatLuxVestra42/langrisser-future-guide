'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DUMP = path.join(ROOT, 'data', 'metadata', 'dump.cs');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');

const text = fs.readFileSync(DUMP, 'utf8');
const lines = text.split(/\r?\n/);

const terms = [
  'HeroFetter',
  'HeroHeartFetter',
  'CompletionConditions',
  'ConditionType',
  'Parm1',
  'Parm2',
  'Parm3',
];

function hitsFor(term) {
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(term)) hits.push(i);
  }
  return hits;
}

function nearestDeclaration(index) {
  for (let i = index; i >= Math.max(0, index - 250); i -= 1) {
    const s = lines[i].trim();
    if (/^(public|private|protected|internal)\s+(sealed\s+|static\s+|abstract\s+|partial\s+)*(class|struct|enum|interface)\s+/.test(s)) {
      return { line: i + 1, text: s };
    }
  }
  return null;
}

function nearestNamespace(index) {
  for (let i = index; i >= Math.max(0, index - 300); i -= 1) {
    const s = lines[i].trim();
    if (s.startsWith('// Namespace:')) return { line: i + 1, text: s };
  }
  return null;
}

function lineRecord(index) {
  return {
    line: index + 1,
    text: lines[index],
    declaration: nearestDeclaration(index),
    namespace: nearestNamespace(index),
  };
}

const termHits = Object.fromEntries(
  terms.map((term) => {
    const hits = hitsFor(term);
    return [term, {
      count: hits.length,
      lineNumbers: hits.slice(0, 500).map((i) => i + 1),
      samples: hits.slice(0, 100).map(lineRecord),
    }];
  }),
);

const primaryIndexes = [...new Set([
  ...hitsFor('HeroFetter'),
  ...hitsFor('HeroHeartFetter'),
  ...hitsFor('CompletionConditions'),
])].sort((a, b) => a - b);

const windows = [];
for (const idx of primaryIndexes) {
  const start = Math.max(0, idx - 50);
  const end = Math.min(lines.length - 1, idx + 80);
  const previous = windows.at(-1);
  if (previous && start <= previous.end + 1) previous.end = Math.max(previous.end, end);
  else windows.push({ start, end });
}

const contexts = windows.slice(0, 40).map(({ start, end }) => ({
  startLine: start + 1,
  endLine: end + 1,
  lines: lines.slice(start, end + 1).map((value, offset) => ({ line: start + offset + 1, text: value })),
}));

const fetterNamedLines = [];
for (let i = 0; i < lines.length; i += 1) {
  const s = lines[i].trim();
  if (/Fetter|fetter|羁绊/.test(s)) {
    fetterNamedLines.push(lineRecord(i));
    if (fetterNamedLines.length >= 500) break;
  }
}

const result = {
  version: 1,
  status: primaryIndexes.length ? 'FOUND' : 'NOT_FOUND',
  purpose: 'Locate HeroFetter-related declarations and nearby method/type signatures in Il2CppDumper dump.cs without loading the file through the GitHub API.',
  source: {
    path: 'data/metadata/dump.cs',
    sizeBytes: fs.statSync(DUMP).size,
    lineCount: lines.length,
    characterCount: text.length,
  },
  termHits,
  primaryHitCount: primaryIndexes.length,
  contexts,
  fetterNamedLines,
  note: 'dump.cs is an IL2CPP metadata/type dump; method bodies may be absent. This output is intended to establish available declarations and candidate consumer signatures before deciding whether native-code disassembly is required.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, primaryHitCount: result.primaryHitCount, source: result.source, termCounts: Object.fromEntries(Object.entries(termHits).map(([k, v]) => [k, v.count])) }, null, 2));
