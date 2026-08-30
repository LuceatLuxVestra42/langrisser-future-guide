import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  STAGE5_FRESHNESS_MODE,
  buildStage5ArtifactDigest,
  buildStage5FreshnessEnvelope,
  buildStage5SourceDigest,
  buildStage5SourceRef,
  buildStage55MembershipParity,
  classifyStage5SourceRef,
} from './soldier-stage5-semantic-projections.mjs';
import { sameSemanticDigest } from './frozen-semantic-digest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const STAGES = Object.freeze({
  '5-2': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      soldierMaster: 'data/generated/soldier-master.v1.json',
      soldierStage3: 'data/generated/soldier-stage3.v1.json',
      stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
      stage4Baseline: 'data/validation/soldier-stage4-8-baseline.v1.json',
    },
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-detail-stage5-2.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-2-combat.v1.json' },
    ],
  },
  '5-3': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      stage5_2: 'data/generated/soldier-detail-stage5-2.v1.json',
      stage5_2Validation: 'data/validation/soldier-stage5-2-combat.v1.json',
      soldierStage3: 'data/generated/soldier-stage3.v1.json',
      stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
    },
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-detail-stage5-3.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-3-ability.v1.json' },
    ],
  },
  '5-4': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      stage5_3: 'data/generated/soldier-detail-stage5-3.v1.json',
      stage5_3Validation: 'data/validation/soldier-stage5-3-ability.v1.json',
      soldierStage3: 'data/generated/soldier-stage3.v1.json',
      stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
    },
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-detail-stage5-4.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-4-training.v1.json' },
    ],
  },
  '5-5': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      stage5_4: 'data/generated/soldier-detail-stage5-4.v1.json',
      stage5_4Validation: 'data/validation/soldier-stage5-4-training.v1.json',
      bySoldier: 'data/generated/hero-soldier-by-soldier.v1.json',
      relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
    },
    relationSet: 'data/generated/hero-soldier-relations.v1.json',
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-detail-stage5-5.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-5-heroes.v1.json' },
    ],
  },
  '5-6': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      stage5_5: 'data/generated/soldier-detail-stage5-5.v1.json',
      stage5_5Validation: 'data/validation/soldier-stage5-5-heroes.v1.json',
      soldierStage3: 'data/generated/soldier-stage3.v1.json',
      stage3Validation: 'data/validation/soldier-stage3-final.v1.json',
    },
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-detail-stage5-6.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-6-sp-detail.v1.json' },
    ],
  },
  '5-7': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      identityContract: 'data/contracts/soldier-identity-contract.v1.json',
      stage5_6: 'data/generated/soldier-detail-stage5-6.v1.json',
      stage5_6Validation: 'data/validation/soldier-stage5-6-sp-detail.v1.json',
    },
    artifacts: [
      { role: 'output', path: 'data/generated/soldier-list-stage5-7.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-7-list.v1.json' },
    ],
  },
  '5-8': {
    sources: {
      contract: 'data/contracts/soldier-detail-stage5-1-contract.v1.json',
      stage5_7: 'data/generated/soldier-list-stage5-7.v1.json',
      stage5_7Validation: 'data/validation/soldier-stage5-7-list.v1.json',
      releaseSource: 'data/soldier-release-source.v1.json',
    },
    artifacts: [
      { role: 'releaseMetadata', path: 'data/generated/soldier-release-metadata.v1.json' },
      { role: 'output', path: 'data/generated/soldier-list-stage5-8.v1.json' },
      { role: 'validation', path: 'data/validation/soldier-stage5-8-release.v1.json' },
    ],
  },
});

const abs = relativePath => path.join(rootDir, relativePath);
const loadJson = relativePath => JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
const writeJson = (relativePath, value) => fs.writeFileSync(abs(relativePath), `${JSON.stringify(value, null, 2)}\n`);

function readPrior(relativePath) {
  try { return loadJson(relativePath); } catch { return null; }
}

