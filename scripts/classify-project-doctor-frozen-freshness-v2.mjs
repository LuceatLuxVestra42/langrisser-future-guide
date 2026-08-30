import { spawnSync } from 'node:child_process';
import {
  buildStage66OutputDigest,
  buildStage66ValidationDigest,
} from './lib/soldier-stage6-6-semantic-projections.mjs';
import {
  buildStage67OutputDigest,
  buildStage67ValidationDigest,
} from './lib/soldier-stage6-7-semantic-projections.mjs';
import { sameSemanticDigest } from './lib/frozen-semantic-digest.mjs';

const SUPPORTED = new Map([
  ['data/generated/soldier-stage6-6-expansion-basis.v1.json', buildStage66OutputDigest],
  ['data/validation/soldier-stage6-6-expansion-basis.v1.json', buildStage66ValidationDigest],
  ['data/generated/soldier-stage6-7-site-admission.v1.json', buildStage67OutputDigest],
  ['data/validation/soldier-stage6-7-site-admission.v1.json', buildStage67ValidationDigest],
]);

const defaultGit = args => spawnSync('git', args, { encoding: 'utf8' });

function gitJson(ref, filePath, runGit = defaultGit) {
  const result = runGit(['show', `${ref}:${filePath}`]);
  if (result?.error || result?.status !== 0) return { exists: false, value: null };
  try {
    return { exists: true, value: JSON.parse(String(result.stdout ?? '')) };
  } catch {
    return { exists: true, value: null, invalidJson: true };
  }
}

export function classifyFrozenPair(filePath, baseValue, headValue) {
  const builder = SUPPORTED.get(filePath);
  if (!builder) return { path: filePath, supported: false, classification: 'NOT_APPLICABLE' };
  if (!baseValue || !headValue) {
    return { path: filePath, supported: true, classification: 'SEMANTIC_CHANGED', reason: 'MISSING_SIDE' };
  }
  try {
    const baseDigest = builder(baseValue);
    const headDigest = builder(headValue);
    return {
      path: filePath,
      supported: true,
      classification: sameSemanticDigest(baseDigest, headDigest) ? 'PROVENANCE_ONLY_CHANGED' : 'SEMANTIC_CHANGED',
      baseDigest,
      headDigest,
    };
  } catch (error) {
    return { path: filePath, supported: true, classification: 'SEMANTIC_CHANGED', reason: 'DIGEST_ERROR', error: error instanceof Error ? error.message : String(error) };
  }
}

export function classifyProjectDoctorFreshnessV2({ paths, base, head, runGit = defaultGit }) {
  const results = [];
  for (const filePath of paths) {
    if (!SUPPORTED.has(filePath)) continue;
    const baseFile = gitJson(base, filePath, runGit);
    const headFile = gitJson(head, filePath, runGit);
    if (!baseFile.exists || !headFile.exists || baseFile.invalidJson || headFile.invalidJson) {
      results.push({ path: filePath, supported: true, classification: 'SEMANTIC_CHANGED', reason: baseFile.invalidJson || headFile.invalidJson ? 'INVALID_JSON' : 'MISSING_SIDE' });
      continue;
    }
    results.push(classifyFrozenPair(filePath, baseFile.value, headFile.value));
  }
  return results;
}

function aggregateFiles(files, mapStatus) {
  const direct = new Set();
  const impacted = new Set();
  const domains = new Set();
  const classes = new Set();
  for (const file of files) {
    for (const item of file.directNodes ?? []) direct.add(item);
    for (const item of file.impactedNodes ?? []) impacted.add(item);
    for (const item of file.domains ?? []) domains.add(item);
    for (const item of file.changeClasses ?? []) classes.add(item);
  }
  return {
    status: files.some(file => file.status === 'INVALID_PATH') ? 'INVALID_INPUT' : files.some(file => file.status === 'MANUAL_REVIEW') ? 'MANUAL_REVIEW' : 'MAPPED',
    mapStatus,
    changedFileCount: files.length,
    mappedFileCount: files.filter(file => file.status === 'MAPPED').length,
    manualReviewFileCount: files.filter(file => file.status === 'MANUAL_REVIEW').length,
    invalidFileCount: files.filter(file => file.status === 'INVALID_PATH').length,
    directNodes: [...direct].sort(),
    impactedNodes: [...impacted].sort(),
    domains: [...domains].sort(),
    changeClasses: [...classes].sort(),
    files,
  };
}

export function applyProjectDoctorFreshnessV2(impact, classifications) {
  const byPath = new Map(classifications.map(item => [item.path, item]));
  const files = (impact.files ?? []).map(file => {
    const classification = byPath.get(file.path);
    if (!classification) return file;
    if (classification.classification !== 'PROVENANCE_ONLY_CHANGED') {
      return { ...file, freshnessV2: classification };
    }
    return {
      ...file,
      candidateDirectNodes: file.directNodes,
      candidateImpactedNodes: file.impactedNodes,
      candidateDomains: file.domains,
      directNodes: ['project-doctor'],
      propagatedNodes: [],
      impactedNodes: ['project-doctor'],
      domains: [],
      changeClasses: ['provenance-data'],
      freshnessV2: classification,
    };
  });
  return {
    ...impact,
    ...aggregateFiles(files, impact.mapStatus),
    freshnessV2: {
      supportedPathCount: classifications.length,
      provenanceOnlyCount: classifications.filter(item => item.classification === 'PROVENANCE_ONLY_CHANGED').length,
      semanticChangedCount: classifications.filter(item => item.classification === 'SEMANTIC_CHANGED').length,
      classifications,
    },
  };
}
