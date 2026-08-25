const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  fullRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  fullValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  stage5_2: 'data/generated/soldier-detail-stage5-2.v1.json',
  stage5_2Validation: 'data/validation/soldier-stage5-2-combat.v1.json',
  stage5_3: 'data/generated/soldier-detail-stage5-3.v1.json',
  stage5_3Validation: 'data/validation/soldier-stage5-3-ability.v1.json',
  stage5_4: 'data/generated/soldier-detail-stage5-4.v1.json',
  stage5_4Validation: 'data/validation/soldier-stage5-4-training.v1.json',
  stage5_6: 'data/generated/soldier-detail-stage5-6.v1.json',
  stage5_6Validation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  stage6_5Manifest: 'data/generated/hero-soldier-page-links-stage6-5.v1.json',
  stage6_5Validation: 'data/validation/soldier-stage6-5-reciprocal-links.v1.json',
  output: 'data/generated/soldier-stage6-6-expansion-basis.v1.json',
  validation: 'data/validation/soldier-stage6-6-expansion-basis.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function indexByInteger(records, key) {
  const map = new Map();
  const duplicates = [];
  const invalid = [];
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) { invalid.push(id ?? null); continue; }
    if (map.has(id)) duplicates.push(id); else map.set(id, record);
  }
  return {
    map,
    duplicates: [...new Set(duplicates)].sort((a, b) => a - b),
    invalid,
  };
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function isSortedUniqueIntegers(values) {
  return Array.isArray(values)
    && values.every((value, index) => Number.isInteger(value) && (index === 0 || value > values[index - 1]));
}
function source(pathValue) { return { path: pathValue, gitBlobSha: gitBlobSha(pathValue) }; }

