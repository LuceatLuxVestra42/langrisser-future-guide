import fs from 'node:fs';

const ownersPath = 'tools/project-check/contracts/owners.v1.json';
const validatorsPath = 'tools/project-check/contracts/validators.v1.json';
const fixturePath = 'tools/project-check/test/post-reinstall-routing-fixtures.mjs';
const selfPath = 'scripts/tmp-admit-soldier-training-material-project-check.mjs';
const workflowPath = '.github/workflows/tmp-admit-soldier-training-material-project-check.yml';

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return text.replace(from, to);
}

let owners = fs.readFileSync(ownersPath, 'utf8');
owners = replaceOnce(
  owners,
  '    {"id":"soldier-assets","validators":["soldier-assets"]},\n',
  '    {"id":"soldier-assets","validators":["soldier-assets"]},\n    {"id":"soldier-training-material-assets","validators":["soldier-training-material-assets"]},\n',
  'owner entry',
);

const dedicatedRule = `    {\n      "id":"soldier-training-material-assets",\n      "patterns":["data/contracts/soldier-training-material-*","data/evidence/soldier-training-material-*","data/generated/soldier-training-material-*","data/manifests/soldier-training-material-*","data/validation/soldier-training-material-*","docs/checkpoints/soldier-training-material-*","scripts/*soldier-training-material*",".github/workflows/soldier-training-material-*","public/images/soldier-training-materials/**","public/images/soldier-training-materials-webp/**"],\n      "owners":["soldier-training-material-assets"]\n    },\n`;
owners = replaceOnce(
  owners,
  '    {\n      "id":"soldier-presentation",\n',
  `${dedicatedRule}    {\n      "id":"soldier-presentation",\n`,
  'dedicated path rule',
);

const oldExclude = '      "excludePatterns":["data/generated/soldier-portrait-*","data/validation/soldier-portrait-*","data/contracts/soldier-portrait-*","scripts/*soldier-portrait*",".github/workflows/soldier-portrait-*","data/presentation/soldier-*","data/validation/soldier-*-presentation*","scripts/*soldier*presentation*",".github/workflows/soldier-*-presentation*"],';
const newExclude = '      "excludePatterns":["data/generated/soldier-portrait-*","data/validation/soldier-portrait-*","data/contracts/soldier-portrait-*","scripts/*soldier-portrait*",".github/workflows/soldier-portrait-*","data/presentation/soldier-*","data/validation/soldier-*-presentation*","scripts/*soldier*presentation*",".github/workflows/soldier-*-presentation*","data/generated/soldier-training-material-*","data/validation/soldier-training-material-*","data/contracts/soldier-training-material-*","scripts/*soldier-training-material*",".github/workflows/soldier-training-material-*"],';
owners = replaceOnce(owners, oldExclude, newExclude, 'soldier-canonical exclusion');
fs.writeFileSync(ownersPath, owners);

let validators = fs.readFileSync(validatorsPath, 'utf8');
const validatorBlock = `    {\n      "id": "soldier-training-material-assets",\n      "phase": 30,\n      "executable": "node",\n      "args": ["tools/project-check/test/soldier-training-material-assets-readonly.mjs"],\n      "owner": "soldier-training-material-assets",\n      "coverage": "Read-only A5 PNG admission, A6 WebP byte/frozen pixel-evidence binding, A7 predeploy consumer parity, and explicit non-semantic boundaries for the Soldier training-material pipeline."\n    },\n`;
validators = replaceOnce(
  validators,
  '    {\n      "id": "equipment-assets",\n',
  `${validatorBlock}    {\n      "id": "equipment-assets",\n`,
  'validator catalog',
);
fs.writeFileSync(validatorsPath, validators);

let fixture = fs.readFileSync(fixturePath, 'utf8');
const assertions = `\nassertRoute(\n  'data/validation/soldier-training-material-assets-a7.v1.json',\n  ['soldier-training-material-assets'],\n  ['soldier-training-material-assets'],\n);\n\nassertRoute(\n  'public/images/soldier-training-materials-webp/6003.webp',\n  ['soldier-training-material-assets'],\n  ['soldier-training-material-assets'],\n);\n\nassertRoute(\n  'docs/checkpoints/soldier-training-material-assets-a7.md',\n  ['soldier-training-material-assets'],\n  ['soldier-training-material-assets'],\n);\n\nassertRoute(\n  'scripts/integrate-soldier-training-material-assets-a7.mjs',\n  ['soldier-training-material-assets'],\n  ['soldier-training-material-assets'],\n);\n\nassertRoute(\n  'src/lib/soldier-training-material-assets.ts',\n  ['soldier-frontend'],\n  ['production-build'],\n);\n\nassertRoute(\n  'src/components/soldier-detail-modal.tsx',\n  ['shared-frontend'],\n  ['production-build'],\n);\n`;
fixture = replaceOnce(
  fixture,
  '\nconsole.log(JSON.stringify({\n',
  `${assertions}\nconsole.log(JSON.stringify({\n`,
  'routing assertions',
);
fixture = replaceOnce(fixture, '  fixtureCount: 3,', '  fixtureCount: 9,', 'fixture count');
fixture = replaceOnce(
  fixture,
  "    'asset-intake -> asset-intake',\n",
  "    'asset-intake -> asset-intake',\n    'soldier-training-material validation -> dedicated read-only validator',\n    'soldier-training-material WebP -> dedicated read-only validator',\n    'soldier-training-material checkpoint -> dedicated read-only validator',\n    'soldier-training-material script -> dedicated read-only validator',\n    'soldier-training-material helper -> production-build',\n    'Soldier detail component -> production-build',\n",
  'fixture descriptions',
);
fs.writeFileSync(fixturePath, fixture);

for (const path of [selfPath, workflowPath]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}

console.log(JSON.stringify({
  status: 'PATCHED',
  files: [ownersPath, validatorsPath, fixturePath],
  temporaryFilesRemoved: [selfPath, workflowPath],
}, null, 2));
