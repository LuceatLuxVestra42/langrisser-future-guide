import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectContractErrors } from '../core/contract-v1.mjs';
import { runAssetIntakeCli } from './run-v1.mjs';

const FIXTURE_PATH = 'tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json';
const SELF_TESTS = [
  'tools/asset-intake/cli/self-test-engine-v1.mjs',
  'tools/asset-intake/cli/self-test-skin-adapter-v1.mjs',
];

const checks = [];
const check = (id, fn) => {
  fn();
  checks.push(id);
};

for (const script of SELF_TESTS) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  check(`UPSTREAM:${path.basename(script)}`, () => assert.equal(result.status, 0, `${script}\n${result.stdout}\n${result.stderr}`));
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'asset-intake-stage4-'));
const root = path.join(tmp, 'root');
const output = path.join(tmp, 'skin-output.json');
const diagnosticsPath = path.join(tmp, 'skin-diagnostics.json');
const scanOutput = path.join(tmp, 'scan.json');
const resourceMapPath = path.join(tmp, 'resource-map.json');

const resourceEntries = [];
let syntheticIndex = 0;
for (const record of fixture.records) {
  for (const locator of record.expectedLocators) {
    let relativePath;
    if (locator.locatorKind === 'RESOURCE_ID') {
      relativePath = `Synthetic/Model/${String(locator.value)}.prefab`;
      resourceEntries.push({ skinResourceId: locator.value, prefabPath: relativePath, assetEntryStatus: 'CONFIRMED' });
    } else {
      relativePath = String(locator.value);
    }
    const absolute = path.join(root, ...relativePath.split('/'));
    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await fsp.writeFile(absolute, Buffer.from(`asset-intake-stage4-${syntheticIndex++}`));
  }
}
await fsp.writeFile(resourceMapPath, `${JSON.stringify({ modelResourcePrefabMap: resourceEntries }, null, 2)}\n`);

const scan = await runAssetIntakeCli(['scan', '--root', root, '--source-artifact', 'stage4-synthetic-fixture', '--out', scanOutput]);
const inventory = JSON.parse(await fsp.readFile(scanOutput, 'utf8'));
check('SCAN_STATUS', () => assert.equal(scan.status, 'PASS_ASSET_INTAKE_SCAN'));
check('SCAN_COUNT', () => assert.equal(inventory.length, 13));
check('SCAN_RELATIVE_PATHS_ONLY', () => assert.ok(inventory.every(record => !path.isAbsolute(record.relativePath) && record.relativePath === record.sourcePath)));
check('SCAN_HASHES', () => assert.ok(inventory.every(record => /^[0-9a-f]{64}$/.test(record.sha256))));

const adapted = await runAssetIntakeCli([
  'skin', '--root', root, '--contract', FIXTURE_PATH, '--resource-map', resourceMapPath,
  '--out', output, '--diagnostics', diagnosticsPath,
]);
const contract = JSON.parse(await fsp.readFile(output, 'utf8'));
const diagnostics = JSON.parse(await fsp.readFile(diagnosticsPath, 'utf8'));
check('SKIN_STATUS', () => assert.equal(adapted.status, 'PASS_ASSET_INTAKE_SKIN_ADAPTER_EXECUTION'));
check('SKIN_RECORDS_RESOLVED', () => assert.deepEqual(diagnostics.recordCounts, { total: 3, resolved: 3, pending: 0, ambiguous: 0 }));
check('SKIN_LOCATORS_RESOLVED', () => assert.deepEqual(diagnostics.locatorCounts, { total: 13, resolved: 13, pending: 0, ambiguous: 0 }));
check('SKIN_EVIDENCE_COUNT', () => assert.equal(diagnostics.evidenceCount, 13));
check('OUTPUT_CONTRACT_VALID', () => assert.deepEqual(collectContractErrors(contract), []));
check('OUTPUT_KEYS_PRESERVED', () => assert.deepEqual(contract.records.map(record => record.canonicalKey.value), [102, 1901, 3701]));
check('OUTPUT_NO_DOMAIN_SEMANTIC_FIELDS', () => assert.ok(contract.records.every(record => !('heroId' in record) && !('sourceOrder' in record))));

const noMapOutput = path.join(tmp, 'skin-no-map.json');
const noMapDiagnostics = path.join(tmp, 'skin-no-map-diagnostics.json');
await runAssetIntakeCli(['skin', '--root', root, '--contract', FIXTURE_PATH, '--out', noMapOutput, '--diagnostics', noMapDiagnostics]);
const pendingDiagnostics = JSON.parse(await fsp.readFile(noMapDiagnostics, 'utf8'));
check('RESOURCE_MAP_FAIL_CLOSED', () => assert.deepEqual(pendingDiagnostics.recordCounts, { total: 3, resolved: 0, pending: 3, ambiguous: 0 }));
check('PENDING_EMITS_NO_PARTIAL_EVIDENCE', () => assert.equal(pendingDiagnostics.evidenceCount, 0));

const help = await runAssetIntakeCli(['--help']);
check('CLI_HELP', () => assert.equal(help.status, 'HELP'));

await fsp.rm(tmp, { recursive: true, force: true });

const result = {
  status: 'PASS_ASSET_INTAKE_STAGE4_REPOSITORY_VALIDATION',
  completion: 'REPOSITORY_ENTRYPOINT_VALIDATED',
  checks: checks.length,
  passed: checks.length,
  failed: 0,
  hardErrors: 0,
  representativeExecution: {
    records: 3,
    locators: 13,
    evidence: 13,
    syntheticBytesOnly: true,
    authoritativeProjectAssetClaim: false,
  },
  guardrails: {
    resourceIdRequiresExplicitMap: true,
    pendingEmitsPartialEvidence: false,
    semanticRecomputation: false,
  },
};
console.log(JSON.stringify(result, null, 2));
