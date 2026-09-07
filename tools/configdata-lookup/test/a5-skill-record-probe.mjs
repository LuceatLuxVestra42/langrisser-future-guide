import assert from 'node:assert/strict';

import { readIndexedSourceRecord } from '../lib/bounded-source-record.mjs';

const targets = ['70009', '70069', '70088', '70099', '70109'];
const results = [];

for (const id of targets) {
  const result = await readIndexedSourceRecord('Skill', id);
  assert.equal(result.id, id);
  assert.equal(String(result.record.ID), id);
  results.push(result);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'A5_SKILL_BOUNDED_RECORD_PROBE',
  targetCount: targets.length,
  results,
}, null, 2));
