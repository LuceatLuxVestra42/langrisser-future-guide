import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage3-classification.v1.json',
  referenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  stage2Summary: 'data/validation/asset-intake-hygiene-stage2-reference-crosscheck-summary.v1.json',
  classification: 'tools/asset-intake/hygiene/generated/asset-hygiene-classification.v1.json',
  reviewQueue: 'tools/asset-intake/hygiene/generated/asset-hygiene-review-queue.v1.json',
  verifiedEvidenceIndex: 'tools/asset-intake/hygiene/generated/asset-hygiene-verified-evidence-index.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage3-classification-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage3-classification.md',
};

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
}

function countBy(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function canonicalKeyId(key) {
  return `${key.domain}:${key.assetKind}:${String(key.value)}`;
}

function checkpointMarkdown(summary) {
  const classes = Object.entries(summary.primaryClassCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const flags = Object.entries(summary.flagCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const priorities = Object.entries(summary.reviewQueueCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  return `# Asset Hygiene Stage 3 — Classification / Review Queue / Freeze\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- AH-2 reference map: \`${PATHS.referenceMap}\`\n- AH-2 summary: \`${PATHS.stage2Summary}\`\n- classification population: ${summary.coverage.inputRecordCount}\n\nAH-1/AH-2의 frozen 결과만 사용했으며 raw ConfigData, 외부 source, filename inference를 사용하지 않았다.\n\n## 2. primary classification\n\n${classes}\n\n\`UNREFERENCED\`는 UNUSED 또는 DELETE를 의미하지 않는다. reference가 현재 graph에 없다는 사실만 기록한다.\n\n## 3. flags\n\n${flags}\n\n\`BASENAME_COLLISION\`은 AH-1 candidate flag이며 \`RESOLVER_COLLISION\`으로 자동 승격하지 않는다.\n\n## 4. review queue\n\n${priorities || '- 없음'}\n\nreview queue는 전체 파일을 사람이 다시 훑지 않도록 risk group만 압축한 것이다.\n\n## 5. verified evidence index\n\n\`\`\`text\ncanonical-key entries      ${summary.verifiedEvidenceIndex.canonicalEntryCount}\nrepository-path entries    ${summary.verifiedEvidenceIndex.pathEntryCount}\nverified asset memberships ${summary.verifiedEvidenceIndex.assetMembershipCount}\n\`\`\`\n\ncanonicalKey는 AH-2 reference에 이미 존재하는 경우에만 사용했다. Equipment/Banner 등 canonicalKey가 명시되지 않은 verified asset은 repository-path-only entry로 남겼고 filename에서 ID를 만들지 않았다.\n\n## 6. REVIEW / BLOCKER\n\nREVIEW:\n${summary.reviews.length ? summary.reviews.map((item, index) => `${index + 1}. \`${item.code}\` — ${item.count}`).join('\n') : '- 없음'}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\``).join('\n') : '- 없음'}\n\n## 7. 하지 않은 것\n\n\`\`\`text\ndelete / move / rename\nformat conversion\nconsumer rewrite\nproduction admission / quarantine\nexternal fetch\nraw ConfigData read\nsemantic recomputation\ncanonical relation recomputation\nname JOIN\nID arithmetic\nfilename 기반 superseded 추론\n\`\`\`\n\n## 8. 완료 조건\n\n- classification coverage 100% (${summary.coverage.classifiedRecordCount}/${summary.coverage.inputRecordCount})\n- unclassified 0\n- classifier hard error ${summary.hardErrorCount}\n- Stage 2 structural unresolved 0\n- asset/frontend/semantic mutation 0\n\n## 9. 다음 시작점\n\n이번 Asset Hygiene v1은 여기서 STOP한다.\n\n후속 별도 작업:\n- AH-4 production admission / quarantine\n- AH-5 dedup / move / delete\n\n## 10. 다시 열리는 조건\n\n- repository asset population 변경 또는 explicit baseline migration\n- active asset manifest/resolver/source 변경\n- AH-2 reference graph structural parity 파손\n- source/evidence provenance 변경\n- classification contract 변경\n\n## 11. 최종 판정\n\n\`\`\`text\n${summary.status}\n${summary.completion}\n${summary.freezeState}\nclassification coverage: ${summary.coverage.classifiedRecordCount}/${summary.coverage.inputRecordCount}\nunclassified: ${summary.coverage.unclassifiedRecordCount}\nhard error: ${summary.hardErrorCount}\nblocker: ${summary.blockers.length}\nSTOP after AH-3\n\`\`\`\n`;
}

