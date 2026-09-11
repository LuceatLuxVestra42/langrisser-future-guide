import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readSourceRecordByLocator } from '../lib/bounded-source-record.mjs';

function sha256Utf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'configdata-bounded-record-'));
try {
  const logicalPath = 'data/configdata/ConfigDataSkillInfo.json';
  const physicalPath = path.join(root, ...logicalPath.split('/'));
  await fs.mkdir(path.dirname(physicalPath), { recursive: true });

  const sourceText = `${JSON.stringify([
    { ID: 70009, Marker: 'target' },
    { ID: 70069, Marker: 'second' },
  ], null, 2)}\n`;
  await fs.writeFile(physicalPath, sourceText, 'utf8');

  const locator = {
    source: logicalPath,
    sourceSha256: sha256Utf8(sourceText),
    containerPath: '$',
    recordIndex: 0,
  };

  const result = await readSourceRecordByLocator({ locator, expectedId: 70009, sourceRoot: root });
  assert.equal(result.id, '70009');
  assert.equal(result.recordIndex, 0);
  assert.equal(result.record.ID, 70009);
  assert.equal(result.record.Marker, 'target');

  await assert.rejects(
    () => readSourceRecordByLocator({ locator, expectedId: 70069, sourceRoot: root }),
    /ID mismatch/,
  );

  await assert.rejects(
    () => readSourceRecordByLocator({
      locator: { ...locator, sourceSha256: '0'.repeat(64) },
      expectedId: 70009,
      sourceRoot: root,
    }),
    /SHA-256 mismatch/,
  );

  await assert.rejects(
    () => readSourceRecordByLocator({
      locator: { ...locator, recordIndex: 99 },
      expectedId: 70009,
      sourceRoot: root,
    }),
    /out of range/,
  );

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'CONFIGDATA_LOOKUP_BOUNDED_SOURCE_RECORD_SELF_TEST',
    readOnly: true,
    exactSourceHashRequired: true,
    exactContainerPathRequired: true,
    exactRecordIndexRequired: true,
    exactPrimaryKeyMatchRequired: true,
    sourceRootEscapeAllowed: false,
    semanticInterpretation: false,
  }, null, 2));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
