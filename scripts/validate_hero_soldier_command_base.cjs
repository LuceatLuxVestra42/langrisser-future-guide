'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONTRACT = path.join(DATA, 'contracts', 'hero-soldier-command-base.v1.json');
const HERO_MASTER = path.join(DATA, 'hero-name-master.v1.json');
const SOURCE = path.join(DATA, 'generated', 'hero-basic-combat.v1.json');
const SOURCE_VALIDATION = path.join(DATA, 'validation', 'hero-basic-combat-stage4-5-summary.v1.json');
const OUTPUT = path.join(DATA, 'generated', 'hero-soldier-command-base.v1.json');
const VALIDATION = path.join(DATA, 'validation', 'hero-soldier-command-base-n2.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}
function setEq(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }

function main() {
  const hardErrors = [];
  const contract = readJson(CONTRACT);
  const master = readJson(HERO_MASTER);
  const source = readJson(SOURCE);
  const sourceValidation = readJson(SOURCE_VALIDATION);
  const output = readJson(OUTPUT);

  if (gitBlobSha(HERO_MASTER) !== contract.authority.canonicalHeroMasterBlobSha) hardErrors.push('canonical Hero master blob mismatch');
  if (gitBlobSha(SOURCE) !== contract.authority.verifiedPredecessorBlobSha) hardErrors.push('Stage4-5 source blob mismatch');
  if (gitBlobSha(SOURCE_VALIDATION) !== contract.authority.verifiedPredecessorValidationBlobSha) hardErrors.push('Stage4-5 validation blob mismatch');
  if (source.status !== 'PASS' || source.recordCount !== 267) hardErrors.push(`source status/count=${source.status}/${source.recordCount}`);
  if (sourceValidation.status !== 'PASS' || sourceValidation.stage4CompletionStatus !== 'COMPLETE') hardErrors.push('source validation not PASS/COMPLETE');
  const gate = (sourceValidation.semanticGates || []).find(x => x.id === 'heroSoldierModifiers');
  if (!gate || gate.status !== 'VERIFIED') hardErrors.push('heroSoldierModifiers gate not VERIFIED');
  if (output.semanticOwner !== 'HERO_SOLDIER_COMMAND_BASE_PROJECTION') hardErrors.push(`output owner=${output.semanticOwner}`);
  if (output.recordCount !== 267 || !Array.isArray(output.records) || output.records.length !== 267) hardErrors.push(`output count=${output.recordCount}/${output.records?.length}`);

  const canonicalIds = (master.records || []).map(x => x.heroId).filter(Number.isInteger);
  const sourceMap = new Map();
  for (const row of source.records || []) {
    if (!Number.isInteger(row.heroId)) { hardErrors.push('source row with invalid heroId'); continue; }
    if (sourceMap.has(row.heroId)) hardErrors.push(`duplicate source heroId=${row.heroId}`);
    sourceMap.set(row.heroId, row);
  }
  const outputMap = new Map();
  for (const row of output.records || []) {
    if (!Number.isInteger(row.heroId)) { hardErrors.push('output row with invalid heroId'); continue; }
    if (outputMap.has(row.heroId)) hardErrors.push(`duplicate output heroId=${row.heroId}`);
    outputMap.set(row.heroId, row);
  }
  if (canonicalIds.length !== 267 || new Set(canonicalIds).size !== 267) hardErrors.push(`canonical count/unique=${canonicalIds.length}/${new Set(canonicalIds).size}`);
  if (!setEq(new Set(canonicalIds), new Set(sourceMap.keys()))) hardErrors.push('source Hero set differs from canonical set');
  if (!setEq(new Set(canonicalIds), new Set(outputMap.keys()))) hardErrors.push('output Hero set differs from canonical set');

  let rawMismatchCount = 0;
  let normalizedMismatchCount = 0;
  let meaningMismatchCount = 0;
  for (const heroId of canonicalIds) {
    const src = sourceMap.get(heroId)?.soldierModifiers;
    const dst = outputMap.get(heroId);
    if (!src || src.status !== 'VERIFIED') { meaningMismatchCount += 1; continue; }
    if (src.meaning !== 'Hero-owned troop stat modifier percentages; not Hero-Soldier membership') meaningMismatchCount += 1;
    for (const key of ['hp', 'at', 'df', 'magicDf']) {
      const expectedRaw = src.raw?.[key];
      const actualRaw = dst?.raw?.[key];
      if (!Number.isInteger(expectedRaw) || actualRaw !== expectedRaw) rawMismatchCount += 1;
      const expectedBase = expectedRaw / 100;
      if (!Number.isFinite(dst?.base?.[key]) || dst.base[key] !== expectedBase || src[key] !== expectedBase) normalizedMismatchCount += 1;
    }
  }

  const leon = outputMap.get(6);
  const leonPass = JSON.stringify(leon?.raw) === JSON.stringify({ hp: 1500, at: 1500, df: 0, magicDf: 0 }) &&
    JSON.stringify(leon?.base) === JSON.stringify({ hp: 15, at: 15, df: 0, magicDf: 0 });
  if (!leonPass) hardErrors.push('Leon fixture mismatch');
  if (rawMismatchCount) hardErrors.push(`rawMismatchCount=${rawMismatchCount}`);
  if (normalizedMismatchCount) hardErrors.push(`normalizedMismatchCount=${normalizedMismatchCount}`);
  if (meaningMismatchCount) hardErrors.push(`meaningMismatchCount=${meaningMismatchCount}`);
  if (output?.boundary?.normalCurrentClassSelection !== 'NOT_DERIVED') hardErrors.push('output derives normal current-class selection');
  if (output?.boundary?.spOverrideOrInheritance !== 'OUT_OF_SCOPE_UNTIL_S0') hardErrors.push('output crosses SP boundary');
  if (output?.boundary?.hero3BondContribution !== 'OUT_OF_SCOPE_REUSE_R5_FROZEN_ARTIFACT') hardErrors.push('output crosses R5 Hero3 boundary');

  const validation = {
    version: 1,
    stage: 'N2',
    status: hardErrors.length ? 'FAIL' : 'PASS',
    owner: 'HERO_SOLDIER_COMMAND_BASE_PROJECTION',
    canonicalHeroCount: canonicalIds.length,
    sourceHeroCount: sourceMap.size,
    outputHeroCount: outputMap.size,
    rawMismatchCount,
    normalizedMismatchCount,
    meaningMismatchCount,
    leonFixturePass: leonPass,
    outputSha256: sha256(OUTPUT),
    hardErrors,
    blockers: hardErrors.length ? ['N2_VALIDATION_FAILED'] : [],
    review: [],
  };
  writeJson(VALIDATION, validation);
  console.log(JSON.stringify(validation, null, 2));
  if (hardErrors.length) process.exitCode = 1;
}

main();
