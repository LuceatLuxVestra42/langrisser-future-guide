import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXTERNAL_SOURCE_PRIORITY, routeAssetRequest } from '../core/route-v1.mjs';
import { runAssetIntakeCli } from './run-v1.mjs';

const CONTRACT_PATH = 'tools/asset-intake/contract/operational-routing.v1.json';
const STAGE4_VALIDATOR = 'tools/asset-intake/cli/validate-stage4-v1.mjs';
const checks = [];
const check = (id, fn) => { fn(); checks.push(id); };

function trackedWorktreeSnapshot() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return String(result.stdout ?? '').trimEnd();
}

function snapshotLineCount(snapshot) {
  return snapshot ? snapshot.split(/\r?\n/).filter(Boolean).length : 0;
}

const trackedBefore = trackedWorktreeSnapshot();

const upstream = spawnSync(process.execPath, [STAGE4_VALIDATOR], { encoding: 'utf8' });
check('UPSTREAM_STAGE4', () => assert.equal(upstream.status, 0, `${upstream.stdout}\n${upstream.stderr}`));

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
check('CONTRACT_STAGE', () => assert.equal(contract.stage, 'Asset Intake Stage 5 - Operational Routing'));
check('CONTRACT_SOURCE_PRIORITY', () => assert.deepEqual(contract.externalSourcePriority.map(row => row.sourceKey), EXTERNAL_SOURCE_PRIORITY));
check('CONTRACT_DIRECT_EXTERNAL_FORBIDDEN', () => assert.equal(contract.externalCandidatePolicy.directExternalProductionUse, false));
check('CONTRACT_SEMANTIC_GUARDRAILS', () => assert.deepEqual(
  [contract.forbidden.nameJoin, contract.forbidden.idArithmetic, contract.forbidden.similarityMatching, contract.forbidden.semanticRelationRecomputation],
  [true, true, true, true],
));

const base = {
  requestId: 'stage5-fixture',
  canonicalKey: { domain: 'skin', assetKind: 'static', value: 102 },
  projectLookup: { status: 'NOT_CHECKED' },
  assetIntake: { status: 'NOT_RUN' },
  externalAttempts: [],
};
const route = patch => routeAssetRequest({ ...base, ...patch });

