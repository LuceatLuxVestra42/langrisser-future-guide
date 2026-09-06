import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-hero-talent-stage6-final.v1.json';
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const fail = (message, detail = {}) => { throw new Error(`${message}\n${JSON.stringify(detail, null, 2)}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
}

function parseArgs(argv) {
  const out = { check: false, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') out.check = true;
    else if (argv[i] === '--output') out.output = argv[++i];
    else fail('Unknown argument', { arg: argv[i] });
  }
  return out;
}

function stripMarkup(text) {
  return String(text ?? '')
    .replace(/&#\d+;/gu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\r/gu, '')
    .trim();
}

function criticalNumericLiterals(text) {
  const clean = stripMarkup(text);
  const values = [];
  for (const match of clean.matchAll(/-?\d+(?:\.\d+)?%/gu)) values.push(match[0].replace(/^-/, ''));
  for (const match of clean.matchAll(/-?\d+\.\d+(?!\d|%)/gu)) values.push(match[0].replace(/^-/, ''));
  return [...new Set(values)];
}

function currentTalentByStar(shard, stars) {
  const talent = shard.normal?.talent;
  if (!talent || talent.status !== 'VERIFIED') fail('Current talent is not VERIFIED', { heroId: shard.heroId });
  const connections = talent.connectionTalentSkills ?? [];
  if (!connections.length) fail('Current talent connections missing', { heroId: shard.heroId });
  const ids = connections.map((c) => (c.skills ?? []).map((s) => s.skillId));
  if (!ids.every((row) => same(row, ids[0]))) fail('Current talent sequence divergence', { heroId: shard.heroId, ids });
  const initialStar = talent.initialStar;
  const skills = connections[0].skills ?? [];
  const byStar = {};
  for (const star of stars) {
    const skill = skills[star - initialStar];
    if (!skill?.nameCn || typeof skill.desc !== 'string') fail('Current talent star missing', { heroId: shard.heroId, star, initialStar });
    byStar[`star${star}`] = { skillId: skill.skillId, nameCn: skill.nameCn, descriptionCnRaw: skill.desc };
  }
  return byStar;
}

function build() {
  const contract = readJson(CONTRACT_PATH);
  const stage5 = readJson(contract.predecessor.stage5Projection);
  const stage3 = readJson(contract.predecessor.stage3KrSheetProjection);
  const overrides = readJson(contract.input.overrides);
  const authority = readJson(contract.predecessor.currentHeroValidation);

  if (authority.heroDataPipelineStatus !== contract.predecessor.requiredHeroPipelineStatus || authority.completion !== contract.predecessor.requiredHeroCompletion) {
    fail('Hero authority predecessor changed', { pipeline: authority.heroDataPipelineStatus, completion: authority.completion });
  }
  if (stage5.summary?.TOTAL !== contract.input.expectedHeroCount) fail('Stage 5 total mismatch', { summary: stage5.summary });
  if (stage5.summary?.DIRECT_REUSE_FINAL !== contract.input.expectedDirectReuseCount) fail('Stage 5 direct count mismatch', { summary: stage5.summary });
  if (stage5.summary?.PARTIAL_UPDATE_REQUIRED !== contract.input.expectedPartialUpdateCount) fail('Stage 5 partial count mismatch', { summary: stage5.summary });
  if (stage5.summary?.RETRANSLATE_FROM_CURRENT_CN !== contract.input.expectedRetranslateCount) fail('Stage 5 retranslate count mismatch', { summary: stage5.summary });
  if (stage3.coverage?.uniqueHeroCount !== contract.input.expectedHeroCount) fail('Stage 3 Hero count mismatch', { coverage: stage3.coverage });
  if (overrides.overrides?.length !== contract.input.expectedOverrideCount) fail('Stage 6 override count mismatch', { actual: overrides.overrides?.length });

  const stage3ById = new Map(stage3.records.map((r) => [r.heroId, r]));
  const overrideById = new Map(overrides.overrides.map((r) => [r.heroId, r]));
  const nonDirect = stage5.records.filter((r) => r.finalDecision !== 'DIRECT_REUSE_FINAL');
  const expectedOverrideIds = nonDirect.map((r) => r.heroId).sort((a, b) => a - b);
  const actualOverrideIds = [...overrideById.keys()].sort((a, b) => a - b);
  if (!same(expectedOverrideIds, actualOverrideIds)) fail('Stage 5 decision / Stage 6 override ID parity mismatch', { expectedOverrideIds, actualOverrideIds });

  const forbidden = new Set(contract.validation.forbidPostCutoffHeroIds);
  const records = stage5.records.map((decision) => {
    if (forbidden.has(decision.heroId)) fail('Post-cutoff Hero entered Stage 6', { heroId: decision.heroId });
    const source = stage3ById.get(decision.heroId);
    if (!source) fail('Stage 3 localization source missing', { heroId: decision.heroId });
    const override = overrideById.get(decision.heroId) ?? null;
    const expectedMode = decision.finalDecision === 'PARTIAL_UPDATE_REQUIRED' ? 'PARTIAL_UPDATE' : decision.finalDecision === 'RETRANSLATE_FROM_CURRENT_CN' ? 'RETRANSLATE_CURRENT_CN' : null;
    if (expectedMode && override?.mode !== expectedMode) fail('Override mode mismatch', { heroId: decision.heroId, expectedMode, actual: override?.mode });
    if (!expectedMode && override) fail('Direct-reuse Hero unexpectedly overridden', { heroId: decision.heroId });

    const shardPath = decision.source?.currentShardPath ?? `data/generated/hero-detail/by-id/${decision.heroId}.json`;
    const shard = readJson(shardPath);
    if (shard.heroId !== decision.heroId) fail('Current shard HeroID mismatch', { heroId: decision.heroId, shardPath, actual: shard.heroId });
    const current = currentTalentByStar(shard, contract.input.stars);

    const descriptions = {};
    for (const star of contract.input.stars) {
      const key = `star${star}`;
      const krRaw = override ? override.stars?.[key] : source.talent?.descriptionsRaw?.[key];
      if (typeof krRaw !== 'string' || !krRaw.trim()) fail('Final KR description missing', { heroId: decision.heroId, star });
      if (override && contract.validation.requirePercentAndDecimalLiteralCoverageForOverrides) {
        const required = criticalNumericLiterals(current[key].descriptionCnRaw);
        const present = new Set(criticalNumericLiterals(krRaw));
        const missing = required.filter((v) => !present.has(v));
        if (missing.length) fail('Critical numeric literal missing from Stage 6 override', { heroId: decision.heroId, star, missing, required, present: [...present] });
      }
      descriptions[key] = {
        descriptionKrRaw: krRaw,
        descriptionKrText: stripMarkup(krRaw),
        currentCnSkillId: current[key].skillId,
        currentCnTalentName: current[key].nameCn,
      };
    }

    const localizationStatus = decision.finalDecision === 'DIRECT_REUSE_FINAL'
      ? 'CONFIRMED_EXISTING_KR_REUSE'
      : decision.finalDecision === 'PARTIAL_UPDATE_REQUIRED'
        ? overrides.reviewPolicy.partialUpdateStatus
        : overrides.reviewPolicy.retranslateStatus;

    return {
      heroId: decision.heroId,
      nameKr: decision.nameKr,
      nameCn: decision.nameCn,
      talentNameKr: source.talent?.nameKr ?? decision.krTalentName,
      finalDecision: decision.finalDecision,
      localizationStatus,
      reviewRequired: decision.finalDecision === 'RETRANSLATE_FROM_CURRENT_CN',
      descriptions,
      provenance: {
        stage3KrSheetSourcePaths: source.sourcePaths,
        stage5Decision: contract.predecessor.stage5Projection,
        stage6Override: override ? contract.input.overrides : null,
        currentHeroShard: shardPath,
      },
    };
  });

  const counts = Object.fromEntries(['DIRECT_REUSE_FINAL', 'PARTIAL_UPDATE_REQUIRED', 'RETRANSLATE_FROM_CURRENT_CN'].map((key) => [key, records.filter((r) => r.finalDecision === key).length]));
  const reviewIds = records.filter((r) => r.reviewRequired).map((r) => r.heroId);
  return {
    version: 1,
    schemaId: 'hero-talent-localization-final/v1',
    status: reviewIds.length ? 'PASS_WITH_REVIEW' : 'PASS',
    scope: '251-Hero-normal-talent-KR-localization-through-Taj-Lynn',
    authorityBoundary: contract.authorityBoundary,
    summary: { heroCount: records.length, ...counts, projectTranslationReviewCount: reviewIds.length, postCutoffHeroCount: 16 },
    reviewHeroIds: reviewIds,
    records,
  };
}

const args = parseArgs(process.argv.slice(2));
const contract = readJson(CONTRACT_PATH);
const result = build();
const output = path.resolve(ROOT, args.output ?? contract.output);
if (args.check) {
  if (!fs.existsSync(output)) fail('Committed Stage 6 final localization output missing', { output });
  const committed = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (!same(stable(result), stable(committed))) fail('Committed Stage 6 final localization output is stale');
  console.log(`Hero Talent Stage 6: ${result.status} (${result.summary.heroCount} Heroes; ${result.summary.projectTranslationReviewCount} review)`);
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, output)} (${result.summary.heroCount} Heroes)`);
}
