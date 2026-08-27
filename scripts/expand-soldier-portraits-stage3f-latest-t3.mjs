import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const V4_PATH = 'data/generated/soldier-portrait-manifest.v4.json';
const MODEL_PATH = 'data/validation/soldier-portrait-stage3f-latest-t3-models.v1.json';
const OUTPUT_PATH = 'data/generated/soldier-portrait-manifest.v5.json';
const EVIDENCE_PATH = 'data/validation/soldier-portrait-stage3f-latest-t3-evidence.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/soldier-frontend-stage3f-latest-t3.txt';
const PUBLIC_DIR = 'public/images/soldiers';
const TARGET_IDS = [135,136,251,427,516,648,819,1033,1035,1037,1038,1039,1118];
const BWIKI_API = 'https://wiki.biligame.com/langrisser/api.php';

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isPng(bytes) { return bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])); }
function pngDimensions(bytes) {
  if (!isPng(bytes) || bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
async function fetchJson(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3F/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}
async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 SoldierPortraitStage3F/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function resolveBwikiImage(nameCn) {
  const titles = [`File:Q${nameCn}.png`, `File:士兵 ${nameCn}.png`];
  const attempts = [];
  for (const title of titles) {
    const params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo', iiprop: 'url|size|sha1', titles: title });
    const apiUrl = `${BWIKI_API}?${params}`;
    try {
      const json = await fetchJson(apiUrl);
      const pages = Object.values(json?.query?.pages ?? {});
      const page = pages[0];
      const info = page?.imageinfo?.[0];
      if (page && !page.missing && info?.url) {
        return { title, apiUrl, sourceUrl: info.url, apiWidth: info.width ?? null, apiHeight: info.height ?? null, apiSize: info.size ?? null, apiSha1: info.sha1 ?? null };
      }
      attempts.push({ title, status: 'MISSING' });
    } catch (error) {
      attempts.push({ title, status: 'ERROR', error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error(`BWIKI image unresolved for ${nameCn}: ${JSON.stringify(attempts)}`);
}

const v4 = JSON.parse(await readFile(V4_PATH, 'utf8'));
const modelIndex = JSON.parse(await readFile(MODEL_PATH, 'utf8'));
const modelById = new Map(modelIndex.rows.map((row) => [row.soldierId, row]));
const unresolvedById = new Map(v4.unresolved.map((row) => [row.soldierId, row]));
const records = v4.records.map((row) => ({ ...row }));
const evidenceRows = [];
const newlyResolved = [];
await mkdir(PUBLIC_DIR, { recursive: true });

for (const soldierId of TARGET_IDS) {
  const model = modelById.get(soldierId);
  const unresolved = unresolvedById.get(soldierId);
  if (!model) throw new Error(`Stage 3F model checkpoint missing ${soldierId}`);
  if (!unresolved) throw new Error(`Stage 3F target is not unresolved in v4: ${soldierId}`);
  if (Number(model.rank) !== 3) throw new Error(`Stage 3F non-T3 target ${soldierId}`);
  if (!model.nameCn || !model.model || !model.modelStem) throw new Error(`Stage 3F identity/model evidence incomplete ${soldierId}`);

  const bwiki = await resolveBwikiImage(model.nameCn);
  const bytes = await fetchBytes(bwiki.sourceUrl);
  if (!isPng(bytes)) throw new Error(`BWIKI asset is not PNG for ${soldierId}: ${bwiki.sourceUrl}`);
  const dimensions = pngDimensions(bytes);
  const fileName = `${soldierId}.png`;
  await writeFile(path.join(PUBLIC_DIR, fileName), bytes);

  const record = {
    soldierId,
    nameKr: model.nameKr ?? null,
    nameCn: model.nameCn,
    tier: 3,
    sourceKind: bwiki.title.startsWith('File:Q') ? 'BWIKI_CURRENT_CN_EXACT_Q_PNG_STAGE3F' : 'BWIKI_CURRENT_CN_EXACT_SOLDIER_PNG_STAGE3F',
    sourceUrl: bwiki.sourceUrl,
    bwikiFileTitle: bwiki.title,
    bwikiPageUrl: `https://wiki.biligame.com/langrisser/士兵/${encodeURIComponent(model.nameCn)}`,
    model: model.model,
    modelStem: model.modelStem,
    fileName,
    resolutionMethod: 'CANONICAL_SOLDIER_ID_TO_CONFIGDATA_CN_MODEL_TO_BWIKI_EXACT_CN_IMAGE',
    size: bytes.length,
    sha256: sha256(bytes),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
  records.push(record);
  newlyResolved.push(record);
  unresolvedById.delete(soldierId);
  evidenceRows.push({
    soldierId,
    status: 'PASS',
    nameKr: model.nameKr ?? null,
    nameCn: model.nameCn,
    model: model.model,
    modelStem: model.modelStem,
    bwikiFileTitle: bwiki.title,
    bwikiApiUrl: bwiki.apiUrl,
    sourceUrl: bwiki.sourceUrl,
    byteSize: bytes.length,
    sha256: record.sha256,
    width: record.width,
    height: record.height,
  });
}

records.sort((a,b) => a.soldierId - b.soldierId);
const unresolved = [...unresolvedById.values()].sort((a,b) => a.soldierId - b.soldierId);
const ids = new Set(records.map((r) => r.soldierId));
if (ids.size !== records.length) throw new Error('Duplicate Soldier portrait ID after Stage 3F');
if (records.length + unresolved.length !== 224) throw new Error('Stage 3F total coverage mismatch');
if (TARGET_IDS.some((id) => unresolvedById.has(id))) throw new Error('Stage 3F target remains unresolved');

const normalResolved = records.filter((r) => !String(r.soldierId).startsWith('9')); // overwritten below from v4 invariant rather than ID heuristic
const tier1Resolved = v4.coverage.tier1Resolved;
const tier2Resolved = v4.coverage.tier2Resolved;
const tier3Resolved = v4.coverage.tier3Resolved + newlyResolved.length;
const resolvedNormalCount = v4.coverage.resolvedNormalCount + newlyResolved.length;
const resolvedSpCount = v4.coverage.resolvedSpCount;
const sourceCounts = Object.fromEntries([...new Set(records.map((r) => r.sourceKind))].sort().map((kind) => [kind, records.filter((r) => r.sourceKind === kind).length]));

const output = {
  version: 5,
  stage: 'frontend-stage3f-latest-t3-current-source-closeout',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  publicRoot: v4.publicRoot,
  assetsReady: true,
  policy: {
    ...v4.policy,
    stage3fAdmission: 'Canonical Soldier ID must be in v4 unresolved T3; ConfigDataSoldierInfo exact ID supplies current Chinese name and unique Model; BWIKI image file must match that exact Chinese name as Q<name>.png or 士兵 <name>.png.',
    latestT3LegacyDependency: false,
    nameSimilarityUsedForAdmission: false,
    combatStatsUsedForIdentity: false,
    modelKeyUsedAsIdentityEvidence: true,
    spPortraitExpansion: 'Not included.',
  },
  sources: {
    previousManifest: V4_PATH,
    modelCheckpoint: MODEL_PATH,
    bwikiApi: BWIKI_API,
    stage3fEvidence: EVIDENCE_PATH,
  },
  coverage: {
    canonicalSoldierCount: 224,
    canonicalNormalCount: v4.coverage.canonicalNormalCount,
    canonicalSpCount: v4.coverage.canonicalSpCount,
    resolvedCount: records.length,
    unresolvedCount: unresolved.length,
    resolvedNormalCount,
    resolvedSpCount,
    tier1Resolved,
    tier2Resolved,
    tier3Resolved,
    newlyResolvedCount: newlyResolved.length,
    remainingT3UnresolvedCount: 0,
    sourceCounts,
  },
  newlyResolvedSoldierIds: newlyResolved.map((r) => r.soldierId).sort((a,b) => a-b),
  records,
  unresolved,
};

if (output.coverage.resolvedCount !== 158 || output.coverage.unresolvedCount !== 66) throw new Error(`Unexpected Stage 3F coverage ${output.coverage.resolvedCount}/${output.coverage.unresolvedCount}`);
if (output.coverage.resolvedNormalCount !== 158 || output.coverage.resolvedSpCount !== 0) throw new Error('Unexpected Stage 3F normal/SP coverage');
if (output.coverage.tier3Resolved !== 129 || output.coverage.remainingT3UnresolvedCount !== 0) throw new Error('Stage 3F T3 closeout mismatch');

await writeFile(EVIDENCE_PATH, `${JSON.stringify({ version: 1, stage: 'soldier-portrait-stage3f-latest-t3-evidence', generatedAt: new Date().toISOString(), targetCount: TARGET_IDS.length, passCount: evidenceRows.length, rows: evidenceRows }, null, 2)}\n`);
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(CHECKPOINT_PATH, [
  'Soldier Frontend Stage 3F — latest T3 portrait closeout',
  'status: PASS_WITH_REVIEW',
  `parentManifest: ${V4_PATH}`,
  'targetT3Count: 13',
  `resolvedThisStage: ${newlyResolved.length}`,
  'tier3Resolved: 129/129',
  `overallResolved: ${output.coverage.resolvedCount}/224`,
  `overallUnresolved: ${output.coverage.unresolvedCount}/224`,
  'remainingNormalUnresolved: 10',
  'remainingSpUnresolved: 56',
  'identityRule: canonical Soldier ID -> ConfigDataSoldierInfo exact ID -> current Chinese name + Model -> BWIKI exact Chinese-name image file',
  'nameSimilarity: PROHIBITED',
  'legacyAbilityMatch: NOT_USED_FOR_STAGE3F',
  'spPortraitReuse: PROHIBITED',
  'next: keep 10 lower-tier normal + 56 SP in review; T3 portrait work is closed',
  '',
].join('\n'));
console.log(`STAGE3F_CLOSEOUT resolved=${output.coverage.resolvedCount} unresolved=${output.coverage.unresolvedCount} t3=${output.coverage.tier3Resolved} new=${newlyResolved.length}`);
console.log(`STAGE3F_NEW_IDS=${output.newlyResolvedSoldierIds.join(',')}`);
