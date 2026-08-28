import { parseD4Cli, runD4 } from './run-project-doctor-d4.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d4-execution.v3.json';
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node scripts/run-project-doctor-d4-v3.mjs [--dry-run] [--json] [D3 changed-file source options]');
  console.log(`Uses frozen execution contract: ${CONTRACT_PATH}`);
  process.exit(0);
}
let options;
try {
  options = parseD4Cli(['--execution-contract', CONTRACT_PATH, ...argv]);
  const output = runD4({ options });
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log('PROJECT DOCTOR EXECUTION — D4 V3');
    console.log(`Plan status   : ${output.plan.status}`);
    console.log(`Changed files : ${output.plan.changedFileCount}`);
    console.log(`Run status    : ${output.result.status}`);
    console.log(`Checks queued : ${output.result.preflight?.queue?.length ?? 0}`);
    console.log(`Checks run    : ${output.result.executions.length}`);
    for (const execution of output.result.executions) console.log(`  [${execution.exitCode}] ${execution.id}: ${execution.command}`);
    if (output.result.manualReviews?.length) console.log(`Manual review : ${output.result.manualReviews.length}`);
  }
  process.exitCode = output.result.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (options?.json) console.log(JSON.stringify({ stage: 'D4-V3', status: 'INVALID_PLAN', error: message }, null, 2));
  else console.error(`[doctor:run:v3] ${message}`);
  process.exitCode = 2;
}
