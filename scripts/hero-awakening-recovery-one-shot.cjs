const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);

function readText(rel) { return fs.readFileSync(P(rel), 'utf8'); }
function writeText(rel, text) { fs.writeFileSync(P(rel), text); }
function readJson(rel) { return JSON.parse(readText(rel)); }
function writeJson(rel, value) { writeText(rel, JSON.stringify(value, null, 2) + '\n'); }
function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return text.replace(from, to);
}

const checkpoint = {
  version: 1,
  stage: 'awakening-z7',
  status: 'PASS',
  purpose: 'Freeze the source-explicit canonical AwakenInfo Level2 state without collapsing Level2SkillID absence into a false Hero-level NONE state or requiring Awaken2Unlock as a universal Level2SkillID validity gate.',
  source: {
    configDataCommit: '6475e63ee23d18adf733756c26a14fa9e3ed662c',
    awakenInfoPath: 'data/configdata/ConfigDataAwakenInfo.json',
    awakenInfoGitBlobSha: '7593f77f0fa0aafac8850ee3fc2b093dd499bbcf',
  },
  canonical: {
    heroCount: 267,
    awakenInfoCoverage: 267,
    level2SkillIdPresent: 257,
    level2SkillIdMissing: 10,
    missingHeroIds: [19, 22, 23, 24, 41, 42, 43, 45, 47, 48],
  },
  sourceShape: {
    level2DefinedRows: '257 canonical AwakenInfo rows explicitly define Level2SkillID. Of those, 256 define Awaken2Unlock=true; canonical heroId 44 explicitly defines Level2SkillID=13152 while omitting the Awaken2Unlock field.',
    level2MissingRows: 'Each of the 10 canonical rows above contains Awaken1LevelID, Awaken2Material and Awaken2LevelID, but does not define Awaken2Unlock or Level2SkillID.',
    hero44Shape: 'AwakenInfo.ID=44 defines Awaken1LevelID=1044, Awaken2LevelID=2044 and Level2SkillID=13152, while Awaken2Unlock is absent.',
    level2SkillReferenceParity: 'All 257 explicit Level2SkillID values resolve exact-one against the validated SkillInfo ID index.',
    nullOrZeroLevel2SkillIdObserved: false,
  },
  semanticDecision: {
    heroAwakenInfoRelation: 'DOMAIN_PROVEN_CANONICAL_HERO_ID_TO_SAME_ID_AWAKENINFO',
    rowAbsentState: 'FAIL',
    level2PresentState: 'VERIFIED_AFTER_EXACT_SKILLINFO_REFERENCE_VALIDATION',
    level2MissingState: 'LEVEL2_SKILL_NOT_DEFINED',
    level2MissingMeaning: 'Source row exists, but the source does not define a Level2SkillID. Do not infer release chronology or rewrite this as Hero awakening NONE.',
    awaken2UnlockRequiredForLevel2Reference: false,
    awaken2UnlockExactRuntimeMeaning: 'MANUAL_REVIEW_NON_BLOCKING',
    hero44HardcodedExceptionUsed: false,
    noneStateAllowedForCanonicalPopulation: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    releaseChronologyInferred: false,
    silentFallbackUsed: false,
  },
  next: 'Y1_STAGE4_5_CONTRACT_UPDATE',
};
writeJson('data/checkpoints/awakening-z7-source-state.v1.json', checkpoint);