check('PROJECT_LOOKUP_FIRST', () => assert.equal(route({}).decision.action, 'CHECK_PROJECT_FROZEN_GENERATED'));
check('PROJECT_RESOLVED_TERMINAL', () => assert.equal(route({
  projectLookup: { status: 'RESOLVED', provenanceVerified: true, canonicalIdEvidenceVerified: true, evidenceRef: 'data/generated/example.json#102' },
}).decision.action, 'USE_PROJECT_VERIFIED_ASSET'));
check('ASSET_INTAKE_BEFORE_EXTERNAL', () => assert.equal(route({ projectLookup: { status: 'NOT_FOUND' } }).decision.action, 'RUN_ASSET_INTAKE'));
check('ASSET_INTAKE_RESOLVED_TERMINAL', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' },
  assetIntake: { status: 'RESOLVED', contractEvidenceValidated: true, resultRef: 'data/validation/example.json#102' },
}).decision.action, 'USE_ASSET_INTAKE_RESOLVED_ASSET'));
check('BILIBILI_FIRST_EXTERNAL', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
}).decision.sourceKey, 'BILIBILI_WIKI_PUBLIC_ORIGINAL'));
check('DRIVE_SECOND_EXTERNAL', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: [{ sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'NOT_FOUND' }],
}).decision.sourceKey, 'LEGACY_KR_SHEET_ASSET_DRIVE'));
check('OTHER_EXTERNAL_LAST', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: [
    { sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'NOT_FOUND' },
    { sourceKey: 'LEGACY_KR_SHEET_ASSET_DRIVE', status: 'REJECTED' },
  ],
}).decision.sourceKey, 'OTHER_EXTERNAL_IMAGE_SOURCE'));
check('UNVERIFIED_CANDIDATE_REJECTED', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: [{ sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'CANDIDATE', sourceRef: 'fixture://candidate', provenanceVerified: true, canonicalIdEvidenceVerified: false }],
}).decision.action, 'REJECT_EXTERNAL_CANDIDATE'));
check('VERIFIED_CANDIDATE_RETURNS_TO_INTAKE', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: [{ sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'CANDIDATE', sourceRef: 'fixture://candidate', provenanceVerified: true, canonicalIdEvidenceVerified: true }],
}).decision.action, 'INGEST_EXTERNAL_EVIDENCE_TO_ASSET_INTAKE'));
check('EXHAUSTED_FAIL_CLOSED', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: EXTERNAL_SOURCE_PRIORITY.map(sourceKey => ({ sourceKey, status: 'NOT_FOUND' })),
}).decision.action, 'BLOCKED_NO_VERIFIED_ASSET'));
check('EXTERNAL_BYPASS_INVALID', () => assert.equal(routeAssetRequest({ ...base,
  externalAttempts: [{ sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'NOT_FOUND' }],
}).status, 'INVALID_ROUTING_REQUEST'));
check('SOURCE_ORDER_BYPASS_INVALID', () => assert.equal(route({
  projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' },
  externalAttempts: [{ sourceKey: 'LEGACY_KR_SHEET_ASSET_DRIVE', status: 'NOT_FOUND' }],
}).status, 'INVALID_ROUTING_REQUEST'));
check('NO_DIRECT_EXTERNAL_USE_ACTION', () => {
  const cases = [
    route({ projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' } }),
    route({ projectLookup: { status: 'NOT_FOUND' }, assetIntake: { status: 'PENDING' }, externalAttempts: [{ sourceKey: 'BILIBILI_WIKI_PUBLIC_ORIGINAL', status: 'CANDIDATE', sourceRef: 'fixture://candidate', provenanceVerified: true, canonicalIdEvidenceVerified: true }] }),
  ];
  assert.ok(cases.every(result => !result.decision.action.startsWith('USE_EXTERNAL')));
});

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'asset-intake-stage5-'));
const requestPath = path.join(tmp, 'request.json');
const outputPath = path.join(tmp, 'route.json');
await fsp.writeFile(requestPath, `${JSON.stringify({ ...base, projectLookup: { status: 'NOT_FOUND' } }, null, 2)}\n`);
const cli = await runAssetIntakeCli(['route', '--request', requestPath, '--out', outputPath]);
const cliOutput = JSON.parse(await fsp.readFile(outputPath, 'utf8'));
check('CLI_ROUTE_STATUS', () => assert.equal(cli.status, 'PASS_ASSET_INTAKE_OPERATIONAL_ROUTE'));
check('CLI_ROUTE_ACTION', () => assert.equal(cliOutput.decision.action, 'RUN_ASSET_INTAKE'));
await fsp.rm(tmp, { recursive: true, force: true });

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check('PACKAGE_STAGE5_VALIDATOR_ENTRY', () => assert.equal(packageJson.scripts['asset:intake:validate'], 'node tools/asset-intake/cli/validate-stage5-v1.mjs'));
check('PACKAGE_ROUTE_ENTRY', () => assert.equal(packageJson.scripts['asset:intake:route'], 'node tools/asset-intake/cli/run-v1.mjs route'));

const trackedAfter = trackedWorktreeSnapshot();
check('TRACKED_WORKTREE_STABLE', () => assert.equal(trackedAfter, trackedBefore));

console.log(JSON.stringify({
  status: 'PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING',
  completion: 'OPERATIONAL_ROUTING_VALIDATED',
  checks: checks.length,
  passed: checks.length,
  failed: 0,
  hardErrors: 0,
  sourcePriority: EXTERNAL_SOURCE_PRIORITY,
  guardrails: {
    projectEvidenceFirst: true,
    assetIntakeBeforeExternalSearch: true,
    externalCandidateDirectUse: false,
    verifiedExternalCandidateReturnsToAssetIntake: true,
    semanticRecomputation: false,
  },
  executionProof: {
    trackedBeforeCount: snapshotLineCount(trackedBefore),
    trackedAfterCount: snapshotLineCount(trackedAfter),
    trackedMutationCount: 0,
  },
}, null, 2));
