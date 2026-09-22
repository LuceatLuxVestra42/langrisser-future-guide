'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const PATHS = {
  "contract": "data/contracts/hero-exclusive-equipment-delivery-a1.v1.json",
  "source": "data/generated/hero-exclusive-equipment-relations.v1.json",
  "delivery": "data/generated/hero-exclusive-equipment-delivery-a1.v1.json",
  "byHero": "data/generated/hero-exclusive-equipment-by-hero.v1.json",
  "byEquipment": "data/generated/hero-exclusive-equipment-by-equipment.v1.json",
  "b4": "data/validation/hero-exclusive-equipment-relation-stageB4-validation.v1.json",
  "b6": "data/validation/hero-exclusive-equipment-relation-stageB6-consumer-summary.v1.json",
  "builder": "scripts/build_hero_exclusive_equipment_delivery_a1.cjs",
  "validator": "scripts/validate_hero_exclusive_equipment_delivery_a1.cjs",
  "output": "data/validation/hero-exclusive-equipment-delivery-a1.v1.json"
};
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const blob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const clone = value => JSON.parse(JSON.stringify(value));
const compareNumber = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const pairKey = edge => String(edge.heroId) + ':' + String(edge.equipmentId);
const sortEdges = edges => [...edges].map(clone).sort((a, b) => compareNumber(a.heroId, b.heroId) || compareNumber(a.equipmentId, b.equipmentId));
const edgeMetadata = edge => ({ relationType: edge.relationType, verificationStatus: edge.verificationStatus, provenance: clone(edge.provenance) });
const countPairs = index => Object.values(index || {}).reduce((count, values) => count + values.length, 0);

