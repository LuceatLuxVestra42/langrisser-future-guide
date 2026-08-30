import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/hero-provisional-localization-stage2.v1.json';
const PRESENTATION_PATH = 'data/presentation/hero-provisional-name-kr.v1.json';
const HERO_LIST_PATH = 'data/generated/hero-list-stage1.v1.json';
const HERO_LIST_SERVER_PATH = 'src/lib/hero-list.server.ts';
const EXPECTED_PATH = 'data/validation/hero-provisional-localization-stage2.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function issue(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function sortedIds(records) {
  return records.map((record) => Number(record.heroId)).sort((a, b) => a - b);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function runtimeImports(source) {
  return [...source.matchAll(/^import\s+[^;]+?from\s+["']([^"']+)["'];?$/gm)].map((match) => match[1]);
}

function audit() {
  const errors = [];
  const contract = readJson(CONTRACT_PATH);
  const presentation = readJson(PRESENTATION_PATH);
  const heroList = readJson(HERO_LIST_PATH);
  const server = readText(HERO_LIST_SERVER_PATH);
  const expected = readJson(EXPECTED_PATH);

  if (
    contract.version !== 1 ||
    contract.schemaId !== 'hero-provisional-localization-stage2-contract/v1' ||
    contract.stage !== 'hero-provisional-localization-stage2' ||
    contract.status !== 'FROZEN'
  ) {
    errors.push(issue('CONTRACT_MISMATCH', 'Stage 2 contract metadata is invalid.'));
  }

  const heroRecords = Array.isArray(heroList.records) ? heroList.records : [];
  if (
    heroList.stage !== 'hero-list-stage1' ||
    heroList.schemaId !== 'hero-list/v1' ||
    heroList.status !== 'PASS' ||
    heroList.completion !== 'COMPLETE' ||
    heroList.freezeState !== 'HERO_LIST_STAGE1_FROZEN' ||
    heroList.summary?.canonicalHeroCount !== contract.population.canonicalHeroCount ||
    heroRecords.length !== contract.population.canonicalHeroCount
  ) {
    errors.push(issue('HERO_LIST_SOURCE_MISMATCH', 'Frozen Hero list source does not match the Stage 2 contract.', {
      stage: heroList.stage,
      schemaId: heroList.schemaId,
      status: heroList.status,
      completion: heroList.completion,
      freezeState: heroList.freezeState,
      records: heroRecords.length,
    }));
  }

  const presentationRecords = Array.isArray(presentation.records) ? presentation.records : [];
  if (
    presentation.version !== 1 ||
    presentation.schemaId !== 'hero-provisional-name-kr-presentation/v1' ||
    presentation.status !== 'PASS' ||
    presentation.scope !== 'frontend-presentation-only' ||
    presentation.source?.officialKoreanNameConfirmed !== false ||
    presentation.source?.identityMutation !== false ||
    presentation.coverage?.recordCount !== contract.population.provisionalHeroCount ||
    presentation.coverage?.provisionalCount !== contract.population.provisionalHeroCount ||
    presentation.coverage?.officialNameUnresolvedCount !== contract.population.officialNameUnresolvedCount ||
    presentationRecords.length !== contract.population.provisionalHeroCount
  ) {
    errors.push(issue('PRESENTATION_CONTRACT_MISMATCH', 'Hero provisional presentation source does not match the Stage 2 contract.'));
  }

  const expectedIds = sortedIds(contract.targets);
  const actualIds = sortedIds(presentationRecords);
  if (!sameArray(actualIds, expectedIds)) {
    errors.push(issue('TARGET_SET_MISMATCH', 'Hero provisional target set differs from the frozen Stage 2 contract.', {
      expectedIds,
      actualIds,
    }));
  }

  const duplicates = actualIds.filter((heroId, index) => actualIds.indexOf(heroId) !== index);
  if (duplicates.length > 0) {
    errors.push(issue('DUPLICATE_HERO_ID', 'Hero provisional presentation contains duplicate heroId values.', {
      heroIds: [...new Set(duplicates)],
    }));
  }

  const heroById = new Map(heroRecords.map((record) => [Number(record.heroId), record]));
  const targetById = new Map(contract.targets.map((record) => [Number(record.heroId), record]));
  let identityParityMismatchCount = 0;

  for (const record of presentationRecords) {
    const heroId = Number(record.heroId);
    const target = targetById.get(heroId);
    const frozen = heroById.get(heroId);

    if (
      !target ||
      record.nameCn !== target.nameCn ||
      record.displayNameKr !== target.displayNameKr ||
      record.status !== contract.localizationContract.provisionalStatus ||
      record.sourceAuthority !== contract.localizationContract.provisionalSourceAuthority
    ) {
      identityParityMismatchCount += 1;
      errors.push(issue('TARGET_RECORD_MISMATCH', `Hero ${heroId} provisional record differs from the Stage 2 contract.`, {
        heroId,
      }));
      continue;
    }

    if (
      !frozen ||
      frozen.identity?.nameCn !== record.nameCn ||
      frozen.identity?.nameKr !== record.displayNameKr
    ) {
      identityParityMismatchCount += 1;
      errors.push(issue('HERO_IDENTITY_PARITY_MISMATCH', `Hero ${heroId} does not match the frozen Hero list identity.`, {
        heroId,
        overlay: { nameCn: record.nameCn, displayNameKr: record.displayNameKr },
        frozen: frozen?.identity ?? null,
      }));
    }
  }

  const requiredServerTokens = [
    '../../data/generated/hero-list-stage1.v1.json',
    '../../data/presentation/hero-provisional-name-kr.v1.json',
    'function projectHeroNameLocalization(hero: HeroListRecord): HeroNameLocalization',
    'officialNameKr: null',
    'nameKrStatus: "provisional-display"',
    'nameKrStatus: "official-confirmed"',
    'nameKrStatus: "cn-fallback"',
    'localization: projectHeroNameLocalization(hero)',
  ];

  let serverProjectionMismatchCount = 0;
  for (const token of requiredServerTokens) {
    if (!server.includes(token)) {
      serverProjectionMismatchCount += 1;
      errors.push(issue('SERVER_PROJECTION_MISMATCH', 'Hero Stage 4 server projection is missing a required localization token.', {
        token,
      }));
    }
  }

  const imports = runtimeImports(server);
  if (imports.some((value) => value.includes('data/configdata/') || value.includes('ConfigData'))) {
    errors.push(issue('RAW_CONFIGDATA_RUNTIME_IMPORT', 'Hero Stage 4 localization projection must not import raw ConfigData.', {
      imports,
    }));
  }

  const summary = {
    canonicalHeroCount: heroRecords.length,
    provisionalHeroCount: presentationRecords.length,
    officialNameUnresolvedCount: presentation.coverage?.officialNameUnresolvedCount ?? null,
    identityParityMismatchCount,
    duplicateHeroIdCount: new Set(duplicates).size,
    serverProjectionMismatchCount,
    hardErrorCount: errors.length,
  };

  const targets = presentationRecords
    .map((record) => ({
      heroId: Number(record.heroId),
      nameCn: record.nameCn,
      officialNameKr: null,
      displayNameKr: record.displayNameKr,
      nameKrStatus: record.status,
      sourceAuthority: record.sourceAuthority,
    }))
    .sort((a, b) => a.heroId - b.heroId);

  const result = {
    version: 1,
    schemaId: 'hero-provisional-localization-stage2-validation/v1',
    stage: 'hero-provisional-localization-stage2',
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    completion: errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    summary,
    targets,
    invariants: expected.invariants,
    review: expected.review,
    blockers: errors.map((row) => row.code),
    nextStartPoint: expected.nextStartPoint,
  };

  if (errors.length === 0) {
    const expectedComparable = {
      version: expected.version,
      schemaId: expected.schemaId,
      stage: expected.stage,
      status: expected.status,
      completion: expected.completion,
      summary: expected.summary,
      targets: expected.targets,
      invariants: expected.invariants,
      review: expected.review,
      blockers: expected.blockers,
      nextStartPoint: expected.nextStartPoint,
    };
    if (JSON.stringify(result) !== JSON.stringify(expectedComparable)) {
      errors.push(issue('VALIDATION_SNAPSHOT_MISMATCH', 'Generated Stage 2 result differs from the frozen validation checkpoint.'));
      result.status = 'FAIL';
      result.completion = 'INCOMPLETE';
      result.summary.hardErrorCount = errors.length;
      result.blockers = errors.map((row) => row.code);
    }
  }

  return { errors, result };
}

const { errors, result } = audit();
const args = new Set(process.argv.slice(2));

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`Hero provisional localization Stage 2: ${result.status}`);
  console.log(`Hero population: ${result.summary.canonicalHeroCount}`);
  console.log(`Provisional Hero names: ${result.summary.provisionalHeroCount}`);
  console.log(`Official Korean names unresolved: ${result.summary.officialNameUnresolvedCount}`);
  console.log(`Hard errors: ${result.summary.hardErrorCount}`);
  for (const row of errors) console.error(`[${row.code}] ${row.message}`);
}

if (args.has('--check') && result.status !== 'PASS') process.exitCode = 1;
