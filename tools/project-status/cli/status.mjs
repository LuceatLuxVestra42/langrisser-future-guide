import { buildProjectStatus } from '../lib/project-status-view.mjs';

const args = new Set(process.argv.slice(2));
const known = new Set(['--normalized', '--project-status', '--markdown', '--help', '-h']);
for (const arg of args) {
  if (!known.has(arg)) throw new Error(`Unknown argument: ${arg}`);
}

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node tools/project-status/cli/status.mjs [--normalized|--project-status|--markdown]');
  process.exit(0);
}

const modes = ['--normalized', '--project-status', '--markdown'].filter(flag => args.has(flag));
if (modes.length > 1) throw new Error('Choose at most one output mode.');

const result = buildProjectStatus();
if (args.has('--normalized')) console.log(JSON.stringify(result.normalized, null, 2));
else if (args.has('--markdown')) process.stdout.write(result.markdown);
else console.log(JSON.stringify(result.projectStatus, null, 2));
