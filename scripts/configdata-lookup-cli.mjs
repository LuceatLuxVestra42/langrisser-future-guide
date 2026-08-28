import {
  findEntity,
  loadStage5Contract,
  lookupEntity,
  refsEntity,
  renderFindHuman,
  renderJson,
  renderLookupHuman,
  renderRefsHuman,
} from './lib/configdata-lookup-stage5.mjs';

function parseOptions(args) {
  const positional = [];
  let json = false;
  let limit = null;
  for (const arg of args) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('--limit=')) limit = arg.slice('--limit='.length);
    else positional.push(arg);
  }
  return { positional, json, limit };
}

function usage() {
  return [
    'Usage:',
    '  npm run lookup -- <Entity> <ID> [--json]',
    '  npm run refs -- <Entity> <ID> [--json]',
    '  npm run find -- <Entity> <literal> [--limit=N] [--json]',
  ].join('\n');
}

async function main() {
  const command = process.argv[2];
  const { positional, json, limit } = parseOptions(process.argv.slice(3));
  const contract = await loadStage5Contract();

  if (command === 'lookup') {
    if (positional.length !== 2) throw new Error(usage());
    const result = await lookupEntity(positional[0], positional[1], contract);
    process.stdout.write(json ? renderJson(result) : renderLookupHuman(result, contract));
    if (!result.found) process.exitCode = 2;
    return;
  }

  if (command === 'refs') {
    if (positional.length !== 2) throw new Error(usage());
    const result = await refsEntity(positional[0], positional[1], contract);
    process.stdout.write(json ? renderJson(result) : renderRefsHuman(result, contract));
    if (!result.found) process.exitCode = 2;
    return;
  }

  if (command === 'find') {
    if (positional.length !== 2) throw new Error(usage());
    const result = await findEntity(positional[0], positional[1], limit, contract);
    process.stdout.write(json ? renderJson(result) : renderFindHuman(result));
    if (result.totalMatchCount === 0) process.exitCode = 2;
    return;
  }

  throw new Error(usage());
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
