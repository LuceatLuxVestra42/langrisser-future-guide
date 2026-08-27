import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CANONICAL_PATH = path.join(ROOT, "data/generated/soldier-detail-stage5-2.v1.json");
const STAGE2_MANIFEST_PATH = path.join(ROOT, "data/generated/soldier-portrait-manifest.v1.json");
const OUTPUT_MANIFEST_PATH = path.join(ROOT, "data/generated/soldier-portrait-manifest.v2.json");
const PUBLIC_DIR = path.join(ROOT, "public/images/soldiers");
const LEGACY_COMMIT = "a85bba49dcf073563e7366dc18e96b7ba67c2ae3";

const DRIVE_TIER_FOLDERS = {
  1: "1Br-tmzvjc4xo7baBaiziwweGyU75H-8x",
  2: "15a3Rc2w2i3Zkf32LZwB4xT8Ldaej0yXl",
};

const LEGACY_PAGES = [
  { page: "보병", direct: "INFANTRY" },
  { page: "창병", direct: "LANCER" },
  { page: "기병", direct: "CAVALRY" },
  { page: "비병", subgroup: { 1: "FLYING", 2: "WATER" } },
  { page: "궁병", subgroup: { 1: "ARCHER", 2: "ASSASSIN" } },
  { page: "승병", subgroup: { 1: "MAGE", 2: "HOLY", 3: "DEMON" } },
];

const STAT_LABELS = {
  range: "사거리",
  move: "이동거리",
  hp: "생명",
  atk: "공격",
  def: "물리방어",
  mdef: "마법방어",
};

function normalizeName(value) {
  return String(value ?? "").normalize("NFC").replace(/[\s_\-]/g, "").toLowerCase();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
}

