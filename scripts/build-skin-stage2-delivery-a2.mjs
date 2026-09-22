import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SOURCE_PATH = 'data/generated/skin-stage2-3-bidirectional-relation.v1.json';
const OUTPUT_PATH = 'data/generated/skin-stage2-delivery-a2.v1.json';
const PROJECTOR_INPUTS = new Set([SOURCE_PATH]);

const compareNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const readProjectorJson = relativePath => {
  if (!PROJECTOR_INPUTS.has(relativePath)) throw new Error('A2 projector input is not allowed: ' + relativePath);
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
};
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();

function buildDelivery() {
  const source = readProjectorJson(SOURCE_PATH);
  const skinIds = Object.keys(source.bySkinId || {}).map(Number).sort(compareNumber);
  const edges = skinIds.map(skinId => ({
    skinId,
    heroId: Number(source.bySkinId[String(skinId)].heroId),
    sourceOrder: Number(source.bySkinId[String(skinId)].sourceOrder),
  }));
  const bySkinId = {};
  for (const edge of edges) bySkinId[String(edge.skinId)] = { targetId: edge.heroId, sourceOrder: edge.sourceOrder };

  const byHeroId = {};
  for (const [heroId, skins] of Object.entries(source.byHeroId || {})) {
    byHeroId[heroId] = (skins || []).map(skinId => ({
      targetId: Number(skinId),
      sourceOrder: Number(source.bySkinId[String(skinId)].sourceOrder),
    }));
  }
  const zeroSkinHeroIds = Object.entries(source.byHeroId || {})
    .filter(([, values]) => Array.isArray(values) && values.length === 0)
    .map(([heroId]) => Number(heroId))
    .sort(compareNumber);

  return {
    version: 1,
    schemaId: 'skin-stage2-delivery-a2/v1',
    stage: 'relation-delivery-A2',
    status: 'EXPERIMENT_PROJECTION',
    sourceArtifact: { path: SOURCE_PATH, gitBlobSha: blob(SOURCE_PATH) },
    projectorInputTrace: [SOURCE_PATH],
    semantics: { skinToHero: 'EXACTLY_ONE', heroToSkin: 'ZERO_OR_MANY', zeroSkinHeroRepresentation: 'PRESENT_EMPTY_ARRAY' },
    summary: { edgeCount: edges.length, bySkinKeyCount: Object.keys(bySkinId).length, byHeroKeyCount: Object.keys(byHeroId).length, zeroSkinHeroCount: zeroSkinHeroIds.length },
    zeroSkinHeroIds,
    edges,
    bySkinId,
    byHeroId,
  };
}

const rendered = JSON.stringify(buildDelivery(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(path.join(root, OUTPUT_PATH), 'utf8');
  if (actual !== rendered) {
    console.error('A2 delivery artifact is stale.');
    process.exit(1);
  }
  console.log('A2 delivery artifact parity: PASS');
} else {
  fs.writeFileSync(path.join(root, OUTPUT_PATH), rendered);
  console.log('Wrote ' + OUTPUT_PATH);
}
