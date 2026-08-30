import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage5-scope-freeze.v1.json',
  stage4Admission: 'tools/asset-intake/hygiene/generated/asset-hygiene-production-admission-index.v1.json',
  stage4Quarantine: 'tools/asset-intake/hygiene/generated/asset-hygiene-production-quarantine-index.v1.json',
  stage4Summary: 'data/validation/asset-intake-hygiene-stage4-production-admission-summary.v1.json',
  classification: 'tools/asset-intake/hygiene/generated/asset-hygiene-classification.v1.json',
  reviewQueue: 'tools/asset-intake/hygiene/generated/asset-hygiene-review-queue.v1.json',
  referenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  scope: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-destructive-scope.v1.json',
  candidateReview: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-candidate-review.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage5-scope-freeze.md',
};

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function countBy(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function destructiveState(record) {
  if (record.traits.activeProduction === true || record.traits.currentFrontendReference === true) {
    return {
      state: 'PROTECTED_CURRENT_USE',
      reasonCode: record.traits.activeProduction === true
        ? 'CURRENT_ACTIVE_PRODUCTION_REFERENCE'
        : 'CURRENT_FRONTEND_STATIC_REFERENCE',
    };
  }
  if (record.primaryClass === 'EVIDENCE_ONLY' || record.primaryClass === 'GENERATED_DERIVATIVE') {
    return {
      state: 'PROTECTED_EVIDENCE_RETENTION',
      reasonCode: record.primaryClass === 'EVIDENCE_ONLY'
        ? 'VERIFIED_EVIDENCE_RETENTION_REQUIRED'
        : 'DERIVATIVE_LINEAGE_RETENTION_REQUIRED',
    };
  }
  if (record.primaryClass === 'UNREFERENCED') {
    return {
      state: 'REVIEW_CANDIDATE_UNREFERENCED',
      reasonCode: 'NO_CURRENT_AH2_REFERENCE_EDGE_REVIEW_ONLY',
    };
  }
  return {
    state: 'UNASSIGNED_REQUIRES_CONTRACT_REVIEW',
    reasonCode: `UNHANDLED_PRIMARY_CLASS_${record.primaryClass}`,
  };
}

function checkpointMarkdown(summary, duplicateReview) {
  const duplicateText = duplicateReview.length
    ? duplicateReview.map((group, index) => [
        `${index + 1}. \`${group.groupId}\``,
        `   - members: ${group.assetCount}`,
        `   - allUnreferenced: ${group.allUnreferenced}`,
        `   - semanticIdentityProven: ${group.semanticIdentityProven}`,
        `   - deleteApproved: ${group.deleteApproved}`,
      ].join('\n')).join('\n')
    : '- 없음';
  return `# Asset Hygiene Stage 5-0 — Destructive Scope Freeze\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- AH-4 admission: \`${PATHS.stage4Admission}\`\n- AH-4 quarantine: \`${PATHS.stage4Quarantine}\`\n- AH-4 summary: \`${PATHS.stage4Summary}\`\n- AH-3 classification: \`${PATHS.classification}\`\n- AH-2 reference map: \`${PATHS.referenceMap}\`\n\nAH-4까지 완료된 production admission/quarantine을 다시 열지 않고 destructive review 경계만 추가했다.\n\n## 2. 전체 population 보호/검토 분리\n\n\`\`\`text\nrecords                         ${summary.coverage.recordCount}\nprotected current use           ${summary.coverage.protectedCurrentUseCount}\nprotected evidence retention    ${summary.coverage.protectedEvidenceRetentionCount}\nunreferenced review candidates  ${summary.coverage.unreferencedReviewCandidateCount}\nunassigned                      ${summary.coverage.unassignedCount}\ndelete approved                 ${summary.coverage.deleteApprovedCount}\n\`\`\`\n\n\`UNREFERENCED\`는 이 단계에서도 UNUSED/DELETE_ELIGIBLE/DELETE_APPROVED로 승격하지 않는다.\n\n## 3. current-use protection\n\n다음 중 하나라도 참이면 destructive action 금지다.\n\n- AH-3 \`activeProduction=true\`\n- AH-3 \`currentFrontendReference=true\`\n\n따라서 AH-4 canonical admission 780, path-only current production 443, current frontend provenance review 17을 포함한 현재 사용 자산은 보호 상태를 유지한다.\n\n## 4. evidence retention protection\n\n현재 사용이 아니더라도 \`EVIDENCE_ONLY\` / \`GENERATED_DERIVATIVE\`는 explicit successor 또는 retention 결정을 별도로 증명하기 전까지 삭제 후보가 아니다.\n\n## 5. exact duplicate review\n\n${duplicateText}\n\nexact-byte duplicate는 byte equality만 증명한다. semantic role/owner equivalence를 증명하지 않으므로 이 단계에서 삭제 승인하지 않는다.\n\n## 6. unreferenced review roots\n\n${Object.entries(summary.unreferencedByRoot).map(([root, count]) => `- \`${root}\`: ${count}`).join('\n')}\n\n이 목록은 후속 AH-5-1+ 조사 순서를 정하는 queue이며 삭제 명령이 아니다.\n\n## 7. REVIEW / BLOCKER\n\nREVIEW:\n${summary.reviews.length ? summary.reviews.map((item, index) => `${index + 1}. \`${item.code}\` — ${item.count}`).join('\n') : '- 없음'}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\` — ${item.count ?? 1}`).join('\n') : '- 없음'}\n\n## 8. 하지 않은 것\n\n\`\`\`text\ndelete approval\nasset delete / move / rename\nformat conversion\nfrontend / consumer / resolver rewrite\nsemantic or canonical relation recomputation\nname JOIN / ID arithmetic / filename role inference\nduplicate bytes -> semantic identity inference\nunreferenced -> unused inference\n\`\`\`\n\n## 9. 다음 시작점\n\n\`${summary.nextStartPoint}\`\n\n먼저 유일한 exact-byte duplicate Banner 2개를 별도 대표 fixture로 검토한다. 삭제는 그 검토 결과가 explicit proof를 만들기 전까지 금지한다.\n\n## 10. 다시 열리는 조건\n\n- AH-4 admission/quarantine 변경\n- AH-3 classification 또는 AH-2 reference graph 변경\n- current frontend/resolver reference 변경\n- destructive decision contract 변경\n\n## 11. 최종 판정\n\n\`\`\`text\n${summary.status}\n${summary.completion}\n${summary.freezeState}\ncoverage: ${summary.coverage.assignedCount}/${summary.coverage.recordCount}\ndelete approved: ${summary.coverage.deleteApprovedCount}\nhard error: ${summary.hardErrorCount}\nblocker: ${summary.blockers.length}\nnext: ${summary.nextStartPoint}\n\`\`\`\n`;
}

