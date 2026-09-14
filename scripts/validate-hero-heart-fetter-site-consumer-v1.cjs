'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : path.resolve(process.argv[i + 1]);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function collectHeroJobIds(heroId) {
  const shard = readJson(path.join(HERO_DIR, `${heroId}.json`));
  const ids = new Set();
  for (const c of shard?.normal?.jobTree?.connections || []) if (Number.isInteger(c?.jobId)) ids.add(c.jobId);
  if (Number.isInteger(shard?.sp?.job?.jobId)) ids.add(shard.sp.job.jobId);
  return ids;
}

function main() {
  const inputPath = arg('--input', path.join(ROOT, 'data/generated/hero-heart-fetter-presentation-research.v1.json'));
  const consumerDir = arg('--consumer-dir', path.join(ROOT, 'data/generated/hero-heart-fetter-site-consumer'));
  if (!fs.existsSync(inputPath)) throw new Error(`missing presentation research input: ${inputPath}`);
  if (!fs.existsSync(consumerDir)) throw new Error(`missing consumer directory: ${consumerDir}`);

  const input = readJson(inputPath);
  const manifestPath = path.join(consumerDir, 'manifest.v1.json');
  const manifest = readJson(manifestPath);
  assert.equal(input.status, 'RESEARCH_PROJECTION');
  assert.equal(input.semanticAuthority, false);
  assert.equal(input.productionConsumerAllowed, false);
  assert.equal(input.heroPopulationCount, 267);
  assert.equal(input.effectRowCount, 1158);
  assert.equal(input.unresolvedPresentationRowCount, 0);
  assert.equal(manifest.status, 'FROZEN_PRESENTATION_CONSUMER');
  assert.equal(manifest.semanticAuthority, false);
  assert.equal(manifest.presentationAuthority, true);
  assert.equal(manifest.productionConsumerAllowed, true);
  assert.equal(manifest.source.sha256, sha256(inputPath));
  assert.deepStrictEqual(manifest.counts.mappingModes, {
    VALIDATED_DEFAULT: 1142,
    EXPLICIT_OVERRIDE: 6,
    EXCLUSION_SET_MEMBER: 8,
    SOURCE_CONFLICT_RESOLUTION: 2,
  });
  assert.equal(manifest.counts.heroPopulation, 267);
  assert.equal(manifest.counts.effectRows, 1158);
  assert.equal(manifest.counts.uniqueSkills, 1066);
  assert.equal(manifest.heroShards.length, 3);
  assert.equal(manifest.skillTextShards.length, 3);

  const expectedFiles = new Set(['manifest.v1.json', ...manifest.heroShards.map((x) => x.path), ...manifest.skillTextShards.map((x) => x.path)]);
  const actualFiles = new Set(fs.readdirSync(consumerDir).filter((x) => fs.statSync(path.join(consumerDir, x)).isFile()));
  assert.deepStrictEqual([...actualFiles].sort(), [...expectedFiles].sort(), 'consumer directory contains missing or unexpected files');

  const actualHeroes = new Map();
  const seenHeroIds = new Set();
  for (const desc of manifest.heroShards) {
    const file = path.join(consumerDir, desc.path);
    assert.equal(sha256(file), desc.sha256, `${desc.path}: hash mismatch`);
    const shard = readJson(file);
    assert.equal(shard.kind, 'HERO_MAP');
    assert.deepStrictEqual(shard.ids, desc.ids);
    for (const id of shard.ids) {
      assert(!seenHeroIds.has(id), `duplicate hero ${id}`);
      seenHeroIds.add(id);
      actualHeroes.set(Number(id), shard.heroes[String(id)]);
    }
  }

  const actualSkills = new Map();
  const seenSkillIds = new Set();
  for (const desc of manifest.skillTextShards) {
    const file = path.join(consumerDir, desc.path);
    assert.equal(sha256(file), desc.sha256, `${desc.path}: hash mismatch`);
    const shard = readJson(file);
    assert.equal(shard.kind, 'SKILL_TEXT');
    assert.deepStrictEqual(shard.ids, desc.ids);
    for (const id of shard.ids) {
      assert(!seenSkillIds.has(id), `duplicate Skill ${id}`);
      seenSkillIds.add(id);
      actualSkills.set(Number(id), shard.skills[String(id)]);
    }
  }

  const expectedHeroes = new Map();
  const expectedSkills = new Map();
  const modeCounts = { VALIDATED_DEFAULT: 0, EXPLICIT_OVERRIDE: 0, EXCLUSION_SET_MEMBER: 0, SOURCE_CONFLICT_RESOLUTION: 0 };
  for (const effect of input.effects || []) {
    const heroId = Number(effect.heroId);
    const row = [Number(effect.heartFetterLevel), Number(effect.presentationJob.jobId), Number(effect.skill.skillId), effect.mappingMode];
    if (!expectedHeroes.has(heroId)) expectedHeroes.set(heroId, []);
    expectedHeroes.get(heroId).push(row);
    const skillId = Number(effect.skill.skillId);
    const text = effect.skill.descriptionCn;
    if (expectedSkills.has(skillId)) assert.equal(expectedSkills.get(skillId), text, `Skill ${skillId}: inconsistent source text`);
    expectedSkills.set(skillId, text);
    assert(Object.prototype.hasOwnProperty.call(modeCounts, effect.mappingMode), `unexpected mapping mode ${effect.mappingMode}`);
    modeCounts[effect.mappingMode]++;
  }
  for (const rows of expectedHeroes.values()) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || String(a[3]).localeCompare(String(b[3])));

  assert.equal(actualHeroes.size, expectedHeroes.size);
  assert.equal(actualSkills.size, expectedSkills.size);
  assert.equal([...actualHeroes.values()].reduce((n, rows) => n + rows.length, 0), 1158);
  assert.deepStrictEqual(modeCounts, manifest.counts.mappingModes);
  for (const [heroId, expectedRows] of expectedHeroes) {
    assert.deepStrictEqual(actualHeroes.get(heroId), expectedRows, `Hero ${heroId}: consumer rows differ`);
    const heroJobs = collectHeroJobIds(heroId);
    for (const [, jobId] of expectedRows) assert(heroJobs.has(jobId), `Hero ${heroId}: presentation Job ${jobId} missing from frozen Hero shard`);
  }
  for (const [skillId, text] of expectedSkills) assert.equal(actualSkills.get(skillId), text, `Skill ${skillId}: consumer text differs`);

  console.log(JSON.stringify({
    status: 'PASS',
    semanticAuthority: false,
    presentationAuthority: true,
    heroPopulation: actualHeroes.size,
    effectRows: 1158,
    uniqueSkills: actualSkills.size,
    mappingModes: modeCounts,
  }, null, 2));
}

main();
