import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SOURCE_PATH = 'data/generated/banner-definition-hero-relations.v1.json';
const OUTPUT_PATH = 'data/generated/banner-delivery-a4.v1.json';
const PROJECTOR_INPUTS = new Set([SOURCE_PATH]);

const clone = value => JSON.parse(JSON.stringify(value));
const readProjectorJson = relativePath => {
  if (!PROJECTOR_INPUTS.has(relativePath)) throw new Error('A4 projector input is not allowed: ' + relativePath);
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
};
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();

function buildDelivery() {
  const source = readProjectorJson(SOURCE_PATH);
  const definitionResults = (source.definitionResults || []).map(clone);
  const edges = (source.edges || []).map(clone);
  const byDefinitionId = {};
  for (const definition of definitionResults) byDefinitionId[definition.bannerDefinitionId] = [];
  for (const edge of edges) {
    const target = clone(edge);
    delete target.bannerDefinitionId;
    const heroId = target.heroId;
    delete target.heroId;
    byDefinitionId[edge.bannerDefinitionId].push({ targetId: heroId, ...target });
  }
  const zeroEdgeDefinitionIds = definitionResults
    .filter(definition => Number(definition.emittedEdgeCount) === 0)
    .map(definition => definition.bannerDefinitionId)
    .sort();
  return {
    version: 1,
    schemaId: 'banner-delivery-a4/v1',
    stage: 'relation-delivery-A4',
    status: 'EXPERIMENT_PROJECTION',
    sourceArtifact: { path: SOURCE_PATH, gitBlobSha: blob(SOURCE_PATH) },
    projectorInputTrace: [SOURCE_PATH],
    summary: {
      definitionCount: definitionResults.length,
      edgeCount: edges.length,
      pickupHeroEdgeCount: edges.filter(edge => edge.relationType === 'PICKUP_HERO').length,
      wishCandidateHeroEdgeCount: edges.filter(edge => edge.relationType === 'WISH_CANDIDATE_HERO').length,
      zeroEdgeDefinitionCount: zeroEdgeDefinitionIds.length,
    },
    zeroEdgeDefinitionIds,
    definitionResults,
    edges,
    byDefinitionId,
  };
}

const rendered = JSON.stringify(buildDelivery(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(path.join(root, OUTPUT_PATH), 'utf8');
  if (actual !== rendered) {
    console.error('A4 delivery artifact is stale.');
    process.exit(1);
  }
  console.log('A4 delivery artifact parity: PASS');
} else {
  fs.writeFileSync(path.join(root, OUTPUT_PATH), rendered);
  console.log('Wrote ' + OUTPUT_PATH);
}
