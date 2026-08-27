import fs from 'node:fs/promises';

const CURRENT_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v3.json';
const OUTPUT_PATH = 'data/validation/soldier-portrait-low-tier-discovery-stage3d.v1.json';
const LEGACY_COMMIT = 'a85bba49dcf073563e7366dc18e96b7ba67c2ae3';
const DRIVE_ROOTS = {
  1: '1Br-tmzvjc4xo7baBaiziwweGyU75H-8x',
  2: '15a3Rc2w2i3Zkf32LZwB4xT8Ldaej0yXl',
};

const LEGACY_PAGES = [
  { page: '보병', direct: 'INFANTRY' },
  { page: '창병', direct: 'LANCER' },
  { page: '기병', direct: 'CAVALRY' },
  { page: '비병', subgroup: { 1: 'FLYING', 2: 'WATER' } },
  { page: '궁병', subgroup: { 1: 'ARCHER', 2: 'ASSASSIN' } },
  { page: '승병', subgroup: { 1: 'MAGE', 2: 'HOLY', 3: 'DEMON' } },
];

function normalizeName(value) {
  return String(value ?? '').normalize('NFC').replace(/[\s_\-]/g, '').toLowerCase();
}

function stripMarkup(value) {
  return String(value ?? '')
    .replace(/<color=[^>]+>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericTokens(value) {
  return stripMarkup(value).match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

function subsequencePositions(haystack, needles) {
  const positions = [];
  let cursor = 0;
  for (const needle of needles) {
    let found = -1;
    for (let i = cursor; i < haystack.length; i += 1) {
      if (Number(haystack[i]) === Number(needle)) { found = i; break; }
    }
    if (found < 0) return null;
    positions.push(found);
    cursor = found + 1;
  }
  return positions;
}

function progression(level1Text, level10Text) {
  const level1 = numericTokens(level1Text);
  const level10 = numericTokens(level10Text);
  if (!level1.length || level1.length !== level10.length) return { valid: false, level1, level10, expected: [], varyingPairs: 0 };
  const expected = [];
  let varyingPairs = 0;
  for (let i = 0; i < level1.length; i += 1) {
    expected.push(level1[i]);
    if (level1[i] !== level10[i]) { expected.push(level10[i]); varyingPairs += 1; }
  }
  return { valid: true, level1, level10, expected, varyingPairs };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function loadDriveIndex(tier) {
  const text = await fetchText(`https://drive.google.com/drive/folders/${DRIVE_ROOTS[tier]}`);
  const matches = [...text.matchAll(/aria-label="([^"]+) Shared folder"[\s\S]{0,900}?data-id="([^"]+)"/g)];
  const records = [...new Map(matches.map((match) => [match[2], { name: match[1], nameKey: normalizeName(match[1]), folderId: match[2] }])).values()];
  const expected = tier === 1 ? 11 : 27;
  if (records.length !== expected) throw new Error(`Drive tier ${tier} expected ${expected} folders, got ${records.length}`);
  return records;
}

async function loadLegacyEntries() {
  const entries = [];
  for (const definition of LEGACY_PAGES) {
    const pageUrl = `https://raw.githubusercontent.com/redpanda7301/langrisser/${LEGACY_COMMIT}/troop/${encodeURIComponent(definition.page)}.html`;
    const text = await fetchText(pageUrl);
    const headings = [...text.matchAll(/<div class="view_title">([123])티어 용병<\/div>/g)].map((match) => ({ tier: Number(match[1]), index: match.index }));
    const images = [...text.matchAll(/<img class="filterDiv [^"]+"[^>]*src="(\.\.\/img\/troop\/[^\"]+\/병종\/(\d+)_([^\"]+\.webp))"[^>]*>/g)];
    for (let index = 0; index < images.length; index += 1) {
      const match = images[index];
      const heading = headings.filter((item) => item.index < match.index).at(-1);
      if (!heading || (heading.tier !== 1 && heading.tier !== 2)) continue;
      let fileStem = match[3].replace(/\.webp$/i, '');
      let subgroup = null;
      const subgroupMatch = fileStem.match(/^(\d+)_(.+)$/);
      if (subgroupMatch) { subgroup = Number(subgroupMatch[1]); fileStem = subgroupMatch[2]; }
      const armyType = definition.direct ?? definition.subgroup?.[subgroup] ?? null;
      if (!armyType) continue;
      const end = images[index + 1]?.index ?? Math.min(text.length, match.index + 24000);
      const chunk = text.slice(match.index, end);
      const name = chunk.match(/<h2>\s*([^<]+?)\s*<\/h2>/)?.[1]?.trim() ?? fileStem;
      const plain = stripMarkup(chunk);
      const heroIndex = plain.indexOf('사용가능영웅');
      const abilityText = heroIndex >= 0 ? plain.slice(0, heroIndex) : plain.slice(0, 1200);
      entries.push({ tier: heading.tier, armyType, name, nameKey: normalizeName(name), page: definition.page, sourceUrl: new URL(match[1], pageUrl).href, abilityText, abilityNumbers: numericTokens(abilityText) });
    }
  }
  return entries;
}

const current = JSON.parse(await fs.readFile(CURRENT_PATH, 'utf8')).records;
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const currentById = new Map(current.map((record) => [record.soldierId, record]));
const legacy = await loadLegacyEntries();
const drive = { 1: await loadDriveIndex(1), 2: await loadDriveIndex(2) };
const unresolved = manifest.unresolved.filter((item) => !item.isSp && (item.tier === 1 || item.tier === 2));
const results = [];

for (const item of unresolved) {
  const record = currentById.get(item.soldierId);
  const tier = record?.identity?.tier ?? item.tier;
  const armyType = record?.identity?.armyType ?? item.armyType;
  const nameKr = record?.identity?.nameKr ?? item.nameKr ?? null;
  const base = { soldierId: item.soldierId, tier, armyType, nameKr, priorReason: item.reason };
  if (!record) { results.push({ ...base, status: 'FAIL_CURRENT_RECORD_MISSING' }); continue; }

  if (nameKr) {
    const exactDrive = drive[tier].filter((folder) => folder.nameKey === normalizeName(nameKr));
    if (exactDrive.length === 1) {
      results.push({ ...base, status: 'PASS_CANONICAL_NAME_EXACT_DRIVE', driveName: exactDrive[0].name, driveFolderId: exactDrive[0].folderId });
      continue;
    }
  }

  const level1Text = record.ability?.levels?.find((level) => level.level === 1)?.description ?? null;
  const level10Text = record.ability?.levels?.find((level) => level.level === 10)?.description ?? record.ability?.finalDescription ?? null;
  const prog = progression(level1Text, level10Text);
  const informative = prog.valid && prog.level1.length >= 2 && prog.varyingPairs >= 1;
  if (!informative) {
    results.push({ ...base, status: 'REVIEW_LOW_TIER_ABILITY_NOT_INFORMATIVE', currentLevel1Numbers: prog.level1, currentLevel10Numbers: prog.level10 });
    continue;
  }

  const matches = legacy
    .filter((entry) => entry.tier === tier && entry.armyType === armyType)
    .map((entry) => ({ entry, positions: subsequencePositions(entry.abilityNumbers, prog.expected) }))
    .filter((match) => match.positions !== null);
  if (matches.length !== 1) {
    results.push({ ...base, status: matches.length === 0 ? 'REVIEW_NO_UNIQUE_LOW_TIER_LEGACY_ABILITY_MATCH' : 'REVIEW_AMBIGUOUS_LOW_TIER_LEGACY_ABILITY_MATCH', legacyCandidates: matches.map(({ entry }) => entry.name) });
    continue;
  }

  const legacyEntry = matches[0].entry;
  const driveMatches = drive[tier].filter((folder) => folder.nameKey === legacyEntry.nameKey);
  if (driveMatches.length !== 1) {
    results.push({ ...base, status: driveMatches.length === 0 ? 'REVIEW_LEGACY_NAME_NOT_IN_DRIVE_TIER' : 'REVIEW_AMBIGUOUS_LEGACY_NAME_IN_DRIVE_TIER', legacyName: legacyEntry.name, legacySourceUrl: legacyEntry.sourceUrl });
    continue;
  }

  results.push({
    ...base,
    status: 'PASS_UNIQUE_LOW_TIER_ABILITY_PLUS_DRIVE_NAME',
    legacyName: legacyEntry.name,
    legacySourceUrl: legacyEntry.sourceUrl,
    driveName: driveMatches[0].name,
    driveFolderId: driveMatches[0].folderId,
    currentLevel1Numbers: prog.level1,
    currentLevel10Numbers: prog.level10,
    expectedLegacySubsequence: prog.expected,
    subsequencePositions: matches[0].positions,
  });
}

const passed = results.filter((result) => result.status.startsWith('PASS_'));
const output = {
  version: 1,
  stage: 'soldier-portrait-stage3d-low-tier-discovery',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  policy: {
    currentCanonicalExactDriveAllowed: true,
    otherwiseUniqueAbilityLegacyRequired: true,
    legacyNameExactDriveRequired: true,
    combatStatsUsedForIdentity: false,
    nameSimilarityUsedForAdmission: false,
  },
  driveCounts: { tier1: drive[1].length, tier2: drive[2].length },
  summary: { unresolvedLowTierCount: results.length, passCount: passed.length, reviewCount: results.length - passed.length },
  passedSoldierIds: passed.map((result) => result.soldierId),
  results,
};
await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3D_LOW_TIER unresolved=${results.length} pass=${passed.length} review=${results.length - passed.length}`);
console.log(`PASSED=${passed.map((r) => `${r.soldierId}:${r.status}:${r.driveName}`).join('|')}`);
console.log(`REVIEW=${results.filter(r=>!r.status.startsWith('PASS_')).map(r=>`${r.soldierId}:${r.status}`).join('|')}`);
