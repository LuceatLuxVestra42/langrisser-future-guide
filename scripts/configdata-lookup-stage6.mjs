import {
  detectStalePlan,
  rebuildIncrementally,
  renderJson,
} from './lib/configdata-lookup-stage6.mjs';

function humanPlan(plan) {
  const lines = [`${plan.status} (${plan.staleCount} stale layer(s))`];
  for (const item of plan.stage1.dirtyEntities) lines.push(`Stage1 ${item.name}: ${item.reasons.join(', ')}`);
  for (const item of plan.stage2.dirtyDomains) lines.push(`Stage2 ${item.name}: ${item.reasons.join(', ')}`);
  for (const key of ['stage3', 'stage4', 'stage5', 'stage6']) {
    const item = plan[key];
    if (item.reasons.length) lines.push(`${item.name}: ${item.reasons.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const json = args.includes('--json');
  if (command === 'check') {
    const plan = await detectStalePlan();
    process.stdout.write(json ? renderJson(plan) : humanPlan(plan));
    if (plan.staleCount !== 0) process.exitCode = 2;
    return;
  }
  if (command === 'rebuild') {
    const result = await rebuildIncrementally();
    process.stdout.write(json ? renderJson(result) : `${result.status}\nchanged files: ${result.changedFileCount}\n${result.changedFiles.map((p) => `  ${p}`).join('\n')}${result.changedFiles.length ? '\n' : ''}`);
    return;
  }
  throw new Error('usage: node scripts/configdata-lookup-stage6.mjs <check|rebuild> [--json]');
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
