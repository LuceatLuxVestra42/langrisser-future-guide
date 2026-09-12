#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const GENERATED_PATH = path.join(ROOT, 'data/generated/hero-soldier-bond-command-contribution.v1.json');
const HERO_MASTER_PATH = path.join(ROOT, 'data/hero-name-master.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/validation/hero-soldier-bond-command-contribution-r5-e.v1.json');

const COMPONENTS = ['hp', 'at', 'df', 'magicDf'];
const EXPECTED_VECTOR_COUNTS = {
  '1000,1000,2500,2500': 30,
  '1000,2500,1000,2500': 50,
  '1000,2500,2500,1000': 50,
  '2500,1000,1000,2500': 13,
  '2500,1000,2500,1000': 29,
  '2500,2500,1000,1000': 95,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}

function sameJson(a, b) {
  return JSON.stringify(stableObject(a)) === JSON.stringify(stableObject(b));
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sortedNumeric(values) {
  return [...values].sort((a, b) => a - b);
}

function addError(errors, code, detail) {
  errors.push({ code, detail });
}

function main() {
  const generatedBytes = fs.readFileSync(GENERATED_PATH);
  const generated = JSON.parse(generatedBytes.toString('utf8'));
  const heroMaster = readJson(HERO_MASTER_PATH);
  const errors = [];

  const records = Array.isArray(generated.records) ? generated.records : [];
  const canonicalIds = (heroMaster.records || []).map((r) => Number(r.heroId));
  const generatedIds = records.map((r) => Number(r.heroId));
  const uniqueGeneratedIds = new Set(generatedIds);

  if (heroMaster.recordCount !== 267 || canonicalIds.length !== 267) {
    addError(errors, 'CANONICAL_HERO_COUNT', { metadata: heroMaster.recordCount, actual: canonicalIds.length, expected: 267 });
  }
  if (generated.recordCount !== 267 || records.length !== 267) {
    addError(errors, 'GENERATED_HERO_COUNT', { metadata: generated.recordCount, actual: records.length, expected: 267 });
  }
  if (uniqueGeneratedIds.size !== records.length) {
    addError(errors, 'DUPLICATE_HERO_ID', { recordCount: records.length, uniqueCount: uniqueGeneratedIds.size });
  }
  if (!sameJson(sortedNumeric(canonicalIds), sortedNumeric(uniqueGeneratedIds))) {
    addError(errors, 'CANONICAL_HERO_ID_SET_MISMATCH', {
      canonicalCount: canonicalIds.length,
      generatedUniqueCount: uniqueGeneratedIds.size,
    });
  }

  if (generated.totalBondCount !== 1335) {
    addError(errors, 'TOTAL_BOND_COUNT', { actual: generated.totalBondCount, expected: 1335 });
  }
  if (generated.skillBuffEdgeCount !== 1602) {
    addError(errors, 'SKILL_BUFF_EDGE_COUNT', { actual: generated.skillBuffEdgeCount, expected: 1602 });
  }

  const observedVectorCounts = {};
  const aggregateRaw = { hp: 0, at: 0, df: 0, magicDf: 0 };
  const aggregateContribution = { hp: 0, at: 0, df: 0, magicDf: 0 };
  let rawShapePassCount = 0;
  let rawSumPassCount = 0;
  let normalizationPassCount = 0;
  let contributionShapePassCount = 0;
  let contributionSumPassCount = 0;

  for (const record of records) {
    const heroId = Number(record.heroId);
    const raw = record.raw || {};
    const contribution = record.contribution || {};
    const rawValues = COMPONENTS.map((key) => Number(raw[key]));
    const contributionValues = COMPONENTS.map((key) => Number(contribution[key]));

    if (!Number.isInteger(heroId)) {
      addError(errors, 'INVALID_HERO_ID', { heroId: record.heroId });
      continue;
    }
    if (rawValues.some((v) => !Number.isFinite(v))) {
      addError(errors, 'INVALID_RAW_VECTOR', { heroId, raw });
      continue;
    }
    if (contributionValues.some((v) => !Number.isFinite(v))) {
      addError(errors, 'INVALID_CONTRIBUTION_VECTOR', { heroId, contribution });
      continue;
    }

    const raw1000 = rawValues.filter((v) => v === 1000).length;
    const raw2500 = rawValues.filter((v) => v === 2500).length;
    if (raw1000 === 2 && raw2500 === 2) rawShapePassCount += 1;
    else addError(errors, 'RAW_SHAPE_INVARIANT', { heroId, rawValues, expected: 'exactly two 1000 and two 2500' });

    const rawSum = rawValues.reduce((sum, value) => sum + value, 0);
    if (rawSum === 7000) rawSumPassCount += 1;
    else addError(errors, 'RAW_SUM_INVARIANT', { heroId, rawSum, expected: 7000 });

    const normalized = rawValues.map((value) => value / 100);
    if (sameJson(normalized, contributionValues)) normalizationPassCount += 1;
    else addError(errors, 'NORMALIZATION_INVARIANT', { heroId, rawValues, contributionValues, expected: normalized });

    const c10 = contributionValues.filter((v) => v === 10).length;
    const c25 = contributionValues.filter((v) => v === 25).length;
    if (c10 === 2 && c25 === 2) contributionShapePassCount += 1;
    else addError(errors, 'CONTRIBUTION_SHAPE_INVARIANT', { heroId, contributionValues, expected: 'exactly two 10 and two 25' });

    const contributionSum = contributionValues.reduce((sum, value) => sum + value, 0);
    if (contributionSum === 70) contributionSumPassCount += 1;
    else addError(errors, 'CONTRIBUTION_SUM_INVARIANT', { heroId, contributionSum, expected: 70 });

    const vectorKey = rawValues.join(',');
    observedVectorCounts[vectorKey] = (observedVectorCounts[vectorKey] || 0) + 1;
    for (let i = 0; i < COMPONENTS.length; i += 1) {
      const key = COMPONENTS[i];
      aggregateRaw[key] += rawValues[i];
      aggregateContribution[key] += contributionValues[i];
    }
  }

  if (!sameJson(observedVectorCounts, EXPECTED_VECTOR_COUNTS)) {
    addError(errors, 'RAW_VECTOR_DISTRIBUTION', { actual: observedVectorCounts, expected: EXPECTED_VECTOR_COUNTS });
  }
  if (!sameJson(generated.rawVectorCounts, EXPECTED_VECTOR_COUNTS)) {
    addError(errors, 'RAW_VECTOR_METADATA_DISTRIBUTION', { actual: generated.rawVectorCounts, expected: EXPECTED_VECTOR_COUNTS });
  }
  if (!sameJson(generated.rawVectorCounts, observedVectorCounts)) {
    addError(errors, 'RAW_VECTOR_METADATA_RECOMPUTE_MISMATCH', { metadata: generated.rawVectorCounts, recomputed: observedVectorCounts });
  }

  const leon = records.find((r) => Number(r.heroId) === 6);
  const expectedLeonRaw = { hp: 2500, at: 2500, df: 1000, magicDf: 1000 };
  const expectedLeonContribution = { hp: 25, at: 25, df: 10, magicDf: 10 };
  const leonPass = Boolean(leon) && sameJson(leon.raw, expectedLeonRaw) && sameJson(leon.contribution, expectedLeonContribution);
  if (!leonPass) {
    addError(errors, 'LEON_FIXTURE', { actual: leon || null, expectedRaw: expectedLeonRaw, expectedContribution: expectedLeonContribution });
  }

  const expectedAggregateRaw = { hp: 472500, at: 559500, df: 430500, magicDf: 406500 };
  const expectedAggregateContribution = { hp: 4725, at: 5595, df: 4305, magicDf: 4065 };
  if (!sameJson(aggregateRaw, expectedAggregateRaw)) {
    addError(errors, 'AGGREGATE_RAW_TOTALS', { actual: aggregateRaw, expected: expectedAggregateRaw });
  }
  if (!sameJson(aggregateContribution, expectedAggregateContribution)) {
    addError(errors, 'AGGREGATE_CONTRIBUTION_TOTALS', { actual: aggregateContribution, expected: expectedAggregateContribution });
  }

  const status = errors.length === 0 ? 'PASS' : 'FAIL';
  const output = {
    version: 1,
    stage: 'R5-E',
    checkpoint: 'population-invariants',
    status,
    completion: errors.length === 0 ? 'COMPLETE' : 'BLOCKED',
    semanticOwner: 'HERO_SOLDIER_BOND_CMD_CONTRIBUTION_MATERIALIZATION',
    purpose: 'Lock output-level population invariants after independent R5-D source recomputation.',
    validatedArtifact: {
      path: 'data/generated/hero-soldier-bond-command-contribution.v1.json',
      gitBlobSha1: gitBlobSha1(generatedBytes),
      sha256: sha256(generatedBytes),
    },
    authorityBoundary: {
      semanticRecomputationPerformed: false,
      rawConfigDataRead: false,
      producerExecuted: false,
      basis: 'R5-D exact parity already proved source semantics; R5-E validates stable output invariants only.',
    },
    invariants: {
      canonicalHeroSet: {
        expectedCount: 267,
        actualCount: records.length,
        uniqueHeroIdCount: uniqueGeneratedIds.size,
        exactSetPass: sameJson(sortedNumeric(canonicalIds), sortedNumeric(uniqueGeneratedIds)),
      },
      populationCounts: {
        totalBondCount: generated.totalBondCount,
        skillBuffEdgeCount: generated.skillBuffEdgeCount,
      },
      perHeroRaw: {
        exactlyTwo1000AndTwo2500PassCount: rawShapePassCount,
        rawSum7000PassCount: rawSumPassCount,
      },
      normalization: {
        rawDiv100ExactPassCount: normalizationPassCount,
        exactlyTwo10AndTwo25PassCount: contributionShapePassCount,
        contributionSum70PassCount: contributionSumPassCount,
      },
      rawVectorDistribution: observedVectorCounts,
      aggregateRaw,
      aggregateContribution,
      leonFixture: {
        heroId: 6,
        raw: leon ? leon.raw : null,
        contribution: leon ? leon.contribution : null,
        status: leonPass ? 'PASS' : 'FAIL',
      },
    },
    errors,
    blocker: errors.length === 0 ? 'NONE' : 'INVARIANT_FAILURE',
    nextStart: errors.length === 0 ? 'R5-F_FREEZE_CHECKPOINT_HANDOFF' : 'R5-E_REPAIR',
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`[R5-E] ${status}`);
  console.log(`[R5-E] heroes=${records.length} errors=${errors.length}`);
  console.log(`[R5-E] vectors=${JSON.stringify(observedVectorCounts)}`);
  console.log(`[R5-E] aggregateRaw=${JSON.stringify(aggregateRaw)}`);

  if (errors.length > 0) process.exit(1);
}

main();
