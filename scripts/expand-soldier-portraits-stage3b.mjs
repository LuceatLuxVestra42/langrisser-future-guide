import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const V2_PATH = 'data/generated/soldier-portrait-manifest.v2.json';
const ALIAS_EVIDENCE_PATH = 'data/validation/soldier-portrait-alias-evidence-stage3b.v1.json';
const CANONICAL_PATH = 'data/generated/soldier-detail-stage5-2.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v3.json';
const PUBLIC_DIR = 'public/images/soldiers';

const NEW_SOURCES = new Map([
  [131, { driveName: '교국 친위대', folderId: '1ipoh8EhHJ0YM-LfAkLvcaKVPZQ3SQp8N', evidence: 'ALIAS_ABILITY' }],
  [132, { driveName: '엘프 투창병', folderId: '1exdoD5vfmcXiKQeKtsKGFcDr1IShyh16', evidence: 'ALIAS_ABILITY' }],
  [134, { driveName: '파도 소환사', folderId: '1OLB6FqTxrKdkJUjTzyGsO3_jw3SPSlmw', evidence: 'ALIAS_ABILITY' }],
  [246, { driveName: '야만용사', folderId: '1onAMYQQUygFsn2chZgWM96ifQxj-rLng', evidence: 'ALIAS_ABILITY' }],
  [247, { driveName: '사막 용병', folderId: '1rN-AZgoV3TENsw2mWXUG6uuRQ-Cpn2ym', evidence: 'ALIAS_ABILITY' }],
  [248, { driveName: '듀얼리스트', folderId: '11AQdZ6UXGE3BHuhZRDl_aqsfIsI_ccGp', evidence: 'ALIAS_ABILITY' }],
  [337, { driveName: '황금 기사', folderId: '1ZX7lZbdKny_pNxNpaQZgJieZLj5j7xwF', evidence: 'ALIAS_ABILITY' }],
  [338, { driveName: '왕도마뱀 기사', folderId: '105s6hJMRrAOR3bgqIBt_YYQrPlvbj8Cq', evidence: 'CANONICAL_NAME_EXACT' }],
  [339, { driveName: '불꽃 카발리에', folderId: '1nEpaqb7VPXQq5e6oSRjweS0CENWifzE2', evidence: 'ALIAS_ABILITY' }],
  [340, { driveName: '송곳니 정복자', folderId: '1qkmQycHAidZzpB7EGvjg6qMrX7X_AolP', evidence: 'ALIAS_ABILITY' }],
  [423, { driveName: '기계용 기사', folderId: '1AiVmvbx9pyKktifgmlxPMYJbgyjZ3zJc', evidence: 'ALIAS_ABILITY' }],
  [424, { driveName: '태양 전투매', folderId: '1kTd58U598a93foH0sGk78jeUNH9IXJzy', evidence: 'ALIAS_ABILITY' }],
  [426, { driveName: '암흑 수정 용기병', folderId: '1k2tYAEY1MapVqqq7v5UhWoVK3Bxms9Zq', evidence: 'ALIAS_ABILITY' }],
  [513, { driveName: '빙하의 정령', folderId: '1DnXCrQ9wFuOKbsejjwvSc_VIz2-1OECk', evidence: 'ALIAS_ABILITY' }],
  [514, { driveName: '바다 제사장', folderId: '1gxbJFUq-bLBp4i2kSY5Fj0hCaqm9VYV_', evidence: 'ALIAS_ABILITY' }],
  [636, { driveName: '수정 마도사', folderId: '17eliktI2xE4O4tEApgnqdegZFFYtyMuM', evidence: 'CANONICAL_NAME_EXACT' }],
  [639, { driveName: '공성 발리스타', folderId: '18biQrtA2t6tra38Dv7ND4KjPgQcGZeRq', evidence: 'ALIAS_ABILITY' }],
  [641, { driveName: '맹독 박쥐술사', folderId: '1AVPEY55KTm_wdBNtVcy4j8tgT2HuKY9H', evidence: 'CANONICAL_NAME_EXACT' }],
  [643, { driveName: '황야 답사대', folderId: '1x5rHI5o9nrvj02TNIGxKlt8FttufEu70', evidence: 'ALIAS_ABILITY' }],
  [644, { driveName: '화염 주술사', folderId: '1sKkej1JKYQ0mZacLh2o4gPQTx6dJYHuo', evidence: 'ALIAS_ABILITY' }],
  [646, { driveName: '외날개 화살', folderId: '1C_5tdaOywAkWIcsNARrVqwcJMBUxH95U', evidence: 'ALIAS_ABILITY' }],
  [816, { driveName: '신성 보호술사', folderId: '1hLrUXveXA-3hglP3BYhDRnSLDN3LKQ9b', evidence: 'ALIAS_ABILITY' }],
  [817, { driveName: '꽃과 바람의 성가대', folderId: '1WKZqo0i9lq2rNetpGRynu_Enl1YdgjgW', evidence: 'ALIAS_ABILITY' }],
  [818, { driveName: '빛의 성자', folderId: '1ooG0qSea0d-zlGgbUs_golNpgaSfzprn', evidence: 'ALIAS_ABILITY' }],
  [1114, { driveName: '나이트 엘프', folderId: '16F2W3W8DcrYbzIy1hlCWPzMEzsyM5ZWz', evidence: 'ALIAS_ABILITY' }],
  [1117, { driveName: '검은 깃털의 가시', folderId: '1ZM_26C2VAHlMocKHeS2wQHP6ck383Dee', evidence: 'ALIAS_ABILITY' }],
]);

