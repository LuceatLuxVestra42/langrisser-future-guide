import { loadProjectStatusWriterContract, writeProjectStatus } from '../lib/write-project-status.mjs';

const args = new Set(process.argv.slice(2));
const known = new Set(['--apply', '--check', '--activation', '--help', '-h']);
for (const arg of args) {
  if (!known.has(arg)) throw new Error(`Unknown argument: ${arg}`);
}

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node tools/project-status/cli/write.mjs [--check|--apply|--activation]');
  process.exit(0);
}

if (args.has('--apply') && args.has('--check')) throw new Error('Choose either --check or --apply.');

if (args.has('--activation')) {
  const contract = loadProjectStatusWriterContract();
  console.log(JSON.stringify({
    state: contract.state,
    activeWriterWorkflow: contract.activeWriterWorkflow,
    legacyWriterWorkflow: contract.legacyWriterWorkflow,
    canonicalTargets: contract.canonicalTargets,
  }, null, 2));
  process.exit(0);
}

const result = writeProjectStatus({ apply: args.has('--apply') });
console.log(JSON.stringify(result, null, 2));
