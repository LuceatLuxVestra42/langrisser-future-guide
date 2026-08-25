'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const validationDir = path.join(dataDir, 'validation');
const outputPath = path.join(validationDir, 'hero-page-stage5-integration-review.v1.json');

const CANONICAL_HERO_COUNT = 267;

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.endsWith('.json') && ent.name.toLowerCase().includes('hero')) out.push(p);
  }
  return out;
}

function rel(p) { return path.relative(root, p).replaceAll('\\', '/'); }

function looksLikeStageFile(file, stageNo) {
  const base = path.basename(file).toLowerCase();
  return base.includes('hero') && new RegExp(`stage5-${stageNo}(?:[^0-9]|$)`).test(base);
}

function metadataStageMatches(doc, stageNo) {
  return doc && typeof doc === 'object' && String(doc.stage || '') === `hero-page-5-${stageNo}`;
}

function completionLooksFinal(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const completion = String(doc.completion || '').toUpperCase();
  const status = String(doc.status || '').toUpperCase();
  return completion.includes('COMPLETE') && !completion.includes('PARTIAL') && !['FAIL', 'BLOCKED', 'REVIEW'].includes(status);
}

const scanFiles = [
  ...walk(path.join(dataDir, 'contracts')),
  ...walk(path.join(dataDir, 'validation')),
  ...walk(path.join(dataDir, 'generated')),
  ...fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.json') && e.name.toLowerCase().includes('hero'))
    .map(e => path.join(dataDir, e.name)),
];

const parsedFiles = [];
for (const file of [...new Set(scanFiles)]) {
  try {
    parsedFiles.push({ file, rel: rel(file), doc: JSON.parse(fs.readFileSync(file, 'utf8')) });
  } catch {
    // Ignore unrelated or malformed candidate JSON here; dedicated stage gates own parse integrity.
  }
}

function discoverStage(stageNo) {
  const candidates = parsedFiles.filter(x => looksLikeStageFile(x.file, stageNo) || metadataStageMatches(x.doc, stageNo));
  const finals = candidates.filter(x => completionLooksFinal(x.doc));
  return {
    candidateFiles: candidates.map(x => x.rel).sort(),
    finalCheckpointFiles: finals.map(x => x.rel).sort(),
    hasFinalCheckpoint: finals.length > 0,
  };
}

const stage51 = discoverStage(1);
const stage52 = discoverStage(2);
const stage54 = discoverStage(4);

const stage53Path = 'data/validation/hero-page-stage5-3-final.v1.json';
const stage55Path = 'data/validation/hero-page-stage5-5-5-final.v1.json';
const stage53 = readJson(stage53Path);
const stage55 = readJson(stage55Path);

const hardErrors = [];
if (stage53.completion !== 'COMPLETE') hardErrors.push('Stage 5-3 final checkpoint is not COMPLETE.');
if (Array.isArray(stage53.hardErrors) && stage53.hardErrors.length) hardErrors.push('Stage 5-3 contains hard errors.');
if (stage53?.gates?.canonicalHeroCoverage?.canonicalHeroes !== CANONICAL_HERO_COUNT) hardErrors.push('Stage 5-3 canonical Hero count drifted from 267.');
if (stage53?.gates?.canonicalHeroCoverage?.generatedHeroKeys !== CANONICAL_HERO_COUNT) hardErrors.push('Stage 5-3 generated Hero-key count drifted from 267.');
if (stage55.status !== 'PASS' || stage55.completion !== 'STAGE_5_5_COMPLETE') hardErrors.push('Stage 5-5 final gate is not PASS/STAGE_5_5_COMPLETE.');
if (stage55?.summary?.canonicalHeroCount !== CANONICAL_HERO_COUNT) hardErrors.push('Stage 5-5 canonical Hero count drifted from 267.');
if (stage55?.summary?.integratedOutputRecordCount !== CANONICAL_HERO_COUNT) hardErrors.push('Stage 5-5 integrated output count drifted from 267.');
if ((stage55?.summary?.failedCheckCount ?? 1) !== 0) hardErrors.push('Stage 5-5 contains failed final-gate checks.');

const blockers = [];
for (const [stage, title, discovered] of [
  ['5-1', 'Bond / fetter block', stage51],
  ['5-2', 'Exclusive equipment + central-law block', stage52],
  ['5-4', 'SP block', stage54],
]) {
  if (!discovered.hasFinalCheckpoint) {
    blockers.push({
      stage,
      title,
      reason: discovered.candidateFiles.length
        ? 'Hero-stage candidate files exist, but no frozen COMPLETE final checkpoint was discovered.'
        : 'No frozen Hero-stage contract/output/final checkpoint was discovered in data/contracts, data/generated, data/validation, or top-level data artifacts.',
      discoveredCandidateFiles: discovered.candidateFiles,
      requiredForStage5Close: true,
    });
  }
}

