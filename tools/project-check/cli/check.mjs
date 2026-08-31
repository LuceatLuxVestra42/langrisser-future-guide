#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectChangedPaths,
  executeProjectCheck,
  normalizeRepositoryPath,
} from '../lib/project-check.mjs';

export function parseArgs(argv) {
  const options = { paths: [], planOnly: false, json: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') options.base = argv[++index];
    else if (arg === '--head') options.head = argv[++index];
    else if (arg === '--path') options.paths.push(argv[++index]);
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--plan') options.planOnly = true;
    else if (arg === '--no-json') options.json = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function stdinPaths() {
  return fs.readFileSync(0, 'utf8')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(normalizeRepositoryPath);
}

function usage() {
  console.log('Usage: node tools/project-check/cli/check.mjs [--base <ref> --head <ref>] [--path <repo-path> ...] [--stdin] [--plan]');
}

export function runCli(options, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const explicit = options.paths.map(normalizeRepositoryPath);
  const fromStdin = options.stdin ? stdinPaths() : [];
  const compared = options.base ? collectChangedPaths({ repoRoot, base: options.base, head: options.head ?? 'HEAD' }) : [];
  const paths = [...new Set([...explicit, ...fromStdin, ...compared])].sort();
  const result = executeProjectCheck(paths, { repoRoot, planOnly: options.planOnly === true });
  return { paths, result };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      process.exit(0);
    }
    if (!options.base && !options.stdin && options.paths.length === 0) {
      throw new Error('Provide --base, --path, or --stdin.');
    }
    const { result } = runCli(options);
    if (options.json !== false) console.log(JSON.stringify(result, null, 2));
    else console.log(`Project Check: ${result.status} (${result.route.changedFileCount} files, ${result.route.validatorCount} validators)`);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[project-check] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
