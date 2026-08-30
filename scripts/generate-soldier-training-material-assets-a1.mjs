import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  canonicalizeContractDocument,
  collectContractErrors,
  stableJson,
} from '../tools/asset-intake/core/contract-v1.mjs';

const A0_PATH = 'data/validation/soldier-training-material-assets-a0.v1.json';
const SOURCE_PATH = 'data/generated/soldier-training-material-iteminfo.v1.json';
const CONTRACT_PATH = 'data/contracts/soldier-training-material-asset-intake.v1.json';
const SUMMARY_PATH = 'data/validation/soldier-training-material-assets-a1.v1.json';
const EXPECTED_SOURCE_BLOB = '9df7bbba18064e34f46cf2f4fd99d1904cbd3d63';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

const a0 = readJson(A0_PATH);
if (a0.status !== 'PASS' || a0.completion !== 'COMPLETE') throw new Error('A0 must be PASS/COMPLETE');

const sourceBytes = fs.readFileSync(SOURCE_PATH);
const sourceBlob = gitBlobSha(sourceBytes);
if (sourceBlob !== EXPECTED_SOURCE_BLOB) throw new Error(`frozen ItemInfo artifact blob mismatch: ${sourceBlob}`);
const source = JSON.parse(sourceBytes.toString('utf8'));
if (source.status !== 'PASS' || source.schemaId !== 'soldier-training-material-iteminfo/v1') throw new Error('frozen ItemInfo artifact is not PASS');
if (source.summary?.targetItemIdCount !== 24 || source.summary?.matchedItemIdCount !== 24 || source.summary?.missingItemIdCount !== 0 || source.summary?.duplicateItemIdCount !== 0) {
  throw new Error('frozen ItemInfo 24/24 invariant failed');
}

const seen = new Set();
const records = [...source.items]
  .sort((a, b) => a.itemId - b.itemId)
  .map((item) => {
    if (!Number.isInteger(item.itemId) || seen.has(item.itemId)) throw new Error(`invalid or duplicate itemId: ${item.itemId}`);
    seen.add(item.itemId);
    if (item.matchCount !== 1) throw new Error(`item ${item.itemId} is not exact-1 matched`);
    if (!/^UI\/Icon\/Item_ABS\/Training_[A-Za-z0-9]+\.png$/.test(item.iconPath)) throw new Error(`item ${item.itemId} has invalid Training icon path: ${item.iconPath}`);
    return {
      canonicalKey: { kind: 'itemId', value: item.itemId },
      domainNativeStatus: 'READY_FOR_ASSET_EVIDENCE',
      normalizedResolutionClass: 'PENDING',
      expectedLocators: [
        {
          assetRole: 'trainingMaterialIcon',
          locatorKind: 'FULL_PATH',
          value: item.iconPath,
        },
      ],
      evidence: [],
    };
  });

if (records.length !== 24 || seen.size !== 24) throw new Error(`expected 24 unique records, got ${records.length}/${seen.size}`);

const contract = canonicalizeContractDocument({
  contractVersion: 'asset-intake/v1',
  domain: 'soldier-training-material',
  sourceContext: {
    path: SOURCE_PATH,
    schemaId: source.schemaId,
    status: source.status,
    gitBlobSha: sourceBlob,
    checkpoint: 'A0_FRESHNESS_ADOPTED',
  },
  records,
});
const contractErrors = collectContractErrors(contract);
if (contractErrors.length) throw new Error(`generated Asset Intake contract invalid: ${contractErrors.join('; ')}`);

fs.mkdirSync(path.dirname(CONTRACT_PATH), { recursive: true });
fs.writeFileSync(CONTRACT_PATH, stableJson(contract));

const summary = {
  version: 1,
  schemaId: 'soldier-training-material-assets-a1/v1',
  stage: 'A1 - Asset Intake Soldier Training Material Domain Rollout',
  status: 'PASS',
  completion: 'COMPLETE',
  predecessor: {
    a0: A0_PATH,
    source: SOURCE_PATH,
    sourceGitBlobSha: sourceBlob,
    sourceStatus: source.status,
  },
  output: {
    contractPath: CONTRACT_PATH,
    contractVersion: contract.contractVersion,
    domain: contract.domain,
  },
  counts: {
    sourceItems: source.items.length,
    canonicalRecords: records.length,
    uniqueItemIds: seen.size,
    fullPathLocators: records.reduce((sum, record) => sum + record.expectedLocators.filter((x) => x.locatorKind === 'FULL_PATH').length, 0),
    pendingRecords: records.filter((record) => record.normalizedResolutionClass === 'PENDING').length,
    evidenceRecords: records.reduce((sum, record) => sum + record.evidence.length, 0),
    contractErrors: contractErrors.length,
  },
  invariants: {
    canonicalKey: 'itemId',
    locatorAuthority: 'frozen ItemInfo.iconPath',
    assetRole: 'trainingMaterialIcon',
    locatorKind: 'FULL_PATH',
    iconRoot: 'UI/Icon/Item_ABS/',
    noTargetInference: true,
    sourceAcquisitionPerformed: false,
  },
  boundaries: {
    semanticRecomputed: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    fuzzyFilenameMatchingUsed: false,
    visualMatchingUsed: false,
    assetBytesChanged: false,
    frontendChanged: false,
  },
  nextStartPoint: 'A2 source census: exact candidate discovery for the frozen 24 FULL_PATH locators, without changing itemId or ItemInfo.Icon semantics.',
};
fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
