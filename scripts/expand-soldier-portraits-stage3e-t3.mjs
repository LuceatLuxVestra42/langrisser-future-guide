import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const V3_PATH = 'data/generated/soldier-portrait-manifest.v3.json';
const DISCOVERY_PATH = 'data/validation/soldier-portrait-legacy-discovery-stage3c.v1.json';
const CURRENT_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v4.json';
const EVIDENCE_OUTPUT = 'data/validation/soldier-portrait-stage3e-t3-evidence.v1.json';
const PUBLIC_DIR = 'public/images/soldiers';

const EXTERNAL_SOURCES = new Map([
  [250, {
    admission: 'CURRENT_KR_EXACT_WITH_PINNED_WEB_EVIDENCE',
    evidenceUrl: 'https://goniblog.com/%EB%9E%91%EA%B7%B8%EB%A6%BF%EC%82%AC-%EC%83%98-%ED%8F%89%EA%B0%80-%EC%A0%84%EC%A7%81-%EC%9E%A5%EB%B9%84-%EC%8A%A4%ED%82%AC-%ED%8B%B0%EC%96%B4-%EA%B3%B5%EB%9E%B5/',
    evidenceName: '숲의 무용가',
    assetUrl: 'https://redpanda7301.github.io/langrisser/img/troop/%EC%A0%95%EA%B8%80%20%EC%82%AC%EC%8A%AC%20%EB%AC%B4%ED%9D%AC.webp',
  }],
  [341, {
    admission: 'CURRENT_KR_EXACT_WITH_PINNED_WEB_EVIDENCE',
    evidenceUrl: 'https://goniblog.com/%EB%9E%91%EA%B7%B8%EB%A6%BF%EC%82%AC-%ED%82%A4%EB%B2%A8%EB%A0%88-%ED%8F%89%EA%B0%80-%EC%A0%84%EC%A7%81-%EC%9E%A5%EB%B9%84-%EC%8A%A4%ED%82%AC-%ED%8B%B0%EC%96%B4-%EA%B3%B5%EB%9E%B5/',
    evidenceName: '밀림 켄타우로스',
    assetUrl: 'https://img.gamewith.jp/article_tools/langrisser/gacha/miturin.png',
  }],
  [422, {
    admission: 'CURRENT_ABILITY_ALIAS_WITH_PINNED_WEB_EVIDENCE',
    evidenceUrl: 'https://goniblog.com/%EB%9E%91%EA%B7%B8%EB%A6%BF%EC%82%AC-%EC%95%8C%ED%85%8C%EB%AE%AC%EB%9F%ACsp-%ED%8F%89%EA%B0%80-%EC%A0%84%EC%A7%81-%EC%9E%A5%EB%B9%84-%EC%8A%A4%ED%82%AC-%ED%8B%B0%EC%96%B4-%EA%B3%B5%EB%9E%B5/',
    evidenceName: '드래고니아 나이트',
    assetUrl: 'https://redpanda7301.github.io/langrisser/img/troop/%EB%B9%84%EB%B3%91_%EC%88%98%EB%B3%91/%EB%B9%84%EB%B3%91/%EB%B3%91%EC%A2%85/20_1_%EB%93%9C%EB%9E%98%EA%B3%A0%EB%8B%88%EC%95%84%EB%82%98%EC%9D%B4%ED%8A%B8.webp',
    expectedLevel1Numbers: [2, 2, 10, 2, 10, 2, 1],
    expectedLevel10Numbers: [30, 6, 30, 6, 30, 2, 1],
  }],
  [647, {
    admission: 'CURRENT_KR_EXACT_WITH_PINNED_WEB_EVIDENCE',
    evidenceUrl: 'https://goniblog.com/%EB%9E%91%EA%B7%B8%EB%A6%BF%EC%82%AC-%ED%9B%94%EB%B0%94%EB%B0%94-%ED%8F%89%EA%B0%80-%EC%A0%84%EC%A7%81-%EC%9E%A5%EB%B9%84-%EC%8A%A4%ED%82%AC-%ED%8B%B0%EC%96%B4-%EA%B3%B5%EB%9E%B5/',
    evidenceName: '금지된 숲의 영령술사',
    assetUrl: 'https://img.gamewith.jp/article_tools/langrisser/gacha/kinrin.png',
  }],
  [1036, {
    admission: 'CURRENT_KR_EXACT_WITH_PINNED_WEB_EVIDENCE',
    evidenceUrl: 'https://goniblog.com/%EB%9E%91%EA%B7%B8%EB%A6%BF%EC%82%AC-%EC%97%BC%EB%A3%A1-%ED%8C%8C%EB%A9%B8%EC%9E%90-%ED%8F%89%EA%B0%80-%EC%A0%84%EC%A7%81-%EC%9E%A5%EB%B9%84-%EC%8A%A4%ED%82%AC-%ED%8B%B0%EC%96%B4-%EA%B3%B5%EB%9E%B5/',
    evidenceName: '지옥 마핵',
    assetUrl: 'https://redpanda7301.github.io/langrisser/img/troop/%EB%A7%88%EB%B2%95%EC%82%AC_%EC%8A%B9%EB%B3%91_%EB%A7%88%EB%AC%BC/%EB%A7%88%EB%AC%BC/%EB%B3%91%EC%A2%85/21_3_%EC%97%B0%EC%98%A5%EC%9D%98%EB%A7%88%EB%A0%A5%EC%BD%94%EC%96%B4.webp',
  }],
]);

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isPng(bytes) { return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])); }
function isWebp(bytes) { return bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP'; }
function pngDimensions(bytes) { if (!isPng(bytes) || bytes.length < 24) return null; return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; }
function normalize(value) { return String(value ?? '').normalize('NFC').replace(/[\s_\-]/g, '').toLowerCase(); }
function stripMarkup(value) { return String(value ?? '').replace(/<color=[^>]+>/gi, '').replace(/<\/color>/gi, '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function numericTokens(value) { return stripMarkup(value).match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []; }
function currentAbilityNumbers(record, level) {
  const description = record?.ability?.levels?.find((x) => x.level === level)?.description ?? (level === 10 ? record?.ability?.finalDescription : null);
  return numericTokens(description);
}
async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const v3 = JSON.parse(await readFile(V3_PATH, 'utf8'));
const discovery = JSON.parse(await readFile(DISCOVERY_PATH, 'utf8'));
const current = JSON.parse(await readFile(CURRENT_PATH, 'utf8')).records;
const currentById = new Map(current.map((r) => [r.soldierId, r]));
const unresolvedById = new Map(v3.unresolved.map((r) => [r.soldierId, r]));
const discoveryById = new Map(discovery.results.map((r) => [r.soldierId, r]));
const records = v3.records.map((r) => ({ ...r }));
const evidenceRows = [];
const newlyResolved = [];
await mkdir(PUBLIC_DIR, { recursive: true });

for (const soldierId of [249, 515, 517, 645]) {
  const d = discoveryById.get(soldierId);
  const canonical = currentById.get(soldierId);
  if (!d || d.status !== 'PASS_UNIQUE_LEGACY_ABILITY_MATCH' || !d.legacySourceUrl) throw new Error(`Stage 3C PASS evidence missing for ${soldierId}`);
  if (!canonical || !unresolvedById.has(soldierId)) throw new Error(`Stage 3E legacy target is not unresolved canonical ${soldierId}`);
  const bytes = await fetchBytes(d.legacySourceUrl);
  if (!isWebp(bytes)) throw new Error(`Stage 3C legacy asset is not WebP for ${soldierId}`);
  const fileName = `${soldierId}.webp`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);
  const record = { soldierId, nameKr: canonical.identity?.nameKr ?? d.nameKr ?? null, tier: 3, sourceKind: 'PINNED_LEGACY_KR_WEBP_STAGE3C_UNIQUE_ABILITY', sourceUrl: d.legacySourceUrl, sourceName: d.legacyName, fileName, resolutionMethod: 'SAME_TIER_ARMY_UNIQUE_LEGACY_ABILITY_NUMERIC_PROGRESSION', size: bytes.length, sha256: sha256(bytes), width: null, height: null };
  records.push(record); newlyResolved.push(record); unresolvedById.delete(soldierId);
  evidenceRows.push({ soldierId, status: 'PASS', admission: 'STAGE3C_UNIQUE_LEGACY_ABILITY', evidenceName: d.legacyName, evidenceUrl: d.legacySourceUrl, assetUrl: d.legacySourceUrl, evidenceVerification: 'PINNED_GITHUB_SOURCE_AND_STAGE3C_GENERATED_PROOF' });
}

for (const [soldierId, source] of EXTERNAL_SOURCES) {
  const canonical = currentById.get(soldierId);
  if (!canonical || !unresolvedById.has(soldierId)) throw new Error(`Stage 3E external target is not unresolved canonical ${soldierId}`);
  const canonicalName = canonical.identity?.nameKr ?? null;
  if (source.admission === 'CURRENT_KR_EXACT_WITH_PINNED_WEB_EVIDENCE') {
    if (normalize(canonicalName) !== normalize(source.evidenceName)) throw new Error(`Canonical/evidence exact Korean name mismatch for ${soldierId}`);
  } else if (source.admission === 'CURRENT_ABILITY_ALIAS_WITH_PINNED_WEB_EVIDENCE') {
    const level1 = currentAbilityNumbers(canonical, 1);
    const level10 = currentAbilityNumbers(canonical, 10);
    if (JSON.stringify(level1) !== JSON.stringify(source.expectedLevel1Numbers) || JSON.stringify(level10) !== JSON.stringify(source.expectedLevel10Numbers)) {
      throw new Error(`Current ability progression no longer matches pinned Stage 3E alias evidence for ${soldierId}`);
    }
  } else throw new Error(`Unknown Stage 3E admission ${source.admission}`);

  const bytes = await fetchBytes(source.assetUrl);
  const ext = isPng(bytes) ? 'png' : isWebp(bytes) ? 'webp' : null;
  if (!ext) throw new Error(`Stage 3E external asset is neither PNG nor WebP for ${soldierId}`);
  const fileName = `${soldierId}.${ext}`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);
  const dimensions = ext === 'png' ? pngDimensions(bytes) : null;
  const record = { soldierId, nameKr: canonicalName, tier: 3, sourceKind: source.admission.startsWith('CURRENT_KR_EXACT') ? 'CURRENT_KR_PINNED_WEB_EVIDENCE_IMAGE' : 'CURRENT_ABILITY_ALIAS_PINNED_WEB_EVIDENCE_IMAGE', sourceUrl: source.assetUrl, evidenceUrl: source.evidenceUrl, evidenceName: source.evidenceName, fileName, resolutionMethod: source.admission, size: bytes.length, sha256: sha256(bytes), width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  records.push(record); newlyResolved.push(record); unresolvedById.delete(soldierId);
  evidenceRows.push({ soldierId, status: 'PASS', admission: source.admission, canonicalName, evidenceName: source.evidenceName, evidenceUrl: source.evidenceUrl, assetUrl: source.assetUrl, evidenceVerification: 'PINNED_FROM_PRIOR_WEB_RESEARCH; ACTIONS_VALIDATES_CURRENT_CANONICAL_OR_ABILITY_AND_ASSET_BYTES' });
}

records.sort((a,b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a,b) => a.soldierId - b.soldierId);
const ids = new Set(records.map((r) => r.soldierId));
if (ids.size !== records.length) throw new Error('Duplicate Soldier portrait ID after Stage 3E');
if (records.length + unresolved.length !== 224) throw new Error('Stage 3E coverage mismatch');
const isSp = (id) => currentById.get(id)?.identity?.isSp === true;
const tierCount = (tier) => records.filter((r) => !isSp(r.soldierId) && currentById.get(r.soldierId)?.identity?.tier === tier).length;
const sourceCounts = Object.fromEntries([...new Set(records.map((r) => r.sourceKind))].sort().map((k) => [k, records.filter((r) => r.sourceKind === k).length]));
const output = {
  version: 4, stage: 'frontend-stage3e-t3-evidence-backed-expansion', status: 'PASS_WITH_REVIEW', generatedAt: new Date().toISOString(), publicRoot: v3.publicRoot, assetsReady: true,
  policy: { ...v3.policy, stage3eLegacyAdmission: 'Reuse only Stage 3C PASS_UNIQUE_LEGACY_ABILITY_MATCH pinned WebP sources.', stage3eCurrentWebAdmission: 'Use pinned web evidence after prior browser verification; Actions does not re-fetch blocked evidence pages and instead validates current canonical Korean name or current ability progression plus actual image bytes.', nameSimilarityUsedForAdmission: false, combatStatsUsedForIdentity: false, spPortraitExpansion: 'Not included.' },
  sources: { previousManifest: V3_PATH, stage3cDiscovery: DISCOVERY_PATH, currentCanonical: CURRENT_PATH, stage3eEvidence: EVIDENCE_OUTPUT },
  coverage: { canonicalSoldierCount: 224, canonicalNormalCount: current.filter((r) => !r.identity.isSp).length, canonicalSpCount: current.filter((r) => r.identity.isSp).length, resolvedCount: records.length, unresolvedCount: unresolved.length, resolvedNormalCount: records.filter((r) => !isSp(r.soldierId)).length, resolvedSpCount: records.filter((r) => isSp(r.soldierId)).length, tier1Resolved: tierCount(1), tier2Resolved: tierCount(2), tier3Resolved: tierCount(3), newlyResolvedCount: newlyResolved.length, sourceCounts },
  newlyResolvedSoldierIds: newlyResolved.map((r) => r.soldierId).sort((a,b) => a-b), records, unresolved,
};
await writeFile(EVIDENCE_OUTPUT, `${JSON.stringify({ version: 1, stage: 'soldier-portrait-stage3e-t3-evidence', generatedAt: new Date().toISOString(), rows: evidenceRows }, null, 2)}\n`);
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3E_EXPANSION resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} new=${output.coverage.newlyResolvedCount} t3=${output.coverage.tier3Resolved}`);
console.log(`STAGE3E_NEW_IDS=${output.newlyResolvedSoldierIds.join(',')}`);
