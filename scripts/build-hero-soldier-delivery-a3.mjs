import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
export const SOURCE_PATH = 'data/generated/hero-soldier-relations.v1.json';
const PROJECTOR_INPUTS = new Set([SOURCE_PATH]);

const clone = value => JSON.parse(JSON.stringify(value));
const readProjectorJson = relativePath => {
  if (!PROJECTOR_INPUTS.has(relativePath)) throw new Error('A3 projector input is not allowed: ' + relativePath);
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
};
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();

export function buildDelivery() {
  const source = readProjectorJson(SOURCE_PATH);
  const edges = (source.edges || []).map(clone);
  const byHeroId = {};
  const bySoldierId = {};
  let provenanceCount = 0;

  for (const edge of edges) {
    const heroKey = String(edge.heroId);
    const soldierKey = String(edge.soldierId);
    if (!byHeroId[heroKey]) byHeroId[heroKey] = [];
    if (!bySoldierId[soldierKey]) bySoldierId[soldierKey] = [];
    byHeroId[heroKey].push(edge.soldierId);
    bySoldierId[soldierKey].push(edge.heroId);
    provenanceCount += Array.isArray(edge.provenance) ? edge.provenance.length : 0;
  }

  return {
    version: 1,
    schemaId: 'hero-soldier-delivery-a3/runtime-v1',
    stage: 'relation-delivery-A3',
    status: 'EXPERIMENT_RUNTIME_PROJECTION',
    sourceArtifact: { path: SOURCE_PATH, gitBlobSha: blob(SOURCE_PATH) },
    projectorInputTrace: [SOURCE_PATH],
    summary: {
      heroKeyCount: Object.keys(byHeroId).length,
      soldierKeyCount: Object.keys(bySoldierId).length,
      edgeCount: edges.length,
      provenanceCount,
    },
    edges,
    byHeroId,
    bySoldierId,
  };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const delivery = buildDelivery();
  console.log(JSON.stringify({ status: delivery.status, sourceArtifact: delivery.sourceArtifact, summary: delivery.summary }, null, 2));
}
