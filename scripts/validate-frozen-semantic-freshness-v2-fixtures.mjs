import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  buildSemanticDigest,
  canonicalJson,
  sameSemanticDigest,
} from './lib/frozen-semantic-digest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = path.join(ROOT, 'data/fixtures/frozen-semantic-freshness-v2-fixtures.v1.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const errors = [];
const results = [];

function fail(id, detail) {
  errors.push({ id, detail });
}

function compareCase(testCase) {
  const left = buildSemanticDigest(testCase.projection, testCase.left.semanticPayload);
  const right = buildSemanticDigest(testCase.projection, testCase.right.semanticPayload);
  const same = sameSemanticDigest(left, right);
  const expectedSame = testCase.expect === 'SAME';
  const pass = same === expectedSame;
  results.push({ id: testCase.id, pass, expected: testCase.expect, left: left.digest, right: right.digest });
  if (!pass) fail(testCase.id, `expected ${testCase.expect}, got ${same ? 'SAME' : 'DIFFERENT'}`);
}

function cleanRelationProvenance(provenance) {
  return (Array.isArray(provenance) ? provenance : []).map((entry) => {
    const { gitBlobSha: _gitBlobSha, ...semantic } = entry ?? {};
    return semantic;
  });
}

function membershipProjection(relation) {
  const pairs = (Array.isArray(relation?.edges) ? relation.edges : []).map((edge) => {
    if (!Number.isInteger(edge?.heroId) || !Number.isInteger(edge?.soldierId)) {
      throw new TypeError('Relation membership requires integer heroId and soldierId');
    }
    return { heroId: edge.heroId, soldierId: edge.soldierId };
  });
  pairs.sort((a, b) => a.heroId - b.heroId || a.soldierId - b.soldierId);
  for (let index = 1; index < pairs.length; index += 1) {
    if (pairs[index - 1].heroId === pairs[index].heroId && pairs[index - 1].soldierId === pairs[index].soldierId) {
      throw new TypeError(`Duplicate relation pair ${pairs[index].heroId}:${pairs[index].soldierId}`);
    }
  }
  return { pairs };
}

function relationSemanticProjection(relation) {
  const edges = (Array.isArray(relation?.edges) ? relation.edges : []).map((edge) => ({
    heroId: edge?.heroId,
    soldierId: edge?.soldierId,
    provenance: cleanRelationProvenance(edge?.provenance),
  }));
  edges.sort((a, b) => a.heroId - b.heroId || a.soldierId - b.soldierId || canonicalJson(a.provenance).localeCompare(canonicalJson(b.provenance)));
  return { edges };
}

function compareRelationCase(testCase) {
  const leftMembership = buildSemanticDigest('hero-soldier-membership/v1', membershipProjection(testCase.left));
  const rightMembership = buildSemanticDigest('hero-soldier-membership/v1', membershipProjection(testCase.right));
  const membershipSame = sameSemanticDigest(leftMembership, rightMembership);
  const expectedMembershipSame = testCase.expectMembership === 'SAME';

  const leftSemantic = buildSemanticDigest('hero-soldier-relation/semantic-v1', relationSemanticProjection(testCase.left));
  const rightSemantic = buildSemanticDigest('hero-soldier-relation/semantic-v1', relationSemanticProjection(testCase.right));
  const semanticSame = sameSemanticDigest(leftSemantic, rightSemantic);
  const expectedSemanticSame = testCase.expectSemantic === 'SAME';

  const pass = membershipSame === expectedMembershipSame && semanticSame === expectedSemanticSame;
  results.push({
    id: testCase.id,
    pass,
    membership: membershipSame ? 'SAME' : 'DIFFERENT',
    semantic: semanticSame ? 'SAME' : 'DIFFERENT',
  });
  if (!pass) {
    fail(testCase.id, `membership=${membershipSame ? 'SAME' : 'DIFFERENT'} semantic=${semanticSame ? 'SAME' : 'DIFFERENT'}`);
  }
}

function expectThrow(id, fn) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  results.push({ id, pass: threw, expected: 'THROW' });
  if (!threw) fail(id, 'expected fail-closed exception');
}

if (fixture?.schemaId !== 'frozen-semantic-freshness-v2-fixtures/v1') fail('fixture-schema', fixture?.schemaId ?? null);
if (fixture?.status !== 'FROZEN') fail('fixture-status', fixture?.status ?? null);
if (fixture?.contract !== FROZEN_SEMANTIC_FRESHNESS_CONTRACT) fail('fixture-contract', fixture?.contract ?? null);

for (const testCase of fixture.cases ?? []) compareCase(testCase);
for (const testCase of fixture.relationCases ?? []) compareRelationCase(testCase);

for (const testCase of fixture.negativeCases ?? []) {
  if (testCase.kind === 'NON_FINITE_NUMBER') {
    expectThrow(testCase.id, () => buildSemanticDigest('fixture/negative/v1', { value: Number.POSITIVE_INFINITY }));
  } else if (testCase.kind === 'UNDEFINED_OBJECT_VALUE') {
    expectThrow(testCase.id, () => buildSemanticDigest('fixture/negative/v1', { value: undefined }));
  } else if (testCase.kind === 'PROJECTION_MISMATCH') {
    const left = buildSemanticDigest('fixture/a/v1', { value: 1 });
    const right = buildSemanticDigest('fixture/b/v1', { value: 1 });
    const pass = sameSemanticDigest(left, right) === false;
    results.push({ id: testCase.id, pass, expected: 'DIFFERENT' });
    if (!pass) fail(testCase.id, 'different projection IDs must never compare equal');
  } else {
    fail(testCase.id, `unknown negative case kind ${testCase.kind}`);
  }
}

const passed = results.filter((result) => result.pass).length;
const status = errors.length === 0 ? 'PASS' : 'FAIL';
console.log(JSON.stringify({
  status,
  contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
  fixtureCases: results.length,
  passed,
  failed: results.length - passed,
  results,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
