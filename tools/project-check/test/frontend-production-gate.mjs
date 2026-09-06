import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();

function run(label, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    process.exit(2);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit ${result.status ?? 2}.`);
    process.exit(Number.isInteger(result.status) ? result.status : 2);
  }
}

run('Production build', 'npm', ['run', 'build']);
run('TypeScript gate', process.execPath, [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '--noEmit']);

console.log('Frontend production gate PASS: production build and TypeScript gate succeeded.');
