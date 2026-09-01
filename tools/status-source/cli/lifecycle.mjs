import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handoffStatusSource,
  renderCloseoutRequest,
  resolveProducerDeclaration,
} from '../lib/lifecycle-status-source.mjs';

function parseValues(argv, allowed) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!allowed.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    values[arg] = value;
  }
  return values;
}

export function parseLifecycleArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { help: true };

  if (command === 'declaration') {
    const githubOutput = rest.includes('--github-output');
    const filtered = rest.filter(arg => arg !== '--github-output');
    const values = parseValues(filtered, new Set(['--pipeline']));
    if (!values['--pipeline']) throw new Error('--pipeline is required.');
    return { command, pipelineId: values['--pipeline'], githubOutput };
  }

  if (command === 'closeout') {
    const write = rest.includes('--write');
    const filtered = rest.filter(arg => arg !== '--write' && arg !== '--check');
    const values = parseValues(filtered, new Set(['--pipeline']));
    if (!values['--pipeline']) throw new Error('--pipeline is required.');
    return { command, pipelineId: values['--pipeline'], write };
  }

  if (command === 'handoff') {
    const apply = rest.includes('--apply');
    const filtered = rest.filter(arg => arg !== '--apply' && arg !== '--check');
    const values = parseValues(filtered, new Set(['--pipeline', '--expected-predecessor', '--id', '--source', '--note']));
    for (const flag of ['--pipeline', '--expected-predecessor', '--id', '--source']) {
      if (!values[flag]) throw new Error(`${flag} is required.`);
    }
    return {
      command,
      pipelineId: values['--pipeline'],
      expectedPredecessorId: values['--expected-predecessor'],
      entryId: values['--id'],
      sourcePath: values['--source'],
      note: values['--note'],
      apply,
    };
  }

  throw new Error(`Unknown lifecycle command: ${command}`);
}

function writeGitHubOutput(result, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) throw new Error('GITHUB_OUTPUT is not available.');
  const values = {
    ready: 'true',
    pipeline: result.pipelineId,
    expected_predecessor: result.expectedPredecessorId,
    entry_id: result.entryId,
    source_path: result.sourcePath,
  };
  for (const [key, value] of Object.entries(values)) {
    const text = String(value);
    if (/[\r\n]/.test(text)) throw new Error(`Unsafe GitHub output value for ${key}`);
    fs.appendFileSync(outputPath, `${key}=${text}\n`);
  }
  return values;
}

function usage() {
  console.log('Usage:');
  console.log('  node tools/status-source/cli/lifecycle.mjs declaration --pipeline <hero|soldier> [--github-output]');
  console.log('  node tools/status-source/cli/lifecycle.mjs closeout --pipeline <hero|soldier> [--check|--write]');
  console.log('  node tools/status-source/cli/lifecycle.mjs handoff --pipeline <hero|soldier> --expected-predecessor <entry-id> --id <entry-id> --source <validated-json> [--note text] [--check|--apply]');
  console.log('Default closeout/handoff mode is CHECK. No production writer workflow is activated during shadow migration.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseLifecycleArgs(process.argv.slice(2));
    if (options.help) {
      usage();
    } else if (options.command === 'declaration') {
      const result = resolveProducerDeclaration({ pipelineId: options.pipelineId });
      if (options.githubOutput) writeGitHubOutput(result);
      console.log(JSON.stringify(result, null, 2));
    } else if (options.command === 'closeout') {
      console.log(JSON.stringify(renderCloseoutRequest({ pipelineId: options.pipelineId, write: options.write }), null, 2));
    } else {
      console.log(JSON.stringify(handoffStatusSource(options), null, 2));
    }
  } catch (error) {
    console.error(`[status-source-lifecycle] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
