'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'data', 'generated');
const VALIDATION = path.join(ROOT, 'data', 'validation');

const CANDIDATE_DATA = path.join(GENERATED, 'hero-page-stage5-1-bonds.v1.json');
const CANDIDATE_AUDIT = path.join(VALIDATION, 'hero-page-stage5-1-production-candidate.v1.json');
const SEMANTIC = path.join(VALIDATION, 'hero-page-stage5-1-retrace-semantic.v1.json');
const FINAL_DATA = path.join(GENERATED, 'hero-page-stage5-1-bonds-final.v1.json');
const FINAL_AUDIT = path.join(VALIDATION, 'hero-page-stage5-1-final.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

const candidate = readJson(CANDIDATE_DATA);
const candidateAudit = readJson(CANDIDATE_AUDIT);
const semantic = readJson(SEMANTIC);

const records = Array.isArray(candidate.records) ? clone(candidate.records) : [];
const errors = [];
const reviews = [];

let heroCount = records.length;
let bondCount = 0;
let conditionCount = 0;
let type1Count = 0;
let type2Count = 0;
let unknownTypeCount = 0;
let type1ResolvedCount = 0;
let type2RequiredHeroCount = 0;
let type2UnresolvedCount = 0;
let heroesWithFiveBonds = 0;

for (const hero of records) {
  const heroId = finiteInt(hero.heroId);
  if (heroId === null) {
    errors.push({ type: 'invalidHeroId', heroId: hero.heroId });
    continue;
  }
  const bonds = Array.isArray(hero.bonds) ? hero.bonds : [];
  bondCount += bonds.length;
  if (bonds.length === 5) heroesWithFiveBonds += 1;
  else errors.push({ type: 'heroBondCountNotFive', heroId, count: bonds.length });

  for (const bond of bonds) {
    if (!bond || bond.sourceResolved !== true) {
      errors.push({ type: 'unresolvedBondSource', heroId, fetterId: bond?.fetterId ?? null });
      continue;
    }
    const conditions = Array.isArray(bond.completionConditions) ? bond.completionConditions : [];
    for (const condition of conditions) {
      conditionCount += 1;
      const type = finiteInt(condition.conditionType);

      if (type === 1) {
        type1Count += 1;
        const targetHeroId = finiteInt(condition.parm1);
        const requiredLevel = finiteInt(condition.parm2);
        if (targetHeroId !== heroId) {
          errors.push({ type: 'type1TargetHeroMismatch', heroId, fetterId: bond.fetterId, targetHeroId });
          continue;
        }
        if (requiredLevel === null || requiredLevel <= 0) {
          errors.push({ type: 'type1InvalidRequiredFavorabilityLevel', heroId, fetterId: bond.fetterId, requiredLevel: condition.parm2 });
          continue;
        }
        condition.semanticStatus = 'HERO_FAVORABILITY_LEVEL_RESOLVED';
        condition.favorability = {
          targetHeroId,
          targetHeroNameKr: hero.nameKr ?? null,
          targetHeroNameCn: hero.nameCn ?? null,
          targetHeroNameEn: hero.nameEn ?? null,
          requiredLevel,
        };
        type1ResolvedCount += 1;
        continue;
      }

      if (type === 2) {
        type2Count += 1;
        if (typeof condition.semanticStatus !== 'string' || condition.semanticStatus.includes('UNRESOLVED') || condition.semanticStatus.includes('MULTIPLE') || condition.semanticStatus.includes('ZERO_CANDIDATE')) {
          type2UnresolvedCount += 1;
          errors.push({
            type: 'type2UnresolvedSemantic',
            heroId,
            fetterId: bond.fetterId,
            missionId: condition.mission?.missionId ?? null,
            semanticStatus: condition.semanticStatus ?? null,
          });
        }
        const isRequiredHeroMission = Number(condition.mission?.missionType) === 5 && Number(condition.mission?.param2) === 6;
        if (isRequiredHeroMission) {
          if (!condition.requiredHero || finiteInt(condition.requiredHero.heroId) === null) {
            errors.push({ type: 'type2MissingRequiredHero', heroId, fetterId: bond.fetterId, missionId: condition.mission?.missionId ?? null });
          } else {
            type2RequiredHeroCount += 1;
          }
        } else if (condition.requiredHero !== null && condition.requiredHero !== undefined) {
          errors.push({ type: 'type2UnexpectedRequiredHero', heroId, fetterId: bond.fetterId, missionId: condition.mission?.missionId ?? null });
        }
        continue;
      }

      unknownTypeCount += 1;
      errors.push({ type: 'unknownCompletionConditionType', heroId, fetterId: bond.fetterId, conditionType: condition.conditionType ?? null });
    }
  }
}

const expected = {
  canonicalHeroCount: Number(semantic?.scope?.canonicalHeroCount ?? 267),
  canonicalFetterCount: Number(semantic?.scope?.canonicalFetterCount ?? 1335),
  canonicalConditionCount: Number(semantic?.scope?.canonicalCompletionConditionCount ?? 2399),
  type1Rows: Number(semantic?.scope?.conditionType1Rows ?? 1335),
  type2Rows: Number(semantic?.scope?.conditionType2Rows ?? 1064),
  type2RequiredHeroRows: Number(semantic?.conditionType2?.validation?.exactlyOneRequiredHero ?? 338),
};

const checks = [
  { name: 'semantic checkpoint resolved', expected: 'RESOLVED', actual: semantic?.decision?.semanticBlocker ?? null, pass: semantic?.decision?.semanticBlocker === 'RESOLVED' },
  { name: 'candidate hard structural errors', expected: 0, actual: Array.isArray(candidateAudit.hardStructuralErrors) ? candidateAudit.hardStructuralErrors.length : null, pass: Array.isArray(candidateAudit.hardStructuralErrors) && candidateAudit.hardStructuralErrors.length === 0 },
  { name: 'candidate invariant checks all pass', expected: true, actual: Array.isArray(candidateAudit.invariantChecks) ? candidateAudit.invariantChecks.every(x => x.pass === true) : false, pass: Array.isArray(candidateAudit.invariantChecks) && candidateAudit.invariantChecks.every(x => x.pass === true) },
  { name: 'canonical Hero count', expected: expected.canonicalHeroCount, actual: heroCount, pass: heroCount === expected.canonicalHeroCount },
  { name: 'all Heroes have five bonds', expected: expected.canonicalHeroCount, actual: heroesWithFiveBonds, pass: heroesWithFiveBonds === expected.canonicalHeroCount },
  { name: 'canonical bond count', expected: expected.canonicalFetterCount, actual: bondCount, pass: bondCount === expected.canonicalFetterCount },
  { name: 'canonical completion condition count', expected: expected.canonicalConditionCount, actual: conditionCount, pass: conditionCount === expected.canonicalConditionCount },
  { name: 'ConditionType 1 count', expected: expected.type1Rows, actual: type1Count, pass: type1Count === expected.type1Rows },
  { name: 'ConditionType 1 all resolved', expected: expected.type1Rows, actual: type1ResolvedCount, pass: type1ResolvedCount === expected.type1Rows },
  { name: 'ConditionType 2 count', expected: expected.type2Rows, actual: type2Count, pass: type2Count === expected.type2Rows },
  { name: 'ConditionType 2 unresolved count', expected: 0, actual: type2UnresolvedCount, pass: type2UnresolvedCount === 0 },
  { name: 'ConditionType 2 required-Hero count', expected: expected.type2RequiredHeroRows, actual: type2RequiredHeroCount, pass: type2RequiredHeroCount === expected.type2RequiredHeroRows },
  { name: 'unknown condition type count', expected: 0, actual: unknownTypeCount, pass: unknownTypeCount === 0 },
  { name: 'final hard error count', expected: 0, actual: errors.length, pass: errors.length === 0 },
];

const pass = checks.every(x => x.pass);

const finalData = {
  version: 1,
  stage: 'hero-page-5-1',
  artifact: 'hero-bond-final',
  status: pass ? 'PASS' : 'FAIL',
  semanticCoverage: {
    conditionType1: 'HERO_FAVORABILITY_LEVEL_VERIFIED',
    conditionType2: 'MISSION_JOIN_AND_REQUIRED_HERO_RESOLVER_VERIFIED',
    unknownConditionTypes: [],
  },
  sourcePolicy: 'Canonical Hero IDs come from hero-name-master; HeroInformation exact-ID ownership and source HeroFetter order are preserved. Type1 uses the client enum HeroFavorabilityLevel; Type2 uses the frozen Mission resolver. No name/pattern fallback joins are used.',
  recordCount: records.length,
  records,
};

const finalAudit = {
  version: 1,
  stage: 'hero-page-5-1',
  checkpoint: 'final',
  status: pass ? 'PASS' : 'FAIL',
  completion: pass ? 'COMPLETE' : 'FINAL_GATE_FAILED',
  purpose: 'Final Stage 5-1 gate for the canonical 267-Hero bond/fetter block.',
  inputs: [
    'data/generated/hero-page-stage5-1-bonds.v1.json',
    'data/validation/hero-page-stage5-1-production-candidate.v1.json',
    'data/validation/hero-page-stage5-1-retrace-semantic.v1.json',
    'data/validation/hero-page-stage5-1-type1-dump-symbols.txt'
  ],
  output: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
  semanticRules: {
    conditionType1: {
      enum: 'FetterCompleteConditionType_HeroFavorabilityLevel = 1',
      parm1: 'target Hero ID',
      parm2: 'required favorability level',
      canonicalValidation: 'Parm1 equals the owning canonical Hero for all Type1 rows; source Parm2 thresholds are preserved verbatim.'
    },
    conditionType2: semantic?.conditionType2?.verifiedRule ?? null,
  },
  summary: {
    canonicalHeroCount: heroCount,
    heroesWithFiveBonds,
    bondCount,
    completionConditionCount: conditionCount,
    type1Count,
    type1ResolvedCount,
    type2Count,
    type2RequiredHeroCount,
    type2UnresolvedCount,
    unknownTypeCount,
    hardErrorCount: errors.length,
    reviewCount: reviews.length,
  },
  checks,
  errors,
  reviews,
  decision: pass
    ? 'Hero Stage 5-1 is complete. The canonical 267-Hero bond block has five source fetters per Hero, all CompletionCondition types are semantically resolved, and all required-Hero joins are unambiguous.'
    : 'Do not close Hero Stage 5-1. One or more final gate checks failed.'
};

fs.mkdirSync(GENERATED, { recursive: true });
fs.mkdirSync(VALIDATION, { recursive: true });
fs.writeFileSync(FINAL_DATA, JSON.stringify(finalData, null, 2) + '\n');
fs.writeFileSync(FINAL_AUDIT, JSON.stringify(finalAudit, null, 2) + '\n');

console.log(JSON.stringify({
  status: finalAudit.status,
  completion: finalAudit.completion,
  summary: finalAudit.summary,
  checks: finalAudit.checks,
  decision: finalAudit.decision,
  output: 'data/validation/hero-page-stage5-1-final.v1.json'
}, null, 2));

if (!pass) process.exitCode = 1;
