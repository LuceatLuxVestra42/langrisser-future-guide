import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-hero-talent-stage5-review.v1.json';
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

function fail(message, context = {}) {
  throw new Error(`${message}\n${JSON.stringify(context, null, 2)}`);
}

function stripMarkup(text) {
  return String(text ?? '')
    .replace(/&#(?:x[0-9a-f]+|\d+);/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\r/gu, '')
    .trim();
}

function numericSignature(text) {
  return [...stripMarkup(text).matchAll(/-?\d+(?:\.\d+)?%?/gu)]
    .map((m) => m[0].replace(/^-/, '').replace(/%$/, ''));
}

function correctedClass(record) {
  let ordered = true;
  let valueSet = true;
  for (const star of ['star3','star4','star5','star6']) {
    const kr = numericSignature(record.krByStar?.[star]?.descriptionRaw);
    const cn = numericSignature(record.currentTalent?.byStar?.[star]?.descriptionRaw);
    if (!same(kr, cn)) ordered = false;
    const krSet = [...new Set(kr)].sort();
    const cnSet = [...new Set(cn)].sort();
    if (!same(krSet, cnSet)) valueSet = false;
  }
  if (ordered) return 'CORRECTED_STRONG';
  if (valueSet) return 'CORRECTED_STRUCTURE_ONLY';
  return 'CORRECTED_DRIFT';
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const stage4 = readJson(contract.predecessor.parityProjection);
  if (stage4.summary?.comparedHeroCount !== contract.predecessor.expectedHeroCount) {
    fail('Stage 4 hero count mismatch', {actual: stage4.summary?.comparedHeroCount});
  }
  if (stage4.summary?.postCutoffHeroCount !== contract.predecessor.expectedPostCutoffHeroCount) {
    fail('Stage 4 post-cutoff count mismatch', {actual: stage4.summary?.postCutoffHeroCount});
  }

  const decisionById = new Map();
  for (const [decision, ids] of Object.entries(contract.reviewDecisions)) {
    for (const id of ids) {
      if (decisionById.has(id)) fail('Duplicate review decision', {heroId:id});
      decisionById.set(id, decision);
    }
  }

  const correctedCounts = {CORRECTED_STRONG:0,CORRECTED_STRUCTURE_ONLY:0,CORRECTED_DRIFT:0};
  const records = stage4.records.map((record) => {
    const corrected = correctedClass(record);
    correctedCounts[corrected] += 1;
    let finalDecision;
    let reason = null;
    if (corrected === 'CORRECTED_STRONG') {
      if (decisionById.has(record.heroId)) fail('Corrected-strong Hero must not appear in manual review partition', {heroId:record.heroId});
      finalDecision = 'DIRECT_REUSE_FINAL';
      reason = record.classification === 'DIRECT_REUSE_STRONG' ? 'STAGE4_STRONG' : 'HTML_ENTITY_NUMERIC_FALSE_POSITIVE_CORRECTED';
    } else {
      finalDecision = decisionById.get(record.heroId);
      if (!finalDecision) fail('Corrected review Hero lacks explicit Stage 5 decision', {heroId:record.heroId, corrected});
      if (finalDecision === 'REUSE_CONFIRMED') {
        finalDecision = 'DIRECT_REUSE_FINAL';
        reason = 'SEMANTIC_REVIEW_CONFIRMED_EQUIVALENT';
      } else if (finalDecision === 'PARTIAL_UPDATE_REQUIRED') {
        reason = contract.partialReasons[String(record.heroId)] ?? null;
      } else if (finalDecision === 'RETRANSLATE_FROM_CURRENT_CN') {
        reason = contract.retranslateReasons[String(record.heroId)] ?? null;
      }
      if (!reason) fail('Non-direct decision lacks reason', {heroId:record.heroId, finalDecision});
    }
    return {
      heroId: record.heroId,
      nameKr: record.nameKr,
      nameCn: record.nameCn,
      krTalentName: record.krTalentName,
      cnTalentNames: record.cnTalentNames,
      stage4Classification: record.classification,
      correctedNumericClassification: corrected,
      finalDecision,
      reason,
      source: record.source
    };
  });

  const expectedCorrected = contract.normalizationCorrection;
  if (correctedCounts.CORRECTED_STRONG !== expectedCorrected.expectedCorrectedStrongCount ||
      correctedCounts.CORRECTED_STRUCTURE_ONLY !== expectedCorrected.expectedCorrectedStructureCount ||
      correctedCounts.CORRECTED_DRIFT !== expectedCorrected.expectedCorrectedDriftCount) {
    fail('Corrected classification count mismatch', correctedCounts);
  }

  const reviewedIds = records.filter(r => r.correctedNumericClassification !== 'CORRECTED_STRONG').map(r => r.heroId).sort((a,b)=>a-b);
  const contractedIds = [...decisionById.keys()].sort((a,b)=>a-b);
  if (!same(reviewedIds, contractedIds)) fail('Explicit review decision partition does not exactly cover corrected review queue', {reviewedIds, contractedIds});

  const summary = {
    DIRECT_REUSE_FINAL: records.filter(r=>r.finalDecision==='DIRECT_REUSE_FINAL').length,
    PARTIAL_UPDATE_REQUIRED: records.filter(r=>r.finalDecision==='PARTIAL_UPDATE_REQUIRED').length,
    RETRANSLATE_FROM_CURRENT_CN: records.filter(r=>r.finalDecision==='RETRANSLATE_FROM_CURRENT_CN').length,
    TOTAL: records.length,
    correctedStrongCount: correctedCounts.CORRECTED_STRONG,
    semanticReviewedReuseCount: records.filter(r=>r.reason==='SEMANTIC_REVIEW_CONFIRMED_EQUIVALENT').length,
    reviewQueueCount: reviewedIds.length,
    postCutoffHeroCount: stage4.summary.postCutoffHeroCount
  };
  for (const key of ['DIRECT_REUSE_FINAL','PARTIAL_UPDATE_REQUIRED','RETRANSLATE_FROM_CURRENT_CN','TOTAL']) {
    if (summary[key] !== contract.expectedFinal[key]) fail('Final count mismatch', {key, actual:summary[key], expected:contract.expectedFinal[key]});
  }

  const output = {
    version:1,
    schemaId:'hero-talent-stage5-review/v1',
    status:'PASS_WITH_REVIEW',
    scope:'localization-decision-only',
    predecessor: contract.predecessor,
    normalizationCorrection: {
      numericHtmlEntityFalsePositiveFixed:true,
      correctedCounts
    },
    authorityBoundary: contract.nonScope,
    summary,
    records
  };

  const outputPath = path.join(ROOT, contract.output);
  const check = process.argv.includes('--check');
  if (check) {
    if (!fs.existsSync(outputPath)) fail('Stage 5 output missing');
    const existing = readJson(contract.output);
    if (!same(existing, output)) fail('Stage 5 output is stale');
    console.log(`Hero Talent Stage 5 Review: PASS (${summary.DIRECT_REUSE_FINAL} reuse; ${summary.PARTIAL_UPDATE_REQUIRED} partial; ${summary.RETRANSLATE_FROM_CURRENT_CN} retranslate)`);
  } else {
    fs.mkdirSync(path.dirname(outputPath), {recursive:true});
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${contract.output}`);
  }
}

main();
