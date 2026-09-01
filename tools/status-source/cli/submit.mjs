import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePromotionArgs } from './promote.mjs';
import { submitStatusSource } from '../lib/submit-status-source.mjs';

export function parseSubmissionArgs(argv) {
  const producerIndexes = argv
    .map((value, index) => value === '--producer' ? index : -1)
    .filter(index => index >= 0);
  if (producerIndexes.length !== 1) throw new Error('--producer must be provided exactly once.');
  const producerIndex = producerIndexes[0];
  const producerId = argv[producerIndex + 1];
  if (!producerId || producerId.startsWith('--')) throw new Error('--producer requires a producer id.');
  const promotionArgv = argv.filter((_, index) => index !== producerIndex && index !== producerIndex + 1);
  return {
    producerId,
    promotionOptions: parsePromotionArgs(promotionArgv),
  };
}

function usage() {
  console.log('Usage: node tools/status-source/cli/submit.mjs --producer <producer-id> --id <entry-id> --source <validated-json> [promotion options] [--apply]');
  console.log('Producer domain is authoritative. Default mode is CHECK; repository mutation requires explicit --apply.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) usage();
    else console.log(JSON.stringify(submitStatusSource(parseSubmissionArgs(argv)), null, 2));
  } catch (error) {
    console.error(`[status-source-producer] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
