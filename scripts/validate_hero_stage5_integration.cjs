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
  if (!completion.includes('COMPLETE')) return false;
  if (['PARTIAL', 'PENDING', 'IN_PROGRESS'].some(token => completion.includes(token))) return false;
  return !['FAIL', 'BLOCKED', 'REVIEW'].includes(status);
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

function finalCheckpointEntry(discovered) {
  if (!discovered?.finalCheckpointFiles?.length) return null;
  const preferred = discovered.finalCheckpointFiles.find(p => /validation\/.*final/i.test(p)) || discovered.finalCheckpointFiles[0];
  return parsedFiles.find(x => x.rel === preferred) || null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function checkpointHardErrorCount(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (Number.isFinite(Number(doc?.summary?.hardErrorCount))) return Number(doc.summary.hardErrorCount);
  if (Array.isArray(doc.hardErrors)) return doc.hardErrors.length;
  if (Array.isArray(doc.errors)) return doc.errors.length;
  return null;
}

function describeDiscoveredBlock(stage, title, discovered) {
  const entry = finalCheckpointEntry(discovered);
  if (!entry) return null;
  const doc = entry.doc;
  return {
    stage,
    title,
    status: doc?.status ?? null,
    completion: doc?.completion ?? null,
    checkpoint: entry.rel,
    canonicalHeroes: firstNumber(
      doc?.summary?.canonicalHeroCount,
      doc?.summary?.outputHeroCount,
      doc?.gates?.canonicalHeroCoverage?.canonicalHeroes,
    ),
    hardErrorCount: checkpointHardErrorCount(doc),
  };
}

const stage51 = discoverStage(1);
const stage52 = discoverStage(2);
const stage54 = discoverStage(4);

const discoveredDefs = [
  { stage: '5-1', title: 'Bond / fetter block', discovered: stage51 },
  { stage: '5-2', title: 'Exclusive equipment + central-law block', discovered: stage52 },
  { stage: '5-4', title: 'SP block', discovered: stage54 },
];

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

const discoveredCompletedBlocks = [];
for (const def of discoveredDefs) {
  if (!def.discovered.hasFinalCheckpoint) continue;
  const block = describeDiscoveredBlock(def.stage, def.title, def.discovered);
  if (!block) {
    hardErrors.push(`Stage ${def.stage} reported a final checkpoint but its document could not be loaded.`);
    continue;
  }
  if (block.canonicalHeroes !== null && block.canonicalHeroes !== CANONICAL_HERO_COUNT) {
    hardErrors.push(`Stage ${def.stage} canonical Hero count drifted from 267.`);
  }
  if (block.hardErrorCount !== null && block.hardErrorCount !== 0) {
    hardErrors.push(`Stage ${def.stage} final checkpoint contains hard errors.`);
  }
  discoveredCompletedBlocks.push(block);
}

const blockers = [];
for (const def of discoveredDefs) {
  if (!def.discovered.hasFinalCheckpoint) {
    blockers.push({
      stage: def.stage,
      title: def.title,
      reason: def.discovered.candidateFiles.length
        ? 'Hero-stage candidate files exist, but no frozen COMPLETE final checkpoint was discovered.'
        : 'No frozen Hero-stage contract/output/final checkpoint was discovered in data/contracts, data/generated, data/validation, or top-level data artifacts.',
      discoveredCandidateFiles: def.discovered.candidateFiles,
      requiredForStage5Close: true,
    });
  }
}

const completedBlocks = [
  ...discoveredCompletedBlocks,
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
].sort((a, b) => a.stage.localeCompare(b.stage, undefined, { numeric: true }));

const completedStageIds = completedBlocks.map(x => x.stage);
const completedKnownCanonicalCounts = completedBlocks
  .filter(x => Number.isFinite(Number(x.canonicalHeroes)))
  .map(x => ({ stage: x.stage, canonicalHeroes: Number(x.canonicalHeroes) }));

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
    name: 'All completed blocks with a declared canonical Hero count preserve 267 Heroes',
    pass: completedKnownCanonicalCounts.every(x => x.canonicalHeroes === CANONICAL_HERO_COUNT),
    detail: completedKnownCanonicalCounts,
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

const blockerInstructions = {
  '5-1': '5-1: build and freeze the bond/fetter Hero block.',
  '5-2': '5-2: build and freeze exclusive-equipment + central-law presence/display block, preserving 미출시 states.',
  '5-4': '5-4: build and freeze SP existence/job/skill/stat/soldier/mission integration, consuming frozen Stage 4 and Stage 5-3 where appropriate.',
};

const remainingStageIds = blockers.map(x => x.stage);
const result = {
  version: 1,
  stage: 'hero-page-5',
  checkpoint: 'stage-wide-integration-review',
  status,
  completion,
  purpose: 'Stage-wide integration audit for Hero Stage 5. Only frozen COMPLETE final checkpoints are promoted; pending semantic/retrace checkpoints remain non-final.',
  summary: {
    plannedBlockCount: 5,
    completedBlockCount: completedStageIds.length,
    completedBlocks: completedStageIds,
    blockedBlocks: remainingStageIds,
    canonicalHeroCount: CANONICAL_HERO_COUNT,
    completedCrossBlockCheckCount: crossBlockChecks.length,
    passedCrossBlockCheckCount: crossBlockChecks.filter(x => x.pass).length,
    hardErrorCount: hardErrors.length,
    blockerCount: blockers.length,
    stage5ReadyToClose: status === 'PASS',
  },
  completedBlocks,
  blockDiscovery: {
    '5-1': stage51,
    '5-2': stage52,
    '5-4': stage54,
  },
  // Backward-compatible alias retained for existing readers.
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
    ? `Do not declare Hero Stage 5 complete. Preserve frozen ${completedStageIds.join(', ')} inputs; finish ${remainingStageIds.join(', ')} independently, then rerun this integration gate.`
    : 'Hero Stage 5 may be closed and passed to the next page-composition stage.',
  recommendedWorkOrder: blockers.length ? [
    ...remainingStageIds.map(stage => blockerInstructions[stage]).filter(Boolean),
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
