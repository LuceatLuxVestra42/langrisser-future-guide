import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseD4Cli, executePlan } from './run-project-doctor-d4.mjs';
import { createPlanV7, loadProjectDoctorD3V7Context, D3_V7_CONTRACT_PATH } from './plan-project-doctor-d3-v7.mjs';
import { loadProjectDoctorD4V6Context } from './run-project-doctor-d4-v6.mjs';

const CONTRACT_PATH = 'data/contracts/project-doctor-d4-execution.v7.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD4V7Context() {
  const delta = read(CONTRACT_PATH);
  if (delta.status !== 'DESIGN_FROZEN' || delta.schemaId !== 'project-doctor-d4-execution/v7') throw new Error('D4 V7 contract is not frozen.');
  if (delta.extends !== 'data/contracts/project-doctor-d4-execution.v6.json') throw new Error('D4 V7 must extend frozen V6.');
  const v6 = loadProjectDoctorD4V6Context();
  const d3Context = loadProjectDoctorD3V7Context(delta.d3Contract);
  const contract = {
    ...v6.contract,
    ...delta,
    allowedCheckIds: [...new Set([...(v6.contract.allowedCheckIds ?? []), ...(delta.addedAllowedCheckIds ?? [])])],
  };
  return { contract, delta, predecessor: v6.contract, d3Context };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let options;
  try {
    options = parseD4Cli(['--execution-contract', CONTRACT_PATH, ...process.argv.slice(2)]);
    options.d3Options.contractPath = D3_V7_CONTRACT_PATH;
    const context = loadProjectDoctorD4V7Context();
    const plan = createPlanV7(options.d3Options, { context: context.d3Context });
    const result = executePlan({ plan, d3Contract: context.d3Context.contract, d4Contract: context.contract, dryRun: options.dryRun });
    const output = { plan, result };
    if (options.json) console.log(JSON.stringify(output, null, 2));
    else {
      console.log('PROJECT DOCTOR EXECUTION — D4 V7');
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
    console.error(`[doctor:run:v7] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
