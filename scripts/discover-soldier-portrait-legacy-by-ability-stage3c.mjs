import fs from 'node:fs/promises';

const CURRENT_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v3.json';
const OUTPUT_PATH = 'data/validation/soldier-portrait-legacy-discovery-stage3c.v1.json';
const LEGACY_COMMIT = 'a85bba49dcf073563e7366dc18e96b7ba67c2ae3';

const LEGACY_PAGES = [
  { page: '보병', direct: 'INFANTRY' },
  { page: '창병', direct: 'LANCER' },
  { page: '기병', direct: 'CAVALRY' },
  { page: '비병', subgroup: { 1: 'FLYING', 2: 'WATER' } },
  { page: '궁병', subgroup: { 1: 'ARCHER', 2: 'ASSASSIN' } },
  { page: '승병', subgroup: { 1: 'MAGE', 2: 'HOLY', 3: 'DEMON' } },
];

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
      if (Number(haystack[i]) === Number(needle)) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    positions.push(found);
    cursor = found + 1;
  }
  return positions;
}

function buildExpectedProgression(level1Text, level10Text) {
  const level1 = numericTokens(level1Text);
  const level10 = numericTokens(level10Text);
  if (level1.length === 0 || level1.length !== level10.length) {
    return { level1, level10, expected: [], validShape: false, varyingPairs: 0 };
  }
  const expected = [];
  let varyingPairs = 0;
  for (let i = 0; i < level1.length; i += 1) {
    expected.push(level1[i]);
    if (level10[i] !== level1[i]) {
      expected.push(level10[i]);
      varyingPairs += 1;
    }
  }
  return { level1, level10, expected, validShape: true, varyingPairs };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
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
      if (!heading || heading.tier !== 3) continue;

      let fileStem = match[3].replace(/\.webp$/i, '');
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
      const plain = stripMarkup(chunk);
      const heroIndex = plain.indexOf('사용가능영웅');
      const abilityText = heroIndex >= 0 ? plain.slice(0, heroIndex) : plain.slice(0, 1400);
      entries.push({
        tier: 3,
        armyType,
        name,
        page: definition.page,
        sourceUrl: new URL(match[1], pageUrl).href,
        abilityText,
        abilityNumbers: numericTokens(abilityText),
      });
    }
  }
  return entries;
}

const current = JSON.parse(await fs.readFile(CURRENT_PATH, 'utf8')).records;
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const currentById = new Map(current.map((record) => [record.soldierId, record]));
const legacy = await loadLegacyEntries();
const unresolvedNormal = manifest.unresolved.filter((item) => !item.isSp);

const results = [];
for (const unresolved of unresolvedNormal) {
  const record = currentById.get(unresolved.soldierId);
  const armyType = record?.identity?.armyType ?? record?.armyType ?? unresolved.armyType;
  const tier = record?.identity?.tier ?? record?.tier ?? unresolved.tier;
  const nameKr = record?.identity?.nameKr ?? record?.nameKr ?? unresolved.nameKr ?? null;
  const base = {
    soldierId: unresolved.soldierId,
    tier,
    armyType,
    nameKr,
    priorReason: unresolved.reason,
  };

  if (!record) {
    results.push({ ...base, status: 'FAIL_CURRENT_RECORD_MISSING' });
    continue;
  }
  if (tier !== 3) {
    results.push({ ...base, status: 'REVIEW_NON_T3_NOT_COVERED' });
    continue;
  }

  const level1Text = record.ability?.levels?.find((level) => level.level === 1)?.description ?? null;
  const level10Text = record.ability?.levels?.find((level) => level.level === 10)?.description ?? record.ability?.finalDescription ?? null;
  const progression = buildExpectedProgression(level1Text, level10Text);
  const informative = progression.validShape && progression.level1.length >= 3 && progression.varyingPairs >= 2;
  if (!informative) {
    results.push({
      ...base,
      status: 'REVIEW_ABILITY_SIGNATURE_NOT_INFORMATIVE',
      currentLevel1Numbers: progression.level1,
      currentLevel10Numbers: progression.level10,
      varyingPairs: progression.varyingPairs,
    });
    continue;
  }

  const sameArmy = legacy.filter((entry) => entry.armyType === armyType);
  const matches = sameArmy
    .map((entry) => ({ entry, positions: subsequencePositions(entry.abilityNumbers, progression.expected) }))
    .filter((item) => item.positions !== null);

  if (matches.length !== 1) {
    results.push({
      ...base,
      status: matches.length === 0 ? 'REVIEW_NO_UNIQUE_LEGACY_ABILITY_MATCH' : 'REVIEW_AMBIGUOUS_LEGACY_ABILITY_MATCH',
      currentLevel1Numbers: progression.level1,
      currentLevel10Numbers: progression.level10,
      expectedLegacySubsequence: progression.expected,
      legacyCandidates: matches.map(({ entry, positions }) => ({ name: entry.name, page: entry.page, sourceUrl: entry.sourceUrl, positions })),
    });
    continue;
  }

  const { entry, positions } = matches[0];
  results.push({
    ...base,
    status: 'PASS_UNIQUE_LEGACY_ABILITY_MATCH',
    currentLevel1Numbers: progression.level1,
    currentLevel10Numbers: progression.level10,
    expectedLegacySubsequence: progression.expected,
    legacyName: entry.name,
    legacyPage: entry.page,
    legacySourceUrl: entry.sourceUrl,
    legacyAbilityText: entry.abilityText,
    subsequencePositions: positions,
  });
}

const pass = results.filter((item) => item.status === 'PASS_UNIQUE_LEGACY_ABILITY_MATCH');
const review = results.filter((item) => item.status !== 'PASS_UNIQUE_LEGACY_ABILITY_MATCH');
const tierCounts = Object.fromEntries([...new Set(results.map((item) => String(item.tier)))].sort().map((tier) => [tier, results.filter((item) => String(item.tier) === tier).length]));
const output = {
  version: 1,
  stage: 'soldier-portrait-stage3c-legacy-discovery-by-ability',
  status: 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  policy: {
    nameSimilarityUsedForAdmission: false,
    combatStatsUsedForIdentity: false,
    sameArmyRequired: true,
    sameTierRequired: true,
    informativeAbilityProgressionRequired: true,
    uniqueLegacyAbilityMatchRequired: true,
    driveAssetAdmissionDeferred: true,
  },
  summary: {
    unresolvedNormalCount: unresolvedNormal.length,
    tierCounts,
    uniqueLegacyMatchCount: pass.length,
    reviewCount: review.length,
  },
  uniqueMatches: pass.map((item) => ({ soldierId: item.soldierId, nameKr: item.nameKr, armyType: item.armyType, legacyName: item.legacyName, legacySourceUrl: item.legacySourceUrl })),
  results,
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3C_DISCOVERY unresolvedNormal=${unresolvedNormal.length} unique=${pass.length} review=${review.length} tiers=${JSON.stringify(tierCounts)}`);
console.log(`UNIQUE_MATCHES=${pass.map((item) => `${item.soldierId}:${item.legacyName}`).join('|')}`);
console.log(`REVIEW=${review.map((item) => `${item.soldierId}:${item.status}`).join('|')}`);
