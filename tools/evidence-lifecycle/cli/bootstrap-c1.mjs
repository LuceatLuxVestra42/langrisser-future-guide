#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ownerMapPath = 'tools/project-check/contracts/owners.v1.json';
const validatorCatalogPath = 'tools/project-check/contracts/validators.v1.json';
const selfTestPath = 'tools/project-check/test/project-check-self-test.mjs';
const c0 = JSON.parse(fs.readFileSync('tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json', 'utf8'));
const baseline = c0.baseline.sha;
const atBaseline = filePath => execFileSync('git', ['show', `${baseline}:${filePath}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

let ownerText = atBaseline(ownerMapPath);
const ownerBoundary = '\n  ],\n  "pathRules": [';
if (!ownerText.includes(ownerBoundary)) throw new Error('Owner array boundary missing.');
ownerText = ownerText.replace(ownerBoundary, ',\n    {"id":"evidence-lifecycle","validators":["evidence-lifecycle-readonly"]}\n  ],\n  "pathRules": [');
const ruleBoundary = '\n  ],\n  "boundaries": {';
if (!ownerText.includes(ruleBoundary)) throw new Error('Path-rule boundary missing.');
ownerText = ownerText.replace(ruleBoundary, ',\n    {\n      "id":"evidence-lifecycle",\n      "patterns":["tools/evidence-lifecycle/**",".github/workflows/evidence-lifecycle-*.yml"],\n      "owners":["evidence-lifecycle"]\n    }\n  ],\n  "boundaries": {');
fs.writeFileSync(ownerMapPath, ownerText);

let validatorText = atBaseline(validatorCatalogPath);
const validatorAnchor = '    {\n      "id": "configdata-integrity",';
if (!validatorText.includes(validatorAnchor)) throw new Error('Validator insertion anchor missing.');
validatorText = validatorText.replace(validatorAnchor, '    {\n      "id": "evidence-lifecycle-readonly",\n      "phase": 8,\n      "executable": "node",\n      "args": ["tools/evidence-lifecycle/test/evidence-lifecycle-readonly.mjs"],\n      "owner": "evidence-lifecycle",\n      "coverage": "Read-only C0 scope-admission and C1 physical inventory parity over the frozen baseline; no semantic recomputation, lifecycle classification, or deletion decision."\n    },\n' + validatorAnchor);
fs.writeFileSync(validatorCatalogPath, validatorText);

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
