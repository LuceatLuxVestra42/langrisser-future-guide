#!/usr/bin/env node
import process from 'node:process';
import {
  MODE_PROBE,
  MODE_STRICT,
  runRouteHostedQa,
} from '../lib/hosted-qa.mjs';

export function parseCliArgs(argv = []) {
  const out = {
    mode: MODE_STRICT,
    expectedSourceSha: null,
    baseUrl: null,
    maxAssets: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--probe-current') out.mode = MODE_PROBE;
    else if (arg === '--expected-sha') out.expectedSourceSha = argv[++index] ?? null;
    else if (arg === '--base-url') out.baseUrl = argv[++index] ?? null;
    else if (arg === '--max-assets') out.maxAssets = Number(argv[++index]);
    else if (arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'Usage:',
    '  node tools/route-hosted-qa/cli/check.mjs --expected-sha <40-hex-sha>',
    '  node tools/route-hosted-qa/cli/check.mjs --probe-current',
    '',
    'Options:',
    '  --expected-sha <sha>  Required in STRICT_CANDIDATE mode.',
    '  --probe-current        Validate the currently deployed source without claiming candidate freshness.',
    '  --base-url <url>       Override only within the frozen GitHub Pages repository base.',
    '  --max-assets <n>       Limit exact emitted asset requests, up to the frozen contract maximum.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const result = await runRouteHostedQa({
      mode: args.mode,
      expectedSourceSha: args.expectedSourceSha,
      baseUrl: args.baseUrl ?? undefined,
      maxAssets: args.maxAssets ?? undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(JSON.stringify({
      status: 'BLOCKER_INVALID_INVOCATION',
      exitCode: 2,
      message: String(error?.message ?? error),
    }, null, 2));
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
