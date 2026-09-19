'use strict';

const fs = require('fs');
const path = require('path');
const { CONFIG_DIR, loadArray } = require('./lib/configdata-direct.cjs');

function summarizeValue(value) {
  if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 3) };
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 30), sample: value };
  return value;
}

const names = fs.readdirSync(CONFIG_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .filter((name) => /(Fetter|Favor|Heart|Bond)/i.test(name))
  .sort();

const out = [];
for (const name of names) {
  const rows = loadArray(name);
  const keys = new Set();
  for (const row of rows.slice(0, 50)) for (const key of Object.keys(row || {})) keys.add(key);
  const relevantKeys = [...keys].filter((key) => /(level|material|cost|consume|item|goods|fetter|favor|heart|stat|attr|hp|def|magic|attack)/i.test(key));
  out.push({
    name,
    count: rows.length,
    keys: [...keys].sort(),
    relevantKeys: relevantKeys.sort(),
    samples: rows.slice(0, 5).map((row) => Object.fromEntries(
      Object.entries(row || {}).filter(([key]) => relevantKeys.includes(key)).map(([key, value]) => [key, summarizeValue(value)])
    )),
  });
}

console.log(JSON.stringify({ status: 'PASS', configDir: CONFIG_DIR, tableCount: names.length, tables: out }, null, 2));