const contract = readJson('data/hero-basic-combat-stage4-5.v1.json');
contract.upstream = { ...(contract.upstream || {}), awakeningZ7: 'data/checkpoints/awakening-z7-source-state.v1.json' };
contract.awakeningStateModel = {
  canonicalRelation: 'DOMAIN_PROVEN_CANONICAL_HERO_ID_TO_SAME_ID_AWAKENINFO',
  canonicalAwakenInfoCoverage: 267,
  level2SkillDefinedCount: 257,
  level2SkillNotDefinedCount: 10,
  level2SkillNotDefinedHeroIds: [19, 22, 23, 24, 41, 42, 43, 45, 47, 48],
  verifiedState: 'AwakenInfo row exists, Level2SkillID is a positive integer and resolves to exactly one SkillInfo.ID. Awaken2Unlock is not a universal validity gate for this explicit Level2SkillID relation.',
  level2SkillNotDefinedState: 'AwakenInfo row exists and defines Awaken1LevelID, Awaken2Material and Awaken2LevelID, but does not define Level2SkillID. This is LEVEL2_SKILL_NOT_DEFINED, not Hero awakening NONE.',
  awaken2UnlockRequiredForLevel2Reference: false,
  awaken2UnlockExactRuntimeMeaning: 'MANUAL_REVIEW_NON_BLOCKING',
  hero44HardcodedExceptionAllowed: false,
  rowAbsentState: 'FAIL',
  canonicalNoneAllowed: false,
  releaseChronologyInferenceAllowed: false,
};
const awakeningGate = (contract.semanticGates || []).find((gate) => gate.id === 'awakeningClassification');
if (!awakeningGate) throw new Error('contract awakeningClassification gate missing');
awakeningGate.status = 'VERIFIED';
awakeningGate.rule = 'For each canonical Hero, resolve the domain-proven same-valued AwakenInfo.ID row. If Level2SkillID is explicitly defined, require a positive integer and an exact SkillInfo.ID reference; do not require Awaken2Unlock=true as a universal validity gate. If Level2SkillID is absent, preserve the source row as LEVEL2_SKILL_NOT_DEFINED; do not collapse it to Hero awakening NONE.';
const normalizationAdds = [
  'For awakening only, consume the domain-proven canonical Hero.ID -> same-valued AwakenInfo.ID correspondence established by the awakening Z3-Z7 proof. This is a domain-specific frozen relation, not a generic ID-equality heuristic.',
  'Do not use HeroInfo.Awaken_ID as the normal Hero awakening relation. Those sparse references include special/Cutscene rows and are not the canonical Hero-to-AwakenInfo relation.',
  'When an AwakenInfo row defines Level2SkillID, require a positive integer and exact SkillInfo.ID resolution. Do not require Awaken2Unlock=true as a universal validity gate and do not hardcode heroId 44 as an exception.',
  'When a canonical AwakenInfo row omits Level2SkillID, emit level2Status=LEVEL2_SKILL_NOT_DEFINED while preserving the AwakenInfo row identity; never emit Hero awakening NONE for that case.',
  'Do not infer release chronology from Level2SkillID absence, Awaken2Unlock presence or absence, Hero ID, row order, names or numeric patterns.',
];
contract.normalizationRules ||= [];
for (const rule of normalizationAdds) if (!contract.normalizationRules.includes(rule)) contract.normalizationRules.push(rule);
const failAdds = [
  'A canonical Hero has no exact domain-proven AwakenInfo row.',
  'A Level2SkillID is non-positive, ambiguous or missing from SkillInfo.',
  'A row without Level2SkillID is collapsed to Hero awakening NONE.',
  'Canonical awakening counts differ from 267 total / 257 Level2 defined / 10 Level2 not defined.',
  'A hardcoded heroId-specific awakening exception is introduced.',
];
contract.validationPolicy ||= { FAIL: [], PASS: [] };
contract.validationPolicy.FAIL ||= [];
for (const rule of failAdds) if (!contract.validationPolicy.FAIL.includes(rule)) contract.validationPolicy.FAIL.push(rule);
contract.validationPolicy.PASS = [
  '267 records are generated with 267 canonical AwakenInfo rows, 257 VERIFIED Level2 Skill references, 10 LEVEL2_SKILL_NOT_DEFINED source states, zero Hero awakening NONE, all semantic gates verified, zero hard errors, A-1 identity parity and A-9 ownership preserved, and every job-level and hero-direct normal skill carries exact SkillInfo SkillCost without changing its upstream population.'
];
contract.stage4CompletionRule = 'Stage 4 is COMPLETE only when the generated summary status is PASS with generatedHeroCount=267, awakening canonical coverage=267, false NONE=0 and unresolvedComponents empty.';
writeJson('data/hero-basic-combat-stage4-5.v1.json', contract);

