#!/usr/bin/env node
import { executeRegressionRun } from '../lib/regression-runner.mjs';

const args = process.argv.slice(2);
let profileId = 'core-regression-v1';
let planOnly = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--plan') {
    planOnly = true;
    continue;
  }
  if (arg === '--profile') {
    const value = args[i + 1];
    if (!value) throw new Error('--profile requires a value');
    profileId = value;
    i += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const result = executeRegressionRun({ profileId, planOnly });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
