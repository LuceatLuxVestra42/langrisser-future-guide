import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PATHS = {
  "contract": "data/contracts/banner-delivery-a4.v1.json",
  "source": "data/generated/banner-definition-hero-relations.v1.json",
  "delivery": "data/generated/banner-delivery-a4.v1.json",
  "final": "data/validation/banner-stage3-8-regression-freeze-summary.v1.json",
  "builder": "scripts/build-banner-delivery-a4.mjs",
  "validator": "scripts/validate-banner-delivery-a4.mjs",
  "validation": "data/validation/banner-delivery-a4.v1.json",
  "workflow": ".github/workflows/banner-delivery-a4.yml"
};
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const clone = value => JSON.parse(JSON.stringify(value));

function targetFromEdge(edge) {
  const target = clone(edge);
  delete target.bannerDefinitionId;
  const heroId = target.heroId;
  delete target.heroId;
  return { targetId: heroId, ...target };
}

function buildValidation() {
  const contract = readJson(PATHS.contract);
  const source = readJson(PATHS.source);
  const delivery = readJson(PATHS.delivery);
  const finalGate = readJson(PATHS.final);
  const builderSource = readText(PATHS.builder);

  const sourceDefinitions = source.definitionResults || [];
  const sourceEdges = source.edges || [];
  const deliveryDefinitions = delivery.definitionResults || [];
  const deliveryEdges = delivery.edges || [];
  const sourceDefinitionIds = sourceDefinitions.map(item => item.bannerDefinitionId).sort();
  const deliveryDefinitionIds = Object.keys(delivery.byDefinitionId || {}).sort();
  const zeroEdgeDefinitionIds = sourceDefinitions
    .filter(item => Number(item.emittedEdgeCount) === 0)
    .map(item => item.bannerDefinitionId)
    .sort();
  const deliveryZeroEdgeDefinitionIds = [...(delivery.zeroEdgeDefinitionIds || [])].sort();

  let byDefinitionMismatchCount = 0;
  let unexpectedZeroEdgeEmissionCount = 0;
  for (const definitionId of sourceDefinitionIds) {
    const expected = sourceEdges.filter(edge => edge.bannerDefinitionId === definitionId).map(targetFromEdge);
    const actual = delivery.byDefinitionId?.[definitionId] || [];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) byDefinitionMismatchCount += 1;
    if (zeroEdgeDefinitionIds.includes(definitionId) && actual.length !== 0) unexpectedZeroEdgeEmissionCount += actual.length;
  }

  const pickupHeroEdgeCount = deliveryEdges.filter(edge => edge.relationType === 'PICKUP_HERO').length;
  const wishCandidateHeroEdgeCount = deliveryEdges.filter(edge => edge.relationType === 'WISH_CANDIDATE_HERO').length;
  const manualMappingAppliedCount = sourceDefinitions.filter(item => item.approvedManualHeroIdMappingApplied === true).length;
  const sourceNullDefinitionCount = sourceDefinitions.filter(item => item.effectiveSourceRecordKey === null).length;

  const repositoryPathLiterals = [...new Set(builderSource.match(/data\/(?:generated|validation|contracts|configdata)\/[A-Za-z0-9._/*-]+/g) || [])].sort();
  const expectedBuilderPaths = [PATHS.delivery, PATHS.source].sort();
  const rawConfigDataLiteralCount = repositoryPathLiterals.filter(value => value.startsWith('data/configdata/')).length;
  const nameJoinTokenCount = (builderSource.match(/\b(?:nameKr|nameCn|nameEn)\b/g) || []).length;
  const semanticIdArithmeticCount = (builderSource.match(/(?:heroId|bannerDefinitionId)\s*[+\-*/%]|[+\-*/%]\s*(?:heroId|bannerDefinitionId)/g) || []).length;
  const manualPairLiteralCount = (builderSource.match(/(?:heroId|bannerDefinitionId)\s*:\s*\d+/g) || []).length;

  const checks = {
    contractAccepted: contract.schemaId === 'banner-delivery-a4-contract/v1' && contract.status === 'EXPERIMENT_FROZEN',
    sourceBlobPinned: delivery.sourceArtifact?.path === PATHS.source && delivery.sourceArtifact?.gitBlobSha === blob(PATHS.source),
    projectorInputTraceExact: JSON.stringify(delivery.projectorInputTrace) === JSON.stringify([PATHS.source]),
    definitionCount77: sourceDefinitions.length === 77 && deliveryDefinitions.length === 77 && deliveryDefinitionIds.length === 77,
    edgeCount600: sourceEdges.length === 600 && deliveryEdges.length === 600,
    definitionResultsExact: JSON.stringify(sourceDefinitions) === JSON.stringify(deliveryDefinitions),
    edgeRecordsExact: JSON.stringify(sourceEdges) === JSON.stringify(deliveryEdges),
    definitionKeySetExact: JSON.stringify(sourceDefinitionIds) === JSON.stringify(deliveryDefinitionIds),
    byDefinitionProjectionExact: byDefinitionMismatchCount === 0,
    pickupHeroEdgeCount136: pickupHeroEdgeCount === 136,
    wishCandidateHeroEdgeCount464: wishCandidateHeroEdgeCount === 464,
    zeroEdgeDefinitionCount8: zeroEdgeDefinitionIds.length === 8 && deliveryZeroEdgeDefinitionIds.length === 8,
    zeroEdgeDefinitionSetExact: JSON.stringify(zeroEdgeDefinitionIds) === JSON.stringify(deliveryZeroEdgeDefinitionIds),
    unexpectedZeroEdgeEmissionZero: unexpectedZeroEdgeEmissionCount === 0,
    manualMappingAppliedZero: manualMappingAppliedCount === 0,
    sourceNullDefinitionCount8: sourceNullDefinitionCount === 8,
    finalOwnerGateFrozen: finalGate.freezeState === 'BANNER_STAGE3_FROZEN' && finalGate.status === 'PASS_BANNER_STAGE3_8_REGRESSION_FREEZE' && finalGate.wish?.candidateEdges === 464 && finalGate.wish?.manualCandidatesSynthesized === false,
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
    schemaId: 'banner-delivery-a4-validation/v1',
    stage: 'relation-delivery-A4',
    status: pass ? 'PASS' : 'FAIL',
    completion: pass ? 'COMPLETE' : 'BLOCKED',
    contract: PATHS.contract,
    authority: { semantic: PATHS.source, ownerValidation: PATHS.final },
    deliveryArtifact: { path: PATHS.delivery, gitBlobSha: blob(PATHS.delivery) },
    checks,
    summary: {
      definitionCount: deliveryDefinitions.length,
      edgeCount: deliveryEdges.length,
      pickupHeroEdgeCount,
      wishCandidateHeroEdgeCount,
      zeroEdgeDefinitionCount: deliveryZeroEdgeDefinitionIds.length,
      byDefinitionMismatchCount,
      unexpectedZeroEdgeEmissionCount,
      manualMappingAppliedCount,
      sourceNullDefinitionCount,
      failedCheckCount: failedChecks.length,
    },
    boundaryEvidence: { projectorInputTrace: delivery.projectorInputTrace, builderRepositoryPathLiterals: repositoryPathLiterals, rawConfigDataLiteralCount, nameJoinTokenCount, semanticIdArithmeticCount, manualPairLiteralCount },
    diagnostics: { failedChecks, zeroEdgeDefinitionIds, deliveryZeroEdgeDefinitionIds },
  };
}

const validation = buildValidation();
const rendered = JSON.stringify(validation, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = readText(PATHS.validation);
  if (actual !== rendered) {
    console.error('A4 validation artifact is stale.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(path.join(root, PATHS.validation), rendered);
}
console.log(JSON.stringify({ status: validation.status, summary: validation.summary, failedChecks: validation.diagnostics.failedChecks }, null, 2));
if (validation.status !== 'PASS') process.exitCode = 1;
