const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'data', 'validation', 'hero-page-stage5-5-2-origin-candidates.v1.json');
const output = path.join(root, 'data', 'validation', 'hero-page-stage5-5-2-origin-top10.v1.json');
const src = JSON.parse(fs.readFileSync(input, 'utf8'));

const result = {
  version: 1,
  stage: src.stage,
  substage: src.substage,
  checkpoint: 'origin-top10',
  source: src.source,
  productionPointerCount: src.productionPointerCount,
  distinctProductionIds: src.distinctProductionIds,
  distinctProductionIdCount: src.distinctProductionIdCount,
  candidateCount: src.candidateCount,
  parseFailureCount: src.parseFailureCount,
  topCandidates: (src.candidates || []).slice(0, 10).map((c) => ({
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
  })),
  interpretationRule: src.interpretationRule,
};

fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
