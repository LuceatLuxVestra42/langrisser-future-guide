import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshFreshness } from './run-project-doctor-d5-refresh-active.mjs';

export * from './run-project-doctor-d5-refresh-active.mjs';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = refreshFreshness();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
