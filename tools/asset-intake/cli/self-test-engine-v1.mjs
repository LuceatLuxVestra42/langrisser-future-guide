import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildEvidence,
  compareByteParity,
  resolveExpectedLocator,
  scanAssetRoot,
  stableInventoryJson,
} from '../core/engine-v1.mjs';

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const PNG_2X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const root = await mkdtemp(path.join(os.tmpdir(), 'asset-intake-stage2-'));
try {
  await mkdir(path.join(root, 'UI/Icon'), { recursive: true });
  await mkdir(path.join(root, 'Scoped/A'), { recursive: true });
  await mkdir(path.join(root, 'Scoped/B'), { recursive: true });
  await mkdir(path.join(root, 'Dup'), { recursive: true });
  await writeFile(path.join(root, 'UI/Icon/hero.png'), PNG_1X1);
  await writeFile(path.join(root, 'Dup/hero-copy.png'), PNG_1X1);
  await writeFile(path.join(root, 'Scoped/A/shared.png'), PNG_1X1);
  await writeFile(path.join(root, 'Scoped/B/shared.png'), PNG_2X1);
  await writeFile(path.join(root, 'plain.bin'), Buffer.from('asset-intake-stage2'));

  const inventory = await scanAssetRoot(root, { sourceArtifact: 'fixture-root' });
  check(inventory.length === 5, 'scan must include five regular files');
  check(inventory.map((x) => x.relativePath).join('|') === [...inventory].map((x) => x.relativePath).sort((a, b) => a.localeCompare(b, 'en')).join('|'), 'inventory ordering must be deterministic');

  const hero = inventory.find((x) => x.relativePath === 'UI/Icon/hero.png');
  check(hero.signature === 'PNG', 'PNG signature must be detected');
  check(hero.width === 1 && hero.height === 1, 'PNG dimensions must be detected');
  check(/^[0-9a-f]{64}$/.test(hero.sha256), 'SHA-256 must be generated');
  check(hero.exactDuplicateGroup?.startsWith('sha256:'), 'exact duplicate group must be annotated');

  const sharedA = inventory.find((x) => x.relativePath === 'Scoped/A/shared.png');
  const sharedB = inventory.find((x) => x.relativePath === 'Scoped/B/shared.png');
  check(sharedA.basenameCollisionGroup === 'basename:shared.png' && sharedB.basenameCollisionGroup === 'basename:shared.png', 'basename collision group must be annotated');

  let resolution = resolveExpectedLocator({ assetRole: 'STATIC', locatorKind: 'FULL_PATH', value: 'UI/Icon/hero.png' }, inventory);
  check(resolution.status === 'RESOLVED' && resolution.matches[0].relativePath === 'UI/Icon/hero.png', 'FULL_PATH must resolve exact relative path');

  resolution = resolveExpectedLocator({ assetRole: 'STATIC', locatorKind: 'EXACT_FILENAME', value: 'shared.png' }, inventory);
  check(resolution.status === 'AMBIGUOUS' && resolution.matches.length === 2, 'unscoped duplicate basename must be ambiguous');

  resolution = resolveExpectedLocator({ assetRole: 'STATIC', locatorKind: 'EXACT_FILENAME', value: 'shared.png', approvedRoot: 'Scoped/A' }, inventory);
  check(resolution.status === 'RESOLVED' && resolution.matches[0].relativePath === 'Scoped/A/shared.png', 'approvedRoot must scope exact filename resolution');

  resolution = resolveExpectedLocator({ assetRole: 'STATIC', locatorKind: 'FULL_PATH', value: 'missing.png' }, inventory);
  check(resolution.status === 'PENDING' && resolution.reason === 'NO_EXACT_MATCH', 'missing exact path must remain pending');

  resolution = resolveExpectedLocator({ assetRole: 'MODEL', locatorKind: 'RESOURCE_ID', value: 102 }, inventory);
  check(resolution.status === 'PENDING' && resolution.reason === 'RESOURCE_MAP_REQUIRED', 'RESOURCE_ID must not infer a filename without an explicit map');

  resolution = resolveExpectedLocator({ assetRole: 'MODEL', locatorKind: 'RESOURCE_ID', value: 102 }, inventory, { resourceMap: { '102': 'UI/Icon/hero.png' } });
  check(resolution.status === 'RESOLVED' && resolution.matches[0].relativePath === 'UI/Icon/hero.png', 'RESOURCE_ID may resolve only through explicit map');

  const evidence = buildEvidence(hero, 0);
  check(evidence.sourceArtifact === 'fixture-root' && evidence.expectedLocatorIndex === 0, 'evidence must preserve explicit source artifact and locator index');
  check(evidence.sourcePath === 'UI/Icon/hero.png' && evidence.relativePath === 'UI/Icon/hero.png', 'evidence paths must remain root-relative and deterministic');

  const heroCopy = inventory.find((x) => x.relativePath === 'Dup/hero-copy.png');
  check(compareByteParity(hero, heroCopy).equal === true, 'identical bytes must pass parity');
  check(compareByteParity(sharedA, sharedB).equal === false, 'different bytes must fail parity');

  const jsonA = stableInventoryJson(inventory);
  const jsonB = stableInventoryJson([...inventory].reverse());
  check(jsonA === jsonB, 'stable inventory serialization must ignore input ordering');

  const statBefore = JSON.parse(jsonA);
  check(statBefore.every((x) => !Object.hasOwn(x, 'absolutePath')), 'serialized inventory must not contain machine-specific absolute paths');

  console.log(JSON.stringify({ status: 'PASS_ASSET_INTAKE_STAGE2_ENGINE_V1', checks, failed: 0 }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
