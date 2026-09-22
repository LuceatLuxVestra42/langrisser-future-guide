import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDelivery, SOURCE_PATH } from './build-hero-soldier-delivery-a3.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PATHS = {
  "contract": "data/contracts/hero-soldier-delivery-a3.v1.json",
  "source": "data/generated/hero-soldier-relations.v1.json",
  "byHero": "data/generated/hero-soldier-by-hero.v1.json",
  "bySoldier": "data/generated/hero-soldier-by-soldier.v1.json",
  "stageC": "data/validation/hero-soldier-integration-stageC-final.v1.json",
  "edgeSchema": "data/contracts/hero-soldier-relation-edge-schema.v1.json",
  "builder": "scripts/build-hero-soldier-delivery-a3.mjs",
  "validator": "scripts/validate-hero-soldier-delivery-a3.mjs",
  "validation": "data/validation/hero-soldier-delivery-a3.v1.json",
  "workflow": ".github/workflows/hero-soldier-delivery-a3.yml"
};
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const compareNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const compareText = (a, b) => (a === b ? 0 : String(a ?? '') < String(b ?? '') ? -1 : 1);
const pairKey = edge => String(edge.heroId) + ':' + String(edge.soldierId);

function provenanceCompare(a, b) {
  return compareText(a?.sourceKind, b?.sourceKind)
    || compareText(a?.origin?.table, b?.origin?.table)
    || compareNumber(Number(a?.origin?.recordId ?? -1), Number(b?.origin?.recordId ?? -1))
    || compareText(a?.origin?.field, b?.origin?.field)
    || compareNumber(Number(a?.parentEdge?.soldierId ?? -1), Number(b?.parentEdge?.soldierId ?? -1));
}

function countIndexPairs(index) {
  return Object.values(index || {}).reduce((count, values) => count + values.length, 0);
}