function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function runFrozenPredecessor({ stage, predecessorCommit, predecessorPath, predecessorBlob }) {
  const actualBlob = execFileSync('git', ['rev-parse', `${predecessorCommit}:${predecessorPath}`], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (actualBlob !== predecessorBlob) {
    throw new Error(`Stage ${stage} predecessor blob mismatch: expected ${predecessorBlob}, got ${actualBlob}`);
  }
  const source = execFileSync('git', ['show', `${predecessorCommit}:${predecessorPath}`], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const tempPath = path.join(path.dirname(abs(predecessorPath)), `.stage5-v2-predecessor-${stage.replace('-', '')}-${process.pid}.cjs`);
  fs.writeFileSync(tempPath, source, 'utf8');
  try {
    const result = spawnSync(process.execPath, [tempPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status === null) throw new Error(`Stage ${stage} predecessor terminated without an exit status`);
    return result.status;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function numericNonZeroChecks(value) {
  return Object.entries(value?.checks ?? {})
    .filter(([, count]) => typeof count === 'number' && count !== 0)
    .map(([key]) => key);
}

function repairStage55RawSnapshotGate({ predecessorExit, artifacts, sourceValues, config }) {
  const output = artifacts.find(entry => entry.role === 'output')?.value;
  const validation = artifacts.find(entry => entry.role === 'validation')?.value;
  const relationSet = loadJson(config.relationSet);
  const parity = buildStage55MembershipParity(sourceValues.bySoldier, relationSet);
  const relationValidation = sourceValues.relationValidation;
  const failedSharedChecks = numericNonZeroChecks(relationValidation);
  const semanticHealthy = parity.semanticMatch
    && relationValidation?.status === 'PASS'
    && failedSharedChecks.length === 0;

  const currentBySoldierBlobSha = gitBlobSha(config.sources.bySoldier);
  const currentRelationBlobSha = gitBlobSha(config.relationSet);
  const recordedBySoldierBlobSha = relationValidation?.indexes?.bySoldier?.gitBlobSha ?? null;
  const bySoldierRecordedRelationBlobSha = sourceValues.bySoldier?.relationSet?.gitBlobSha ?? null;
  const recordedRelationBlobSha = relationValidation?.relationSet?.gitBlobSha ?? null;
  const rawBySoldierMismatch = currentBySoldierBlobSha !== recordedBySoldierBlobSha;
  const predecessorRawRelationMismatch = bySoldierRecordedRelationBlobSha !== recordedRelationBlobSha;
  const currentRelationProvenanceDrift = currentRelationBlobSha !== recordedRelationBlobSha;

  const rawErrorPatterns = [
    /^bySoldier index blob mismatch:/,
    /^relation-set blob mismatch:/,
  ];
  const originalErrors = Array.isArray(validation?.errors) ? validation.errors : [];
  const remainingErrors = semanticHealthy
    ? originalErrors.filter(error => !rawErrorPatterns.some(pattern => typeof error === 'string' && pattern.test(error)))
    : [...originalErrors];

  if (!parity.semanticMatch) remainingErrors.push('Hero-Soldier bySoldier membership differs from canonical relation membership');
  if (relationValidation?.status !== 'PASS') remainingErrors.push(`Shared relation validation must be PASS, got ${relationValidation?.status ?? null}`);
  if (failedSharedChecks.length) remainingErrors.push(`Shared relation validation has non-zero checks: ${failedSharedChecks.join(', ')}`);

  const dedupedErrors = [...new Set(remainingErrors)];
  validation.errors = dedupedErrors;
  validation.checks.bySoldierBlobMismatch = 0;
  validation.checks.relationSetBlobMismatch = 0;
  validation.checks.bySoldierSemanticMismatch = parity.semanticMatch ? 0 : 1;
  validation.checks.relationSetSemanticMismatch = parity.semanticMatch ? 0 : 1;

  const status = dedupedErrors.length ? 'FAIL' : 'PASS';
  validation.status = status;
  output.status = status;
  validation.freshness = {
    ...(validation.freshness ?? {}),
    membership: {
      projection: parity.projection,
      canonicalDigest: parity.canonicalDigest,
      bySoldierDigest: parity.bySoldierDigest,
      semanticMatch: parity.semanticMatch,
      rawSnapshotObservations: {
        bySoldier: {
          recordedGitBlobSha: recordedBySoldierBlobSha,
          currentGitBlobSha: currentBySoldierBlobSha,
          provenanceOnlyChanged: rawBySoldierMismatch && parity.semanticMatch,
        },
        relationSet: {
          recordedGitBlobSha: recordedRelationBlobSha,
          currentGitBlobSha: currentRelationBlobSha,
          bySoldierRecordedGitBlobSha: bySoldierRecordedRelationBlobSha,
          provenanceOnlyChanged: (predecessorRawRelationMismatch || currentRelationProvenanceDrift) && parity.semanticMatch,
        },
      },
    },
  };

  if (predecessorExit !== 0 && status === 'PASS' && !rawBySoldierMismatch && !predecessorRawRelationMismatch) {
    throw new Error(`Stage 5-5 predecessor exited ${predecessorExit} without a provenance-only raw snapshot explanation`);
  }
  if (status !== 'PASS') {
    throw new Error(`Stage 5-5 semantic membership gate failed: ${dedupedErrors.join('; ')}`);
  }
  return validation.freshness.membership;
}

export async function runStage5V2Migration({ stage, predecessorCommit, predecessorPath, predecessorBlob }) {
  const config = STAGES[stage];
  if (!config) throw new TypeError(`Unsupported Soldier Stage 5 migration stage: ${stage}`);

  const priorArtifacts = new Map(config.artifacts.map(artifact => [artifact.path, readPrior(artifact.path)]));
  const predecessorExit = runFrozenPredecessor({ stage, predecessorCommit, predecessorPath, predecessorBlob });

  const sourceValues = Object.fromEntries(
    Object.entries(config.sources).map(([label, relativePath]) => [label, loadJson(relativePath)]),
  );
  const artifacts = config.artifacts.map(artifact => ({ ...artifact, value: loadJson(artifact.path) }));

  const stage55MembershipFreshness = stage === '5-5'
    ? repairStage55RawSnapshotGate({ predecessorExit, artifacts, sourceValues, config })
    : null;
  if (stage !== '5-5' && predecessorExit !== 0) {
    throw new Error(`Stage ${stage} semantic predecessor failed with exit ${predecessorExit}`);
  }

  for (const artifact of artifacts) {
    if (artifact.value?.status !== 'PASS') {
      throw new Error(`Stage ${stage} predecessor artifact is not PASS: ${artifact.path} status=${artifact.value?.status ?? null}`);
    }
  }

  const primaryPrior = priorArtifacts.get(config.artifacts[0].path);
  const legacySources = artifacts[0].value?.sources ?? {};
  const observations = [];
  const migratedSources = {};

  for (const [label, relativePath] of Object.entries(config.sources)) {
    const value = sourceValues[label];
    const currentBlob = gitBlobSha(relativePath);
    if (typeof currentBlob !== 'string' || currentBlob.length === 0) {
      throw new Error(`Unable to resolve current Git blob for Stage ${stage} source ${label}: ${relativePath}`);
    }
    const currentDigest = buildStage5SourceDigest(stage, label, value);
    const priorRef = primaryPrior?.sources?.[label] ?? null;
    const classification = priorRef?.semanticDigest
      ? classifyStage5SourceRef(priorRef, currentDigest, currentBlob)
      : 'LEGACY_MIGRATION';
    observations.push({ label, classification });
    migratedSources[label] = buildStage5SourceRef({
      stage,
      label,
      path: relativePath,
      value,
      currentGitBlobSha: currentBlob,
      priorRef,
      legacyRef: legacySources[label] ?? null,
    });
  }

  for (const artifact of artifacts) {
    const legacyExternal = artifact.value?.sources?.externalReleaseSource;
    artifact.value.sources = {
      ...migratedSources,
      ...(stage === '5-8' && legacyExternal ? { externalReleaseSource: legacyExternal } : {}),
    };

    const semanticDigest = buildStage5ArtifactDigest(stage, artifact.role, artifact.value);
    const prior = priorArtifacts.get(artifact.path);
    if (sameSemanticDigest(prior?.freshness?.semanticDigest, semanticDigest) && prior?.generatedAt != null) {
      artifact.value.generatedAt = prior.generatedAt;
    }
    artifact.value.freshness = {
      ...buildStage5FreshnessEnvelope(semanticDigest),
      directDependencyCount: Object.keys(config.sources).length,
      sourceFreshnessAuthority: 'semanticDigest',
      gitBlobShaRole: 'audit-sticky-provenance',
    };
    if (stage === '5-5' && artifact.role === 'validation' && stage55MembershipFreshness) {
      artifact.value.freshness.membership = stage55MembershipFreshness;
    }
    writeJson(artifact.path, artifact.value);
  }

  for (const [label, ref] of Object.entries(migratedSources)) {
    const currentDigest = buildStage5SourceDigest(stage, label, sourceValues[label]);
    const classification = classifyStage5SourceRef(ref, currentDigest, gitBlobSha(ref.path));
    if (!['SEMANTIC_FRESH', 'PROVENANCE_ONLY_CHANGED'].includes(classification)) {
      throw new Error(`Stage ${stage} freshly written source ref ${label} is not semantically fresh: ${classification}`);
    }
  }

  const counts = observations.reduce((acc, observation) => {
    acc[observation.classification] = (acc[observation.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Soldier Stage ${stage} Semantic Freshness V2: PASS (${STAGE5_FRESHNESS_MODE})`);
  console.log(`Source freshness observations: ${JSON.stringify(counts)}`);
  for (const artifact of artifacts) {
    console.log(`${artifact.role} semantic digest: ${artifact.value.freshness.semanticDigest.digest}`);
  }
}
