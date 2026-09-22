'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const SOURCE_PATH = 'data/generated/hero-exclusive-equipment-relations.v1.json';
const OUTPUT_PATH = 'data/generated/hero-exclusive-equipment-delivery-a1.v1.json';
const PROJECTOR_INPUTS = new Set([SOURCE_PATH]);

const compareNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const clone = value => JSON.parse(JSON.stringify(value));
const readProjectorJson = relativePath => {
  if (!PROJECTOR_INPUTS.has(relativePath)) throw new Error('A1 projector input is not allowed: ' + relativePath);
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
};
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();

function buildDelivery() {
  const source = readProjectorJson(SOURCE_PATH);
  const edges = (source.records || []).map(clone).sort((a, b) => compareNumber(a.heroId, b.heroId) || compareNumber(a.equipmentId, b.equipmentId));
  const byHeroId = {};
  const byEquipmentId = {};
  for (const edge of edges) {
    const heroKey = String(edge.heroId);
    const equipmentKey = String(edge.equipmentId);
    if (!byHeroId[heroKey]) byHeroId[heroKey] = [];
    if (!byEquipmentId[equipmentKey]) byEquipmentId[equipmentKey] = [];
    const metadata = { relationType: edge.relationType, verificationStatus: edge.verificationStatus, provenance: clone(edge.provenance) };
    byHeroId[heroKey].push({ targetId: edge.equipmentId, ...metadata });
    byEquipmentId[equipmentKey].push({ targetId: edge.heroId, ...metadata });
  }
  const heroMissingKeyCount = Number(source.summary?.canonicalHeroCount ?? 0) - Object.keys(byHeroId).length;
  return {
    version: 1,
    schemaId: 'hero-exclusive-equipment-delivery-a1/v1',
    stage: 'relation-delivery-A1',
    status: 'EXPERIMENT_PROJECTION',
    sourceArtifact: { path: SOURCE_PATH, gitBlobSha: blob(SOURCE_PATH), recordCount: edges.length },
    projectorInputTrace: [SOURCE_PATH],
    semantics: { relationType: 'exclusive', heroToEquipment: 'ZERO_OR_ONE', equipmentToHero: 'EXACTLY_ONE', absentHeroRepresentation: 'MISSING_KEY' },
    summary: {
      edgeCount: edges.length,
      byHeroKeyCount: Object.keys(byHeroId).length,
      byHeroPairCount: Object.values(byHeroId).reduce((count, values) => count + values.length, 0),
      heroMissingKeyCount,
      byEquipmentKeyCount: Object.keys(byEquipmentId).length,
      byEquipmentPairCount: Object.values(byEquipmentId).reduce((count, values) => count + values.length, 0),
    },
    edges,
    byHeroId,
    byEquipmentId,
  };
}

const rendered = JSON.stringify(buildDelivery(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(path.join(root, OUTPUT_PATH), 'utf8');
  if (actual !== rendered) {
    console.error('A1 delivery artifact is stale. Re-run ' + path.basename(__filename) + '.');
    process.exit(1);
  }
  console.log('A1 delivery artifact parity: PASS');
} else {
  fs.writeFileSync(path.join(root, OUTPUT_PATH), rendered);
  console.log('Wrote ' + OUTPUT_PATH);
}
