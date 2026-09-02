#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ownerMapPath = 'tools/project-check/contracts/owners.v1.json';
const validatorCatalogPath = 'tools/project-check/contracts/validators.v1.json';
const selfTestPath = 'tools/project-check/test/project-check-self-test.mjs';

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }

const ownerMap = readJson(ownerMapPath);
if (!ownerMap.owners.some(item => item.id === 'evidence-lifecycle')) {
  ownerMap.owners.push({ id: 'evidence-lifecycle', validators: ['evidence-lifecycle-readonly'] });
}
if (!ownerMap.pathRules.some(item => item.id === 'evidence-lifecycle')) {
  ownerMap.pathRules.push({
    id: 'evidence-lifecycle',
    patterns: ['tools/evidence-lifecycle/**', '.github/workflows/evidence-lifecycle-*.yml'],
    owners: ['evidence-lifecycle']
  });
}
writeJson(ownerMapPath, ownerMap);

const catalog = readJson(validatorCatalogPath);
if (!catalog.validators.some(item => item.id === 'evidence-lifecycle-readonly')) {
  catalog.validators.push({
    id: 'evidence-lifecycle-readonly',
    phase: 8,
    executable: 'node',
    args: ['tools/evidence-lifecycle/test/evidence-lifecycle-readonly.mjs'],
    owner: 'evidence-lifecycle',
    coverage: 'Read-only C0 scope-admission and C1 physical inventory parity over the frozen baseline; no semantic recomputation, lifecycle classification, or deletion decision.'
  });
}
writeJson(validatorCatalogPath, catalog);

let selfTest = fs.readFileSync(selfTestPath, 'utf8');
const marker = "'tools/evidence-lifecycle/generated/c1-inventory.v1.json'";
if (!selfTest.includes(marker)) {
  const anchor = 'const bannerAsset = routeProjectCheckPaths';
  const insertion = `expectOwners(\n  'tools/evidence-lifecycle/generated/c1-inventory.v1.json',\n  ['evidence-lifecycle'],\n  ['evidence-lifecycle-readonly'],\n);\nexpectOwners(\n  '.github/workflows/evidence-lifecycle-c1-bootstrap.yml',\n  ['evidence-lifecycle'],\n  ['evidence-lifecycle-readonly'],\n);\n\n`;
  if (!selfTest.includes(anchor)) throw new Error('Project Check self-test insertion anchor missing.');
  selfTest = selfTest.replace(anchor, `${insertion}${anchor}`);
  fs.writeFileSync(selfTestPath, selfTest);
}

execFileSync('node', ['tools/evidence-lifecycle/cli/c1-inventory.mjs', '--write'], { stdio: 'inherit' });
execFileSync('node', ['tools/project-check/test/project-check-self-test.mjs'], { stdio: 'inherit' });
execFileSync('node', ['tools/evidence-lifecycle/test/evidence-lifecycle-readonly.mjs'], { stdio: 'inherit' });
