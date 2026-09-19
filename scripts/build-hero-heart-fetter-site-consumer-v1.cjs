'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`Missing ${name}`);
  return path.resolve(process.argv[i + 1]);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function writeJson(file, value) {
  const text = stableJson(value);
  fs.writeFileSync(file, text);
  return sha256Bytes(Buffer.from(text));
}
function chunk(ids, count) {
  const size = Math.ceil(ids.length / count);
  return Array.from({ length: count }, (_, i) => ids.slice(i * size, Math.min((i + 1) * size, ids.length))).filter((x) => x.length);
}

function main() {
  const inputPath = arg('--input');
  const outputDir = arg('--output-dir');
  const inputBytes = fs.readFileSync(inputPath);
  const input = JSON.parse(inputBytes.toString('utf8'));

  if (input.status !== 'RESEARCH_PROJECTION' || input.semanticAuthority !== false || input.productionConsumerAllowed !== false) {
    throw new Error('presentation research boundary changed');
  }
  if (input.heroPopulationCount !== 267 || input.effectRowCount !== 1158 || input.unresolvedPresentationRowCount !== 0) {
    throw new Error('presentation research population/count boundary changed');
  }

  const expectedSourceModes = { VALIDATED_DEFAULT: 1142, EXPLICIT_OVERRIDE: 6, EXCLUSION_SET_MEMBER: 8, SOURCE_CONFLICT_RESOLUTION: 2 };
  const expectedPresentationModes = { VALIDATED_DEFAULT: 1050, EXPLICIT_OVERRIDE: 6, EXCLUSION_SET_MEMBER: 8, SOURCE_CONFLICT_RESOLUTION: 2 };
  const sourceModeCounts = Object.fromEntries(Object.keys(expectedSourceModes).map((k) => [k, 0]));
  const presentationModeCounts = Object.fromEntries(Object.keys(expectedPresentationModes).map((k) => [k, 0]));
  const heroRows = new Map();
  const heroRowKeys = new Map();
  const skillTexts = new Map();
  let deduplicatedRows = 0;

  for (const effect of input.effects || []) {
    const heroId = Number(effect.heroId);
    const level = Number(effect.heartFetterLevel);
    const jobId = Number(effect?.presentationJob?.jobId);
    const skillId = Number(effect?.skill?.skillId);
    const mode = effect.mappingMode;
    const text = effect?.skill?.descriptionCn;
    if (!Number.isInteger(heroId) || ![4, 7].includes(level) || !Number.isInteger(jobId) || !Number.isInteger(skillId)) throw new Error('invalid effect identity');
    if (!(mode in sourceModeCounts)) throw new Error(`unexpected mapping mode ${mode}`);
    if (typeof text !== 'string') throw new Error(`Skill ${skillId}: missing descriptionCn`);
    sourceModeCounts[mode]++;
    if (!heroRows.has(heroId)) {
      heroRows.set(heroId, []);
      heroRowKeys.set(heroId, new Set());
    }
    const row = [level, jobId, skillId, mode];
    const rowKey = JSON.stringify(row);
    if (!heroRowKeys.get(heroId).has(rowKey)) {
      heroRowKeys.get(heroId).add(rowKey);
      heroRows.get(heroId).push(row);
      presentationModeCounts[mode]++;
    } else {
      deduplicatedRows++;
    }
    if (skillTexts.has(skillId) && skillTexts.get(skillId) !== text) throw new Error(`Skill ${skillId}: inconsistent descriptionCn`);
    skillTexts.set(skillId, text);
  }
  for (const [mode, count] of Object.entries(expectedSourceModes)) if (sourceModeCounts[mode] !== count) throw new Error(`${mode}: expected source count ${count}, got ${sourceModeCounts[mode]}`);
  for (const [mode, count] of Object.entries(expectedPresentationModes)) if (presentationModeCounts[mode] !== count) throw new Error(`${mode}: expected presentation count ${count}, got ${presentationModeCounts[mode]}`);
  if (deduplicatedRows !== 92) throw new Error(`expected 92 duplicate presentation rows, got ${deduplicatedRows}`);

  const heroIds = [...heroRows.keys()].sort((a, b) => a - b);
  const skillIds = [...skillTexts.keys()].sort((a, b) => a - b);
  const presentationEffectRows = [...heroRows.values()].reduce((sum, rows) => sum + rows.length, 0);
  if (heroIds.length !== 267 || skillIds.length !== 1066 || presentationEffectRows !== 1066) throw new Error(`unexpected unique counts heroes=${heroIds.length} skills=${skillIds.length} presentationRows=${presentationEffectRows}`);
  for (const rows of heroRows.values()) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || String(a[3]).localeCompare(String(b[3])));

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const heroShards = [];
  const skillTextShards = [];

  chunk(heroIds, 3).forEach((ids, index) => {
    const name = `hero-map-${String(index + 1).padStart(3, '0')}.json`;
    const payload = { schemaVersion: 1, kind: 'HERO_MAP', ids, heroes: Object.fromEntries(ids.map((id) => [String(id), heroRows.get(id)])) };
    const sha256 = writeJson(path.join(outputDir, name), payload);
    heroShards.push({ path: name, ids, sha256 });
  });
  chunk(skillIds, 3).forEach((ids, index) => {
    const name = `skill-text-${String(index + 1).padStart(3, '0')}.json`;
    const payload = { schemaVersion: 1, kind: 'SKILL_TEXT', ids, skills: Object.fromEntries(ids.map((id) => [String(id), skillTexts.get(id)])) };
    const sha256 = writeJson(path.join(outputDir, name), payload);
    skillTextShards.push({ path: name, ids, sha256 });
  });

  const manifest = {
    schemaVersion: 1,
    stage: 'hero-heart-fetter-site-consumer-v1',
    status: 'FROZEN_PRESENTATION_CONSUMER',
    semanticAuthority: false,
    presentationAuthority: true,
    productionConsumerAllowed: true,
    source: {
      presentationResearch: 'hero-heart-fetter-presentation-research.v1.json',
      sha256: sha256Bytes(inputBytes),
    },
    counts: {
      heroPopulation: heroIds.length,
      sourceEffectRows: (input.effects || []).length,
      effectRows: presentationEffectRows,
      deduplicatedRows,
      uniqueSkills: skillIds.length,
      sourceMappingModes: sourceModeCounts,
      mappingModes: presentationModeCounts,
    },
    heroShards,
    skillTextShards,
  };
  writeJson(path.join(outputDir, 'manifest.v1.json'), manifest);
  console.log(JSON.stringify({ status: 'PASS', outputDir, counts: manifest.counts }, null, 2));
}

main();
