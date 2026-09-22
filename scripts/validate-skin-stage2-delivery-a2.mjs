import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PATHS = {
  "contract": "data/contracts/skin-stage2-delivery-a2.v1.json",
  "source": "data/generated/skin-stage2-3-bidirectional-relation.v1.json",
  "delivery": "data/generated/skin-stage2-delivery-a2.v1.json",
  "stage25": "data/validation/skin-stage2-5-final.v1.json",
  "builder": "scripts/build-skin-stage2-delivery-a2.mjs",
  "validator": "scripts/validate-skin-stage2-delivery-a2.mjs",
  "output": "data/validation/skin-stage2-delivery-a2.v1.json"
};
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const compareNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

function buildValidation() {
  const contract = readJson(PATHS.contract);
  const source = readJson(PATHS.source);
  const delivery = readJson(PATHS.delivery);
  const stage25 = readJson(PATHS.stage25);
  const builderSource = readText(PATHS.builder);

  const sourceSkinIds = Object.keys(source.bySkinId || {}).map(Number).sort(compareNumber);
  const deliverySkinIds = Object.keys(delivery.bySkinId || {}).map(Number).sort(compareNumber);
  const sourceHeroIds = Object.keys(source.byHeroId || {}).map(Number).sort(compareNumber);
  const deliveryHeroIds = Object.keys(delivery.byHeroId || {}).map(Number).sort(compareNumber);

  let bySkinMismatchCount = 0;
  let sourceOrderMismatchCount = 0;
  for (const skinId of sourceSkinIds) {
    const expected = source.bySkinId[String(skinId)];
    const actual = delivery.bySkinId?.[String(skinId)];
    if (!actual || Number(actual.targetId) !== Number(expected.heroId) || Number(actual.sourceOrder) !== Number(expected.sourceOrder)) bySkinMismatchCount += 1;
  }

  let byHeroListMismatchCount = 0;
  let byHeroSourceOrderMismatchCount = 0;
  for (const heroId of sourceHeroIds) {
    const expected = (source.byHeroId[String(heroId)] || []).map(Number);
    const actualEntries = delivery.byHeroId?.[String(heroId)] || [];
    const actual = actualEntries.map(item => Number(item.targetId));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) byHeroListMismatchCount += 1;
    for (const item of actualEntries) {
      const canonical = source.bySkinId[String(item.targetId)];
      if (!canonical || Number(canonical.heroId) !== Number(heroId) || Number(canonical.sourceOrder) !== Number(item.sourceOrder)) byHeroSourceOrderMismatchCount += 1;
    }
  }

  const zeroSkinHeroIds = Object.entries(source.byHeroId || {})
    .filter(([, values]) => Array.isArray(values) && values.length === 0)
    .map(([heroId]) => Number(heroId))
    .sort(compareNumber);
  const deliveryZeroSkinHeroIds = Object.entries(delivery.byHeroId || {})
    .filter(([, values]) => Array.isArray(values) && values.length === 0)
    .map(([heroId]) => Number(heroId))
    .sort(compareNumber);

  const expectedEdges = sourceSkinIds.map(skinId => ({
    skinId,
    heroId: Number(source.bySkinId[String(skinId)].heroId),
    sourceOrder: Number(source.bySkinId[String(skinId)].sourceOrder),
  }));
  const deliveryEdges = [...(delivery.edges || [])].sort((a, b) => compareNumber(Number(a.skinId), Number(b.skinId)));
  const seen = new Set();
  let duplicateSkinCount = 0;
  for (const edge of deliveryEdges) {
    const key = String(edge.skinId);
    if (seen.has(key)) duplicateSkinCount += 1;
    seen.add(key);
    const canonical = source.bySkinId[key];
    if (!canonical || Number(canonical.sourceOrder) !== Number(edge.sourceOrder)) sourceOrderMismatchCount += 1;
  }

  const repositoryPathLiterals = [...new Set(builderSource.match(/data\/(?:generated|validation|contracts|configdata)\/[A-Za-z0-9._/*-]+/g) || [])].sort();
  const expectedBuilderPaths = [PATHS.delivery, PATHS.source].sort();
  const rawConfigDataLiteralCount = repositoryPathLiterals.filter(value => value.startsWith('data/configdata/')).length;
  const nameJoinTokenCount = (builderSource.match(/\b(?:nameKr|nameCn|nameEn)\b/g) || []).length;
  const semanticIdArithmeticCount = (builderSource.match(/(?:skinId|heroId)\s*[+\-*/%]|[+\-*/%]\s*(?:skinId|heroId)/g) || []).length;
  const manualPairLiteralCount = (builderSource.match(/(?:skinId|heroId)\s*:\s*\d+/g) || []).length;

  const checks = {
    contractAccepted: contract.schemaId === 'skin-stage2-delivery-a2-contract/v1' && contract.status === 'EXPERIMENT_FROZEN',
    sourceBlobPinned: delivery.sourceArtifact?.path === PATHS.source && delivery.sourceArtifact?.gitBlobSha === blob(PATHS.source),
    projectorInputTraceExact: JSON.stringify(delivery.projectorInputTrace) === JSON.stringify([PATHS.source]),
    sourceSkinCount540: sourceSkinIds.length === 540,
    deliverySkinCount540: deliverySkinIds.length === 540,
    sourceHeroKeyCount267: sourceHeroIds.length === 267,
    deliveryHeroKeyCount267: deliveryHeroIds.length === 267,
    skinKeySetExact: JSON.stringify(sourceSkinIds) === JSON.stringify(deliverySkinIds),
    heroKeySetExact: JSON.stringify(sourceHeroIds) === JSON.stringify(deliveryHeroIds),
    bySkinMismatchZero: bySkinMismatchCount === 0,
    byHeroListMismatchZero: byHeroListMismatchCount === 0,
    byHeroSourceOrderMismatchZero: byHeroSourceOrderMismatchCount === 0,
    edgeProjectionExact: JSON.stringify(expectedEdges) === JSON.stringify(deliveryEdges),
    duplicateSkinZero: duplicateSkinCount === 0,
    sourceOrderMismatchZero: sourceOrderMismatchCount === 0,
    zeroSkinHeroCount32: zeroSkinHeroIds.length === 32 && deliveryZeroSkinHeroIds.length === 32,
    zeroSkinHeroSetExact: JSON.stringify(zeroSkinHeroIds) === JSON.stringify(deliveryZeroSkinHeroIds) && JSON.stringify(zeroSkinHeroIds) === JSON.stringify(delivery.zeroSkinHeroIds),
    explicitEmptyPreserved: zeroSkinHeroIds.every(heroId => Object.prototype.hasOwnProperty.call(delivery.byHeroId || {}, String(heroId)) && Array.isArray(delivery.byHeroId[String(heroId)]) && delivery.byHeroId[String(heroId)].length === 0),
    stage25OwnerGatePass: stage25.status === 'PASS' && stage25.completion === 'SKIN_STAGE2_COMPLETE' && stage25.metrics?.zeroSkinHeroCount === 32 && stage25.checks?.stage24SourceOrderMismatchZero === true,
    builderRepositoryPathAllowlistExact: JSON.stringify(repositoryPathLiterals) === JSON.stringify(expectedBuilderPaths),
    rawConfigDataReadLiteralZero: rawConfigDataLiteralCount === 0,
    nameJoinTokenZero: nameJoinTokenCount === 0,
    semanticIdArithmeticZero: semanticIdArithmeticCount === 0,
    manualPairLiteralZero: manualPairLiteralCount === 0,
  };
  const failedChecks = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  const pass = failedChecks.length === 0;

  return {
    version: 1,
    schemaId: 'skin-stage2-delivery-a2-validation/v1',
    stage: 'relation-delivery-A2',
    status: pass ? 'PASS' : 'FAIL',
    completion: pass ? 'COMPLETE' : 'BLOCKED',
    contract: PATHS.contract,
    authority: { semantic: PATHS.source },
    deliveryArtifact: { path: PATHS.delivery, gitBlobSha: blob(PATHS.delivery) },
    checks,
    summary: {
      sourceSkinCount: sourceSkinIds.length,
      deliverySkinCount: deliverySkinIds.length,
      sourceHeroKeyCount: sourceHeroIds.length,
      deliveryHeroKeyCount: deliveryHeroIds.length,
      edgeCount: deliveryEdges.length,
      zeroSkinHeroCount: deliveryZeroSkinHeroIds.length,
      bySkinMismatchCount,
      byHeroListMismatchCount,
      sourceOrderMismatchCount: sourceOrderMismatchCount + byHeroSourceOrderMismatchCount,
      duplicateSkinCount,
      failedCheckCount: failedChecks.length,
    },
    boundaryEvidence: { projectorInputTrace: delivery.projectorInputTrace, builderRepositoryPathLiterals: repositoryPathLiterals, rawConfigDataLiteralCount, nameJoinTokenCount, semanticIdArithmeticCount, manualPairLiteralCount },
    diagnostics: { failedChecks, zeroSkinHeroIds, deliveryZeroSkinHeroIds },
  };
}

const validation = buildValidation();
const rendered = JSON.stringify(validation, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = readText(PATHS.output);
  if (actual !== rendered) {
    console.error('A2 validation artifact is stale.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(path.join(root, PATHS.output), rendered);
}
console.log(JSON.stringify({ status: validation.status, summary: validation.summary, failedChecks: validation.diagnostics.failedChecks }, null, 2));
if (validation.status !== 'PASS') process.exitCode = 1;
