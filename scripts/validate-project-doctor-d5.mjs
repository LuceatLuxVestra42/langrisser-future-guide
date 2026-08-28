import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFreshness } from './validate-project-doctor-d5-active.mjs';

export * from './validate-project-doctor-d5-active.mjs';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = validateFreshness();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
