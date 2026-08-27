import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const V3_PATH = 'data/generated/soldier-portrait-manifest.v3.json';
const DISCOVERY_PATH = 'data/validation/soldier-portrait-legacy-discovery-stage3c.v1.json';
const CANONICAL_PATH = 'data/generated/soldier-detail-stage5-2.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v4.json';
const PUBLIC_DIR = 'public/images/soldiers';
const TARGET_IDS = new Set([249, 515, 517, 645]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isWebp(bytes) {
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const v3 = JSON.parse(await readFile(V3_PATH, 'utf8'));
const discovery = JSON.parse(await readFile(DISCOVERY_PATH, 'utf8'));
const canonical = JSON.parse(await readFile(CANONICAL_PATH, 'utf8')).records;
const canonicalById = new Map(canonical.map((record) => [record.soldierId, record]));
const unresolvedById = new Map(v3.unresolved.map((record) => [record.soldierId, record]));
const discoveryById = new Map(discovery.results.map((record) => [record.soldierId, record]));
const records = v3.records.map((record) => ({ ...record }));
const newlyResolved = [];

await mkdir(PUBLIC_DIR, { recursive: true });

for (const soldierId of TARGET_IDS) {
  const unresolved = unresolvedById.get(soldierId);
  const proof = discoveryById.get(soldierId);
  const canonicalRecord = canonicalById.get(soldierId);
  if (!unresolved || !canonicalRecord) throw new Error(`Target ${soldierId} is not a current unresolved canonical Soldier`);
  if (canonicalRecord.identity.isSp) throw new Error(`Stage 3C target unexpectedly SP: ${soldierId}`);
  if (!proof || proof.status !== 'PASS_UNIQUE_LEGACY_ABILITY_MATCH') throw new Error(`Missing unique legacy ability proof for ${soldierId}`);
  if (!proof.legacySourceUrl || !proof.legacyName) throw new Error(`Missing pinned legacy asset for ${soldierId}`);

  const bytes = await fetchBytes(proof.legacySourceUrl);
  if (!isWebp(bytes)) throw new Error(`Pinned legacy asset is not WebP for ${soldierId}`);
  const fileName = `${soldierId}.webp`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr: canonicalRecord.identity.nameKr,
    tier: canonicalRecord.identity.tier,
    legacyName: proof.legacyName,
    sourceKind: 'PINNED_LEGACY_KR_WEBP_STAGE3C_UNIQUE_ABILITY_EVIDENCE',
    sourceFileName: path.basename(new URL(proof.legacySourceUrl).pathname),
    sourceUrl: proof.legacySourceUrl,
    fileName,
    resolutionMethod: 'SAME_TIER_ARMY_UNIQUE_PINNED_LEGACY_ENTRY_BY_CURRENT_LEVEL1_TO_LEVEL10_ABILITY_NUMERIC_PROGRESSION',
    size: bytes.length,
    sha256: sha256(bytes),
  };
  records.push(record);
  newlyResolved.push(record);
  unresolvedById.delete(soldierId);
}

records.sort((a, b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a, b) => a.soldierId - b.soldierId);
const resolvedIds = new Set(records.map((record) => record.soldierId));
if (resolvedIds.size !== records.length) throw new Error('Duplicate resolved Soldier IDs in v4');
if (records.length + unresolved.length !== 224) throw new Error('v4 coverage mismatch');

const isSp = (soldierId) => canonicalById.get(soldierId)?.identity?.isSp === true;
const countTier = (tier) => records.filter((record) => !isSp(record.soldierId) && canonicalById.get(record.soldierId)?.identity?.tier === tier).length;
const sourceCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.sourceKind))].sort().map((kind) => [kind, records.filter((record) => record.sourceKind === kind).length]),
);

const output = {
  version: 4,
  stage: 'frontend-stage3c-unique-legacy-ability-expansion',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  publicRoot: v3.publicRoot,
  assetsReady: true,
  policy: {
    ...v3.policy,
    stage3cAdmission: 'Same tier/army, informative current level1-to-level10 ability progression, exactly one pinned legacy Korean entry matching the numeric progression; consume that pinned legacy WebP directly.',
    driveFolderTitleRequiredForStage3c: false,
    nameSimilarityUsedForAdmission: false,
    combatStatsUsedForIdentity: false,
    spPortraitExpansion: 'Not included.',
  },
  sources: {
    previousManifest: V3_PATH,
    legacyDiscovery: DISCOVERY_PATH,
    canonical: CANONICAL_PATH,
  },
  coverage: {
    canonicalSoldierCount: 224,
    canonicalNormalCount: canonical.filter((record) => !record.identity.isSp).length,
    canonicalSpCount: canonical.filter((record) => record.identity.isSp).length,
    resolvedCount: records.length,
    unresolvedCount: unresolved.length,
    resolvedNormalCount: records.filter((record) => !isSp(record.soldierId)).length,
    resolvedSpCount: records.filter((record) => isSp(record.soldierId)).length,
    tier1Resolved: countTier(1),
    tier2Resolved: countTier(2),
    tier3Resolved: countTier(3),
    newlyResolvedCount: newlyResolved.length,
    sourceCounts,
  },
  newlyResolvedSoldierIds: newlyResolved.map((record) => record.soldierId),
  records,
  unresolved,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3C_EXPANSION resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} new=${newlyResolved.length}`);
console.log(`NEW_IDS=${output.newlyResolvedSoldierIds.join(',')}`);
console.log(`TIERS T1=${output.coverage.tier1Resolved} T2=${output.coverage.tier2Resolved} T3=${output.coverage.tier3Resolved} SP=${output.coverage.resolvedSpCount}`);
