import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDelivery as buildA3Delivery } from '../../../scripts/build-hero-soldier-delivery-a3.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'data/contracts/relation-delivery-consumer-migration.v1.json'), 'utf8'));
const packageArg = process.argv.indexOf('--package-dir');
const packageDir = path.resolve(packageArg >= 0 ? process.argv[packageArg + 1] : process.env.RELATION_DELIVERY_PACKAGE_DIR || path.join(root, '.tmp/relation-delivery-package'));
const profile = contract.profiles.find(item => item.relationKey === 'hero-soldier');
const portable = JSON.parse(fs.readFileSync(path.join(packageDir, 'projections/hero-soldier.json'), 'utf8'));
const runtime = buildA3Delivery();
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };

const pairMap = new Map();
let provenanceCount = 0;
for (const edge of runtime.edges || []) {
  const key = `${edge.heroId}:${edge.soldierId}`;
  if (pairMap.has(key)) fail(`duplicate runtime edge ${key}`);
  pairMap.set(key, edge);
  provenanceCount += Array.isArray(edge.provenance) ? edge.provenance.length : 0;
}
if (pairMap.size !== profile.semanticCounts.edgeCount) fail(`semantic edge count mismatch: ${pairMap.size}`);
if (provenanceCount !== profile.semanticCounts.provenanceEntryCount) fail(`semantic provenance count mismatch: ${provenanceCount}`);

let missingPairCount = 0;
let extraPairCount = 0;
let metadataMismatchCount = 0;
let orderMismatchCount = 0;
let serializedProvenanceInstanceCount = 0;
const seenByDirection = new Map();

for (const lookup of portable.lookups || []) {
  const sourceIndex = lookup.direction === 'Hero->Soldier' ? runtime.byHeroId : lookup.direction === 'Soldier->Hero' ? runtime.bySoldierId : null;
  if (!sourceIndex) fail(`unexpected A3 direction ${lookup.direction}`);
  const seen = new Set();
  for (const entry of lookup.entries || []) {
    const expectedIds = sourceIndex[String(entry.fromId)] || [];
    const actualIds = (entry.targets || []).map(target => target.targetId);
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) orderMismatchCount += 1;
    for (const target of entry.targets || []) {
      const heroId = lookup.direction === 'Hero->Soldier' ? Number(entry.fromId) : Number(target.targetId);
      const soldierId = lookup.direction === 'Hero->Soldier' ? Number(target.targetId) : Number(entry.fromId);
      const key = `${heroId}:${soldierId}`;
      const edge = pairMap.get(key);
      if (!edge) {
        extraPairCount += 1;
        continue;
      }
      seen.add(key);
      const { heroId: _heroId, soldierId: _soldierId, ...expectedMetadata } = edge;
      const { targetId: _targetId, ...actualMetadata } = target;
      if (JSON.stringify(clone(expectedMetadata)) !== JSON.stringify(clone(actualMetadata))) metadataMismatchCount += 1;
      serializedProvenanceInstanceCount += Array.isArray(target.provenance) ? target.provenance.length : 0;
    }
  }
  for (const key of pairMap.keys()) if (!seen.has(key)) missingPairCount += 1;
  seenByDirection.set(lookup.direction, seen.size);
}

if (portable.lookups?.length !== 2) fail(`expected 2 A3 directions, got ${portable.lookups?.length ?? 0}`);
if (missingPairCount !== 0 || extraPairCount !== 0 || metadataMismatchCount !== 0 || orderMismatchCount !== 0) {
  fail(`A3 transport parity failed: ${JSON.stringify({ missingPairCount, extraPairCount, metadataMismatchCount, orderMismatchCount })}`);
}
if (portable.transportSummary?.semanticEdgeCount !== profile.semanticCounts.edgeCount) fail('portable semanticEdgeCount mismatch');
if (portable.transportSummary?.semanticProvenanceEntryCount !== profile.semanticCounts.provenanceEntryCount) fail('portable semanticProvenanceEntryCount mismatch');
if (portable.transportSummary?.transportHeroLookupTargetCount !== profile.semanticCounts.edgeCount) fail('Hero transport target count mismatch');
if (portable.transportSummary?.transportSoldierLookupTargetCount !== profile.semanticCounts.edgeCount) fail('Soldier transport target count mismatch');
if (portable.transportSummary?.transportMetadataInstanceCount !== serializedProvenanceInstanceCount) fail('transport metadata instance count mismatch');

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'RELATION_DELIVERY_2_2_A3_TRANSPORT_PARITY',
  semanticEdgeCount: profile.semanticCounts.edgeCount,
  semanticProvenanceEntryCount: profile.semanticCounts.provenanceEntryCount,
  transportHeroLookupPairCount: seenByDirection.get('Hero->Soldier'),
  transportSoldierLookupPairCount: seenByDirection.get('Soldier->Hero'),
  serializedTransportProvenanceInstanceCount: serializedProvenanceInstanceCount,
  missingPairCount,
  extraPairCount,
  metadataMismatchCount,
  orderMismatchCount
}, null, 2));
