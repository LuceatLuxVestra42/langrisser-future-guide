import { readIndexedSourceRecord } from '../lib/bounded-source-record.mjs';

function usage() {
  return 'Usage: node tools/configdata-lookup/cli/read-source-record.mjs <Entity> <ID> [--json]';
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter((arg) => arg !== '--json');
  if (positional.length !== 2) throw new Error(usage());

  const result = await readIndexedSourceRecord(positional[0], positional[1]);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write([
    `${positional[0]} ${result.id}`,
    `source: ${result.source}`,
    `sourceSha256: ${result.sourceSha256}`,
    `containerPath: ${result.containerPath}`,
    `recordIndex: ${result.recordIndex}`,
    `primaryKey: ${result.primaryKey}`,
    JSON.stringify(result.record),
  ].join('\n') + '\n');
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
