import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridgeStatusSource } from '../lib/bridge-status-source.mjs';

export function parseBridgeArgs(argv) {
  const options = { all: false, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--check') {
      options.apply = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!['--pipeline', '--id', '--source', '--note'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--pipeline') options.pipelineId = value;
    else if (arg === '--id') options.entryId = value;
    else if (arg === '--source') options.sourcePath = value;
    else if (arg === '--note') options.note = value;
  }

  if (!options.help) {
    if (options.all && options.pipelineId) throw new Error('--all and --pipeline cannot be used together.');
    if (!options.all && !options.pipelineId) throw new Error('--pipeline or --all is required.');
    if (options.all && (options.entryId || options.sourcePath || options.note)) {
      throw new Error('--id, --source, and --note cannot override individual pipelines when --all is used.');
    }
    if ((options.entryId && !options.sourcePath) || (!options.entryId && options.sourcePath)) {
      throw new Error('--id and --source must be provided together for a candidate artifact.');
    }
  }
  return options;
}

function usage() {
  console.log('Usage: node tools/status-source/cli/bridge.mjs (--pipeline <pipeline-id> | --all) [--id <entry-id> --source <validated-json>] [--check | --apply] [--note text]');
  console.log('Default mode is CHECK. The bridge never executes or infers owning validators.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseBridgeArgs(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(bridgeStatusSource(options), null, 2));
  } catch (error) {
    console.error(`[status-source-artifact-bridge] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
