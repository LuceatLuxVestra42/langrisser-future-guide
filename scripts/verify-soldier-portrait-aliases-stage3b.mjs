import fs from 'node:fs/promises';

const CURRENT_PATH = 'data/generated/soldier-detail-stage5-6.v1.json';
const MANIFEST_PATH = 'data/generated/soldier-portrait-manifest.v2.json';
const OUTPUT_PATH = 'data/validation/soldier-portrait-alias-evidence-stage3b.v1.json';
const LEGACY_COMMIT = 'a85bba49dcf073563e7366dc18e96b7ba67c2ae3';

const LEGACY_PAGES = [
  { page: '보병', direct: 'INFANTRY' },
  { page: '창병', direct: 'LANCER' },
  { page: '기병', direct: 'CAVALRY' },
  { page: '비병', subgroup: { 1: 'FLYING', 2: 'WATER' } },
  { page: '궁병', subgroup: { 1: 'ARCHER', 2: 'ASSASSIN' } },
  { page: '승병', subgroup: { 1: 'MAGE', 2: 'HOLY', 3: 'DEMON' } },
];

// Candidate discovery may use presentation-name similarity, but admission NEVER does.
// A candidate is accepted only when the current ability numeric progression matches
// the pinned legacy entry in the same tier and army type.
const CANDIDATES = new Map([
  [131, '교국 친위대'],
  [132, '엘프 투창병'],
  [134, '파도 소환사'],
  [246, '야만용사'],
  [247, '사막 용병'],
  [248, '듀얼리스트'],
  [249, '송곳니 경비병'],
  [250, '정글 사슬 무희'],
  [251, '야만 뿔투사'],
  [337, '황금 기사'],
  [339, '불꽃 카발리에'],
  [340, '송곳니 정복자'],
  [341, '밀림 켄타우르스'],
  [422, '용의 후예'],
  [423, '기계용 기사'],
  [424, '태양 전투매'],
  [426, '암흑 수정 용기병'],
  [427, '검은 페가수스 기사'],
  [513, '빙하의 정령'],
  [514, '바다 제사장'],
  [515, '군도 특사'],
  [516, '어둠의 촉수'],
  [517, '어두운 파도 비늘'],
  [639, '공성 발리스타'],
  [643, '황야 답사대'],
  [644, '화염 주술사'],
  [645, '주술사'],
  [646, '외날개 화살'],
  [647, '금단의 숲의 샤먼'],
  [648, '비취 날개 사수'],
  [816, '신성 보호술사'],
  [817, '꽃과 바람의 성가대'],
  [818, '빛의 성자'],
  [1033, '거대 영혼 인형'],
  [1035, '계약 골렘'],
  [1036, '연옥의 마력 코어'],
  [1114, '나이트 엘프'],
  [1117, '검은 깃털의 가시'],
]);

function normalizeName(value) {
  return String(value ?? '').normalize('NFC').replace(/[\s_\-]/g, '').toLowerCase();
}

