import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const owners = readJson('tools/project-check/contracts/owners.v1.json');
const validators = readJson('tools/project-check/contracts/validators.v1.json');

const owner = owners.owners.find(item => item.id === 'relation-delivery');
assert.ok(owner, 'relation-delivery owner must exist');
assert.deepEqual(owner.validators, ['relation-delivery-self-test']);

const rule = owners.pathRules.find(item => item.id === 'relation-delivery');
assert.ok(rule, 'relation-delivery path rule must exist');
assert.deepEqual(rule.owners, ['relation-delivery']);
assert.deepEqual(rule.patterns, [
  'tools/relation-delivery/**',
  'data/contracts/relation-delivery-*',
  'data/validation/relation-delivery-*',
  '.github/workflows/relation-delivery-*',
]);

const validator = validators.validators.find(item => item.id === 'relation-delivery-self-test');
assert.ok(validator, 'relation-delivery validator must exist');
assert.equal(validator.executable, 'node');
assert.deepEqual(validator.args, ['tools/relation-delivery/test/relation-delivery-self-test.mjs']);
assert.equal(validator.owner, 'relation-delivery');

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'RELATION_DELIVERY_OWNER_ADMISSION_SELF_TEST',
  owner: owner.id,
  validator: validator.id,
  pathRule: rule.id,
  semanticRecomputationCount: 0,
}, null, 2));
