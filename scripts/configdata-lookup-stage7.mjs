#!/usr/bin/env node
import {
  changedPathsFromGit,
  changedPathsFromWorkingTree,
  loadStage7Inputs,
  renderDoctor,
  renderPlan,
  runSelectedPipelines,
  selectSmartRegression,
  writeGitHubOutputs,
} from './lib/configdata-lookup-stage7.mjs';

function parseArgs(argv) {
  const command = argv[0] || 'doctor';
  const options = { changed: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--changed') {
      const value = argv[++index];
      if (!value) throw new Error('--changed requires a path.');
      options.changed.push(value);
    } else if (token === '--base') {
      options.base = argv[++index];
      if (!options.base) throw new Error('--base requires a git revision.');
    } else if (token === '--head') {
      options.head = argv[++index];
      if (!options.head) throw new Error('--head requires a git revision.');
    } else if (token === '--json') {
      options.json = true;
    } else if (token === '--github-output') {
      options.githubOutput = argv[++index];
      if (!options.githubOutput) throw new Error('--github-output requires a file path.');
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (Boolean(options.base) !== Boolean(options.head)) {
    throw new Error('--base and --head must be provided together.');
  }
  return { command, options };
}

function resolveChangedPaths(options) {
  if (options.changed.length) return options.changed;
  if (options.base && options.head) return changedPathsFromGit(options.base, options.head);
  return changedPathsFromWorkingTree();
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!['plan', 'doctor', 'run'].includes(command)) {
    throw new Error(`Usage: node scripts/configdata-lookup-stage7.mjs <plan|doctor|run> [--changed PATH ... | --base SHA --head SHA] [--json] [--github-output FILE]`);
  }

  const inputs = loadStage7Inputs();
  const plan = selectSmartRegression(resolveChangedPaths(options), inputs);

  if (options.githubOutput) writeGitHubOutputs(options.githubOutput, plan);

  if (command === 'run') {
    process.stdout.write(options.json ? renderPlan(plan) : renderDoctor(plan));
    const result = runSelectedPipelines(plan, inputs);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === 'plan' || options.json) {
    process.stdout.write(renderPlan(plan));
  } else {
    process.stdout.write(renderDoctor(plan));
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
