import fs from 'node:fs';
import { parseD4Cli, executePlan } from './run-project-doctor-d4.mjs';
import { createPlanV6, loadProjectDoctorD3V6Context, D3_V6_CONTRACT_PATH } from './plan-project-doctor-d3-v6.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d4-execution.v6.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD4V6Context() {
  const delta = read(CONTRACT_PATH);
  if (delta.status !== 'DESIGN_FROZEN' || delta.schemaId !== 'project-doctor-d4-execution/v6') throw new Error('D4 V6 contract is not frozen.');
  const predecessor = read(delta.extends);
  if (predecessor.status !== 'DESIGN_FROZEN' || predecessor.schemaId !== 'project-doctor-d4-execution/v5') throw new Error('D4 V6 predecessor must be frozen V5.');
  const d3Context = loadProjectDoctorD3V6Context(delta.d3Contract);
  const contract = {
    ...predecessor,
    ...delta,
    allowedCheckIds: [...new Set([...(predecessor.allowedCheckIds ?? []), ...(delta.addedAllowedCheckIds ?? [])])],
  };
  return { contract, delta, predecessor, d3Context };
}

let options;
try {
  options = parseD4Cli(['--execution-contract', CONTRACT_PATH, ...process.argv.slice(2)]);
  options.d3Options.contractPath = D3_V6_CONTRACT_PATH;
  const context = loadProjectDoctorD4V6Context();
  const plan = createPlanV6(options.d3Options, { context: context.d3Context });
  const result = executePlan({ plan, d3Contract: context.d3Context.contract, d4Contract: context.contract, dryRun: options.dryRun });
  const output = { plan, result };
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log('PROJECT DOCTOR EXECUTION — D4 V6');
    console.log(`Plan status   : ${plan.status}`);
    console.log(`Changed files : ${plan.changedFileCount}`);
    console.log(`Run status    : ${result.status}`);
    console.log(`Checks queued : ${result.preflight?.queue?.length ?? 0}`);
    console.log(`Checks run    : ${result.executions.length}`);
    console.log(`Provenance-only: ${plan.freshnessV2?.provenanceOnlyCount ?? 0}`);
    for (const item of result.executions) console.log(`  [${item.exitCode}] ${item.id}: ${item.command}`);
    if (result.manualReviews?.length) console.log(`Manual review : ${result.manualReviews.length}`);
  }
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(`[doctor:run:v6] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