function duplicatePairCount(edges) {
  const seen = new Set();
  let duplicates = 0;
  for (const edge of edges) {
    const key = pairKey(edge);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function compareLookup(authority, delivery, targetField) {
  const authorityKeys = Object.keys(authority || {}).sort((a, b) => compareNumber(Number(a), Number(b)));
  const deliveryKeys = Object.keys(delivery || {}).sort((a, b) => compareNumber(Number(a), Number(b)));
  const missingKeys = authorityKeys.filter(key => !Object.prototype.hasOwnProperty.call(delivery || {}, key));
  const extraKeys = deliveryKeys.filter(key => !Object.prototype.hasOwnProperty.call(authority || {}, key));
  let valueMismatchCount = 0;
  for (const key of authorityKeys) {
    if (!Object.prototype.hasOwnProperty.call(delivery || {}, key)) continue;
    const expected = authority[key] || [];
    const actual = (delivery[key] || []).map(item => item[targetField]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) valueMismatchCount += 1;
  }
  return { authorityKeys, deliveryKeys, missingKeys, extraKeys, valueMismatchCount };
}

function buildValidation() {
  const contract = readJson(PATHS.contract);
  const source = readJson(PATHS.source);
  const delivery = readJson(PATHS.delivery);
  const byHero = readJson(PATHS.byHero);
  const byEquipment = readJson(PATHS.byEquipment);
  const b4 = readJson(PATHS.b4);
  const b6 = readJson(PATHS.b6);
  const builderSource = readText(PATHS.builder);

  const canonicalEdges = sortEdges(source.records || []);
  const deliveryEdges = sortEdges(delivery.edges || []);
  const sourceMap = new Map(canonicalEdges.map(edge => [pairKey(edge), edge]));
  const deliveryMap = new Map(deliveryEdges.map(edge => [pairKey(edge), edge]));
  const missingEdges = [...sourceMap.keys()].filter(key => !deliveryMap.has(key));
  const extraEdges = [...deliveryMap.keys()].filter(key => !sourceMap.has(key));
  let metadataMismatchCount = 0;
  let relationTypeMismatchCount = 0;
  let verificationMismatchCount = 0;
  let provenanceMismatchCount = 0;
  for (const [key, expected] of sourceMap) {
    const actual = deliveryMap.get(key);
    if (!actual) continue;
    if (actual.relationType !== expected.relationType) relationTypeMismatchCount += 1;
    if (actual.verificationStatus !== expected.verificationStatus) verificationMismatchCount += 1;
    if (JSON.stringify(actual.provenance) !== JSON.stringify(expected.provenance)) provenanceMismatchCount += 1;
    if (JSON.stringify(edgeMetadata(actual)) !== JSON.stringify(edgeMetadata(expected))) metadataMismatchCount += 1;
  }

  const heroLookup = compareLookup(byHero.byHeroId || {}, delivery.byHeroId || {}, 'targetId');
  const equipmentLookup = compareLookup(byEquipment.byEquipmentId || {}, delivery.byEquipmentId || {}, 'targetId');
  let lookupMetadataMismatchCount = 0;
  for (const [heroId, values] of Object.entries(delivery.byHeroId || {})) {
    for (const value of values || []) {
      const expected = sourceMap.get(String(Number(heroId)) + ':' + String(Number(value.targetId)));
      if (!expected || JSON.stringify({ relationType: value.relationType, verificationStatus: value.verificationStatus, provenance: value.provenance }) !== JSON.stringify(edgeMetadata(expected))) lookupMetadataMismatchCount += 1;
    }
  }
  for (const [equipmentId, values] of Object.entries(delivery.byEquipmentId || {})) {
    for (const value of values || []) {
      const expected = sourceMap.get(String(Number(value.targetId)) + ':' + String(Number(equipmentId)));
      if (!expected || JSON.stringify({ relationType: value.relationType, verificationStatus: value.verificationStatus, provenance: value.provenance }) !== JSON.stringify(edgeMetadata(expected))) lookupMetadataMismatchCount += 1;
    }
  }

  const literalMatches = builderSource.match(/data\/(?:generated|validation|contracts|configdata)\/[A-Za-z0-9._/*-]+/g) || [];
  const repositoryPathLiterals = [...new Set(literalMatches)].sort();
  const expectedBuilderPaths = [PATHS.delivery, PATHS.source].sort();
  const rawConfigDataLiteralCount = repositoryPathLiterals.filter(value => value.startsWith('data/configdata/')).length;
  const nameJoinTokenCount = (builderSource.match(/\b(?:nameKr|nameCn|nameEn)\b/g) || []).length;
  const semanticIdArithmeticCount = (builderSource.match(/(?:heroId|equipmentId)\s*[+\-*/%]|[+\-*/%]\s*(?:heroId|equipmentId)/g) || []).length;
  const manualPairLiteralCount = (builderSource.match(/(?:heroId|equipmentId)\s*:\s*\d+/g) || []).length;

  const checks = {
    contractAccepted: contract.schemaId === 'hero-exclusive-equipment-delivery-a1-contract/v1' && contract.status === 'EXPERIMENT_FROZEN',
    sourceBlobPinned: delivery.sourceArtifact?.path === PATHS.source && delivery.sourceArtifact?.gitBlobSha === blob(PATHS.source),
    projectorInputTraceExact: JSON.stringify(delivery.projectorInputTrace) === JSON.stringify([PATHS.source]),
    canonicalEdgeCount167: canonicalEdges.length === 167,
    deliveryEdgeCount167: deliveryEdges.length === 167,
    missingEdgeCountZero: missingEdges.length === 0,
    extraEdgeCountZero: extraEdges.length === 0,
    duplicateEdgeCountZero: duplicatePairCount(deliveryEdges) === 0,
    semanticRecordsExact: JSON.stringify(canonicalEdges) === JSON.stringify(deliveryEdges),
    relationTypeMismatchZero: relationTypeMismatchCount === 0,
    verificationMismatchZero: verificationMismatchCount === 0,
    provenanceMismatchZero: provenanceMismatchCount === 0,
    metadataMismatchZero: metadataMismatchCount === 0,
    byHeroKeyCount167: Object.keys(delivery.byHeroId || {}).length === 167,
    byHeroPairCount167: countPairs(delivery.byHeroId || {}) === 167,
    heroMissingKeyCount100: delivery.summary?.heroMissingKeyCount === 100 && byHero.summary?.canonicalHeroesWithoutKey === 100,
    byHeroLookupExact: heroLookup.missingKeys.length === 0 && heroLookup.extraKeys.length === 0 && heroLookup.valueMismatchCount === 0,
    byEquipmentKeyCount167: Object.keys(delivery.byEquipmentId || {}).length === 167,
    byEquipmentPairCount167: countPairs(delivery.byEquipmentId || {}) === 167,
    byEquipmentLookupExact: equipmentLookup.missingKeys.length === 0 && equipmentLookup.extraKeys.length === 0 && equipmentLookup.valueMismatchCount === 0,
    lookupMetadataMismatchZero: lookupMetadataMismatchCount === 0,
    b4SemanticGatePass: b4.status === 'PASS' && b4.completion === 'COMPLETE' && b4.checks?.canonicalEdgeCount?.actual === 167 && b4.checks?.authoritativeProvenanceMismatch?.actual === 0 && b4.cardinalityInvariant?.heroWithoutExclusiveCount === 100,
    b6LookupGatePass: b6.status === 'PASS' && b6.completion === 'COMPLETE' && b6.checks?.directionalParity?.pass === true && b6.checks?.generalEquipmentAdmitted?.actual === 0 && b6.checks?.canonicalOwnerHeroResolution?.actualUnknown === 0,
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
    schemaId: 'hero-exclusive-equipment-delivery-a1-validation/v1',
    stage: 'relation-delivery-A1',
    status: pass ? 'PASS' : 'FAIL',
    completion: pass ? 'COMPLETE' : 'BLOCKED',
    contract: PATHS.contract,
    authority: { semantic: PATHS.source, lookup: [PATHS.byHero, PATHS.byEquipment] },
    deliveryArtifact: { path: PATHS.delivery, gitBlobSha: blob(PATHS.delivery) },
    checks,
    summary: {
      canonicalEdgeCount: canonicalEdges.length,
      deliveryEdgeCount: deliveryEdges.length,
      missingEdgeCount: missingEdges.length,
      extraEdgeCount: extraEdges.length,
      duplicateEdgeCount: duplicatePairCount(deliveryEdges),
      metadataMismatchCount,
      provenanceMismatchCount,
      byHeroKeyCount: Object.keys(delivery.byHeroId || {}).length,
      heroMissingKeyCount: delivery.summary?.heroMissingKeyCount ?? null,
      byEquipmentKeyCount: Object.keys(delivery.byEquipmentId || {}).length,
      lookupMetadataMismatchCount,
      failedCheckCount: failedChecks.length,
    },
    boundaryEvidence: {
      projectorInputTrace: delivery.projectorInputTrace,
      builderRepositoryPathLiterals: repositoryPathLiterals,
      rawConfigDataLiteralCount,
      nameJoinTokenCount,
      semanticIdArithmeticCount,
      manualPairLiteralCount,
    },
    diagnostics: {
      failedChecks,
      missingEdges,
      extraEdges,
      byHeroMissingKeys: heroLookup.missingKeys,
      byHeroExtraKeys: heroLookup.extraKeys,
      byHeroValueMismatchCount: heroLookup.valueMismatchCount,
      byEquipmentMissingKeys: equipmentLookup.missingKeys,
      byEquipmentExtraKeys: equipmentLookup.extraKeys,
      byEquipmentValueMismatchCount: equipmentLookup.valueMismatchCount,
    },
  };
}

const validation = buildValidation();
const rendered = JSON.stringify(validation, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = readText(PATHS.output);
  if (actual !== rendered) {
    console.error('A1 validation artifact is stale. Re-run ' + path.basename(__filename) + '.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(path.join(root, PATHS.output), rendered);
}
console.log(JSON.stringify({ status: validation.status, summary: validation.summary, failedChecks: validation.diagnostics.failedChecks }, null, 2));
if (validation.status !== 'PASS') process.exitCode = 1;
