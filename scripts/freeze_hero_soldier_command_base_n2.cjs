'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONTRACT = path.join(DATA, 'contracts', 'hero-soldier-command-base.v1.json');
const OUTPUT = path.join(DATA, 'generated', 'hero-soldier-command-base.v1.json');
const VALIDATION = path.join(DATA, 'validation', 'hero-soldier-command-base-n2.v1.json');
const CHECKPOINT = path.join(DATA, 'validation', 'hero-soldier-command-base-n2-f.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function fail(message) { throw new Error(`[N2-F] ${message}`); }

function main() {
  const contract = readJson(CONTRACT);
  const output = readJson(OUTPUT);
  const validation = readJson(VALIDATION);
  if (validation.status !== 'PASS' || validation.hardErrors?.length) fail('N2 validator not PASS');
  if (output.recordCount !== 267 || output.semanticOwner !== contract.owner) fail('N2 output contract mismatch');

  writeJson(CHECKPOINT, {
    version: 1,
    stage: 'N2-F',
    status: 'FINAL_FROZEN',
    completion: 'HERO_SOLDIER_COMMAND_BASE_PROJECTION_COMPLETE',
    owner: contract.owner,
    predecessor: {
      r5FrozenCommit: contract.authority.r5FrozenPredecessorCommit,
      stage4Combat: contract.authority.verifiedPredecessor,
      stage4CombatBlobSha: contract.authority.verifiedPredecessorBlobSha,
      stage4Validation: contract.authority.verifiedPredecessorValidation,
      stage4ValidationBlobSha: contract.authority.verifiedPredecessorValidationBlobSha
    },
    artifact: {
      path: 'data/generated/hero-soldier-command-base.v1.json',
      gitBlobSha1: gitBlobSha(OUTPUT),
      sha256: sha256(OUTPUT),
      recordCount: output.recordCount,
      meaning: output.meaning
    },
    validation: {
      path: 'data/validation/hero-soldier-command-base-n2.v1.json',
      gitBlobSha1: gitBlobSha(VALIDATION),
      sha256: sha256(VALIDATION),
      status: validation.status,
      rawMismatchCount: validation.rawMismatchCount,
      normalizedMismatchCount: validation.normalizedMismatchCount,
      meaningMismatchCount: validation.meaningMismatchCount,
      leonFixturePass: validation.leonFixturePass,
      hardErrorCount: validation.hardErrors.length
    },
    semanticBoundary: contract.semanticBoundary,
    blockers: [],
    review: [],
    reopenConditions: [
      'hero-basic-combat Stage4-5 predecessor or its heroSoldierModifiers semantic gate changes',
      'canonical Hero population changes',
      'independent N2 validator hard failure',
      'artifact or validation hash mismatch',
      'authoritative contradiction to HeroInfo-owned command-base meaning'
    ],
    handoff: {
      currentOwnerClosed: true,
      nextOwner: 'SP_SOLDIER_COMMAND_OVERRIDE_SEMANTICS',
      nextStage: 'S0',
      nextStart: 'Determine explicit SP command override/inheritance semantics from the current frozen SP relation/source. Reuse this N2 base directly; do not reinterpret HeroInfo or derive class-specific Normal command values.'
    }
  });
  process.stdout.write(`${CHECKPOINT}\n`);
}

main();
