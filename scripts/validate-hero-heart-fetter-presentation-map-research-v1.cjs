'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function artifactPath(argv) {
  const i = argv.indexOf('--artifact');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/validate-hero-heart-fetter-presentation-map-research-v1.cjs --artifact <path>');
  return path.resolve(argv[i + 1]);
}
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function overrideKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function mapKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function assertNoForbiddenFields(value, location = '$') {
  const forbidden = new Set(['applicableJobId', 'applicableJobIds', 'jobRestricted']);
  if (Array.isArray(value)) return value.forEach((item, i) => assertNoForbiddenFields(item, `${location}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!forbidden.has(key), `${location}: forbidden field ${key}`);
    assertNoForbiddenFields(item, `${location}.${key}`);
  }
}

function main() {
  const artifact = read(artifactPath(process.argv.slice(2)));
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);

  assert.strictEqual(artifact.schemaVersion, 1);
  assert.strictEqual(artifact.stage, 'hero-heart-fetter-presentation-map-research-v1');
  assert.strictEqual(artifact.status, 'RESEARCH_PROJECTION');
  assert.strictEqual(artifact.semanticAuthority, false);
  assert.strictEqual(artifact.productionConsumerAllowed, false);
  assert.strictEqual(artifact.heroPopulationCount, 267);
  assert.strictEqual(artifact.rowCount, 1158);
  assert.strictEqual(artifact.defaultRuleRowCount, 1154);
  assert.strictEqual(artifact.overrideRowCount, 4);
  assert.deepStrictEqual(artifact.keyFields, ['heroId','heartFetterLevel','skillId','buffId','conditionParamJobId']);
  assert.deepStrictEqual(artifact.valueFields, ['presentationJobId','mappingMode']);
  assertNoForbiddenFields(artifact);

  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  const expected = [];
  for (const row of source.effects) {
    const k = sourceKey(row);
    const override = overrides.get(k);
    expected.push({
      heroId: row.heroId,
      heartFetterLevel: row.heartFetterLevel,
      skillId: row.skill.skillId,
      buffId: row.buff.buffId,
      conditionParamJobId: row.condition.conditionParamJobId,
      presentationJobId: override ? override.presentationJobId : row.condition.conditionParamJobId,
      mappingMode: override ? 'EXPLICIT_OVERRIDE' : 'VALIDATED_DEFAULT'
    });
  }
  expected.sort((a, b) => a.heroId - b.heroId || a.heartFetterLevel - b.heartFetterLevel || a.presentationJobId - b.presentationJobId || a.skillId - b.skillId || a.buffId - b.buffId || a.conditionParamJobId - b.conditionParamJobId);
  assert.deepStrictEqual(artifact.rows, expected);

  const seen = new Set();
  for (const row of artifact.rows) {
    const k = mapKey(row);
    assert(!seen.has(k), `duplicate map key ${k}`);
    seen.add(k);
    assert(row.mappingMode === 'VALIDATED_DEFAULT' || row.mappingMode === 'EXPLICIT_OVERRIDE', `invalid mapping mode ${row.mappingMode}`);
  }
  assert.strictEqual(seen.size, 1158);
  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_MAP_RESEARCH_V1', heroPopulationCount:267, rowCount:1158, defaultRows:1154, overrideRows:4})}\n`);
}

main();