let producer = readText('scripts/prepare_hero_basic_combat_stage45.cjs');
producer = replaceOnce(
  producer,
  "function setDiff(a, b) { return [...a].filter((v) => !b.has(v)).sort((x, y) => x - y); }\n",
  "function setDiff(a, b) { return [...a].filter((v) => !b.has(v)).sort((x, y) => x - y); }\nfunction hasOwn(value, key) { return Boolean(value && Object.prototype.hasOwnProperty.call(value, key)); }\n",
  'producer hasOwn',
);
producer = replaceOnce(
  producer,
  "  const skillByHero = new Map((skillAcquisition.records || []).map((r) => [r.heroId, r]));\n  const records = [];\n",
  "  const skillByHero = new Map((skillAcquisition.records || []).map((r) => [r.heroId, r]));\n  const records = [];\n  const awakeningSummary = {\n    canonicalAwakenInfoRows: 0,\n    verifiedLevel2Skill: 0,\n    level2SkillNotDefined: 0,\n    falseNone: 0,\n  };\n",
  'producer awakening summary',
);
const oldAwakening = `    const awakenId = Number.isInteger(hero.Awaken_ID) && hero.Awaken_ID > 0 ? hero.Awaken_ID : null;\n    let awakening = { status: 'NONE', awakenId: null, level2SkillId: null, skill: null };\n    if (awakenId) {\n      const awaken = awakenIndex.get(awakenId);\n      if (!awaken) errors.push(\`heroId \${treeHero.heroId}: Awaken_ID \${awakenId} missing from AwakenInfo\`);\n      const level2SkillId = awaken?.Level2SkillID || null;\n      const awakenSkill = level2SkillId ? skillIndex.get(level2SkillId) : null;\n      if (level2SkillId && !awakenSkill) errors.push(\`heroId \${treeHero.heroId}: awakening skill \${level2SkillId} missing from SkillInfo\`);\n      awakening = {\n        status: awaken && (!level2SkillId || awakenSkill) ? 'VERIFIED' : 'FAIL',\n        awakenId,\n        nameCn: awaken?.Name ?? null,\n        level2SkillId,\n        skill: skillSnapshot(awakenSkill),\n      };\n    }\n`;
const newAwakening = `    const awaken = awakenIndex.get(treeHero.heroId);\n    let awakening = {\n      status: 'FAIL',\n      awakenId: treeHero.heroId,\n      nameCn: null,\n      level2Status: 'UNRESOLVED',\n      level2SkillId: null,\n      skill: null,\n    };\n\n    if (!awaken) {\n      errors.push(\`heroId \${treeHero.heroId}: canonical AwakenInfo row missing\`);\n    } else {\n      awakeningSummary.canonicalAwakenInfoRows += 1;\n      const hasLevel2SkillId = hasOwn(awaken, 'Level2SkillID');\n      if (hasLevel2SkillId) {\n        const level2SkillId = awaken.Level2SkillID;\n        if (!Number.isInteger(level2SkillId) || level2SkillId <= 0) errors.push(\`heroId \${treeHero.heroId}: invalid Level2SkillID=\${level2SkillId}\`);\n        const awakenSkill = Number.isInteger(level2SkillId) && level2SkillId > 0 ? skillIndex.get(level2SkillId) : null;\n        if (Number.isInteger(level2SkillId) && level2SkillId > 0 && !awakenSkill) errors.push(\`heroId \${treeHero.heroId}: awakening skill \${level2SkillId} missing from SkillInfo\`);\n        awakening = {\n          status: awakenSkill ? 'VERIFIED' : 'FAIL',\n          awakenId: awaken.ID,\n          nameCn: awaken.Name ?? null,\n          level2Status: awakenSkill ? 'DEFINED' : 'UNRESOLVED',\n          level2SkillId: Number.isInteger(level2SkillId) && level2SkillId > 0 ? level2SkillId : null,\n          skill: skillSnapshot(awakenSkill),\n        };\n        if (awakening.status === 'VERIFIED') awakeningSummary.verifiedLevel2Skill += 1;\n      } else {\n        awakening = {\n          status: 'VERIFIED',\n          awakenId: awaken.ID,\n          nameCn: awaken.Name ?? null,\n          level2Status: 'LEVEL2_SKILL_NOT_DEFINED',\n          level2SkillId: null,\n          skill: null,\n        };\n        awakeningSummary.level2SkillNotDefined += 1;\n      }\n    }\n    if (awakening.status === 'NONE') awakeningSummary.falseNone += 1;\n`;
producer = replaceOnce(producer, oldAwakening, newAwakening, 'producer awakening block');
producer = replaceOnce(
  producer,
  "  const output = { version: 3, stage: '4-5', status: 'PASS', recordCount: records.length, records };\n",
  "  if (awakeningSummary.canonicalAwakenInfoRows !== 267) errors.push(`canonical AwakenInfo rows=${awakeningSummary.canonicalAwakenInfoRows}, expected 267`);\n  if (awakeningSummary.verifiedLevel2Skill !== 257) errors.push(`verified Level2 skills=${awakeningSummary.verifiedLevel2Skill}, expected 257`);\n  if (awakeningSummary.level2SkillNotDefined !== 10) errors.push(`Level2 skill not defined=${awakeningSummary.level2SkillNotDefined}, expected 10`);\n  if (awakeningSummary.falseNone !== 0) errors.push(`false awakening NONE=${awakeningSummary.falseNone}`);\n\n  const output = { version: 3, stage: '4-5', status: 'PASS', recordCount: records.length, records };\n",
  'producer count gates',
);
producer = replaceOnce(
  producer,
  "    status: ['displayJobStats', 'heroSoldierModifiers', 'talentStarProgression', 'equipableSkillCost', 'heroDirectSkillCost'].includes(gate.id) ? 'VERIFIED' : gate.status,\n",
  "    status: ['awakeningClassification', 'displayJobStats', 'heroSoldierModifiers', 'talentStarProgression', 'equipableSkillCost', 'heroDirectSkillCost'].includes(gate.id) ? (finalStatus === 'PASS' ? 'VERIFIED' : 'FAIL') : gate.status,\n",
  'producer gate status',
);
producer = replaceOnce(producer, "    formulaContract: {\n", "    awakeningSummary,\n    formulaContract: {\n", 'producer summary field');
producer = replaceOnce(
  producer,
  "      'HeroInfo.Awaken_ID -> AwakenInfo.Level2SkillID -> SkillInfo.ID',\n",
  "      'Domain-proven canonical Hero.ID -> same-valued AwakenInfo.ID relation for 267 heroes',\n      '257 explicit AwakenInfo.Level2SkillID -> exact SkillInfo.ID references',\n      '10 canonical AwakenInfo rows preserved as LEVEL2_SKILL_NOT_DEFINED instead of false NONE',\n",
  'producer verified components',
);
producer = replaceOnce(
  producer,
  "  console.log(`heroes=${records.length} canonical=${canonicalIds.size} errors=${errors.length} membershipLeaks=${leaks.length}`);\n",
  "  console.log(`heroes=${records.length} canonical=${canonicalIds.size} awakening=${awakeningSummary.canonicalAwakenInfoRows}/${awakeningSummary.verifiedLevel2Skill}/${awakeningSummary.level2SkillNotDefined} errors=${errors.length} membershipLeaks=${leaks.length}`);\n",
  'producer log',
);
writeText('scripts/prepare_hero_basic_combat_stage45.cjs', producer);