function normalizeName(value) {
  return String(value ?? '').normalize('NFC').replace(/[\s_\-]/g, '').toLowerCase();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
}

function pngDimensions(bytes) {
  if (!isPng(bytes) || bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function resolveDefaultPng(folderId) {
  const text = await fetchText(`https://drive.google.com/drive/folders/${folderId}`);
  const patterns = [
    /aria-label="Default\.png(?: Image)?(?: Shared)?"[\s\S]{0,1200}?data-id="([^"]+)"/,
    /data-id="([^"]+)"[\s\S]{0,1200}?aria-label="Default\.png(?: Image)?(?: Shared)?"/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function downloadDrivePng(fileId) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];
  const failures = [];
  for (const url of urls) {
    try {
      const bytes = await fetchBytes(url);
      if (isPng(bytes)) return bytes;
      failures.push(`non-PNG from ${new URL(url).host}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Drive PNG download failed for ${fileId}: ${failures.join('; ')}`);
}

const v2 = JSON.parse(await readFile(V2_PATH, 'utf8'));
const evidence = JSON.parse(await readFile(ALIAS_EVIDENCE_PATH, 'utf8'));
const canonical = JSON.parse(await readFile(CANONICAL_PATH, 'utf8')).records;
const canonicalById = new Map(canonical.map((record) => [record.soldierId, record]));
const evidenceById = new Map(evidence.results.map((record) => [record.soldierId, record]));
const unresolvedById = new Map(v2.unresolved.map((record) => [record.soldierId, record]));
const records = v2.records.map((record) => ({ ...record }));
const newResolved = [];
const assetReview = [];

await mkdir(PUBLIC_DIR, { recursive: true });

for (const [soldierId, source] of NEW_SOURCES) {
  const canonicalRecord = canonicalById.get(soldierId);
  const unresolved = unresolvedById.get(soldierId);
  if (!canonicalRecord || !unresolved) throw new Error(`Stage 3B source is not a current unresolved canonical Soldier: ${soldierId}`);
  if (canonicalRecord.identity.isSp) throw new Error(`Stage 3B normal expansion unexpectedly targets SP Soldier ${soldierId}`);

  if (source.evidence === 'ALIAS_ABILITY') {
    const proof = evidenceById.get(soldierId);
    if (!proof || proof.status !== 'PASS_ALIAS_EVIDENCE') throw new Error(`Missing PASS alias evidence for Soldier ${soldierId}`);
    if (normalizeName(proof.legacyName) !== normalizeName(source.driveName)) throw new Error(`Legacy/Drive name mismatch for Soldier ${soldierId}`);
  } else if (source.evidence === 'CANONICAL_NAME_EXACT') {
    if (normalizeName(canonicalRecord.identity.nameKr) !== normalizeName(source.driveName)) throw new Error(`Canonical/Drive exact-name mismatch for Soldier ${soldierId}`);
  } else {
    throw new Error(`Unknown evidence kind ${source.evidence}`);
  }

  const fileId = await resolveDefaultPng(source.folderId);
  if (!fileId) {
    assetReview.push({ soldierId, reason: 'DRIVE_DEFAULT_PNG_MISSING', driveName: source.driveName, folderId: source.folderId });
    continue;
  }

  const bytes = await downloadDrivePng(fileId);
  if (!isPng(bytes)) throw new Error(`Downloaded Stage 3B asset is not PNG for Soldier ${soldierId}`);
  const dimensions = pngDimensions(bytes);
  const fileName = `${soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr: canonicalRecord.identity.nameKr,
    tier: canonicalRecord.identity.tier,
    driveName: source.driveName,
    driveFolderId: source.folderId,
    driveFileId: fileId,
    sourceKind: source.evidence === 'ALIAS_ABILITY' ? 'DRIVE_DEFAULT_PNG_STAGE3B_ALIAS_ABILITY_EVIDENCE' : 'DRIVE_DEFAULT_PNG_STAGE3B_CANONICAL_NAME_EXACT',
    sourceFileName: 'Default.png',
    fileName,
    resolutionMethod: source.evidence === 'ALIAS_ABILITY'
      ? 'SAME_TIER_ARMY_UNIQUE_PINNED_LEGACY_ENTRY_PLUS_ABILITY_NUMERIC_PROGRESSION_PLUS_DRIVE_NAME'
      : 'CANONICAL_KR_NAME_EXACT_DRIVE_III_FOLDER_DEFAULT_PNG',
    size: bytes.length,
    sha256: sha256(bytes),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
  records.push(record);
  newResolved.push(record);
  unresolvedById.delete(soldierId);
}

records.sort((a, b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a, b) => a.soldierId - b.soldierId);
const resolvedIds = new Set(records.map((record) => record.soldierId));
if (resolvedIds.size !== records.length) throw new Error('Duplicate Soldier IDs in Stage 3B resolved portrait set');
if (records.length + unresolved.length !== 224) throw new Error('Stage 3B resolved + unresolved coverage mismatch');

const isSp = (soldierId) => canonicalById.get(soldierId)?.identity?.isSp === true;
const countTier = (tier) => records.filter((record) => !isSp(record.soldierId) && canonicalById.get(record.soldierId)?.identity?.tier === tier).length;
const sourceCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.sourceKind))].sort().map((kind) => [kind, records.filter((record) => record.sourceKind === kind).length]),
);

const output = {
  version: 3,
  stage: 'frontend-stage3b-evidence-backed-coverage-expansion',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  publicRoot: v2.publicRoot,
  assetsReady: true,
  policy: {
    ...v2.policy,
    stage3bAliasAdmission: 'Same tier/army + unique pinned legacy entry + current level1-to-level10 ability numeric progression found in legacy Korean ability text + legacy name bound to Drive III folder.',
    stage3bExactAdmission: 'Canonical Korean name exact normalized match to Drive III folder title.',
    combatStatsAreNotIdentity: true,
    spPortraitExpansion: 'Not included. SP remains unresolved unless a dedicated portrait source is independently established.',
  },
  sources: {
    previousManifest: V2_PATH,
    aliasEvidence: ALIAS_EVIDENCE_PATH,
    canonical: CANONICAL_PATH,
    driveTierIII: '17586qKXHeDoCZ13E6bmrmgMRtMUk9fzQ',
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
    newlyResolvedCount: newResolved.length,
    assetReviewCount: assetReview.length,
    sourceCounts,
  },
  newlyResolvedSoldierIds: newResolved.map((record) => record.soldierId),
  assetReview,
  records,
  unresolved,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3B_PORTRAIT_EXPANSION resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} newlyResolved=${newResolved.length} assetReview=${assetReview.length}`);
console.log(`NEW_IDS=${output.newlyResolvedSoldierIds.join(',')}`);
console.log(`TIERS T1=${output.coverage.tier1Resolved} T2=${output.coverage.tier2Resolved} T3=${output.coverage.tier3Resolved} SP=${output.coverage.resolvedSpCount}`);
console.log(`ASSET_REVIEW=${assetReview.map((item) => item.soldierId).join(',')}`);
