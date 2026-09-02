import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';

installConfigDataSourceRootReadRedirect();
const { rebuildIncrementally, renderJson } = await import('../../../scripts/lib/configdata-lookup-stage6.mjs');

function usage() {
  return 'usage: node tools/configdata-lookup/cli/rebuild.mjs --apply [--json]\n';
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(['--apply', '--json']);
  for (const arg of args) {
    if (!allowed.has(arg)) throw new Error(`unsupported argument: ${arg}\n${usage()}`);
  }
  if (!args.has('--apply')) throw new Error(`explicit --apply is required\n${usage()}`);

  const result = await rebuildIncrementally();
  if (args.has('--json')) {
    process.stdout.write(renderJson(result));
    return;
  }
  process.stdout.write(`${result.status}\nchanged files: ${result.changedFileCount}\n`);
  for (const filePath of result.changedFiles) process.stdout.write(`  ${filePath}\n`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