export async function buildStage3Classification({ write = false } = {}) {
  const [contract, referenceMap, stage2Summary] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.referenceMap),
    json(PATHS.stage2Summary),
  ]);

  if (stage2Summary.status !== 'PASS_ASSET_HYGIENE_STAGE2_REFERENCE_CROSSCHECK' || stage2Summary.completion !== 'COMPLETE' || stage2Summary.hardErrorCount !== 0) {
    throw new Error('AH-3 requires frozen PASS/COMPLETE AH-2 with zero hard errors');
  }
  if (referenceMap.recordCount !== contract.population.expectedRecordCount || referenceMap.records.length !== contract.population.expectedRecordCount) {
    throw new Error(`AH-3 population mismatch: ${referenceMap.records.length}`);
  }

  const validPrimary = new Set(contract.primaryClasses);
  const validFlags = new Set(contract.flags);
  const classified = [];

  for (const record of referenceMap.records) {
    const kinds = uniqueSorted(record.references.map((reference) => reference.kind));
    const has = (kind) => kinds.includes(kind);
    const activeProduction = has('ACTIVE_PRODUCTION_REF');
    const explicitDerivative = has('DERIVATIVE_REF');
    const currentFrontendReference = has('FRONTEND_REF');
    const verifiedEvidence = activeProduction || explicitDerivative || has('SOURCE_EVIDENCE_REF') || has('MANIFEST_REF');
    const explicitSuperseded = record.references.some((reference) => reference.explicitSuperseded === true || (reference.kind === 'HISTORICAL_REF' && reference.relation === 'SUPERSEDED'));
    const resolverCollision = record.references.some((reference) => reference.resolverCollision === true || reference.kind === 'RESOLVER_COLLISION');
    const unverifiedExternal = record.references.some((reference) => reference.unverifiedExternal === true || reference.kind === 'UNVERIFIED_EXTERNAL');

    let primaryClass;
    let reasonCode;
    if (activeProduction) {
      primaryClass = 'ACTIVE_VERIFIED';
      reasonCode = 'CURRENT_VERIFIED_PRODUCTION_REFERENCE';
    } else if (has('SOURCE_EVIDENCE_REF') || has('MANIFEST_REF')) {
      primaryClass = 'EVIDENCE_ONLY';
      reasonCode = 'CURRENT_VERIFIED_EVIDENCE_OR_MANIFEST_ONLY';
    } else if (explicitDerivative) {
      primaryClass = 'GENERATED_DERIVATIVE';
      reasonCode = 'EXPLICIT_DERIVATIVE_RELATION_ONLY';
    } else if (explicitSuperseded) {
      primaryClass = 'SUPERSEDED';
      reasonCode = 'EXPLICIT_SUPERSEDED_EVIDENCE';
    } else if (record.references.length === 0) {
      primaryClass = 'UNREFERENCED';
      reasonCode = 'NO_CURRENT_REFERENCE_EDGE';
    } else {
      primaryClass = 'PROVENANCE_UNKNOWN';
      reasonCode = 'CURRENT_REFERENCE_WITHOUT_VERIFIED_PROVENANCE_EDGE';
    }

    const flags = [];
    if (record.exactDuplicateGroup) flags.push('EXACT_DUPLICATE');
    if (record.basenameCollisionGroup) flags.push('BASENAME_COLLISION');
    if (resolverCollision) flags.push('RESOLVER_COLLISION');
    if (unverifiedExternal) flags.push('UNVERIFIED_EXTERNAL');
    if (
      primaryClass === 'PROVENANCE_UNKNOWN' ||
      primaryClass === 'UNREFERENCED' ||
      resolverCollision ||
      unverifiedExternal ||
      record.exactDuplicateGroup
    ) flags.push('REVIEW_REQUIRED');

    flags.sort((a, b) => a.localeCompare(b, 'en'));
    if (!validPrimary.has(primaryClass)) throw new Error(`invalid primaryClass ${primaryClass} for ${record.repositoryPath}`);
    if (flags.some((flag) => !validFlags.has(flag))) throw new Error(`invalid flag for ${record.repositoryPath}`);

    classified.push({
      repositoryPath: record.repositoryPath,
      root: record.root,
      sha256: record.sha256,
      primaryClass,
      reasonCode,
      flags,
      traits: {
        activeProduction,
        explicitDerivative,
        currentFrontendReference,
        verifiedEvidence,
      },
      referenceCount: record.references.length,
      referenceKinds: kinds,
      exactDuplicateGroup: record.exactDuplicateGroup ?? null,
      basenameCollisionGroup: record.basenameCollisionGroup ?? null,
    });
  }

  classified.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const duplicateGroups = new Map();
  for (const record of classified) {
    if (!record.exactDuplicateGroup) continue;
    if (!duplicateGroups.has(record.exactDuplicateGroup)) duplicateGroups.set(record.exactDuplicateGroup, []);
    duplicateGroups.get(record.exactDuplicateGroup).push(record.repositoryPath);
  }

  const queueItems = [];
  for (const record of classified.filter((item) => item.flags.includes('RESOLVER_COLLISION'))) {
    queueItems.push({ priority: 'P0', code: 'RESOLVER_COLLISION', assetCount: 1, repositoryPaths: [record.repositoryPath] });
  }
  for (const record of classified.filter((item) => item.primaryClass === 'PROVENANCE_UNKNOWN' && item.traits.currentFrontendReference)) {
    queueItems.push({ priority: 'P1', code: 'CURRENT_FRONTEND_PROVENANCE_UNKNOWN', assetCount: 1, repositoryPaths: [record.repositoryPath] });
  }
  for (const record of classified.filter((item) => item.flags.includes('UNVERIFIED_EXTERNAL') && item.traits.activeProduction)) {
    queueItems.push({ priority: 'P1', code: 'UNVERIFIED_EXTERNAL_PRODUCTION_REF', assetCount: 1, repositoryPaths: [record.repositoryPath] });
  }
  for (const record of classified.filter((item) => item.primaryClass === 'SUPERSEDED' && item.traits.activeProduction)) {
    queueItems.push({ priority: 'P2', code: 'SUPERSEDED_STILL_ACTIVE', assetCount: 1, repositoryPaths: [record.repositoryPath] });
  }
  for (const [groupId, paths] of [...duplicateGroups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    paths.sort((a, b) => a.localeCompare(b, 'en'));
    queueItems.push({ priority: 'P3', code: 'EXACT_DUPLICATE', groupId, assetCount: paths.length, repositoryPaths: paths });
  }

  const unreferencedByRoot = new Map();
  for (const record of classified.filter((item) => item.primaryClass === 'UNREFERENCED')) {
    if (!unreferencedByRoot.has(record.root)) unreferencedByRoot.set(record.root, []);
    unreferencedByRoot.get(record.root).push(record.repositoryPath);
  }
  for (const [root, paths] of [...unreferencedByRoot.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    paths.sort((a, b) => a.localeCompare(b, 'en'));
    queueItems.push({
      priority: 'P4',
      code: 'UNREFERENCED',
      root,
      assetCount: paths.length,
      representativePaths: paths.slice(0, 12),
      repositoryPathsOmitted: Math.max(0, paths.length - 12),
    });
  }

  const unknownOther = classified.filter((item) => item.primaryClass === 'PROVENANCE_UNKNOWN' && !item.traits.currentFrontendReference);
  if (unknownOther.length) {
    queueItems.push({
      priority: 'P2', code: 'PROVENANCE_UNKNOWN_OTHER', assetCount: unknownOther.length,
      representativePaths: unknownOther.slice(0, 20).map((item) => item.repositoryPath),
      repositoryPathsOmitted: Math.max(0, unknownOther.length - 20),
    });
  }

  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  queueItems.sort((a, b) => (priorityRank[a.priority] - priorityRank[b.priority]) || a.code.localeCompare(b.code, 'en') || String(a.root ?? a.groupId ?? '').localeCompare(String(b.root ?? b.groupId ?? ''), 'en'));

  const canonicalGroups = new Map();
  const pathEntries = [];
  const includedClasses = new Set(contract.verifiedEvidenceIndex.includePrimaryClasses);
  const sourceByPath = new Map(referenceMap.records.map((record) => [record.repositoryPath, record]));
  for (const record of classified) {
    if (!includedClasses.has(record.primaryClass)) continue;
    const source = sourceByPath.get(record.repositoryPath);
    const canonicalKeys = [];
    for (const reference of source.references) {
      if (reference.canonicalKey && typeof reference.canonicalKey === 'object') {
        canonicalKeys.push(reference.canonicalKey);
      }
    }
    const uniqueCanonical = new Map(canonicalKeys.map((key) => [canonicalKeyId(key), key]));
    const asset = {
      repositoryPath: record.repositoryPath,
      sha256: record.sha256,
      primaryClass: record.primaryClass,
      referenceKinds: record.referenceKinds,
      activeProduction: record.traits.activeProduction,
      explicitDerivative: record.traits.explicitDerivative,
    };
    if (uniqueCanonical.size === 0) {
      pathEntries.push({
        lookupKey: `path:${record.repositoryPath}`,
        identityMode: 'REPOSITORY_PATH_ONLY',
        canonicalKey: null,
        ...asset,
        verification: 'VERIFIED_PROJECT_EVIDENCE',
      });
      continue;
    }
    for (const [keyId, key] of uniqueCanonical.entries()) {
      if (!canonicalGroups.has(keyId)) canonicalGroups.set(keyId, { canonicalKey: key, assets: [] });
      canonicalGroups.get(keyId).assets.push(asset);
    }
  }

  const canonicalEntries = [...canonicalGroups.entries()].map(([keyId, entry]) => ({
    lookupKey: `canonical:${keyId}`,
    identityMode: 'CANONICAL_KEY',
    canonicalKey: entry.canonicalKey,
    assets: entry.assets.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en')),
    verification: 'VERIFIED_PROJECT_EVIDENCE',
  })).sort((a, b) => a.lookupKey.localeCompare(b.lookupKey, 'en'));
  pathEntries.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey, 'en'));

  const classification = {
    version: 1,
    schemaId: 'asset-hygiene-classification/v1',
    stage: 'ASSET_HYGIENE_3',
    status: 'PASS_WITH_REVIEW',
    completion: 'COMPLETE',
    predecessor: PATHS.referenceMap,
    recordCount: classified.length,
    records: classified,
  };

  const reviewQueue = {
    version: 1,
    schemaId: 'asset-hygiene-review-queue/v1',
    stage: 'ASSET_HYGIENE_3',
    status: 'REVIEW_REQUIRED_NON_BLOCKING',
    itemCount: queueItems.length,
    items: queueItems,
  };

  const verifiedEvidenceIndex = {
    version: 1,
    schemaId: 'asset-hygiene-verified-evidence-index/v1',
    stage: 'ASSET_HYGIENE_3',
    status: 'FROZEN_READ_ONLY_INDEX',
    productionAdoption: false,
    canonicalIdentityPolicy: contract.verifiedEvidenceIndex.canonicalIdentityPolicy,
    pathFallbackPolicy: contract.verifiedEvidenceIndex.pathFallbackPolicy,
    canonicalEntryCount: canonicalEntries.length,
    pathEntryCount: pathEntries.length,
    canonicalEntries,
    pathEntries,
  };

  const primaryClassCounts = countBy(classified, (record) => record.primaryClass);
  const flagCountsRaw = {};
  for (const flag of contract.flags) flagCountsRaw[flag] = 0;
  for (const record of classified) for (const flag of record.flags) flagCountsRaw[flag] += 1;
  const flagCounts = Object.fromEntries(Object.entries(flagCountsRaw).sort(([a], [b]) => a.localeCompare(b, 'en')));
  const reviewQueueCounts = countBy(queueItems, (item) => `${item.priority}_${item.code}`);
  const unclassifiedRecordCount = classified.filter((record) => !record.primaryClass).length;
  const hardErrorCount = unclassifiedRecordCount;
  const verifiedAssetMembership = canonicalEntries.reduce((sum, entry) => sum + entry.assets.length, 0) + pathEntries.length;

  const reviews = [];
  for (const [primaryClass, count] of Object.entries(primaryClassCounts)) {
    if (primaryClass === 'UNREFERENCED' || primaryClass === 'PROVENANCE_UNKNOWN') reviews.push({ code: `${primaryClass}_PRESENT`, count });
  }
  if (flagCounts.EXACT_DUPLICATE) reviews.push({ code: 'EXACT_DUPLICATE_CANDIDATES_PRESENT', count: flagCounts.EXACT_DUPLICATE });
  if (flagCounts.BASENAME_COLLISION) reviews.push({ code: 'BASENAME_COLLISION_CANDIDATES_PRESENT', count: flagCounts.BASENAME_COLLISION });

  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage3-classification-summary/v1',
    stage: 'ASSET_HYGIENE_3',
    status: hardErrorCount === 0 ? 'PASS_WITH_REVIEW' : 'BLOCKED',
    completion: hardErrorCount === 0 ? 'COMPLETE' : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? 'ASSET_HYGIENE_BASELINE_FROZEN' : 'NOT_FROZEN',
    predecessors: contract.predecessors,
    coverage: {
      inputRecordCount: referenceMap.records.length,
      classifiedRecordCount: classified.length,
      unclassifiedRecordCount,
      classificationCoveragePercent: referenceMap.records.length ? Number(((classified.length / referenceMap.records.length) * 100).toFixed(2)) : 0,
    },
    primaryClassCounts,
    flagCounts,
    traitCounts: {
      activeProduction: classified.filter((item) => item.traits.activeProduction).length,
      explicitDerivative: classified.filter((item) => item.traits.explicitDerivative).length,
      currentFrontendReference: classified.filter((item) => item.traits.currentFrontendReference).length,
      verifiedEvidence: classified.filter((item) => item.traits.verifiedEvidence).length,
    },
    reviewQueueCounts,
    verifiedEvidenceIndex: {
      canonicalEntryCount: canonicalEntries.length,
      pathEntryCount: pathEntries.length,
      assetMembershipCount: verifiedAssetMembership,
      productionAdoption: false,
    },
    reviews,
    blockers: hardErrorCount ? [{ code: 'UNCLASSIFIED_RECORDS_PRESENT', count: unclassifiedRecordCount }] : [],
    hardErrorCount,
    forbiddenOperationCounts: {
      assetMutation: 0,
      frontendMutation: 0,
      externalFetch: 0,
      rawConfigDataRead: 0,
      semanticRecomputation: 0,
      consumerRewrite: 0,
    },
    stopAfterStage3: true,
    nextStartPoint: 'STOP_AH3_FROZEN__AH4_SEPARATE_WORK',
  };

  const checkpoint = checkpointMarkdown(summary);

  if (write) {
    const outputs = [
      [PATHS.classification, stable(classification)],
      [PATHS.reviewQueue, stable(reviewQueue)],
      [PATHS.verifiedEvidenceIndex, stable(verifiedEvidenceIndex)],
      [PATHS.summary, stable(summary)],
      [PATHS.checkpoint, checkpoint],
    ];
    for (const [repositoryPath, content] of outputs) {
      await mkdir(path.dirname(path.join(REPO_ROOT, repositoryPath)), { recursive: true });
      await writeFile(path.join(REPO_ROOT, repositoryPath), content);
    }
  }

  return { classification, reviewQueue, verifiedEvidenceIndex, summary, checkpoint };
}