const completedBlocks = [
  {
    stage: '5-3',
    title: 'Usable Soldiers',
    status: stage53.status,
    completion: stage53.completion,
    checkpoint: stage53Path,
    canonicalHeroes: stage53?.gates?.canonicalHeroCoverage?.canonicalHeroes ?? null,
    relationCount: stage53?.gates?.relationPreservation?.canonicalRelationCount ?? null,
    referencedUniqueSoldiers: stage53?.gates?.soldierResolution?.referencedUniqueSoldiers ?? null,
    hardErrorCount: Array.isArray(stage53.hardErrors) ? stage53.hardErrors.length : null,
    nonBlockingReview: stage53.review || null,
  },
  {
    stage: '5-5',
    title: 'Header / basic information',
    status: stage55.status,
    completion: stage55.completion,
    checkpoint: stage55Path,
    canonicalHeroes: stage55?.summary?.canonicalHeroCount ?? null,
    failedCheckCount: stage55?.summary?.failedCheckCount ?? null,
    regularSkinCount: stage55?.summary?.totalRegularSkinCount ?? null,
    unencodedSkinAcquisitionCount: stage55?.summary?.unencodedSkinAcquisitionCount ?? null,
    hardBlockingDataGaps: stage55?.summary?.hardBlockingDataGaps ?? null,
  },
];

const crossBlockChecks = [
  {
    name: '5-3 and 5-5 canonical Hero count agree',
    pass: stage53?.gates?.canonicalHeroCoverage?.canonicalHeroes === stage55?.summary?.canonicalHeroCount,
    detail: {
      stage53: stage53?.gates?.canonicalHeroCoverage?.canonicalHeroes ?? null,
      stage55: stage55?.summary?.canonicalHeroCount ?? null,
    },
  },
  {
    name: '5-3 and 5-5 both preserve 267 canonical Hero keys',
    pass: stage53?.gates?.canonicalHeroCoverage?.generatedHeroKeys === CANONICAL_HERO_COUNT && stage55?.summary?.integratedOutputRecordCount === CANONICAL_HERO_COUNT,
    detail: {
      stage53GeneratedHeroKeys: stage53?.gates?.canonicalHeroCoverage?.generatedHeroKeys ?? null,
      stage55OutputRecords: stage55?.summary?.integratedOutputRecordCount ?? null,
    },
  },
  {
    name: 'Completed blocks have no hard structural failures',
    pass: hardErrors.length === 0,
    detail: hardErrors,
  },
];

const nonBlockingFollowups = [
  {
    owner: '5-3 presentation metadata',
    issue: '41 referenced Soldier records still have pending/missing Korean display names.',
    blockingStage5Integration: false,
  },
  {
    owner: '5-5 presentation metadata',
    issue: '176 regular skins have source-omitted GetPathType and remain UNENCODED by policy.',
    blockingStage5Integration: false,
  },
  {
    owner: '5-5 localization',
    issue: 'CV/faction/origin/skin Korean localization may be layered later without reopening source semantics.',
    blockingStage5Integration: false,
  },
  {
    owner: 'asset pipeline',
    issue: 'Source asset paths still require extraction/web-delivery conversion outside Stage 5 semantic integration.',
    blockingStage5Integration: false,
  },
];

const status = hardErrors.length ? 'FAIL' : (blockers.length ? 'BLOCKED' : 'PASS');
const completion = hardErrors.length
  ? 'STAGE_5_INTEGRATION_REVIEW_FAILED'
  : blockers.length
    ? 'STAGE_5_INTEGRATION_REVIEW_COMPLETE_BLOCKED_BY_UNFINISHED_BLOCKS'
    : 'STAGE_5_COMPLETE';

const result = {
  version: 1,
  stage: 'hero-page-5',
  checkpoint: 'stage-wide-integration-review',
  status,
  completion,
  purpose: 'Stage-wide integration audit for Hero Stage 5. Completed sub-blocks are cross-checked without fabricating missing 5-1/5-2/5-4 outputs.',
  summary: {
    plannedBlockCount: 5,
    completedBlockCount: 2,
    completedBlocks: ['5-3', '5-5'],
    blockedBlocks: blockers.map(x => x.stage),
    canonicalHeroCount: CANONICAL_HERO_COUNT,
    completedCrossBlockCheckCount: crossBlockChecks.length,
    passedCrossBlockCheckCount: crossBlockChecks.filter(x => x.pass).length,
    hardErrorCount: hardErrors.length,
    blockerCount: blockers.length,
    stage5ReadyToClose: status === 'PASS',
  },
  completedBlocks,
  unfinishedBlockDiscovery: {
    '5-1': stage51,
    '5-2': stage52,
    '5-4': stage54,
  },
  crossBlockChecks,
  blockers,
  hardErrors,
  nonBlockingFollowups,
  decision: blockers.length
    ? 'Do not declare Hero Stage 5 complete. Preserve frozen 5-3 and 5-5 inputs, finish 5-1, 5-2 and 5-4 independently, then rerun this integration gate.'
    : 'Hero Stage 5 may be closed and passed to the next page-composition stage.',
  recommendedWorkOrder: blockers.length ? [
    '5-1: build and freeze the bond/fetter Hero block.',
    '5-2: build and freeze exclusive-equipment + central-law presence/display block, preserving 미출시 states.',
    '5-4: build and freeze SP existence/job/skill/stat/soldier/mission integration, consuming frozen Stage 4 and Stage 5-3 where appropriate.',
    'Rerun Stage 5 integration review and close Stage 5 only when all five block checkpoints are present and compatible.',
  ] : [],
};

fs.mkdirSync(validationDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  completion: result.completion,
  summary: result.summary,
  blockers: result.blockers,
  hardErrors: result.hardErrors,
  output: rel(outputPath),
}, null, 2));

// BLOCKED is a successful audit outcome: only completed-block integrity failure breaks CI.
if (hardErrors.length) process.exitCode = 1;
