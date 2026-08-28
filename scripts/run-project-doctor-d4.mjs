import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlanCli, createPlan, DEFAULT_PLAN_CONTRACT_PATH } from './plan-project-doctor-d3.mjs';

export const DEFAULT_D4_CONTRACT_PATH = 'data/contracts/project-doctor-d4-execution.v1.json';
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const parseD4Cli = argv => {
  const own = { dryRun: false, json: false, contractPath: DEFAULT_D4_CONTRACT_PATH, help: false };
  const d3Args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') own.dryRun = true;
    else if (arg === '--json') { own.json = true; d3Args.push(arg); }
    else if (arg === '--execution-contract') {
      if (!argv[i + 1]) throw new Error('--execution-contract requires a path.');
      own.contractPath = argv[++i];
    } else if (arg === '--help' || arg === '-h') own.help = true;
    else d3Args.push(arg);
  }
  return { ...own, d3Options: parsePlanCli(d3Args) };
};

export const buildAllowlist = (d3Contract, d4Contract) => {
  const catalog = new Map((d3Contract.checkCatalog ?? []).map(item => [item.id, item]));
  const allowlist = new Map();
  for (const id of new Set(d4Contract.allowedCheckIds ?? [])) {
    const item = catalog.get(id);
    if (!item) throw new Error(`D4 allowed check is absent from D3 catalog: ${id}`);
    allowlist.set(id, { id, phase: item.phase, command: item.command });
  }
  return allowlist;
};

const parseNpmRun = command => {
  const match = /^npm run ([A-Za-z0-9:_-]+)$/.exec(command);
  if (!match) throw new Error(`Command is outside the allowed npm-run shape: ${command}`);
  return { program: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', match[1]] };
};

export const preflightPlan = ({ plan, d3Contract, d4Contract }) => {
  if (!['PLAN_READY', 'MANUAL_REVIEW', 'NO_CHANGES'].includes(plan?.status)) {
    return { ok: false, errors: [`Plan status is not executable: ${plan?.status ?? 'missing'}`], queue: [] };
  }
  const allowlist = buildAllowlist(d3Contract, d4Contract);
  const errors = [];
  const seen = new Set();
  const queue = [];
  for (const check of plan.selectedChecks ?? []) {
    if (seen.has(check.id)) { errors.push(`Duplicate selected check: ${check.id}`); continue; }
    seen.add(check.id);
    const allowed = allowlist.get(check.id);
    if (!allowed) { errors.push(`Selected check is not allowed by D4: ${check.id}`); continue; }
    if (check.command !== allowed.command) { errors.push(`Command mismatch for ${check.id}`); continue; }
    if (Number(check.phase) !== Number(allowed.phase)) { errors.push(`Phase mismatch for ${check.id}`); continue; }
    try {
      queue.push({ id: check.id, phase: check.phase, command: check.command, ...parseNpmRun(check.command) });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  queue.sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));
  return { ok: errors.length === 0, errors, queue };
};

const defaultExecutor = item => spawnSync(item.program, item.args, { stdio: 'inherit', shell: false });

export const executePlan = ({ plan, d3Contract, d4Contract, dryRun = false, executor = defaultExecutor }) => {
  const preflight = preflightPlan({ plan, d3Contract, d4Contract });
  if (!preflight.ok) return { status: 'INVALID_PLAN', exitCode: 2, preflight, executions: [], manualReviews: plan.manualReviews ?? [] };
  if (plan.status === 'NO_CHANGES') return { status: 'PASS_NO_CHANGES', exitCode: 0, preflight, executions: [], manualReviews: [] };
  if (dryRun) return { status: 'PASS_DRY_RUN', exitCode: 0, preflight, executions: [], manualReviews: plan.manualReviews ?? [] };

  const executions = [];
  for (const item of preflight.queue) {
    const result = executor(item);
    const exitCode = result?.status ?? 1;
    executions.push({ id: item.id, phase: item.phase, command: item.command, exitCode, error: result?.error?.message ?? null });
    if (result?.error || exitCode !== 0) {
      return { status: 'FAIL_CHECK', exitCode: 1, failedCheckId: item.id, preflight, executions, manualReviews: plan.manualReviews ?? [] };
    }
  }
  if (plan.status === 'MANUAL_REVIEW') return { status: 'REVIEW_MANUAL', exitCode: 3, preflight, executions, manualReviews: plan.manualReviews ?? [] };
  return { status: 'PASS_EXECUTED', exitCode: 0, preflight, executions, manualReviews: [] };
};

const printHuman = ({ plan, result }) => {
  console.log('PROJECT DOCTOR EXECUTION');
  console.log(`Plan status   : ${plan.status}`);
  console.log(`Changed files : ${plan.changedFileCount}`);
  console.log(`Run status    : ${result.status}`);
  console.log(`Checks queued : ${result.preflight?.queue?.length ?? 0}`);
  console.log(`Checks run    : ${result.executions.length}`);
  for (const execution of result.executions) console.log(`  [${execution.exitCode}] ${execution.id}: ${execution.command}`);
  if (result.manualReviews?.length) console.log(`Manual review : ${result.manualReviews.length}`);
  if (result.preflight?.errors?.length) for (const error of result.preflight.errors) console.error(`  preflight: ${error}`);
};

export const runD4 = ({ options, helpers = {} }) => {
  const d4Contract = helpers.d4Contract ?? readJson(options.contractPath);
  if (d4Contract.status !== 'DESIGN_FROZEN') throw new Error(`D4 contract is not frozen: ${d4Contract.status}`);
  const d3ContractPath = d4Contract.d3Contract ?? DEFAULT_PLAN_CONTRACT_PATH;
  const d3Contract = helpers.d3Contract ?? readJson(d3ContractPath);
  const d3Options = { ...options.d3Options, contractPath: d3ContractPath };
  const plan = helpers.plan ?? createPlan(d3Options, helpers.planHelpers ?? {});
  const result = executePlan({ plan, d3Contract, d4Contract, dryRun: options.dryRun, executor: helpers.executor });
  return { plan, result };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let options;
  try {
    options = parseD4Cli(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/run-project-doctor-d4.mjs [--dry-run] [--json] [D3 changed-file source options]');
      process.exit(0);
    }
    const output = runD4({ options });
    if (options.json) console.log(JSON.stringify(output, null, 2));
    else printHuman(output);
    process.exitCode = output.result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.json) console.log(JSON.stringify({ stage: 'D4', status: 'INVALID_PLAN', error: message }, null, 2));
    else console.error(`[doctor:run] ${message}`);
    process.exitCode = 2;
  }
}
