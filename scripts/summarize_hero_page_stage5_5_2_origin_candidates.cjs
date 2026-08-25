const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'data', 'validation', 'hero-page-stage5-5-2-origin-candidates.v1.json');
const output = path.join(root, 'data', 'validation', 'hero-page-stage5-5-2-origin-candidates-summary.v1.json');

const src = JSON.parse(fs.readFileSync(input, 'utf8'));
const top = (src.candidates || []).slice(0, 20).map((c) => ({
  file: c.file,
  rowCount: c.rowCount,
  distinctIntegerIds: c.distinctIntegerIds,
  matchedTargetCount: c.matchedTargetCount,
  targetCount: c.targetCount,
  targetCoverage: c.targetCoverage,
  duplicateMatchedIds: c.duplicateMatchedIds,
  nonEmptyStringFields: c.nonEmptyStringFields,
  matchedRowKeys: c.matchedRowKeys,
  samples: c.samples,
}));

const result = {
  version: 1,
  stage: src.stage,
  substage: src.substage,
  checkpoint: 'origin-candidate-summary',
  source: src.source,
  productionPointerCount: src.productionPointerCount,
  distinctProductionIds: src.distinctProductionIds,
  distinctProductionIdCount: src.distinctProductionIdCount,
  heroIdsByProductionId: src.heroIdsByProductionId,
  candidateCount: src.candidateCount,
  parseFailureCount: src.parseFailureCount,
  topCandidates: top,
  interpretationRule: src.interpretationRule,
};

fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, output)} with ${top.length} candidates.`);
