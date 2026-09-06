import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-hero-talent-kr-cn-parity.v1.json';
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function fail(message, context = {}) {
  const suffix = Object.keys(context).length ? `\n${JSON.stringify(context, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

function parseArgs(argv) {
  const options = { check: false, json: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--output') options.output = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function stripMarkup(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\r/gu, '')
    .trim();
}

function numericSignature(text) {
  return [...stripMarkup(text).matchAll(/-?\d+(?:\.\d+)?%?/gu)].map((match) => match[0]);
}

function normalizedToken(token) {
  return String(token).replace(/^-/, '').replace(/%$/, '');
}

function normalizedSignature(tokens) {
  return tokens.map(normalizedToken);
}

function valueSet(tokens) {
  return [...new Set(normalizedSignature(tokens))].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getCurrentTalent(shard, heroId, stars) {
  const talent = shard.normal?.talent;
  if (!talent || talent.status !== 'VERIFIED') return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_NOT_VERIFIED' };

  const connections = talent.connectionTalentSkills;
  if (!Array.isArray(connections) || connections.length === 0) return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_CONNECTIONS_MISSING' };

  const sequences = connections.map((connection) => (connection.skills ?? []).map((skill) => skill.skillId));
  const firstSequence = sequences[0];
  if (!sequences.every((sequence) => sameArray(sequence, firstSequence))) {
    return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_CONNECTION_SEQUENCE_DIVERGENCE', sequences };
  }

  const initialStar = talent.initialStar;
  const skills = connections[0].skills ?? [];
  if (!Number.isInteger(initialStar) || initialStar < 1 || initialStar > 6) return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_INITIAL_STAR_INVALID', initialStar };

  const expectedLength = 7 - initialStar;
  if (skills.length !== expectedLength) {
    return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_STAR_SEQUENCE_LENGTH_MISMATCH', initialStar, expectedLength, actualLength: skills.length };
  }

  const byStar = {};
  for (const star of stars) {
    if (star < initialStar) return { status: 'MANUAL_REVIEW', reason: 'REQUESTED_STAR_BELOW_INITIAL_STAR', star, initialStar };
    const skill = skills[star - initialStar];
    if (!skill?.nameCn || typeof skill.desc !== 'string') return { status: 'MANUAL_REVIEW', reason: 'CURRENT_TALENT_STAR_SKILL_MISSING', star, heroId };
    const signature = numericSignature(skill.desc);
    byStar[`star${star}`] = {
      skillId: skill.skillId,
      nameCn: skill.nameCn,
      descriptionRaw: skill.desc,
      descriptionText: stripMarkup(skill.desc),
      numericSignature: signature,
      normalizedNumericSignature: normalizedSignature(signature),
      normalizedNumericValueSet: valueSet(signature),
    };
  }

  return { status: 'VERIFIED', selectionRule: talent.selectionRule, initialStar, connectionCount: connections.length, byStar };
}

function compareRecord(record, contract) {
  const shardPath = `${contract.currentHeroAuthority.shardDirectory}/${record.heroId}.json`;
  if (!fs.existsSync(path.join(ROOT, shardPath))) {
    return { heroId: record.heroId, nameKr: record.nameKr, nameCn: record.nameCn, classification: 'MANUAL_REVIEW', reason: 'CURRENT_HERO_SHARD_MISSING', shardPath };
  }

  const shard = readJson(shardPath);
  if (shard.heroId !== record.heroId) fail('Hero shard ID mismatch.', { expected: record.heroId, actual: shard.heroId, shardPath });

  const current = getCurrentTalent(shard, record.heroId, contract.scope.stars);
  const krByStar = {};
  for (const star of contract.scope.stars) {
    const raw = record.talent?.descriptionsRaw?.[`star${star}`];
    const signature = numericSignature(raw);
    krByStar[`star${star}`] = {
      descriptionRaw: raw ?? null,
      descriptionText: stripMarkup(raw),
      numericSignature: signature,
      normalizedNumericSignature: normalizedSignature(signature),
      normalizedNumericValueSet: valueSet(signature),
    };
  }

  if (current.status !== 'VERIFIED') {
    return { heroId: record.heroId, nameKr: record.nameKr, nameCn: record.nameCn, krTalentName: record.talent?.nameKr ?? null, classification: 'MANUAL_REVIEW', reason: current.reason, current, krByStar, shardPath };
  }

  const starComparisons = {};
  let orderedParity = true;
  let valueSetParity = true;
  for (const star of contract.scope.stars) {
    const key = `star${star}`;
    const krRaw = krByStar[key].numericSignature;
    const cnRaw = current.byStar[key].numericSignature;
    const krNormalized = krByStar[key].normalizedNumericSignature;
    const cnNormalized = current.byStar[key].normalizedNumericSignature;
    const krSet = krByStar[key].normalizedNumericValueSet;
    const cnSet = current.byStar[key].normalizedNumericValueSet;
    const orderedEqual = sameArray(krNormalized, cnNormalized);
    const valueSetEqual = sameArray(krSet, cnSet);
    if (!orderedEqual) orderedParity = false;
    if (!valueSetEqual) valueSetParity = false;
    starComparisons[key] = {
      orderedEqual,
      valueSetEqual,
      krNumericSignature: krRaw,
      cnNumericSignature: cnRaw,
      krNormalizedNumericSignature: krNormalized,
      cnNormalizedNumericSignature: cnNormalized,
      krNormalizedNumericValueSet: krSet,
      cnNormalizedNumericValueSet: cnSet,
      cnSkillId: current.byStar[key].skillId,
    };
  }

  const classification = orderedParity
    ? 'DIRECT_REUSE_STRONG'
    : valueSetParity
      ? 'REUSE_CANDIDATE_STRUCTURE_ONLY'
      : 'REVIEW_NUMERIC_DRIFT';
  const cnTalentNames = [...new Set(Object.values(current.byStar).map((row) => row.nameCn))];

  return {
    heroId: record.heroId,
    nameKr: record.nameKr,
    nameCn: record.nameCn,
    krTalentName: record.talent?.nameKr ?? null,
    cnTalentNames,
    classification,
    nameReuse: record.talent?.nameKr ? 'DIRECT_KR_SHEET_NAME' : 'MANUAL_REVIEW',
    descriptionReuse: classification,
    currentTalent: current,
    krByStar,
    starComparisons,
    source: { krSheetPrimaryKey: record.primarySheetKey, krSheetSourcePaths: record.sourcePaths, currentShardPath: shardPath },
  };
}

function buildResult() {
  const contract = readJson(CONTRACT_PATH);
  const stage3 = readJson(contract.predecessor.krSheetProjection);
  const authority = readJson(contract.currentHeroAuthority.validation);
  const manifest = readJson(contract.currentHeroAuthority.manifest);

  if (stage3.status !== contract.predecessor.krSheetExpectedStatus || stage3.coverage?.uniqueHeroCount !== contract.predecessor.krSheetExpectedHeroCount) {
    fail('Stage 3 KR-sheet projection predecessor mismatch.', { status: stage3.status, uniqueHeroCount: stage3.coverage?.uniqueHeroCount });
  }
  if (authority.completion !== contract.currentHeroAuthority.requiredCompletion || authority.heroDataPipelineStatus !== contract.currentHeroAuthority.requiredPipelineStatus) {
    fail('Current Hero authority is not the required FINAL_FROZEN predecessor.', { completion: authority.completion, heroDataPipelineStatus: authority.heroDataPipelineStatus });
  }
  if (manifest.summary?.canonicalHeroCount !== contract.currentHeroAuthority.canonicalHeroCount) {
    fail('Current Hero manifest canonical count mismatch.', { expected: contract.currentHeroAuthority.canonicalHeroCount, actual: manifest.summary?.canonicalHeroCount });
  }

  const records = stage3.records.map((record) => compareRecord(record, contract));
  const counts = {
    DIRECT_REUSE_STRONG: records.filter((row) => row.classification === 'DIRECT_REUSE_STRONG').length,
    REUSE_CANDIDATE_STRUCTURE_ONLY: records.filter((row) => row.classification === 'REUSE_CANDIDATE_STRUCTURE_ONLY').length,
    REVIEW_NUMERIC_DRIFT: records.filter((row) => row.classification === 'REVIEW_NUMERIC_DRIFT').length,
    MANUAL_REVIEW: records.filter((row) => row.classification === 'MANUAL_REVIEW').length,
  };

  return {
    version: 1,
    schemaId: 'hero-talent-kr-cn-parity/v1',
    status: 'PASS_WITH_REVIEW',
    scope: 'localization-presentation-parity-only',
    predecessor: {
      stage3Commit: contract.predecessor.stage3Commit,
      krSheetProjection: contract.predecessor.krSheetProjection,
      krSheetHeroCount: stage3.coverage.uniqueHeroCount,
      currentHeroValidation: contract.currentHeroAuthority.validation,
      currentHeroPipelineStatus: authority.heroDataPipelineStatus,
      currentHeroManifest: contract.currentHeroAuthority.manifest,
      canonicalHeroCount: manifest.summary.canonicalHeroCount,
    },
    authorityBoundary: { semanticRejoin: false, identityMutation: false, relationMutation: false, nameJoin: false, idArithmetic: false, translationGeneration: false, postCutoffTranslation: false },
    comparisonPolicy: {
      joinKey: 'HeroID from the accepted Stage 3 projection',
      stars: contract.scope.stars,
      currentTalentSource: 'FINAL_FROZEN Hero detail shard normal.talent',
      normalization: contract.normalization,
      strongMeaning: contract.classification.DIRECT_REUSE_STRONG,
      structureOnlyMeaning: contract.classification.REUSE_CANDIDATE_STRUCTURE_ONLY,
      numericDriftMeaning: contract.classification.REVIEW_NUMERIC_DRIFT,
      manualReviewMeaning: contract.classification.MANUAL_REVIEW,
    },
    summary: {
      comparedHeroCount: records.length,
      ...counts,
      directReuseCandidateCount: counts.DIRECT_REUSE_STRONG + counts.REUSE_CANDIDATE_STRUCTURE_ONLY,
      reviewCount: counts.REUSE_CANDIDATE_STRUCTURE_ONLY + counts.REVIEW_NUMERIC_DRIFT + counts.MANUAL_REVIEW,
      postCutoffHeroCount: stage3.coverage.postCutoffHeroCount,
    },
    records,
  };
}

const options = parseArgs(process.argv.slice(2));
const result = buildResult();
const contract = readJson(CONTRACT_PATH);
const outputPath = path.resolve(ROOT, options.output ?? contract.output);

if (options.check) {
  if (!fs.existsSync(outputPath)) fail('Committed Hero talent KR/CN parity output is missing.', { outputPath });
  const expected = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) fail('Committed Hero talent KR/CN parity output is stale or mismatched.');
  console.log(`Hero Talent KR/CN Parity: ${result.status} (${result.summary.DIRECT_REUSE_STRONG} strong; ${result.summary.REUSE_CANDIDATE_STRUCTURE_ONLY} structure-only; ${result.summary.REVIEW_NUMERIC_DRIFT} drift; ${result.summary.MANUAL_REVIEW} manual)`);
} else if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, outputPath)} (${result.summary.comparedHeroCount} Heroes)`);
}