function main() {
  const fullRecords = loadJson(paths.fullRecords);
  const fullValidation = loadJson(paths.fullValidation);
  const stage5_2 = loadJson(paths.stage5_2);
  const stage5_2Validation = loadJson(paths.stage5_2Validation);
  const stage5_3 = loadJson(paths.stage5_3);
  const stage5_3Validation = loadJson(paths.stage5_3Validation);
  const stage5_4 = loadJson(paths.stage5_4);
  const stage5_4Validation = loadJson(paths.stage5_4Validation);
  const stage5_6 = loadJson(paths.stage5_6);
  const stage5_6Validation = loadJson(paths.stage5_6Validation);
  const relationSet = loadJson(paths.relationSet);
  const relationValidation = loadJson(paths.relationValidation);
  const stage6_5Manifest = loadJson(paths.stage6_5Manifest);
  const stage6_5Validation = loadJson(paths.stage6_5Validation);

  const full = Array.isArray(fullRecords.records) ? fullRecords.records : [];
  const records5_2 = Array.isArray(stage5_2.records) ? stage5_2.records : [];
  const records5_3 = Array.isArray(stage5_3.records) ? stage5_3.records : [];
  const records5_4 = Array.isArray(stage5_4.records) ? stage5_4.records : [];
  const records5_6 = Array.isArray(stage5_6.records) ? stage5_6.records : [];
  const edges = Array.isArray(relationSet.edges) ? relationSet.edges : [];

  const indexes = {
    full: indexByInteger(full, 'soldierId'),
    stage5_2: indexByInteger(records5_2, 'soldierId'),
    stage5_3: indexByInteger(records5_3, 'soldierId'),
    stage5_4: indexByInteger(records5_4, 'soldierId'),
    stage5_6: indexByInteger(records5_6, 'soldierId'),
  };

  const errors = [];
  const reviews = [];
  const requiredPasses = [
    ['Stage 6-1 full records', fullRecords.status],
    ['Stage 6-1 validation', fullValidation.status],
    ['Stage 5-2 combat', stage5_2.status],
    ['Stage 5-2 validation', stage5_2Validation.status],
    ['Stage 5-3 ability', stage5_3.status],
    ['Stage 5-3 validation', stage5_3Validation.status],
    ['Stage 5-4 training', stage5_4.status],
    ['Stage 5-4 validation', stage5_4Validation.status],
    ['Stage 5-6 SP detail', stage5_6.status],
    ['Stage 5-6 validation', stage5_6Validation.status],
    ['Hero-Soldier relation validation', relationValidation.status],
    ['Stage 6-5 reciprocal manifest', stage6_5Manifest.status],
    ['Stage 6-5 reciprocal validation', stage6_5Validation.status],
  ];
  const upstreamNonPass = requiredPasses.filter(([, status]) => status !== 'PASS');
  if (upstreamNonPass.length) {
    errors.push(`Upstream non-PASS inputs: ${upstreamNonPass.map(([name, status]) => `${name}=${status}`).join(', ')}`);
  }

  for (const [name, index] of Object.entries(indexes)) {
    if (index.invalid.length) errors.push(`${name} contains ${index.invalid.length} invalid soldierId values`);
    if (index.duplicates.length) errors.push(`${name} contains duplicate Soldier IDs: ${index.duplicates.join(', ')}`);
  }

  const fullIds = [...indexes.full.map.keys()].sort((a, b) => a - b);
  const fullIdSet = new Set(fullIds);
  const sourceIdMismatches = [];
  for (const [name, index] of Object.entries(indexes)) {
    if (name === 'full') continue;
    const ids = [...index.map.keys()].sort((a, b) => a - b);
    const missing = fullIds.filter((id) => !index.map.has(id));
    const extra = ids.filter((id) => !fullIdSet.has(id));
    if (missing.length || extra.length) sourceIdMismatches.push({ source: name, missing, extra });
  }
  if (sourceIdMismatches.length) errors.push(`${sourceIdMismatches.length} Stage 5 source sets differ from the Stage 6-1 canonical Soldier set`);

  const combatPreservationMismatches = [];
  const malformedFullCombat = [];
  const abilityPreservationMismatches = [];
  const malformedAbilityPaths = [];
  const trainingPreservationMismatches = [];
  const malformedTrainingPaths = [];
  const spPreservationMismatches = [];
  const malformedSpBlocks = [];
  const nonSpDetailLeak = [];

  let normalCount = 0;
  let spCount = 0;
  let normalTier3Count = 0;
  let normalAbilityLevelRecords = 0;
  let normalTrainingLevelRecords = 0;
  let spDescriptionLevelRecords = 0;
  let spStatDeltaCount = 0;
  let spStage1MissionCount = 0;
  let spStage2MissionCount = 0;
  let spSecondStageTrue = 0;
  let spSecondStageFalse = 0;
  let spExpandedHeroReferenceCount = 0;
  const missionTypeCounts = new Map();

  for (const soldierId of fullIds) {
    const current = indexes.full.map.get(soldierId);
    const source5_2 = indexes.stage5_2.map.get(soldierId);
    const source5_3 = indexes.stage5_3.map.get(soldierId);
    const source5_4 = indexes.stage5_4.map.get(soldierId);
    const source5_6 = indexes.stage5_6.map.get(soldierId);
    if (!source5_2 || !source5_3 || !source5_4 || !source5_6) continue;

    if (!same(current.combat, source5_2.combat)) combatPreservationMismatches.push(soldierId);
    const combat = current.combat ?? {};
    const combatValid = ['hp', 'atk', 'def', 'mdef', 'move', 'range', 'moveType'].every((key) => finite(combat[key]))
      && typeof combat.isMelee === 'boolean';
    if (!combatValid) malformedFullCombat.push(soldierId);

    if (!same(current.ability, source5_3.ability)) abilityPreservationMismatches.push(soldierId);
    if (!same(current.training, source5_4.training)) trainingPreservationMismatches.push(soldierId);
    if (!same(current.sp, source5_6.sp)) spPreservationMismatches.push(soldierId);

    const isSp = current?.identity?.isSp === true;
    if (isSp) spCount += 1; else normalCount += 1;
    const isNormalTier3 = !isSp && current?.identity?.tier === 3;

    if (isNormalTier3) {
      normalTier3Count += 1;
      const ability = current.ability ?? {};
      const abilityLevels = Array.isArray(ability.levels) ? ability.levels : [];
      normalAbilityLevelRecords += abilityLevels.length;
      const abilityValid = Number.isInteger(ability.techId)
        && abilityLevels.length === 10
        && abilityLevels.every((level, index) => level?.level === index + 1
          && Number.isInteger(level?.levelInfoId)
          && level?.soldierSkillLevel === index + 1
          && Number.isInteger(level?.soldierSkillId)
          && nonEmpty(level?.description))
        && nonEmpty(ability.finalDescription);
      if (!abilityValid) malformedAbilityPaths.push(soldierId);

      const training = current.training ?? {};
      const perLevelCost = Array.isArray(training.perLevelCost) ? training.perLevelCost : [];
      normalTrainingLevelRecords += perLevelCost.length;
      const trainingValid = Number.isInteger(training.techId)
        && training.techId === ability.techId
        && perLevelCost.length === 10
        && perLevelCost.every((level, index) => level?.level === index + 1
          && finite(level?.gold)
          && Array.isArray(level?.materials)
          && level.materials.every((material) => Number.isInteger(material?.goodsType)
            && Number.isInteger(material?.itemId)
            && finite(material?.count)))
        && training.lv5Total?.levelsIncluded === 5
        && training.lv10Total?.levelsIncluded === 10
        && finite(training.lv5Total?.gold)
        && finite(training.lv10Total?.gold)
        && Array.isArray(training.lv5Total?.materials)
        && Array.isArray(training.lv10Total?.materials);
      if (!trainingValid) malformedTrainingPaths.push(soldierId);
    }

    if (!isSp) {
      if (current.sp !== null) nonSpDetailLeak.push(soldierId);
      continue;
    }

    const sp = current.sp;
    const descriptionLevels = Array.isArray(sp?.descriptionLevels) ? sp.descriptionLevels : [];
    const stage1Missions = Array.isArray(sp?.stage1?.missions) ? sp.stage1.missions : [];
    const stage2Missions = Array.isArray(sp?.stage2?.missions) ? sp.stage2.missions : [];
    const expandedHeroIds = Array.isArray(sp?.expandedHeroIds) ? sp.expandedHeroIds : [];
    spDescriptionLevelRecords += descriptionLevels.length;
    spStage1MissionCount += stage1Missions.length;
    spStage2MissionCount += stage2Missions.length;
    spExpandedHeroReferenceCount += expandedHeroIds.length;

    const statDeltaValid = sp?.statDelta
      && ['hp', 'atk', 'def', 'mdef', 'move', 'range'].every((key) => finite(sp.statDelta[key]));
    if (statDeltaValid) spStatDeltaCount += 1;

    for (const mission of [...stage1Missions, ...stage2Missions]) {
      const type = mission?.missionType;
      if (Number.isInteger(type)) missionTypeCounts.set(type, (missionTypeCounts.get(type) ?? 0) + 1);
    }

    if (sp?.secondStageUnlock === true) spSecondStageTrue += 1;
    else spSecondStageFalse += 1;

    const stage1Valid = Number.isInteger(sp?.normalSoldierId)
      && sp?.spSoldierId === soldierId
      && statDeltaValid
      && descriptionLevels.length === 10
      && descriptionLevels.every((level, index) => level?.level === index + 1 && nonEmpty(level?.description))
      && nonEmpty(sp?.finalDescription)
      && Number.isInteger(sp?.stage1?.awakenLevelId)
      && Array.isArray(sp?.stage1?.awakenMaterials)
      && stage1Missions.length === 2
      && stage1Missions.every((mission) => Number.isInteger(mission?.missionId) && mission?.missing !== true)
      && same(stage1Missions.map((mission) => mission.missionType).sort((a, b) => a - b), [73, 123]);

    let stage2Valid = false;
    if (sp?.secondStageUnlock === true) {
      stage2Valid = Number.isInteger(sp?.stage2?.awakenLevelId)
        && Array.isArray(sp?.stage2?.awakenMaterials)
        && stage2Missions.length === 1
        && stage2Missions[0]?.missionType === 124
        && Number.isInteger(stage2Missions[0]?.missionId)
        && stage2Missions[0]?.missing !== true
        && isSortedUniqueIntegers(expandedHeroIds)
        && same(expandedHeroIds, sp?.stage2?.expandHeroIds ?? []);
    } else {
      stage2Valid = sp?.stage2 === null && expandedHeroIds.length === 0;
    }

    if (!stage1Valid || !stage2Valid) malformedSpBlocks.push(soldierId);
  }

  if (combatPreservationMismatches.length) errors.push(`${combatPreservationMismatches.length} final combat blocks differ from Stage 5-2`);
  if (malformedFullCombat.length) errors.push(`${malformedFullCombat.length} final full-stat combat blocks are malformed`);
  if (abilityPreservationMismatches.length) errors.push(`${abilityPreservationMismatches.length} final ability blocks differ from Stage 5-3`);
  if (malformedAbilityPaths.length) errors.push(`${malformedAbilityPaths.length} normal tier-3 Lv1-10 trait paths are malformed`);
  if (trainingPreservationMismatches.length) errors.push(`${trainingPreservationMismatches.length} final training blocks differ from Stage 5-4`);
  if (malformedTrainingPaths.length) errors.push(`${malformedTrainingPaths.length} normal tier-3 Lv1-10 training-cost paths are malformed`);
  if (spPreservationMismatches.length) errors.push(`${spPreservationMismatches.length} final SP blocks differ from Stage 5-6`);
  if (malformedSpBlocks.length) errors.push(`${malformedSpBlocks.length} final SP expansion blocks are malformed`);
  if (nonSpDetailLeak.length) errors.push(`${nonSpDetailLeak.length} normal Soldiers unexpectedly contain SP detail`);

  const edgeInvalidPairs = [];
  const edgesWithoutProvenance = [];
  let provenanceCount = 0;
  const provenanceSourceCounts = new Map();
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!Number.isInteger(edge?.heroId) || !Number.isInteger(edge?.soldierId)) edgeInvalidPairs.push(index);
    const provenance = Array.isArray(edge?.provenance) ? edge.provenance : [];
    if (!provenance.length) edgesWithoutProvenance.push(index);
    provenanceCount += provenance.length;
    for (const item of provenance) {
      const sourceKind = item?.sourceKind;
      if (typeof sourceKind === 'string' && sourceKind.length) {
        provenanceSourceCounts.set(sourceKind, (provenanceSourceCounts.get(sourceKind) ?? 0) + 1);
      }
    }
  }

  const relationSummary = relationSet.summary ?? {};
  const sourceProductionCounts = relationSummary.sourceProductionCounts ?? {};
  const provenanceSummaryMismatch = [];
  if (relationSummary.edgeCount !== edges.length) provenanceSummaryMismatch.push(`edgeCount ${relationSummary.edgeCount} != ${edges.length}`);
  if (relationSummary.provenanceCount !== provenanceCount) provenanceSummaryMismatch.push(`provenanceCount ${relationSummary.provenanceCount} != ${provenanceCount}`);
  for (const [kind, expected] of Object.entries(sourceProductionCounts)) {
    const actual = provenanceSourceCounts.get(kind) ?? 0;
    if (actual !== expected) provenanceSummaryMismatch.push(`${kind} ${expected} != ${actual}`);
  }
  if (edgeInvalidPairs.length) errors.push(`${edgeInvalidPairs.length} canonical Hero-Soldier edges have invalid IDs`);
  if (edgesWithoutProvenance.length) errors.push(`${edgesWithoutProvenance.length} canonical Hero-Soldier edges lost provenance`);
  if (provenanceSummaryMismatch.length) errors.push(`Relation provenance summary mismatch: ${provenanceSummaryMismatch.join('; ')}`);
  if ((relationValidation?.checks?.edgesWithoutProvenance ?? null) !== 0) errors.push('Shared relation validation no longer reports edgesWithoutProvenance=0');
  if ((stage6_5Manifest?.summary?.canonicalRelationCount ?? null) !== edges.length) errors.push('Stage 6-5 canonical relation count differs from Stage 6-6 provenance source');

  const expected = {
    canonicalSoldiers: 224,
    normalSoldiers: 168,
    spSoldiers: 56,
    normalTier3: 129,
    normalAbilityLevelRecords: 1290,
    normalTrainingLevelRecords: 1290,
    spDescriptionLevelRecords: 560,
    spStage1MissionCount: 112,
    spStage2MissionCount: 45,
    spSecondStageTrue: 45,
    spSecondStageFalse: 11,
    relationEdges: 5977,
    relationProvenance: 5978,
  };
  const baselineMismatches = [];
  const actualBaseline = {
    canonicalSoldiers: full.length,
    normalSoldiers: normalCount,
    spSoldiers: spCount,
    normalTier3: normalTier3Count,
    normalAbilityLevelRecords,
    normalTrainingLevelRecords,
    spDescriptionLevelRecords,
    spStage1MissionCount,
    spStage2MissionCount,
    spSecondStageTrue,
    spSecondStageFalse,
    relationEdges: edges.length,
    relationProvenance: provenanceCount,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actualBaseline[key] !== value) baselineMismatches.push(`${key}: actual=${actualBaseline[key]} expected=${value}`);
  }
  if (baselineMismatches.length) errors.push(`Stage 6-6 frozen baseline mismatch: ${baselineMismatches.join('; ')}`);

  const missionTypeObject = Object.fromEntries([...missionTypeCounts.entries()].sort((a, b) => a[0] - b[0]).map(([key, value]) => [String(key), value]));
  if (!same(missionTypeObject, { '73': 56, '123': 56, '124': 45 })) {
    errors.push(`SP mission type distribution mismatch: ${JSON.stringify(missionTypeObject)}`);
  }

  reviews.push({
    code: 'SIMULATOR_IMPLEMENTATION_DEFERRED',
    classification: 'REVIEW',
    rule: 'Stage 6-6 freezes simulator-ready data inputs only. Combat formulas, state mutation and interactive simulator UI remain a later second-phase implementation.',
  });
  reviews.push({
    code: 'SP_FULL_STATS_ARE_AUTHORITATIVE',
    classification: 'REVIEW',
    rule: 'Future consumers must use each SP record combat block as the full SP stat source. statDelta is comparison metadata and must not be used to reconstruct SP full stats from the normal form.',
  });
  reviews.push({
    code: 'RELATION_PROVENANCE_SEPARATE_AUTHORITY',
    classification: 'REVIEW',
    rule: 'Hero eligibility provenance stays authoritative in the shared Hero-Soldier relation set; page/simulator consumers may join by IDs but must not infer provenance from display lists.',
  });

  const status = errors.length ? 'FAIL' : 'PASS';
  const generatedAt = fullRecords.generatedAt ?? fullValidation.generatedAt ?? relationSet.generatedAt ?? null;
  const sources = {
    fullRecords: source(paths.fullRecords),
    fullValidation: source(paths.fullValidation),
    stage5_2: source(paths.stage5_2),
    stage5_2Validation: source(paths.stage5_2Validation),
    stage5_3: source(paths.stage5_3),
    stage5_3Validation: source(paths.stage5_3Validation),
    stage5_4: source(paths.stage5_4),
    stage5_4Validation: source(paths.stage5_4Validation),
    stage5_6: source(paths.stage5_6),
    stage5_6Validation: source(paths.stage5_6Validation),
    relationSet: source(paths.relationSet),
    relationValidation: source(paths.relationValidation),
    stage6_5Manifest: source(paths.stage6_5Manifest),
    stage6_5Validation: source(paths.stage6_5Validation),
  };

  const output = {
    version: 1,
    schemaId: 'soldier-stage6-6-expansion-basis/v1',
    stage: '6-6',
    status,
    generatedAt,
    purpose: 'Freeze lossless Soldier page-data inputs needed for later expansion and a level-by-level simulator without implementing simulator formulas in Stage 6.',
    simulatorReadiness: {
      status: status === 'PASS' ? 'FOUNDATION_READY' : 'BLOCKED',
      scope: 'DATA_FOUNDATION_ONLY',
      implementedNow: [
        'full normal/SP combat stat preservation',
        'normal tier-3 trait Lv1-10 preservation',
        'normal tier-3 per-level training cost Lv1-10 preservation',
        'SP description/stat-delta/mission/second-stage preservation',
        'Hero-Soldier provenance authority preservation',
      ],
      deferred: [
        'combat outcome formulas',
        'training-state mutation and optimization logic',
        'interactive simulator UI',
        'presentation-specific cost simplification rules beyond existing lv5/lv10 totals',
      ],
    },
    authorities: {
      fullStats: {
        source: paths.fullRecords,
        field: 'records[].combat',
        rule: 'The current record combat block is the full stat source for both normal and SP Soldiers.',
      },
      normalTraitLevels: {
        source: paths.fullRecords,
        field: 'records[].ability.levels',
        scope: 'normal tier-3 only',
        rule: 'Preserve exact Lv1-10 descriptions and source IDs; do not collapse the simulator source to finalDescription only.',
      },
      trainingCosts: {
        source: paths.fullRecords,
        field: 'records[].training.perLevelCost',
        scope: 'normal tier-3 only',
        rule: 'Per-level costs are the expansion source; lv5Total/lv10Total are validated aggregates, not replacements for the 10-step path.',
      },
      spExpansion: {
        source: paths.fullRecords,
        field: 'records[].sp',
        scope: 'SP only',
        rule: 'Preserve 10 description levels, statDelta, stage1/stage2 mission objects and expandedHeroIds. One-stage SP records must keep stage2=null.',
      },
      heroEligibilityProvenance: {
        source: paths.relationSet,
        field: 'edges[].provenance',
        rule: 'Hero eligibility and its provenance are one shared authority; consumers must not rebuild membership/provenance from page presentation data.',
      },
    },
    summary: {
      ...actualBaseline,
      spStatDeltaCount,
      spExpandedHeroReferenceCount,
      spMissionTypeCounts: missionTypeObject,
      relationSourceProductionCounts: Object.fromEntries([...provenanceSourceCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    },
    sources,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-6-expansion-basis-validation/v1',
    stage: '6-6',
    status,
    generatedAt,
    sources,
    checks: {
      upstreamNonPass: upstreamNonPass.length,
      invalidFullRecordIds: indexes.full.invalid.length,
      duplicateFullRecordIds: indexes.full.duplicates.length,
      sourceIdSetMismatch: sourceIdMismatches.length,
      combatPreservationMismatches: combatPreservationMismatches.length,
      malformedFullCombat: malformedFullCombat.length,
      abilityPreservationMismatches: abilityPreservationMismatches.length,
      malformedAbilityPaths: malformedAbilityPaths.length,
      trainingPreservationMismatches: trainingPreservationMismatches.length,
      malformedTrainingPaths: malformedTrainingPaths.length,
      spPreservationMismatches: spPreservationMismatches.length,
      malformedSpBlocks: malformedSpBlocks.length,
      nonSpDetailLeak: nonSpDetailLeak.length,
      relationInvalidPairs: edgeInvalidPairs.length,
      edgesWithoutProvenance: edgesWithoutProvenance.length,
      provenanceSummaryMismatch: provenanceSummaryMismatch.length,
      baselineMismatches: baselineMismatches.length,
    },
    coverage: {
      ...actualBaseline,
      spStatDeltaCount,
      spExpandedHeroReferenceCount,
      spMissionTypeCounts: missionTypeObject,
      relationSourceProductionCounts: Object.fromEntries([...provenanceSourceCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      sourceIdMismatches,
      combatPreservationMismatches,
      malformedFullCombat,
      abilityPreservationMismatches,
      malformedAbilityPaths,
      trainingPreservationMismatches,
      malformedTrainingPaths,
      spPreservationMismatches,
      malformedSpBlocks,
      nonSpDetailLeak,
      edgeInvalidPairs,
      edgesWithoutProvenance,
      provenanceSummaryMismatch,
      baselineMismatches,
    },
    errors,
    reviews,
  };

  writeJson(paths.output, output);
  writeJson(paths.validation, validation);

  console.log(`Soldier Stage 6-6: ${status}`);
  console.log(`Soldiers normal/SP/tier3: ${normalCount}/${spCount}/${normalTier3Count}`);
  console.log(`Lv1-10 trait/training records: ${normalAbilityLevelRecords}/${normalTrainingLevelRecords}`);
  console.log(`SP missions stage1/stage2: ${spStage1MissionCount}/${spStage2MissionCount}`);
  console.log(`Relation edges/provenance: ${edges.length}/${provenanceCount}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
