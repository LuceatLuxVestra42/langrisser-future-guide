import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const workflow = readFileSync('.github/workflows/merge-finalize-main.yml', 'utf8');
const mergeAdmission = workflow.split('\n  merge-admission:\n')[1];

assert.ok(mergeAdmission, 'merge-admission job must exist');
assert.match(
  mergeAdmission,
  /- name: Create merge finalizer GitHub App token for main mutation[\s\S]*?id: app-token[\s\S]*?uses: actions\/create-github-app-token@v2/,
  'merge-admission must create a GitHub App token',
);
assert.match(
  mergeAdmission,
  /GITHUB_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/,
  'merge-only mutation must use the GitHub App token so downstream push workflows can trigger',
);
assert.doesNotMatch(
  mergeAdmission,
  /GITHUB_TOKEN: \$\{\{ github\.token \}\}/,
  'merge-admission must not use GITHUB_TOKEN for the main merge mutation',
);
assert.match(
  mergeAdmission,
  /GH_TOKEN: \$\{\{ github\.token \}\}/,
  'workflow-dispatch handoff must retain github.token for the explicit dispatch path',
);

console.log('MERGE_FINALIZER_MAIN_MERGE_APP_TOKEN_FIXTURE=PASS');