function stripMarkup(value) {
  return String(value ?? '')
    .replace(/<color=[^>]+>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<[^>]+>/g, '')
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
    return { level1, level10, expected: [], validShape: false };
  }
  const expected = [];
  for (let i = 0; i < level1.length; i += 1) {
    expected.push(level1[i]);
    if (level10[i] !== level1[i]) expected.push(level10[i]);
  }
  return { level1, level10, expected, validShape: true };
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
      const plain = stripMarkup(chunk.replace(/<br\s*\/?\s*>/gi, ' '));
      const heroIndex = plain.indexOf('사용가능영웅');
      const abilityText = heroIndex >= 0 ? plain.slice(0, heroIndex) : plain.slice(0, 1200);
      entries.push({
        tier: 3,
        armyType,
        name,
        nameKey: normalizeName(name),
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
const unresolvedIds = new Set(manifest.unresolved.filter((item) => !item.isSp).map((item) => item.soldierId));
const currentById = new Map(current.map((record) => [record.soldierId, record]));
const legacy = await loadLegacyEntries();

const results = [];
for (const [soldierId, legacyName] of CANDIDATES) {
  const record = currentById.get(soldierId);
  const base = {
    soldierId,
    currentNameKr: record?.identity?.nameKr ?? record?.nameKr ?? null,
    currentArmyType: record?.identity?.armyType ?? record?.armyType ?? null,
    legacyName,
  };

  if (!unresolvedIds.has(soldierId)) {
    results.push({ ...base, status: 'SKIP_NOT_UNRESOLVED' });
    continue;
  }
  if (!record) {
    results.push({ ...base, status: 'FAIL_CURRENT_RECORD_MISSING' });
    continue;
  }

  const armyType = record.identity?.armyType ?? record.armyType;
  const candidates = legacy.filter((entry) => entry.armyType === armyType && entry.nameKey === normalizeName(legacyName));
  if (candidates.length !== 1) {
    results.push({ ...base, status: candidates.length === 0 ? 'FAIL_LEGACY_ENTRY_MISSING' : 'FAIL_LEGACY_ENTRY_AMBIGUOUS', legacyCandidateCount: candidates.length });
    continue;
  }

  const level1 = record.ability?.levels?.find((level) => level.level === 1)?.description ?? null;
  const level10 = record.ability?.levels?.find((level) => level.level === 10)?.description ?? record.ability?.finalDescription ?? null;
  const progression = buildExpectedProgression(level1, level10);
  const legacyEntry = candidates[0];
  const positions = progression.validShape ? subsequencePositions(legacyEntry.abilityNumbers, progression.expected) : null;
  const varyingPairs = progression.level1.filter((value, index) => value !== progression.level10[index]).length;
  const informative = progression.level1.length >= 3 && varyingPairs >= 2;
  const pass = Boolean(positions && informative);

  results.push({
    ...base,
    status: pass ? 'PASS_ALIAS_EVIDENCE' : 'REVIEW_ABILITY_SIGNATURE',
    legacyPage: legacyEntry.page,
    legacySourceUrl: legacyEntry.sourceUrl,
    currentLevel1Numbers: progression.level1,
    currentLevel10Numbers: progression.level10,
    expectedLegacySubsequence: progression.expected,
    legacyAbilityNumbers: legacyEntry.abilityNumbers,
    varyingPairs,
    informative,
    subsequencePositions: positions,
    currentLevel1Text: stripMarkup(level1),
    currentLevel10Text: stripMarkup(level10),
    legacyAbilityText: legacyEntry.abilityText,
  });
}

const pass = results.filter((item) => item.status === 'PASS_ALIAS_EVIDENCE');
const review = results.filter((item) => item.status !== 'PASS_ALIAS_EVIDENCE');
const output = {
  version: 1,
  stage: 'soldier-portrait-stage3b-alias-evidence',
  status: review.length === 0 ? 'PASS' : 'PASS_WITH_REVIEW',
  generatedAt: new Date().toISOString(),
  policy: {
    candidateDiscoveryIsNotAdmission: true,
    admissionRequiresSameArmy: true,
    admissionRequiresUniquePinnedLegacyEntry: true,
    admissionRequiresAbilityNumericProgressionSubsequence: true,
    combatStatsAreNotUsedAsIdentity: true,
  },
  summary: {
    candidateCount: results.length,
    passCount: pass.length,
    reviewCount: review.length,
  },
  passedSoldierIds: pass.map((item) => item.soldierId),
  results,
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`STAGE3B_ALIAS_EVIDENCE candidates=${results.length} pass=${pass.length} review=${review.length}`);
console.log(`PASSED_IDS=${pass.map((item) => item.soldierId).join(',')}`);
console.log(`REVIEW=${review.map((item) => `${item.soldierId}:${item.status}`).join(',')}`);
