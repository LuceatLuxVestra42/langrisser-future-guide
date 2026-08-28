import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEffectiveMap, analyzePaths, parseStdinText } from './analyze-project-doctor-d2-impact.mjs';

export const DEFAULT_PLAN_CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v1.json';

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const uniqSorted = values => [...new Set(values)].sort();

export const parsePlanCli = argv => {
  const options = {
    contractPath: DEFAULT_PLAN_CONTRACT_PATH,
    json: false,
    help: false,
    mode: 'compare',
    base: 'main',
    head: 'HEAD',
    paths: [],
  };
  let sourceMode = null;
  const claimMode = mode => {
    if (sourceMode && sourceMode !== mode) throw new Error(`Only one changed-file source mode may be used (already selected: ${sourceMode}).`);
    sourceMode = mode;
    options.mode = mode;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--contract') {
      if (!argv[i + 1]) throw new Error('--contract requires a path.');
      options.contractPath = argv[++i];
    } else if (arg === '--base') {
      if (!argv[i + 1]) throw new Error('--base requires a git ref.');
      options.base = argv[++i];
    } else if (arg === '--head') {
      if (!argv[i + 1]) throw new Error('--head requires a git ref.');
      options.head = argv[++i];
    } else if (arg === '--staged') claimMode('staged');
    else if (arg === '--working') claimMode('working');
    else if (arg === '--stdin') claimMode('stdin');
    else if (arg === '--paths') {
      claimMode('paths');
      options.paths.push(...argv.slice(i + 1));
      break;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else {
      claimMode('paths');
      options.paths.push(arg);
    }
  }
  if (!sourceMode) options.mode = 'compare';
  if (options.mode !== 'compare' && (options.base !== 'main' || options.head !== 'HEAD')) {
    throw new Error('--base/--head are only valid with compare mode.');
  }
  return options;
};

const defaultGitRunner = args => spawnSync('git', args, { encoding: 'utf8' });

