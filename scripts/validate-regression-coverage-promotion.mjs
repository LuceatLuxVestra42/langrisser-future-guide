import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'data/contracts/regression-coverage-promotion.v1.json';
const SUMMARY_PATH = 'data/validation/regression-coverage-promotion-summary.v1.json';
const PACKAGE_PATH = 'package.json';

const EXPECTED_MANUAL_NODES = [
  'banner-assets',
  'banner-data',
  'equipment-assets',
  'equipment-canonical',
  'hero-assets',
  'hero-canonical',
  'hero-equipment-relation',
  'hero-soldier-relation',
  'skin-assets',
  'skin-relation',
  'soldier-assets',
  'soldier-canonical',
  'shared-movement',
].sort();

const EXPECTED_AUDIT = {
  PROMOTION_READY: 8,
  PROMOTION_READY_WITH_SCOPE: 1,
  PARTIAL_AUTOMATION_ONLY: 3,
  KEEP_MANUAL: 1,
};

const EXPECTED_ACTIVATION = {
  READY_TO_PROMOTE: 0,
  BLOCKED_BY_FINAL_OWNER: 9,
  PARTIAL_AUTOMATION_ONLY: 3,
  KEEP_MANUAL: 1,
};

function fail(message) {
  throw new Error(`[REGRESSION_COVERAGE_PROMOTION_INVALID] ${message}`);
}

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function gitBlobSha(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const header = Buffer.from(`blob ${buf.length}\0`);
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function countBy(items, key) {
  return items.reduce((out, item) => {
    const value = item[key];
    out[value] = (out[value] ?? 0) + 1;
    return out;
  }, {});
}

function assertExactCounts(actual, expected, label) {
  for (const [key, expectedCount] of Object.entries(expected)) {
    const actualCount = actual[key] ?? 0;
    if (actualCount !== expectedCount) {
      fail(`${label}.${key} expected ${expectedCount}, got ${actualCount}`);
    }
  }
  const extras = Object.keys(actual).filter((key) => !(key in expected));
  if (extras.length) fail(`${label} contains unexpected dispositions: ${extras.join(', ')}`);
}

const contract = readJson(CONTRACT_PATH);
const d3 = readJson(contract.baseline.d3.path);
const d4 = readJson(contract.baseline.d4.path);
const pkg = readJson(PACKAGE_PATH);
const summary = readJson(SUMMARY_PATH);

if (contract.schemaId !== 'regression-coverage-promotion/v1') fail('unexpected schemaId');
if (contract.checkpoint !== 'REGRESSION_COVERAGE_PROMOTION_V1') fail('unexpected checkpoint');
if (contract.status !== 'DESIGN_FROZEN') fail('contract must remain DESIGN_FROZEN');
if (contract.baseline.doctorReuse !== 'D1_D7_REUSED_UNCHANGED') fail('D1-D7 reuse boundary changed');
if (contract.baseline.activation !== 'NOT_WIRED_TO_D3_D4') fail('this contract must not be wired into D3/D4');
if (contract.futurePromotionGate.thisVersionActivatesChecks !== false) fail('v1 must not activate checks');
if (contract.promotionPolicy.manualReviewClearedByThisContract !== false) fail('v1 must not clear MANUAL_REVIEW');
if (contract.promotionPolicy.implicitD3D4MutationAllowed !== false) fail('implicit D3/D4 mutation is forbidden');

if (d3.checkpoint !== contract.baseline.d3.checkpoint || d3.status !== contract.baseline.d3.status) {
  fail('D3 checkpoint/status no longer matches the frozen baseline');
}
if (d4.checkpoint !== contract.baseline.d4.checkpoint || d4.status !== contract.baseline.d4.status) {
  fail('D4 checkpoint/status no longer matches the frozen baseline');
}
if (gitBlobSha(contract.baseline.d3.path) !== contract.baseline.d3.gitBlobSha) fail('D3 contract bytes changed');
if (gitBlobSha(contract.baseline.d4.path) !== contract.baseline.d4.gitBlobSha) fail('D4 contract bytes changed');

const d3ManualNodes = Object.keys(d3.manualReviewNodes ?? {}).sort();
if (JSON.stringify(d3ManualNodes) !== JSON.stringify(EXPECTED_MANUAL_NODES)) {
  fail(`D3 MANUAL_REVIEW node set changed: ${d3ManualNodes.join(', ')}`);
}
if (!String(d4.manualReviewBoundary ?? '').includes('later frozen contract explicitly promotes their owning validator')) {
  fail('D4 manual-review promotion boundary changed');
}

const nodes = contract.nodes ?? [];
const nodeIds = nodes.map((node) => node.id).sort();
if (JSON.stringify(nodeIds) !== JSON.stringify(EXPECTED_MANUAL_NODES)) fail('promotion contract node set must exactly match D3 MANUAL_REVIEW nodes');
if (new Set(nodeIds).size !== nodeIds.length) fail('duplicate node id');

assertExactCounts(countBy(nodes, 'auditDisposition'), EXPECTED_AUDIT, 'auditDisposition');
assertExactCounts(countBy(nodes, 'activationDisposition'), EXPECTED_ACTIVATION, 'activationDisposition');

for (const node of nodes) {
  if (node.activationDisposition !== 'READY_TO_PROMOTE' && node.candidateValidator !== null) {
    fail(`${node.id} is not activation-ready but contains a candidate validator`);
  }
  for (const evidence of node.evidence ?? []) {
    if (!fs.existsSync(path.join(ROOT, evidence))) fail(`${node.id} evidence missing: ${evidence}`);
  }
}

const soldierAssets = nodes.find((node) => node.id === 'soldier-assets');
if (!soldierAssets) fail('soldier-assets missing');
if (soldierAssets.scope?.requiredManifest !== 'data/generated/soldier-portrait-manifest.v9.json') fail('soldier-assets must require manifest v9');
if (soldierAssets.scope?.requiredCoverage !== '224/224') fail('soldier-assets must require 224/224 coverage');
if (soldierAssets.scope?.forbidHistoricalCoverage !== '168/224') fail('soldier-assets must explicitly forbid 168/224 historical coverage');

const rejected = JSON.stringify(contract.explicitlyRejectedSubstitutes ?? []);
if (!rejected.includes('npm run validate:hero-stage3')) fail('Hero Stage 3 historical substitute must stay explicitly rejected');
if (!rejected.includes('npm run build:movement-types')) fail('movement builder substitute must stay explicitly rejected');
if (!rejected.includes('168/224')) fail('historical Soldier portrait coverage must stay explicitly rejected');

const expectedScript = 'node scripts/validate-regression-coverage-promotion.mjs';
if (pkg.scripts?.['validate:regression-promotion'] !== expectedScript) {
  fail(`package script validate:regression-promotion must equal: ${expectedScript}`);
}

if (summary.checkpoint !== contract.checkpoint) fail('summary checkpoint mismatch');
if (summary.result !== 'PASS_CONTRACT_ONLY_NO_D3_D4_ACTIVATION') fail('summary result mismatch');
if (summary.doctorContractsModified !== false) fail('summary must record zero Doctor contract modifications');
if (summary.activation?.ready !== 0 || summary.activation?.blockedByFinalOwner !== 9 || summary.activation?.partialAutomationOnly !== 3 || summary.activation?.keepManual !== 1) {
  fail('summary activation counts mismatch');
}

console.log('PASS_REGRESSION_COVERAGE_PROMOTION_V1');
console.log('D3/D4 unchanged; 9 audit-ready nodes remain blocked until exact final owning validators are explicitly registered.');
