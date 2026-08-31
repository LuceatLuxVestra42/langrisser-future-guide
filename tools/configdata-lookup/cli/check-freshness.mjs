import { checkLookupFreshness } from '../lib/freshness.mjs';

async function main() {
  const json = process.argv.includes('--json');
  const plan = await checkLookupFreshness();
  if (json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else process.stdout.write(`${plan.status} (${plan.staleCount} stale layer(s))\n`);
  if (plan.staleCount !== 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