const gitLines = (args, runGit) => {
  const result = runGit(args);
  if (result.error) throw new Error(`git could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim() || `exit ${result.status ?? 'unknown'}`;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return String(result.stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
};

export const collectChangedFiles = (options, { runGit = defaultGitRunner, stdinText = null } = {}) => {
  if (options.mode === 'paths') return options.paths;
  if (options.mode === 'stdin') {
    const text = stdinText === null ? fs.readFileSync(0, 'utf8') : stdinText;
    return parseStdinText(text);
  }
  if (options.mode === 'staged') {
    return gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMRD', '--'], runGit);
  }
  if (options.mode === 'working') {
    const tracked = gitLines(['diff', '--name-only', '--diff-filter=ACMRD', '--'], runGit);
    const untracked = gitLines(['ls-files', '--others', '--exclude-standard'], runGit);
    return uniqSorted([...tracked, ...untracked]);
  }
  if (!options.base || !options.head) throw new Error('Compare mode requires both base and head refs.');
  return gitLines(['diff', '--name-only', '--diff-filter=ACMRD', `${options.base}...${options.head}`, '--'], runGit);
};

export const loadPlanningContext = contractPath => {
  const contract = readJson(contractPath);
  if (contract.status !== 'DESIGN_FROZEN') throw new Error(`D3 contract is not frozen: ${contract.status}`);
  const impactContract = readJson(contract.impactContract);
  if (impactContract.status !== 'DESIGN_FROZEN') throw new Error(`D2 impact contract is not frozen: ${impactContract.status}`);
  const baseMap = readJson(impactContract.baseMap);
  if (baseMap.status !== 'DESIGN_FROZEN') throw new Error(`D2 dependency map is not frozen: ${baseMap.status}`);
  return { contract, impactContract, effectiveMap: buildEffectiveMap(baseMap, impactContract) };
};

export const selectChecks = (impact, contract) => {
  const nodes = new Set(impact.impactedNodes ?? []);
  const changeClasses = new Set(impact.changeClasses ?? []);
  return (contract.checkCatalog ?? [])
    .filter(item => (item.triggerNodes ?? []).some(node => nodes.has(node))
      || (item.triggerChangeClasses ?? []).some(changeClass => changeClasses.has(changeClass)))
    .map(item => ({
      id: item.id,
      type: item.type,
      phase: item.phase,
      command: item.command,
      execution: 'PLANNED',
      triggeredByNodes: uniqSorted((item.triggerNodes ?? []).filter(node => nodes.has(node))),
      triggeredByChangeClasses: uniqSorted((item.triggerChangeClasses ?? []).filter(value => changeClasses.has(value))),
      coverage: item.coverage,
    }))
    .sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));
};

export const selectManualReviews = (impact, contract) => {
  const reviews = [];
  const manualNodes = contract.manualReviewNodes ?? {};
  for (const node of uniqSorted(impact.impactedNodes ?? [])) {
    if (manualNodes[node]) reviews.push({ type: 'UNCATALOGED_DEDICATED_CHECK', node, reason: manualNodes[node] });
  }
  for (const file of impact.files ?? []) {
    if (file.status === 'MANUAL_REVIEW') {
      reviews.push({ type: 'UNMAPPED_PATH', path: file.path ?? file.inputPath, reason: file.reason ?? 'MANUAL_REVIEW' });
    }
  }
  return reviews;
};

export const buildPlanFromImpact = ({ source, changedFiles, impact, contract }) => {
  if (impact.status === 'INVALID_INPUT') {
    return {
      version: 1, schemaId: 'project-doctor-d3-plan/v1', stage: 'D3', status: 'INVALID_INPUT',
      source, changedFileCount: impact.changedFileCount, changedFiles, impact,
      selectedChecks: [], manualReviews: [], validatorExecutionCount: 0,
    };
  }
  const selectedChecks = selectChecks(impact, contract);
  const manualReviews = selectManualReviews(impact, contract);
  const status = manualReviews.length > 0 || impact.status === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'PLAN_READY';
  return {
    version: 1,
    schemaId: 'project-doctor-d3-plan/v1',
    stage: 'D3',
    status,
    source,
    changedFileCount: impact.changedFileCount,
    changedFiles: (impact.files ?? []).map(file => file.path ?? file.inputPath),
    impact: {
      status: impact.status,
      directNodes: impact.directNodes,
      impactedNodes: impact.impactedNodes,
      domains: impact.domains,
      changeClasses: impact.changeClasses,
      manualReviewFileCount: impact.manualReviewFileCount,
      invalidFileCount: impact.invalidFileCount,
      files: impact.files,
    },
    selectedChecks,
    manualReviews,
    validatorExecutionCount: 0,
  };
};

export const planPaths = ({ paths, source = { mode: 'paths' }, context }) => {
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      version: 1, schemaId: 'project-doctor-d3-plan/v1', stage: 'D3', status: 'NO_CHANGES',
      source, changedFileCount: 0, changedFiles: [],
      impact: { status: 'MAPPED', directNodes: [], impactedNodes: [], domains: [], changeClasses: [], files: [] },
      selectedChecks: [], manualReviews: [], validatorExecutionCount: 0,
    };
  }
  const impact = analyzePaths(paths, context.effectiveMap);
  return buildPlanFromImpact({ source, changedFiles: paths, impact, contract: context.contract });
};

export const createPlan = (options, helpers = {}) => {
  const context = helpers.context ?? loadPlanningContext(options.contractPath);
  const changedFiles = collectChangedFiles(options, helpers);
  const source = { mode: options.mode };
  if (options.mode === 'compare') Object.assign(source, { base: options.base, head: options.head, comparison: `${options.base}...${options.head}` });
  return planPaths({ paths: changedFiles, source, context });
};

const printHuman = plan => {
  console.log('PROJECT DOCTOR VALIDATION PLAN');
  console.log(`Source        : ${plan.source?.mode ?? '-'}`);
  if (plan.source?.comparison) console.log(`Compare       : ${plan.source.comparison}`);
  console.log(`Changed files : ${plan.changedFileCount}`);
  console.log(`Status        : ${plan.status}`);
  console.log(`Domains       : ${plan.impact?.domains?.length ? plan.impact.domains.join(', ') : '-'}`);
  console.log(`Impact nodes  : ${plan.impact?.impactedNodes?.length ? plan.impact.impactedNodes.join(', ') : '-'}`);
  console.log('\nPlanned checks:');
  if (!plan.selectedChecks.length) console.log('  - none');
  for (const check of plan.selectedChecks) console.log(`  [phase ${check.phase}] ${check.id}: ${check.command}`);
  if (plan.manualReviews.length) {
    console.log('\nManual review:');
    for (const review of plan.manualReviews) console.log(`  - ${review.node ?? review.path}: ${review.reason}`);
  }
  console.log('\nValidator executions: 0 (D3 is plan-only)');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let options;
  try {
    options = parsePlanCli(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/plan-project-doctor-d3.mjs [--json] [--base main --head HEAD | --staged | --working | --stdin | --paths <path...>]');
      console.log('Default source: git diff main...HEAD');
      process.exit(0);
    }
    const plan = createPlan(options);
    if (options.json) console.log(JSON.stringify(plan, null, 2));
    else printHuman(plan);
    const contract = readJson(options.contractPath);
    process.exitCode = contract.exitPolicy?.[plan.status] ?? (plan.status === 'PLAN_READY' || plan.status === 'NO_CHANGES' ? 0 : 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.json) console.log(JSON.stringify({ version: 1, stage: 'D3', status: 'INVALID_INPUT', error: message, validatorExecutionCount: 0 }, null, 2));
    else console.error(`[doctor:plan] ${message}`);
    process.exitCode = 2;
  }
}
