'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const GENERATED = path.join(DATA, 'generated');
const CONTRACT_PATH = path.join(DATA, 'contracts', 'hero-soldier-command-base.v1.json');
const HERO_MASTER_PATH = path.join(DATA, 'hero-name-master.v1.json');
const PREDECESSOR_PATH = path.join(GENERATED, 'hero-basic-combat.v1.json');
const PREDECESSOR_VALIDATION_PATH = path.join(DATA, 'validation', 'hero-basic-combat-stage4-5-summary.v1.json');
const OUTPUT_PATH = path.join(GENERATED, 'hero-soldier-command-base.v1.json');

function fail(message) { throw new Error(`[N2] ${message}`); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}
function strictInt(value, label) {
  if (!Number.isInteger(value)) fail(`${label} must be an integer, got ${JSON.stringify(value)}`);
  return value;
}
function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const heroMaster = readJson(HERO_MASTER_PATH);
  const predecessor = readJson(PREDECESSOR_PATH);
  const predecessorValidation = readJson(PREDECESSOR_VALIDATION_PATH);

  if (contract?.owner !== 'HERO_SOLDIER_COMMAND_BASE_PROJECTION') fail('contract owner mismatch');
  if (gitBlobSha(HERO_MASTER_PATH) !== contract.authority.canonicalHeroMasterBlobSha) fail('canonical Hero master blob mismatch');
  if (gitBlobSha(PREDECESSOR_PATH) !== contract.authority.verifiedPredecessorBlobSha) fail('Stage4-5 predecessor blob mismatch');
  if (gitBlobSha(PREDECESSOR_VALIDATION_PATH) !== contract.authority.verifiedPredecessorValidationBlobSha) fail('Stage4-5 validation blob mismatch');
  if (predecessor.status !== 'PASS' || predecessor.recordCount !== 267) fail(`Stage4-5 predecessor status/count mismatch: ${predecessor.status}/${predecessor.recordCount}`);
  if (predecessorValidation.status !== 'PASS' || predecessorValidation.stage4CompletionStatus !== 'COMPLETE') fail('Stage4-5 validation is not PASS/COMPLETE');

  const gate = (predecessorValidation.semanticGates || []).find(row => row.id === contract.authority.requiredSemanticGate);
  if (!gate || gate.status !== contract.authority.requiredSemanticGateStatus) fail('heroSoldierModifiers semantic gate is not VERIFIED');

  const canonicalIds = (heroMaster.records || []).map(row => strictInt(row.heroId, 'hero-name-master.heroId'));
  if (canonicalIds.length !== 267 || new Set(canonicalIds).size !== 267) fail(`canonical Hero population mismatch: ${canonicalIds.length}`);

  const sourceByHeroId = new Map();
  for (const row of predecessor.records || []) {
    const heroId = strictInt(row.heroId, 'hero-basic-combat.heroId');
    if (sourceByHeroId.has(heroId)) fail(`duplicate Stage4-5 heroId=${heroId}`);
    sourceByHeroId.set(heroId, row);
  }
  if (!sameSet(new Set(canonicalIds), new Set(sourceByHeroId.keys()))) fail('Stage4-5 Hero set differs from canonical Hero set');

  const records = canonicalIds.map(heroId => {
    const source = sourceByHeroId.get(heroId);
    const modifiers = source?.soldierModifiers;
    if (!modifiers || modifiers.status !== 'VERIFIED') fail(`heroId ${heroId}: soldierModifiers not VERIFIED`);
    if (modifiers.meaning !== 'Hero-owned troop stat modifier percentages; not Hero-Soldier membership') {
      fail(`heroId ${heroId}: soldierModifiers meaning drift`);
    }
    const raw = {};
    const base = {};
    for (const key of ['hp', 'at', 'df', 'magicDf']) {
      const rawValue = strictInt(modifiers.raw?.[key], `heroId ${heroId}.raw.${key}`);
      const normalized = modifiers[key];
      if (!Number.isFinite(normalized) || normalized !== rawValue / 100) fail(`heroId ${heroId}: ${key} normalization mismatch`);
      raw[key] = rawValue;
      base[key] = normalized;
    }
    return { heroId, raw, base };
  });

  const leon = records.find(row => row.heroId === 6);
  const leonExpected = JSON.stringify({ hp: 1500, at: 1500, df: 0, magicDf: 0 });
  if (!leon || JSON.stringify(leon.raw) !== leonExpected) fail('Leon raw command-base fixture mismatch');

  writeJson(OUTPUT_PATH, {
    version: 1,
    artifact: 'hero-soldier-command-base',
    stage: 'N2',
    status: 'GENERATED_PENDING_N2_VALIDATION',
    semanticOwner: contract.owner,
    meaning: 'Hero-owned troop stat modifier base',
    source: {
      canonicalHeroMaster: contract.authority.canonicalHeroMaster,
      canonicalHeroMasterBlobSha: contract.authority.canonicalHeroMasterBlobSha,
      verifiedPredecessor: contract.authority.verifiedPredecessor,
      verifiedPredecessorBlobSha: contract.authority.verifiedPredecessorBlobSha,
      verifiedPredecessorValidation: contract.authority.verifiedPredecessorValidation,
      verifiedPredecessorValidationBlobSha: contract.authority.verifiedPredecessorValidationBlobSha,
      requiredSemanticGate: contract.authority.requiredSemanticGate,
    },
    boundary: {
      normalCurrentClassSelection: 'NOT_DERIVED',
      normalJobConnectionDependency: false,
      spOverrideOrInheritance: 'OUT_OF_SCOPE_UNTIL_S0',
      hero3BondContribution: 'OUT_OF_SCOPE_REUSE_R5_FROZEN_ARTIFACT',
      soldierMembership: 'OUT_OF_SCOPE',
    },
    normalization: 'raw / 100',
    recordCount: records.length,
    records,
  });

  process.stdout.write(`${OUTPUT_PATH}\n`);
}

main();
