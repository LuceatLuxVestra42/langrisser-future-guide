import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const write = (p, v) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v, null, 2) + '\n');
};

const validators = [
  { stage: '2-0', script: 'scripts/validate-banner-stage2-0-effective-input.mjs', summary: 'data/validation/banner-stage2-0-input-summary.v1.json' },
  { stage: '2-1', script: 'scripts/validate-banner-stage2-1-identity-grouping.mjs', summary: 'data/validation/banner-stage2-1-summary.v1.json' },
  { stage: '2-2', script: 'scripts/validate-banner-stage2-2-materialization.mjs', summary: 'data/validation/banner-stage2-2-summary.v1.json' },
  { stage: '2-3', script: 'scripts/validate-banner-stage2-3-occurrences.mjs', summary: 'data/validation/banner-stage2-3-summary.v1.json' },
  { stage: '2-4', script: 'scripts/validate-banner-stage2-4-taxonomy.mjs', summary: 'data/validation/banner-stage2-4-summary.v1.json' },
  { stage: '2-5', script: 'scripts/validate-banner-stage2-5-hero-relations.mjs', summary: 'data/validation/banner-stage2-5-summary.v1.json' },
  { stage: '2-6', script: 'scripts/validate-banner-stage2-6-cp-event-relations.mjs', summary: 'data/validation/banner-stage2-6-summary.v1.json' },
  { stage: '2-7', script: 'scripts/validate-banner-stage2-7-history.mjs', summary: 'data/validation/banner-stage2-7-summary.v1.json' }
];

const results = [];
let allPass = true;

for (const v of validators) {
  const summaryPath = path.join(ROOT, v.summary);
  const originalSummary = fs.readFileSync(summaryPath, 'utf8');
  let exitCode = 1;
  try {
    console.log(`\n=== Banner Stage ${v.stage} validator ===`);
    const result = spawnSync(process.execPath, [path.join(ROOT, v.script)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env
    });
    exitCode = result.status ?? 1;
  } finally {
    fs.writeFileSync(summaryPath, originalSummary);
  }
  const passed = exitCode === 0;
  results.push({ stage: v.stage, script: v.script, canonicalSummaryRestored: true, exitCode, passed });
  if (!passed) allPass = false;
}

const executionReport = {
  version: 1,
  stage: 'Banner Stage 2-8',
  status: allPass ? 'ALL_PREDECESSOR_VALIDATORS_EXECUTED_PASS' : 'PREDECESSOR_VALIDATOR_EXECUTION_FAILED',
  executionMode: 'EXECUTE_EACH_VALIDATOR_THEN_RESTORE_FROZEN_PREDECESSOR_SUMMARY',
  validatorCount: validators.length,
  passedValidatorCount: results.filter(x => x.passed).length,
  failedValidatorCount: results.filter(x => !x.passed).length,
  canonicalPredecessorSummariesMutated: false,
  results
};
write('data/validation/banner-stage2-8-predecessor-execution.v1.json', executionReport);

if (!allPass) {
  console.error('One or more predecessor validators failed; Stage 2-8 manifest/freeze not executed.');
  process.exit(1);
}

for (const script of [
  'scripts/finalize-banner-stage2-8-production-manifest.mjs',
  'scripts/validate-banner-stage2-8-freeze.mjs'
]) {
  console.log(`\n=== ${script} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

console.log('\nBanner Stage 2-8 regression runner completed successfully.');
