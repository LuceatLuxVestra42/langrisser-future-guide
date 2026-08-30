import assert from 'node:assert/strict';
import { classifyFrozenPair, applyProjectDoctorFreshnessV2 } from './classify-project-doctor-frozen-freshness-v2.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const stage67Path = 'data/generated/soldier-stage6-7-site-admission.v1.json';
const base = {
  version: 1,
  schemaId: 'soldier-stage6-7-site-admission/v1',
  stage: '6-7',
  status: 'PASS',
  generatedAt: '2026-08-30T00:00:00Z',
  sources: { sample: { path: 'x', gitBlobSha: 'aaa' } },
  summary: { canonicalSoldiers: 224, canonicalRelationCount: 5977 },
};

const provenance = clone(base);
provenance.generatedAt = '2026-08-30T01:00:00Z';
provenance.sources.sample.gitBlobSha = 'bbb';
const same = classifyFrozenPair(stage67Path, base, provenance);
assert.equal(same.classification, 'PROVENANCE_ONLY_CHANGED');

const semantic = clone(base);
semantic.summary.canonicalRelationCount = 5976;
const changed = classifyFrozenPair(stage67Path, base, semantic);
assert.equal(changed.classification, 'SEMANTIC_CHANGED');

const impact = {
  status: 'MAPPED',
  mapStatus: 'DESIGN_FROZEN',
  files: [{
    path: stage67Path,
    status: 'MAPPED',
    directNodes: ['soldier-canonical'],
    propagatedNodes: ['hero-soldier-relation', 'soldier-frontend', 'hero-frontend'],
    impactedNodes: ['soldier-canonical', 'hero-soldier-relation', 'soldier-frontend', 'hero-frontend'],
    domains: ['hero', 'hero-soldier', 'soldier'],
    changeClasses: ['semantic-data'],
  }],
};
const routed = applyProjectDoctorFreshnessV2(impact, [same]);
assert.deepEqual(routed.directNodes, ['project-doctor']);
assert.deepEqual(routed.domains, []);
assert.deepEqual(routed.changeClasses, ['provenance-data']);
assert.equal(routed.freshnessV2.provenanceOnlyCount, 1);

const failClosed = applyProjectDoctorFreshnessV2(impact, [changed]);
assert.deepEqual(failClosed.directNodes, ['soldier-canonical']);
assert.ok(failClosed.domains.includes('soldier'));

console.log(JSON.stringify({
  status: 'PASS_PROJECT_DOCTOR_FROZEN_FRESHNESS_V2',
  fixtureCount: 4,
  fixturePassCount: 4,
  provenanceOnlySuppressesDomainFanout: true,
  semanticChangePreservesDomainOwner: true,
}, null, 2));