export async function buildStage5ScopeFreeze({ write = false } = {}) {
  const [contract, stage4Admission, stage4Quarantine, stage4Summary, classification, reviewQueue, referenceMap] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.stage4Admission),
    json(PATHS.stage4Quarantine),
    json(PATHS.stage4Summary),
    json(PATHS.classification),
    json(PATHS.reviewQueue),
    json(PATHS.referenceMap),
  ]);

  if (
    stage4Summary.status !== 'PASS_WITH_REVIEW' ||
    stage4Summary.completion !== 'COMPLETE' ||
    stage4Summary.freezeState !== 'ASSET_HYGIENE_STAGE4_PRODUCTION_ADMISSION_FROZEN' ||
    stage4Summary.hardErrorCount !== 0 ||
    stage4Summary.blockers.length !== 0
  ) throw new Error('AH-5-0 requires frozen PASS_WITH_REVIEW/COMPLETE AH-4 with zero blockers');

  if (
    classification.recordCount !== contract.population.expectedRecordCount ||
    classification.records.length !== contract.population.expectedRecordCount ||
    referenceMap.recordCount !== contract.population.expectedRecordCount ||
    stage4Summary.coverage.assignedAssetCount !== contract.population.expectedRecordCount
  ) throw new Error('AH-5-0 predecessor population mismatch');

  if (
    stage4Admission.productionAdoption !== true ||
    stage4Quarantine.existingProductionConsumerRevocation !== false
  ) throw new Error('AH-5-0 requires AH-4 admission active while preserving existing production consumers');

  const refsByPath = new Map(referenceMap.records.map((record) => [record.repositoryPath, record.references]));
  const scopeRecords = [];
  const blockers = [];

  for (const record of classification.records) {
    const decision = destructiveState(record);
    if (decision.state === 'UNASSIGNED_REQUIRES_CONTRACT_REVIEW') {
      blockers.push({ code: 'UNASSIGNED_DESTRUCTIVE_STATE', repositoryPath: record.repositoryPath, primaryClass: record.primaryClass });
    }
    const riskFlags = record.flags.filter((flag) => ['RESOLVER_COLLISION', 'UNVERIFIED_EXTERNAL'].includes(flag));
    if (riskFlags.length) blockers.push({ code: 'DESTRUCTIVE_RISK_FLAG_PRESENT', repositoryPath: record.repositoryPath, flags: riskFlags });
    scopeRecords.push({
      repositoryPath: record.repositoryPath,
      sha256: record.sha256,
      primaryClass: record.primaryClass,
      flags: record.flags,
      traits: record.traits,
      referenceCount: record.referenceCount,
      referenceKinds: record.referenceKinds,
      exactDuplicateGroup: record.exactDuplicateGroup,
      state: decision.state,
      reasonCode: decision.reasonCode,
      deleteEligible: false,
      deleteApproved: false,
    });
  }
  scopeRecords.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const duplicateGroups = new Map();
  for (const record of scopeRecords) {
    if (!record.exactDuplicateGroup) continue;
    if (!duplicateGroups.has(record.exactDuplicateGroup)) duplicateGroups.set(record.exactDuplicateGroup, []);
    duplicateGroups.get(record.exactDuplicateGroup).push(record);
  }

  const exactDuplicateReviews = [...duplicateGroups.entries()].map(([groupId, members]) => {
    const sorted = [...members].sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));
    return {
      groupId,
      assetCount: sorted.length,
      allUnreferenced: sorted.every((record) => record.primaryClass === 'UNREFERENCED' && record.referenceCount === 0),
      semanticIdentityProven: false,
      roleEquivalenceProven: false,
      ownerEquivalenceProven: false,
      deleteEligible: false,
      deleteApproved: false,
      nextAction: 'MANUAL_SEMANTIC_ROLE_OWNER_REVIEW',
      members: sorted.map((record) => ({
        repositoryPath: record.repositoryPath,
        sha256: record.sha256,
        primaryClass: record.primaryClass,
        state: record.state,
        referenceCount: record.referenceCount,
        referenceKinds: record.referenceKinds,
        references: refsByPath.get(record.repositoryPath) ?? [],
      })),
    };
  }).sort((a, b) => a.groupId.localeCompare(b.groupId, 'en'));

  if (exactDuplicateReviews.length !== contract.population.expectedExactDuplicateGroupCount) {
    blockers.push({ code: 'EXACT_DUPLICATE_GROUP_COUNT_MISMATCH', count: exactDuplicateReviews.length });
  }

  const unreferenced = scopeRecords.filter((record) => record.state === 'REVIEW_CANDIDATE_UNREFERENCED');
  if (unreferenced.length !== contract.population.expectedUnreferencedCount) {
    blockers.push({ code: 'UNREFERENCED_REVIEW_COUNT_MISMATCH', count: unreferenced.length });
  }

  const unreferencedGroups = new Map();
  for (const record of unreferenced) {
    const root = record.repositoryPath.startsWith('public/images/banners/') ? 'public/images/banners/'
      : record.repositoryPath.startsWith('public/images/heroes/') ? 'public/images/heroes/'
      : record.repositoryPath.startsWith('public/images/shared/') ? 'public/images/shared/'
      : record.repositoryPath.startsWith('src/') ? 'src/'
      : record.repositoryPath.startsWith('tools/') ? 'tools/'
      : record.repositoryPath.startsWith('public/') ? 'public/'
      : '<other>';
    if (!unreferencedGroups.has(root)) unreferencedGroups.set(root, []);
    unreferencedGroups.get(root).push(record.repositoryPath);
  }
  const unreferencedByRoot = Object.fromEntries([...unreferencedGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([root, paths]) => [root, paths.length]));

  const candidateReview = {
    version: 1,
    schemaId: 'asset-hygiene-stage5-candidate-review/v1',
    stage: 'ASSET_HYGIENE_5_0',
    status: blockers.length ? 'BLOCKED' : 'REVIEW_SCOPE_FROZEN_NO_DELETE_APPROVAL',
    exactDuplicateGroupCount: exactDuplicateReviews.length,
    exactDuplicateGroups: exactDuplicateReviews,
    unreferencedAssetCount: unreferenced.length,
    unreferencedGroups: [...unreferencedGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([root, paths]) => ({
        root,
        assetCount: paths.length,
        repositoryPaths: [...paths].sort((a, b) => a.localeCompare(b, 'en')),
        deleteEligible: false,
        deleteApproved: false,
        nextAction: root === 'public/images/banners/'
          ? 'BANNER_REFERENCE_AND_ROLE_REVIEW'
          : 'DOMAIN_OWNER_AND_REFERENCE_REVIEW',
      })),
    deleteEligibleCount: 0,
    deleteApprovedCount: 0,
  };

  const stateCounts = countBy(scopeRecords, (record) => record.state);
  const assignedCount = scopeRecords.filter((record) => record.state !== 'UNASSIGNED_REQUIRES_CONTRACT_REVIEW').length;
  const deleteApprovedCount = scopeRecords.filter((record) => record.deleteApproved === true).length;
  const reviews = [
    { code: 'EXACT_DUPLICATE_REQUIRES_SEMANTIC_ROLE_OWNER_REVIEW', count: exactDuplicateReviews.length },
    { code: 'UNREFERENCED_REQUIRES_DOMAIN_REVIEW', count: unreferenced.length },
  ];

  const hardErrorCount = blockers.length;
  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage5-scope-freeze-summary/v1',
    stage: 'ASSET_HYGIENE_5_0',
    status: hardErrorCount === 0 ? contract.finalState.status : 'BLOCKED',
    completion: hardErrorCount === 0 ? contract.finalState.completion : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? contract.finalState.freezeState : 'NOT_FROZEN',
    predecessors: contract.predecessors,
    coverage: {
      recordCount: scopeRecords.length,
      assignedCount,
      protectedCurrentUseCount: stateCounts.PROTECTED_CURRENT_USE ?? 0,
      protectedEvidenceRetentionCount: stateCounts.PROTECTED_EVIDENCE_RETENTION ?? 0,
      unreferencedReviewCandidateCount: stateCounts.REVIEW_CANDIDATE_UNREFERENCED ?? 0,
      unassignedCount: stateCounts.UNASSIGNED_REQUIRES_CONTRACT_REVIEW ?? 0,
      deleteEligibleCount: 0,
      deleteApprovedCount,
    },
    exactDuplicateReview: {
      groupCount: exactDuplicateReviews.length,
      assetCount: exactDuplicateReviews.reduce((sum, group) => sum + group.assetCount, 0),
      allUnreferencedGroupCount: exactDuplicateReviews.filter((group) => group.allUnreferenced).length,
      semanticIdentityProvenCount: 0,
      deleteApprovedGroupCount: 0,
    },
    unreferencedByRoot,
    reviews,
    blockers,
    hardErrorCount,
    forbiddenOperationCounts: {
      deleteApproval: 0,
      assetDelete: 0,
      assetMove: 0,
      assetRename: 0,
      formatConversion: 0,
      frontendMutation: 0,
      consumerRewrite: 0,
      resolverRewrite: 0,
      semanticRecomputation: 0,
      canonicalRelationRecomputation: 0,
      duplicateBytesToSemanticIdentityInference: 0,
      unreferencedToUnusedInference: 0,
    },
    nextStartPoint: hardErrorCount === 0 ? contract.finalState.nextStartPoint : 'ASSET_HYGIENE_5_0_SCOPE_REPAIR',
  };

  const scope = {
    version: 1,
    schemaId: 'asset-hygiene-stage5-destructive-scope/v1',
    stage: 'ASSET_HYGIENE_5_0',
    status: hardErrorCount === 0 ? 'DESTRUCTIVE_SCOPE_FROZEN_NO_ACTION' : 'BLOCKED',
    recordCount: scopeRecords.length,
    records: scopeRecords,
  };
  const checkpoint = checkpointMarkdown(summary, exactDuplicateReviews);

  if (write) {
    const outputs = [
      [PATHS.scope, stable(scope)],
      [PATHS.candidateReview, stable(candidateReview)],
      [PATHS.summary, stable(summary)],
      [PATHS.checkpoint, checkpoint],
    ];
    for (const [repositoryPath, content] of outputs) {
      await mkdir(path.dirname(path.join(REPO_ROOT, repositoryPath)), { recursive: true });
      await writeFile(path.join(REPO_ROOT, repositoryPath), content);
    }
  }

  return { scope, candidateReview, summary, checkpoint };
}
