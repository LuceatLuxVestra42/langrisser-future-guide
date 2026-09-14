'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function outputPath(argv) {
  const i = argv.indexOf('--output');
  if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/build-hero-heart-fetter-presentation-map-research-v1.cjs --output <path>');
  return path.resolve(argv[i + 1]);
}
function sourceKey(row) {
  return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':');
}
function overrideKey(row) {
  return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':');
}

function main() {
  const source = read(SOURCE_PATH);
  const policy = read(POLICY_PATH);
  if (source.status !== 'RESEARCH_PROJECTION' || source.semanticAuthority !== false || source.productionConsumerAllowed !== false) {
    throw new Error('job-effect research source boundary changed');
  }
  if (policy.status !== 'RESEARCH_POLICY' || policy.validationBoundary?.productionFrontendConsumption !== false) {
    throw new Error('presentation policy boundary changed');
  }

  const overrides = new Map(policy.policy.explicitOverrides.map((row) => [overrideKey(row), row]));
  let defaultRows = 0;
  let overrideRows = 0;
  const rows = [];

  for (const row of source.effects || []) {
    const k = sourceKey(row);
    const override = overrides.get(k);
    if (override) overrideRows += 1;
    else defaultRows += 1;
    rows.push({
      heroId: row.heroId,
      heartFetterLevel: row.heartFetterLevel,
      skillId: row.skill.skillId,
      buffId: row.buff.buffId,
      conditionParamJobId: row.condition.conditionParamJobId,
      presentationJobId: override ? override.presentationJobId : row.condition.conditionParamJobId,
      mappingMode: override ? 'EXPLICIT_OVERRIDE' : 'VALIDATED_DEFAULT'
    });
  }

  rows.sort((a, b) => a.heroId - b.heroId || a.heartFetterLevel - b.heartFetterLevel || a.presentationJobId - b.presentationJobId || a.skillId - b.skillId || a.buffId - b.buffId || a.conditionParamJobId - b.conditionParamJobId);
  if (rows.length !== 1158 || defaultRows !== 1154 || overrideRows !== 4) {
    throw new Error(`unexpected map counts rows=${rows.length} default=${defaultRows} override=${overrideRows}`);
  }

  const output = {
    schemaVersion: 1,
    stage: 'hero-heart-fetter-presentation-map-research-v1',
    status: 'RESEARCH_PROJECTION',
    semanticAuthority: false,
    productionConsumerAllowed: false,
    sourceProjection: 'data/generated/hero-heart-fetter-job-effect-research.v1.json',
    presentationPolicy: 'data/validation/hero-heart-fetter-presentation-policy.v1.json',
    heroPopulationCount: new Set(rows.map((row) => row.heroId)).size,
    rowCount: rows.length,
    defaultRuleRowCount: defaultRows,
    overrideRowCount: overrideRows,
    keyFields: ['heroId', 'heartFetterLevel', 'skillId', 'buffId', 'conditionParamJobId'],
    valueFields: ['presentationJobId', 'mappingMode'],
    rows
  };
  fs.writeFileSync(outputPath(process.argv.slice(2)), `${JSON.stringify(output, null, 2)}\n`);
}

main();
