import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  collectChangedPaths,
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

function git(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '').trim();
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-check-deletion-'));
try {
  git(fixtureRoot, ['init', '-q']);
  git(fixtureRoot, ['config', 'user.email', 'project-check@example.invalid']);
  git(fixtureRoot, ['config', 'user.name', 'Project Check Self Test']);

  const deletedPath = 'public/images/soldiers/100.png';
  const absoluteDeletedPath = path.join(fixtureRoot, deletedPath);
  fs.mkdirSync(path.dirname(absoluteDeletedPath), { recursive: true });
  fs.writeFileSync(absoluteDeletedPath, 'fixture');
  git(fixtureRoot, ['add', '--', deletedPath]);
  git(fixtureRoot, ['commit', '-qm', 'fixture base']);
  const base = git(fixtureRoot, ['rev-parse', 'HEAD']);

  fs.rmSync(absoluteDeletedPath);
  git(fixtureRoot, ['add', '-A']);
  git(fixtureRoot, ['commit', '-qm', 'delete fixture']);
  const head = git(fixtureRoot, ['rev-parse', 'HEAD']);

  const changed = collectChangedPaths({ repoRoot: fixtureRoot, base, head });
  assert.deepEqual(changed, [deletedPath], 'deleted repository paths must survive changed-path collection');

  const contracts = loadProjectCheckContracts({ repoRoot: process.cwd() });
  const route = routeProjectCheckPaths(changed, contracts);
  assert.equal(route.status, 'PLAN_READY');
  assert.equal(route.changedFileCount, 1);
  assert.deepEqual(route.owners, ['soldier-assets']);
  assert.deepEqual(route.validators.map(item => item.id), ['soldier-assets']);
  assert.deepEqual(route.manualReviews, []);

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'PROJECT_CHECK_DELETION_DIFF_REGRESSION',
    changedPath: deletedPath,
    owners: route.owners,
    validators: route.validators.map(item => item.id),
  }, null, 2));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