let validator = readText('scripts/validate_hero_stage4_final.cjs');
validator = replaceOnce(
  validator,
  "const heroDirectSkillIds = new Set();\n\n",
  "const heroDirectSkillIds = new Set();\nconst combatByHero = new Map((combat.records || []).map((x) => [x.heroId, x]));\nconst skillRowById = new Map();\nfor (const row of skillRows) {\n  if (!Number.isInteger(row?.ID)) continue;\n  if (!skillRowById.has(row.ID)) skillRowById.set(row.ID, row);\n}\nconst awakenRows = loadArray('ConfigDataAwakenInfo');\nconst awakenById = new Map();\nfor (const row of awakenRows) {\n  if (!Number.isInteger(row?.ID)) continue;\n  if (awakenById.has(row.ID)) errors.push(`AwakenInfo duplicate ID=${row.ID}`);\n  else awakenById.set(row.ID, row);\n}\n\n",
  'validator source indexes',
);
const audit = `const awakeningAudit = {\n  canonicalAwakenInfoRows: 0,\n  verifiedLevel2Skill: 0,\n  level2SkillNotDefined: 0,\n  falseNone: 0,\n  missingSkillReference: 0,\n};\nfor (const heroId of canonical) {\n  const sourceAwaken = awakenById.get(heroId);\n  const generated = combatByHero.get(heroId)?.awakening;\n  if (!sourceAwaken) { errors.push(\`heroId \${heroId}: canonical AwakenInfo row missing\`); continue; }\n  awakeningAudit.canonicalAwakenInfoRows += 1;\n  if (!generated) { errors.push(\`heroId \${heroId}: generated awakening block missing\`); continue; }\n  if (generated.status === 'NONE') awakeningAudit.falseNone += 1;\n  if (generated.awakenId !== sourceAwaken.ID) errors.push(\`heroId \${heroId}: generated awakenId=\${generated.awakenId} source=\${sourceAwaken.ID}\`);\n  if ((generated.nameCn ?? null) !== (sourceAwaken.Name ?? null)) errors.push(\`heroId \${heroId}: generated awakening name mismatch\`);\n  const sourceHasLevel2 = Object.prototype.hasOwnProperty.call(sourceAwaken, 'Level2SkillID');\n  if (sourceHasLevel2) {\n    const level2SkillId = sourceAwaken.Level2SkillID;\n    if (!Number.isInteger(level2SkillId) || level2SkillId <= 0) { errors.push(\`heroId \${heroId}: source Level2SkillID=\${level2SkillId} invalid\`); continue; }\n    const sourceSkill = skillRowById.get(level2SkillId);\n    if (!sourceSkill) { awakeningAudit.missingSkillReference += 1; errors.push(\`heroId \${heroId}: source Level2SkillID \${level2SkillId} missing from SkillInfo\`); continue; }\n    if (generated.status !== 'VERIFIED') errors.push(\`heroId \${heroId}: generated awakening status=\${generated.status}, expected VERIFIED\`);\n    if (generated.level2Status !== 'DEFINED') errors.push(\`heroId \${heroId}: generated level2Status=\${generated.level2Status}, expected DEFINED\`);\n    if (generated.level2SkillId !== level2SkillId) errors.push(\`heroId \${heroId}: generated Level2SkillID=\${generated.level2SkillId}, expected \${level2SkillId}\`);\n    if (generated.skill?.skillId !== level2SkillId) errors.push(\`heroId \${heroId}: generated awakening Skill snapshot mismatch\`);\n    awakeningAudit.verifiedLevel2Skill += 1;\n  } else {\n    if (generated.status !== 'VERIFIED') errors.push(\`heroId \${heroId}: generated source-row status=\${generated.status}, expected VERIFIED\`);\n    if (generated.level2Status !== 'LEVEL2_SKILL_NOT_DEFINED') errors.push(\`heroId \${heroId}: generated level2Status=\${generated.level2Status}, expected LEVEL2_SKILL_NOT_DEFINED\`);\n    if (generated.level2SkillId !== null || generated.skill !== null) errors.push(\`heroId \${heroId}: Level2-not-defined state must not carry a Skill reference\`);\n    awakeningAudit.level2SkillNotDefined += 1;\n  }\n}\nif (awakeningAudit.canonicalAwakenInfoRows !== 267) errors.push(\`awakening canonical coverage=\${awakeningAudit.canonicalAwakenInfoRows}, expected 267\`);\nif (awakeningAudit.verifiedLevel2Skill !== 257) errors.push(\`awakening defined Level2 count=\${awakeningAudit.verifiedLevel2Skill}, expected 257\`);\nif (awakeningAudit.level2SkillNotDefined !== 10) errors.push(\`awakening Level2-not-defined count=\${awakeningAudit.level2SkillNotDefined}, expected 10\`);\nif (awakeningAudit.falseNone !== 0) errors.push(\`awakening false NONE=\${awakeningAudit.falseNone}\`);\nif (awakeningAudit.missingSkillReference !== 0) errors.push(\`awakening missing SkillInfo references=\${awakeningAudit.missingSkillReference}\`);\nconst summaryAwakening = summary.awakeningSummary || {};\nfor (const [key, expected] of Object.entries({ canonicalAwakenInfoRows: 267, verifiedLevel2Skill: 257, level2SkillNotDefined: 10, falseNone: 0 })) {\n  if (summaryAwakening[key] !== expected) errors.push(\`summary awakeningSummary.\${key}=\${summaryAwakening[key]}, expected \${expected}\`);\n  if (awakeningAudit[key] !== expected) errors.push(\`independent awakening audit \${key}=\${awakeningAudit[key]}, expected \${expected}\`);\n}\n\n`;
validator = replaceOnce(
  validator,
  "if (summary.relationBoundary?.membershipFieldLeakCount !== 0) errors.push('summary relation boundary leak count is nonzero');\n\nfor (const hero of combat.records || []) {\n",
  "if (summary.relationBoundary?.membershipFieldLeakCount !== 0) errors.push('summary relation boundary leak count is nonzero');\n\n" + audit + "for (const hero of combat.records || []) {\n",
  'validator awakening audit',
);
validator = replaceOnce(
  validator,
  "console.log(`heroes=${combat.records?.length || 0} upstream=${upstream.status} equipableSkills=${equipableSkillIds.size} cost1=${skillCost1} cost2=${skillCost2} directSkills=${heroDirectSkillIds.size} directCost1=${directCost1} directCost2=${directCost2} errors=${errors.length}`);\n",
  "console.log(`heroes=${combat.records?.length || 0} upstream=${upstream.status} awakening=${awakeningAudit.canonicalAwakenInfoRows}/${awakeningAudit.verifiedLevel2Skill}/${awakeningAudit.level2SkillNotDefined} equipableSkills=${equipableSkillIds.size} cost1=${skillCost1} cost2=${skillCost2} directSkills=${heroDirectSkillIds.size} directCost1=${directCost1} directCost2=${directCost2} errors=${errors.length}`);\n",
  'validator log',
);
writeText('scripts/validate_hero_stage4_final.cjs', validator);

const owners = readJson('tools/project-check/contracts/owners.v1.json');
if (!(owners.pathRules || []).some((rule) => rule.id === 'awakening-source-state-checkpoint')) {
  const idx = owners.pathRules.findIndex((rule) => rule.id === 'hero-canonical');
  const rule = { id: 'awakening-source-state-checkpoint', patterns: ['data/checkpoints/awakening-z7-source-state.v1.json'], owners: ['hero-canonical'] };
  if (idx < 0) owners.pathRules.push(rule); else owners.pathRules.splice(idx, 0, rule);
}
writeJson('tools/project-check/contracts/owners.v1.json', owners);

console.log('Hero awakening recovery semantic patch applied.');
