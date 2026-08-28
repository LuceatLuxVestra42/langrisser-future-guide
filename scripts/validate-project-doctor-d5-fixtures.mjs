import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshFreshness } from './run-project-doctor-d5-refresh.mjs';
import { validateFreshness } from './validate-project-doctor-d5.mjs';

const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-doctor-d5-'));
const fixtures = [];
const runFixture = (id, fn) => { fn(); fixtures.push(id); };
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
};

try {
  process.chdir(fixtureRoot);
  fs.mkdirSync('scripts', { recursive: true });
  fs.mkdirSync('data/contracts', { recursive: true });
  fs.mkdirSync('data/generated', { recursive: true });
  fs.mkdirSync('data/validation', { recursive: true });
  fs.writeFileSync('scripts/core-a.mjs', '// core a\n');
  fs.writeFileSync('scripts/core-b.mjs', '// core b\n');
  fs.writeFileSync('scripts/mock-status.mjs', '// fixture status runner placeholder\n');

  const d1ContractPath = 'data/contracts/d1.json';
  const d5ContractPath = 'data/contracts/d5.json';
  const manifestPath = 'data/generated/d5.json';
  const outputPaths = ['data/generated/d1.json', 'data/validation/d11.json', 'data/validation/d12.json'];

  const writeBaseD1Contract = () => writeJson(d1ContractPath, {
    status: 'DESIGN_FROZEN',
    domains: {
      hero: {
        primaryStatusSource: 'data/validation/source-primary.json',
        supplementalSources: [{ path: 'data/validation/source-supp.json' }],
      },
    },
  });

  writeJson(d5ContractPath, {
    status: 'DESIGN_FROZEN',
    d1Contract: d1ContractPath,
    d1StatusRunner: 'scripts/mock-status.mjs',
    manifestPath,
    coreInputPaths: [d1ContractPath, 'scripts/core-a.mjs', 'scripts/core-b.mjs', 'scripts/mock-status.mjs'],
    outputPaths,
    outputStatusRules: [
      { path: outputPaths[0], field: 'status', equals: 'COLLECTED' },
      { path: outputPaths[1], field: 'status', equals: 'PASS_D11' },
      { path: outputPaths[2], field: 'status', equals: 'PASS_D12' },
    ],
  });

  const writeOutputs = () => {
    writeJson(outputPaths[0], { status: 'COLLECTED' });
    writeJson(outputPaths[1], { status: 'PASS_D11' });
    writeJson(outputPaths[2], { status: 'PASS_D12' });
  };
  const successfulStatus = () => { writeOutputs(); return { status: 0 }; };
  const reset = () => {
    writeBaseD1Contract();
    writeJson('data/validation/source-primary.json', { status: 'PASS' });
    writeJson('data/validation/source-supp.json', { status: 'PASS' });
    fs.writeFileSync('scripts/core-a.mjs', '// core a\n');
    for (const filePath of [manifestPath, ...outputPaths, 'data/validation/new-source.json']) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  };

  runFixture('FRESH_AFTER_REFRESH', () => {
    reset();
    const refreshed = refreshFreshness({ contractPath: d5ContractPath, runStatus: successfulStatus });
    assert.equal(refreshed.exitCode, 0);
    assert.equal(validateFreshness({ contractPath: d5ContractPath }).status, 'FRESH');
  });

  runFixture('SOURCE_CHANGE_STALE', () => {
    reset();
    refreshFreshness({ contractPath: d5ContractPath, runStatus: successfulStatus });
    writeJson('data/validation/source-primary.json', { status: 'REVIEW' });
    assert.equal(validateFreshness({ contractPath: d5ContractPath }).status, 'STALE');
  });

  runFixture('OUTPUT_TAMPER_STALE', () => {
    reset();
    refreshFreshness({ contractPath: d5ContractPath, runStatus: successfulStatus });
    writeJson(outputPaths[0], { status: 'COLLECTED', tamper: true });
    assert.equal(validateFreshness({ contractPath: d5ContractPath }).status, 'STALE');
  });

  runFixture('RACE_CHANGE_BLOCKED', () => {
    reset();
    const refreshed = refreshFreshness({
      contractPath: d5ContractPath,
      runStatus: () => {
        writeOutputs();
        writeJson('data/validation/source-supp.json', { status: 'CHANGED_DURING_RUN' });
        return { status: 0 };
      },
    });
    assert.equal(refreshed.status, 'SOURCE_CHANGED_DURING_REFRESH');
    assert.equal(refreshed.exitCode, 5);
  });

  runFixture('MISSING_OUTPUT_BLOCKED', () => {
    reset();
    const refreshed = refreshFreshness({
      contractPath: d5ContractPath,
      runStatus: () => {
        writeJson(outputPaths[0], { status: 'COLLECTED' });
        writeJson(outputPaths[1], { status: 'PASS_D11' });
        return { status: 0 };
      },
    });
    assert.equal(refreshed.status, 'OUTPUT_MISSING_AFTER_REFRESH');
  });

  runFixture('SOURCE_SET_CHANGE_STALE', () => {
    reset();
    refreshFreshness({ contractPath: d5ContractPath, runStatus: successfulStatus });
    const d1 = JSON.parse(fs.readFileSync(d1ContractPath, 'utf8'));
    d1.domains.skin = { primaryStatusSource: 'data/validation/new-source.json', supplementalSources: [] };
    writeJson('data/validation/new-source.json', { status: 'PASS' });
    writeJson(d1ContractPath, d1);
    assert.equal(validateFreshness({ contractPath: d5ContractPath }).status, 'STALE');
  });

  runFixture('PRODUCER_CHANGE_STALE', () => {
    reset();
    refreshFreshness({ contractPath: d5ContractPath, runStatus: successfulStatus });
    fs.writeFileSync('scripts/core-a.mjs', '// changed producer\n');
    assert.equal(validateFreshness({ contractPath: d5ContractPath }).status, 'STALE');
  });

  console.log(JSON.stringify({
    status: 'PASS_PROJECT_DOCTOR_D5_FIXTURES',
    fixturePassCount: fixtures.length,
    fixtureCount: fixtures.length,
    fixtures,
    actualRepositoryChildCommandExecutionCount: 0,
  }, null, 2));
} finally {
  process.chdir(originalCwd);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