function buildValidation() {
  const contract = readJson(PATHS.contract);
  const source = readJson(PATHS.source);
  const byHero = readJson(PATHS.byHero);
  const bySoldier = readJson(PATHS.bySoldier);
  const stageC = readJson(PATHS.stageC);
  const edgeSchema = readJson(PATHS.edgeSchema);
  const builderSource = readText(PATHS.builder);
  const delivery = buildDelivery();

  const sourceEdges = source.edges || [];
  const deliveryEdges = delivery.edges || [];
  const seenPairs = new Set();
  let duplicatePairCount = 0;
  let edgeOrderMismatchCount = 0;
  let provenanceOrderMismatchCount = 0;
  let provenanceCount = 0;

  for (let index = 0; index < deliveryEdges.length; index += 1) {
    const edge = deliveryEdges[index];
    const key = pairKey(edge);
    if (seenPairs.has(key)) duplicatePairCount += 1;
    seenPairs.add(key);
    provenanceCount += Array.isArray(edge.provenance) ? edge.provenance.length : 0;

    if (index > 0) {
      const previous = deliveryEdges[index - 1];
      const order = compareNumber(Number(previous.soldierId), Number(edge.soldierId))
        || compareNumber(Number(previous.heroId), Number(edge.heroId));
      if (order > 0) edgeOrderMismatchCount += 1;
    }
    const provenance = edge.provenance || [];
    for (let p = 1; p < provenance.length; p += 1) {
      if (provenanceCompare(provenance[p - 1], provenance[p]) > 0) provenanceOrderMismatchCount += 1;
    }
  }

  const heroKeys = Object.keys(byHero.byHeroId || {});
  const soldierKeys = Object.keys(bySoldier.bySoldierId || {});
  let byHeroMismatchCount = 0;
  let bySoldierMismatchCount = 0;
  for (const heroId of heroKeys) {
    if (JSON.stringify(byHero.byHeroId[heroId] || []) !== JSON.stringify(delivery.byHeroId[heroId] || [])) byHeroMismatchCount += 1;
  }
  for (const soldierId of soldierKeys) {
    if (JSON.stringify(bySoldier.bySoldierId[soldierId] || []) !== JSON.stringify(delivery.bySoldierId[soldierId] || [])) bySoldierMismatchCount += 1;
  }

  const repositoryPathLiterals = [...new Set(builderSource.match(/data\/(?:generated|validation|contracts|configdata)\/[A-Za-z0-9._/*-]+/g) || [])].sort();
  const expectedBuilderPaths = [SOURCE_PATH].sort();
  const rawConfigDataLiteralCount = repositoryPathLiterals.filter(value => value.startsWith('data/configdata/')).length;
  const nameJoinTokenCount = (builderSource.match(/\b(?:nameKr|nameCn|nameEn)\b/g) || []).length;
  const semanticIdArithmeticCount = (builderSource.match(/(?:heroId|soldierId)\s*[+\-*/%]|[+\-*/%]\s*(?:heroId|soldierId)/g) || []).length;
  const manualPairLiteralCount = (builderSource.match(/(?:heroId|soldierId)\s*:\s*\d+/g) || []).length;

  const checks = {
    contractAccepted: contract.schemaId === 'hero-soldier-delivery-a3-contract/v1' && contract.status === 'EXPERIMENT_FROZEN',
    sourceBlobPinned: delivery.sourceArtifact?.path === PATHS.source && delivery.sourceArtifact?.gitBlobSha === blob(PATHS.source),
    projectorInputTraceExact: JSON.stringify(delivery.projectorInputTrace) === JSON.stringify([PATHS.source]),
    sourceEdgeCount5977: sourceEdges.length === 5977,
    deliveryEdgeCount5977: deliveryEdges.length === 5977,
    semanticEdgesAndProvenanceExact: JSON.stringify(sourceEdges) === JSON.stringify(deliveryEdges),
    duplicatePairZero: duplicatePairCount === 0,
    provenanceCount5978: provenanceCount === 5978 && Number(source.summary?.provenanceCount) === 5978,
    heroKeyCount267: Object.keys(delivery.byHeroId || {}).length === 267 && Number(byHero.summary?.keyCount) === 267,
    soldierKeyCount224: Object.keys(delivery.bySoldierId || {}).length === 224 && Number(bySoldier.summary?.keyCount) === 224,
    heroIndexPairCount5977: countIndexPairs(delivery.byHeroId || {}) === 5977 && Number(byHero.summary?.relationCount) === 5977,
    soldierIndexPairCount5977: countIndexPairs(delivery.bySoldierId || {}) === 5977 && Number(bySoldier.summary?.relationCount) === 5977,
    byHeroLookupExact: byHeroMismatchCount === 0 && Object.keys(delivery.byHeroId || {}).length === heroKeys.length,
    bySoldierLookupExact: bySoldierMismatchCount === 0 && Object.keys(delivery.bySoldierId || {}).length === soldierKeys.length,
    edgeSerializationOrderExact: edgeOrderMismatchCount === 0 && edgeSchema.determinismRules?.edgeOrder === 'sort by soldierId ascending, then heroId ascending when serialized',
    provenanceSerializationOrderExact: provenanceOrderMismatchCount === 0 && typeof edgeSchema.determinismRules?.provenanceOrder === 'string',
    stageCOwnerGateFrozen: stageC.completion === 'COMPLETE' && stageC.pipelineStatus === 'FINAL_FROZEN' && stageC.summary?.canonicalPairCount === 5977 && stageC.summary?.hardErrorCount === 0,
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
    schemaId: 'hero-soldier-delivery-a3-validation/v1',
    stage: 'relation-delivery-A3',
    status: pass ? 'PASS' : 'FAIL',
    completion: pass ? 'COMPLETE' : 'BLOCKED',
    contract: PATHS.contract,
    authority: { semantic: PATHS.source, lookup: [PATHS.byHero, PATHS.bySoldier], provenanceSchema: PATHS.edgeSchema, ownerValidation: PATHS.stageC },
    runtimeProjection: { persisted: false, sourceGitBlobSha: delivery.sourceArtifact.gitBlobSha },
    checks,
    summary: {
      edgeCount: deliveryEdges.length,
      provenanceCount,
      heroKeyCount: Object.keys(delivery.byHeroId || {}).length,
      soldierKeyCount: Object.keys(delivery.bySoldierId || {}).length,
      byHeroMismatchCount,
      bySoldierMismatchCount,
      duplicatePairCount,
      edgeOrderMismatchCount,
      provenanceOrderMismatchCount,
      failedCheckCount: failedChecks.length,
    },
    boundaryEvidence: { projectorInputTrace: delivery.projectorInputTrace, builderRepositoryPathLiterals: repositoryPathLiterals, rawConfigDataLiteralCount, nameJoinTokenCount, semanticIdArithmeticCount, manualPairLiteralCount },
    diagnostics: { failedChecks },
  };
}

const validation = buildValidation();
const rendered = JSON.stringify(validation, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = readText(PATHS.validation);
  if (actual !== rendered) {
    console.error('A3 validation artifact is stale.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(path.join(root, PATHS.validation), rendered);
}
console.log(JSON.stringify({ status: validation.status, summary: validation.summary, failedChecks: validation.diagnostics.failedChecks }, null, 2));
if (validation.status !== 'PASS') process.exitCode = 1;