function isWebp(bytes) {
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function pngDimensions(bytes) {
  if (!isPng(bytes) || bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function statValue(chunk, label) {
  const match = chunk.match(new RegExp(`<!--\\s*${label}\\s*-->[\\s\\S]{0,900}?<td[^>]*>\\s*([0-9]+)\\s*<\\/td>`, "i"));
  return match ? Number(match[1]) : null;
}

async function loadLegacyEntries() {
  const entries = [];
  for (const definition of LEGACY_PAGES) {
    const pageUrl = `https://raw.githubusercontent.com/redpanda7301/langrisser/${LEGACY_COMMIT}/troop/${encodeURIComponent(definition.page)}.html`;
    const text = await fetchText(pageUrl);
    const headings = [...text.matchAll(/<div class="view_title">([123])티어 용병<\/div>/g)]
      .map((match) => ({ tier: Number(match[1]), index: match.index }));
    const images = [...text.matchAll(/<img class="filterDiv [^"]+"[^>]*src="(\.\.\/img\/troop\/[^\"]+\/병종\/(\d+)_([^\"]+\.webp))"[^>]*>/g)];

    for (let index = 0; index < images.length; index += 1) {
      const match = images[index];
      const heading = headings.filter((item) => item.index < match.index).at(-1);
      if (!heading || heading.tier > 3) continue;

      let fileStem = match[3].replace(/\.webp$/i, "");
      let subgroup = null;
      const subgroupMatch = fileStem.match(/^(\d+)_(.+)$/);
      if (subgroupMatch) {
        subgroup = Number(subgroupMatch[1]);
        fileStem = subgroupMatch[2];
      }
      const armyType = definition.direct ?? definition.subgroup?.[subgroup] ?? null;
      if (!armyType) continue;

      const end = images[index + 1]?.index ?? Math.min(text.length, match.index + 24000);
      const chunk = text.slice(match.index, end);
      const name = chunk.match(/<h2>\s*([^<]+?)\s*<\/h2>/)?.[1]?.trim() ?? fileStem;
      const stats = Object.fromEntries(
        Object.entries(STAT_LABELS).map(([key, label]) => [key, statValue(chunk, label)]),
      );
      entries.push({
        tier: heading.tier,
        armyType,
        name,
        nameKey: normalizeName(name),
        legacyPage: definition.page,
        sourceUrl: new URL(match[1], pageUrl).href,
        stats,
      });
    }
  }
  return entries;
}

async function loadDriveFolderIndex(tier) {
  const folderId = DRIVE_TIER_FOLDERS[tier];
  const text = await fetchText(`https://drive.google.com/drive/folders/${folderId}`);
  const matches = [...text.matchAll(/aria-label="([^"]+) Shared folder"[\s\S]{0,900}?data-id="([^"]+)"/g)];
  const records = [...new Map(matches.map((match) => [match[2], {
    name: match[1],
    nameKey: normalizeName(match[1]),
    folderId: match[2],
  }])).values()];
  return records;
}

async function resolveDefaultPng(folderId) {
  const text = await fetchText(`https://drive.google.com/drive/folders/${folderId}`);
  const patterns = [
    /aria-label="Default\.png"[\s\S]{0,1200}?data-id="([^"]+)"/,
    /data-id="([^"]+)"[\s\S]{0,1200}?aria-label="Default\.png"/,
  ];
  let fileId = null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) { fileId = match[1]; break; }
  }
  if (!fileId) throw new Error(`Default.png not found in Drive folder ${folderId}`);
  return fileId;
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
      if (!isPng(bytes)) { failures.push(`non-PNG from ${new URL(url).host}`); continue; }
      return bytes;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Drive PNG download failed for ${fileId}: ${failures.join("; ")}`);
}

function combatSignature(record) {
  const c = record.combat ?? record.stats;
  return [record.armyType, record.tier, c.range, c.move, c.hp, c.atk, c.def, c.mdef].join(":");
}

const canonicalSource = JSON.parse(await readFile(CANONICAL_PATH, "utf8"));
const canonical = canonicalSource.records;
if (canonical.length !== 224) throw new Error(`Expected 224 canonical Soldiers, got ${canonical.length}`);

const stage2 = JSON.parse(await readFile(STAGE2_MANIFEST_PATH, "utf8"));
const stage2ById = new Map(stage2.records.map((record) => [record.soldierId, record]));
const legacy = await loadLegacyEntries();
const driveI = await loadDriveFolderIndex(1);
const driveII = await loadDriveFolderIndex(2);
if (driveI.length !== 11) throw new Error(`Expected 11 Drive I folders, got ${driveI.length}`);
if (driveII.length !== 27) throw new Error(`Expected 27 Drive II folders, got ${driveII.length}`);

const legacyBySignature = new Map();
for (const entry of legacy) {
  if (Object.values(entry.stats).some((value) => value == null)) continue;
  const signature = combatSignature({ armyType: entry.armyType, tier: entry.tier, stats: entry.stats });
  const bucket = legacyBySignature.get(signature) ?? [];
  bucket.push(entry);
  legacyBySignature.set(signature, bucket);
}

const canonicalTierArmyCounts = new Map();
for (const record of canonical.filter((record) => !record.identity.isSp)) {
  const key = `${record.identity.tier}:${record.identity.armyType}`;
  canonicalTierArmyCounts.set(key, (canonicalTierArmyCounts.get(key) ?? 0) + 1);
}

const legacyTierArmy = new Map();
for (const entry of legacy) {
  const key = `${entry.tier}:${entry.armyType}`;
  const bucket = legacyTierArmy.get(key) ?? [];
  bucket.push(entry);
  legacyTierArmy.set(key, bucket);
}

const resolved = [];
const unresolved = [];
const usedSourceKeys = new Set();

function unresolvedRecord(record, reason, details = null) {
  unresolved.push({
    soldierId: record.soldierId,
    tier: record.identity.tier,
    isSp: record.identity.isSp,
    armyType: record.identity.armyType,
    nameKr: record.identity.nameKr,
    reason,
    details,
  });
}

for (const record of canonical) {
  if (record.identity.isSp) {
    unresolvedRecord(record, "SP_PORTRAIT_SOURCE_NOT_ESTABLISHED");
    continue;
  }

  const stage2Record = stage2ById.get(record.soldierId);
  if (stage2Record) {
    resolved.push({
      ...stage2Record,
      sourceKind: "DRIVE_DEFAULT_PNG_STAGE2_PROOF",
      resolutionMethod: "CANONICAL_KR_NAME_EXACT_DRIVE_FOLDER_DEFAULT_PNG",
    });
    usedSourceKeys.add(`stage2:${record.soldierId}`);
    continue;
  }

  const tier = record.identity.tier;
  if (tier === 3) {
    if (!record.identity.nameKr) {
      unresolvedRecord(record, "CANONICAL_KR_NAME_MISSING");
      continue;
    }
    const key = normalizeName(record.identity.nameKr);
    const candidates = legacy.filter((entry) => entry.tier === 3 && entry.armyType === record.identity.armyType && entry.nameKey === key);
    if (candidates.length !== 1) {
      unresolvedRecord(record, candidates.length === 0 ? "NO_EXACT_LEGACY_KR_NAME_MATCH" : "AMBIGUOUS_LEGACY_KR_NAME_MATCH", candidates.map((entry) => entry.name));
      continue;
    }
    const sourceKey = `legacy:${candidates[0].sourceUrl}`;
    if (usedSourceKeys.has(sourceKey)) {
      unresolvedRecord(record, "LEGACY_ASSET_ALREADY_USED", candidates[0].name);
      continue;
    }
    resolved.push({
      soldierId: record.soldierId,
      nameKr: record.identity.nameKr,
      tier,
      sourceKind: "PINNED_LEGACY_KR_WEBP",
      sourceFileName: path.basename(new URL(candidates[0].sourceUrl).pathname),
      legacyName: candidates[0].name,
      sourceUrl: candidates[0].sourceUrl,
      fileName: `${record.soldierId}.webp`,
      resolutionMethod: "CANONICAL_KR_NAME_EXACT_LEGACY_KR_NAME_SAME_TIER_ARMY",
    });
    usedSourceKeys.add(sourceKey);
    continue;
  }

  if (tier === 2) {
    const signature = combatSignature({ armyType: record.identity.armyType, tier, combat: record.combat });
    const candidates = legacyBySignature.get(signature) ?? [];
    if (candidates.length !== 1) {
      unresolvedRecord(record, candidates.length === 0 ? "NO_UNIQUE_T2_COMBAT_SIGNATURE" : "AMBIGUOUS_T2_COMBAT_SIGNATURE", candidates.map((entry) => entry.name));
      continue;
    }
    const legacyEntry = candidates[0];
    const driveCandidates = driveII.filter((item) => item.nameKey === legacyEntry.nameKey);
    if (driveCandidates.length !== 1) {
      unresolvedRecord(record, driveCandidates.length === 0 ? "NO_DRIVE_II_NAME_CROSSCHECK" : "AMBIGUOUS_DRIVE_II_NAME_CROSSCHECK", legacyEntry.name);
      continue;
    }
    const sourceKey = `drive:${driveCandidates[0].folderId}`;
    if (usedSourceKeys.has(sourceKey)) {
      unresolvedRecord(record, "DRIVE_FOLDER_ALREADY_USED", legacyEntry.name);
      continue;
    }
    resolved.push({
      soldierId: record.soldierId,
      nameKr: null,
      presentationNameEvidence: legacyEntry.name,
      tier,
      driveFolderId: driveCandidates[0].folderId,
      sourceKind: "DRIVE_DEFAULT_PNG_T2_CROSSCHECKED",
      sourceFileName: "Default.png",
      fileName: `${record.soldierId}.png`,
      resolutionMethod: "UNIQUE_COMBAT_SIGNATURE_PLUS_LEGACY_KR_NAME_EXACT_DRIVE_II_FOLDER",
    });
    usedSourceKeys.add(sourceKey);
    continue;
  }

  if (tier === 1) {
    const key = `${tier}:${record.identity.armyType}`;
    const canonicalCount = canonicalTierArmyCounts.get(key) ?? 0;
    const legacyCandidates = legacyTierArmy.get(key) ?? [];
    if (canonicalCount !== 1 || legacyCandidates.length !== 1) {
      unresolvedRecord(record, "T1_TIER_ARMY_NOT_UNIQUE", { canonicalCount, legacyCount: legacyCandidates.length });
      continue;
    }
    const legacyEntry = legacyCandidates[0];
    const driveCandidates = driveI.filter((item) => item.nameKey === legacyEntry.nameKey);
    if (driveCandidates.length !== 1) {
      unresolvedRecord(record, driveCandidates.length === 0 ? "NO_DRIVE_I_NAME_CROSSCHECK" : "AMBIGUOUS_DRIVE_I_NAME_CROSSCHECK", legacyEntry.name);
      continue;
    }
    const sourceKey = `drive:${driveCandidates[0].folderId}`;
    if (usedSourceKeys.has(sourceKey)) {
      unresolvedRecord(record, "DRIVE_FOLDER_ALREADY_USED", legacyEntry.name);
      continue;
    }
    resolved.push({
      soldierId: record.soldierId,
      nameKr: null,
      presentationNameEvidence: legacyEntry.name,
      tier,
      driveFolderId: driveCandidates[0].folderId,
      sourceKind: "DRIVE_DEFAULT_PNG_T1_STRUCTURAL_CROSSCHECKED",
      sourceFileName: "Default.png",
      fileName: `${record.soldierId}.png`,
      resolutionMethod: "UNIQUE_CANONICAL_AND_LEGACY_TIER_ARMY_PLUS_LEGACY_KR_NAME_EXACT_DRIVE_I_FOLDER",
    });
    usedSourceKeys.add(sourceKey);
    continue;
  }

  unresolvedRecord(record, "UNSUPPORTED_TIER");
}

resolved.sort((a, b) => a.soldierId - b.soldierId);
unresolved.sort((a, b) => a.soldierId - b.soldierId);

const resolvedIds = new Set(resolved.map((record) => record.soldierId));
if (resolvedIds.size !== resolved.length) throw new Error("Duplicate Soldier IDs in resolved portrait set");
if (resolved.length + unresolved.length !== 224) throw new Error("Resolved + unresolved does not cover 224 canonical Soldiers");

await mkdir(PUBLIC_DIR, { recursive: true });
const keepFiles = new Set(resolved.map((record) => record.fileName));
for (const existing of ["102.png", "105.png", "106.png"]) {
  if (!keepFiles.has(existing)) throw new Error(`Stage 2 proof asset unexpectedly dropped: ${existing}`);
}

for (const record of resolved) {
  const outputPath = path.join(PUBLIC_DIR, record.fileName);
  let bytes;
  if (record.sourceKind === "DRIVE_DEFAULT_PNG_STAGE2_PROOF") {
    bytes = await readFile(outputPath);
    if (!isPng(bytes)) throw new Error(`Stage 2 proof asset is not PNG: ${record.fileName}`);
    const expectedSha = stage2ById.get(record.soldierId)?.sha256;
    if (expectedSha && sha256(bytes) !== expectedSha) throw new Error(`Stage 2 SHA mismatch: ${record.fileName}`);
  } else if (record.sourceKind.startsWith("DRIVE_DEFAULT_PNG_")) {
    const fileId = await resolveDefaultPng(record.driveFolderId);
    bytes = await downloadDrivePng(fileId);
    record.driveFileId = fileId;
    await writeFile(outputPath, bytes);
  } else if (record.sourceKind === "PINNED_LEGACY_KR_WEBP") {
    bytes = await fetchBytes(record.sourceUrl);
    if (!isWebp(bytes)) throw new Error(`Legacy asset is not WebP: ${record.sourceUrl}`);
    await writeFile(outputPath, bytes);
  } else {
    throw new Error(`Unknown sourceKind ${record.sourceKind}`);
  }

  record.size = bytes.length;
  record.sha256 = sha256(bytes);
  if (isPng(bytes)) {
    const dimensions = pngDimensions(bytes);
    record.width = dimensions?.width ?? null;
    record.height = dimensions?.height ?? null;
  }
}

// Remove stale Stage 3-generated files that are no longer in the resolved set while preserving directory ownership.
const { readdir } = await import("node:fs/promises");
for (const fileName of await readdir(PUBLIC_DIR)) {
  if (!/^[0-9]+\.(?:png|webp)$/i.test(fileName)) continue;
  if (!keepFiles.has(fileName)) await rm(path.join(PUBLIC_DIR, fileName), { force: true });
}

const countByTier = (tier) => resolved.filter((record) => record.tier === tier).length;
const sourceCounts = Object.fromEntries(
  [...new Set(resolved.map((record) => record.sourceKind))].sort().map((kind) => [kind, resolved.filter((record) => record.sourceKind === kind).length]),
);

const manifest = {
  version: 2,
  stage: "frontend-stage3-safe-coverage-expansion",
  status: "PASS_WITH_REVIEW",
  generatedAt: new Date().toISOString(),
  publicRoot: "images/soldiers",
  assetsReady: true,
  policy: {
    noGuessing: true,
    spNormalPortraitReuse: false,
    stage2ProofPreserved: true,
    t1: "Require one canonical Soldier and one legacy Soldier in same tier+army, then exact legacy Korean name to Drive I folder.",
    t2: "Require unique current combat signature to legacy Soldier, then exact legacy Korean name to Drive II folder.",
    t3: "Require exact normalized canonical Korean name to pinned legacy Korean Soldier name in same tier+army; Stage 2 exact Drive proofs remain PNG.",
    unresolved: "Keep UI fallback; never infer or reuse a portrait without evidence.",
  },
  sources: {
    canonical: "data/generated/soldier-detail-stage5-2.v1.json",
    stage2Manifest: "data/generated/soldier-portrait-manifest.v1.json",
    legacyRepository: `redpanda7301/langrisser@${LEGACY_COMMIT}`,
    driveTierI: DRIVE_TIER_FOLDERS[1],
    driveTierII: DRIVE_TIER_FOLDERS[2],
  },
  coverage: {
    canonicalSoldierCount: 224,
    canonicalNormalCount: 168,
    canonicalSpCount: 56,
    resolvedCount: resolved.length,
    unresolvedCount: unresolved.length,
    resolvedNormalCount: resolved.filter((record) => record.soldierId < 5000).length,
    resolvedSpCount: resolved.filter((record) => record.soldierId >= 5000).length,
    tier1Resolved: countByTier(1),
    tier2Resolved: countByTier(2),
    tier3Resolved: countByTier(3),
    sourceCounts,
  },
  records: resolved,
  unresolved,
};

await writeFile(OUTPUT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Stage 3 portrait generation: resolved=${resolved.length} unresolved=${unresolved.length}`);
console.log(`By tier: T1=${countByTier(1)} T2=${countByTier(2)} T3=${countByTier(3)} SP=${manifest.coverage.resolvedSpCount}`);
console.log(`Sources: ${JSON.stringify(sourceCounts)}`);
console.log(`Unresolved IDs: ${unresolved.map((record) => record.soldierId).join(",")}`);
