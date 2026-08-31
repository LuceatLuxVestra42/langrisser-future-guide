import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAdmissionAssignment,
  promoteStatusSource,
} from '../lib/promote-status-source.mjs';

export function parsePromotionArgs(argv) {
  const options = { equals: [], in: [], apply: false };
  const valueArgs = new Set(['--domain', '--id', '--source', '--facet', '--equals', '--in', '--projection-file', '--note']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (!valueArgs.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--domain') options.domain = value;
    else if (arg === '--id') options.id = value;
    else if (arg === '--source') options.sourcePath = value;
    else if (arg === '--facet') options.facet = value;
    else if (arg === '--equals') options.equals.push(parseAdmissionAssignment(value, arg));
    else if (arg === '--in') options.in.push(parseAdmissionAssignment(value, arg));
    else if (arg === '--projection-file') options.projectionFile = value;
    else if (arg === '--note') options.note = value;
  }
  return options;
}

function usage() {
  console.log('Usage: node tools/status-source/cli/promote.mjs --domain <domain> --id <entry-id> --source <validated-json> [--facet <facet>] [--equals /pointer=value] [--in /pointer=a,b] [--projection-file file.json] [--note text] [--apply]');
  console.log('Default mode is CHECK. Repository mutation occurs only with --apply.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parsePromotionArgs(process.argv.slice(2));
    if (options.help) usage();
    else console.log(JSON.stringify(promoteStatusSource(options), null, 2));
  } catch (error) {
    console.error(`[status-source-promotion] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
