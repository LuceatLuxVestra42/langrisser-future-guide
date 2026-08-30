import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage5-banner-unreferenced-review.v1.json',
  stage5CandidateReview: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-candidate-review.v1.json',
  stage5ScopeSummary: 'data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json',
  stage5DuplicateReview: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-banner-duplicate-review.v1.json',
  stage5DuplicateSummary: 'data/validation/asset-intake-hygiene-stage5-banner-duplicate-review-summary.v1.json',
  stage2ReferenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  bannerStage3AssetRelations: 'data/generated/banner-stage3-1-asset-relations.v1.json',
  review: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-banner-unreferenced-review.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage5-banner-unreferenced-review-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage5-banner-unreferenced-review.md',
};

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = String(keyFn(value));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function physicalFamily(repositoryPath) {
  if (repositoryPath.startsWith('public/images/banners/Banner/')) return 'Banner';
  if (repositoryPath.startsWith('public/images/banners/Picture_Notice/')) return 'Picture_Notice';
  return 'OUTSIDE_APPROVED_BANNER_ROOT';
}

function gitHistoryByPath() {
  const output = execFileSync('git', [
    'log',
    '--format=__COMMIT__%H%x09%s',
    '--name-status',
    '--',
    'public/images/banners/Banner',
    'public/images/banners/Picture_Notice',
  ], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

  const byPath = new Map();
  let currentCommit = null;
  let currentMessage = null;
  const add = (repositoryPath, event) => {
    if (!repositoryPath?.startsWith('public/images/banners/')) return;
    if (!byPath.has(repositoryPath)) byPath.set(repositoryPath, []);
    byPath.get(repositoryPath).push(event);
  };

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith('__COMMIT__')) {
      const payload = line.slice('__COMMIT__'.length);
      const tab = payload.indexOf('\t');
      currentCommit = tab >= 0 ? payload.slice(0, tab) : payload;
      currentMessage = tab >= 0 ? payload.slice(tab + 1) : '';
      continue;
    }
    if (!currentCommit) continue;
    const fields = line.split('\t');
    const status = fields[0];
    if (!status) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = fields[1];
      const newPath = fields[2];
      add(oldPath, { commit: currentCommit, message: currentMessage, status, pathRole: 'OLD_PATH', otherPath: newPath ?? null });
      add(newPath, { commit: currentCommit, message: currentMessage, status, pathRole: 'NEW_PATH', otherPath: oldPath ?? null });
    } else {
      const repositoryPath = fields[1];
      add(repositoryPath, { commit: currentCommit, message: currentMessage, status, pathRole: 'CURRENT_PATH', otherPath: null });
    }
  }
  return byPath;
}

function currentPathIntroduction(events) {
  const chronological = [...events].reverse();
  return chronological.find((event) => event.status === 'A' || ((event.status.startsWith('R') || event.status.startsWith('C')) && event.pathRole === 'NEW_PATH')) ?? chronological[0] ?? null;
}

function postIntroductionHistory(events, introduction) {
  if (!introduction) return [];
  const index = events.indexOf(introduction);
  if (index <= 0) return [];
  return events.slice(0, index);
}

function checkpointMarkdown(summary) {
  const familyLines = Object.entries(summary.targetPhysicalFamilyCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const batchLines = summary.introductionBatches.map((item) => `- \`${item.commit}\` — ${item.assetCount} files — ${item.message}`).join('\n');
  return `# Asset Hygiene Stage 5-2 — Banner Unreferenced Review\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- AH-5-0 destructive scope: \`${PATHS.stage5ScopeSummary}\`\n- AH-5-1 Banner duplicate review: \`${PATHS.stage5DuplicateSummary}\`\n- AH-5-0 Banner unreferenced population: 431\n\nAH-5-0/5-1 결과를 재사용했고 asset bytes, Banner semantic identity, canonical ownership을 다시 만들지 않았다.\n\n## 2. target coverage\n\n\`\`\`text\ntarget Banner unreferenced: ${summary.targetAssetCount}\nreviewed: ${summary.reviewedAssetCount}\ncurrent reference edges: ${summary.currentReferenceCount}\ncurrent Banner resolved relations: ${summary.currentBannerResolvedRelationCount}\npath history coverage: ${summary.pathHistoryCoverageCount}/${summary.targetAssetCount}\nintroduction evidence coverage: ${summary.introductionEvidenceCoverageCount}/${summary.targetAssetCount}\npost-introduction changed paths: ${summary.postIntroductionChangedAssetCount}\n\`\`\`\n\nPhysical family only:\n${familyLines}\n\n## 3. current Banner census parity\n\n\`\`\`text\nphysical Banner assets: ${summary.bannerCurrentBoundary.physicalAssetCount}\ncurrent resolved unique paths: ${summary.bannerCurrentBoundary.currentResolvedUniquePathCount}\nunreferenced review paths: ${summary.targetAssetCount}\nresolved + unreferenced: ${summary.bannerCurrentBoundary.currentResolvedUniquePathCount + summary.targetAssetCount}\n\`\`\`\n\n501 = 70 + 431 parity를 검증했다. 이 수치는 current reference coverage이며 unused/delete 의미가 아니다.\n\n## 4. Git path provenance\n\n현재 path의 Git history와 introduction batch를 전수 기록했다. introduction commit은 path provenance일 뿐 Banner role, canonical owner, recurrence/source identity 근거로 사용하지 않는다.\n\n${batchLines || '- 없음'}\n\n431개 모두 같은 최초 import batch에 속한다. 그중 ${summary.postIntroductionChangedAssetCount}개는 이후 path-level Git 변경 이력이 추가로 있으며 해당 post-introduction history를 개별 record에 보존했다. 이 변경 이력도 semantic role, owner equivalence, supersession, delete safety로 해석하지 않는다.\n\n## 5. decisions\n\n\`\`\`text\nexact duplicate predecessor members: ${summary.decisionCounts.RETAIN_PENDING_ROLE_OR_OWNER_EQUIVALENCE_EVIDENCE ?? 0}\nother unreferenced retain-review: ${summary.decisionCounts.RETAIN_REVIEW_ONLY_UNREFERENCED ?? 0}\ndelete eligible: ${summary.deleteEligibleCount}\ndelete approved: ${summary.deleteApprovedCount}\n\`\`\`\n\nAH-5-1 duplicate 2개는 기존 retain 판정을 그대로 상속했다. 나머지 path도 reference 부재만으로 unused/delete로 승격하지 않았다.\n\n## 6. REVIEW / BLOCKER\n\nREVIEW:\n- \`BANNER_UNREFERENCED_RETAINS_REVIEW_ONLY\`: ${summary.targetAssetCount}\n- \`BANNER_PATH_CHANGED_AFTER_INTRODUCTION_REVIEW_ONLY\`: ${summary.postIntroductionChangedAssetCount}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\`${item.repositoryPath ? ` — ${item.repositoryPath}` : ''}`).join('\n') : '- 없음'}\n\n## 7. 하지 않은 것\n\n\`\`\`text\nasset delete / move / rename\nformat conversion\nfrontend / consumer / resolver rewrite\nsemantic relation recomputation\ncanonical relation recomputation\nfilename role inference\nimport batch role/owner inference\npost-introduction Git change -> semantic role inference\nunreferenced -> unused inference\nreference absence -> delete safety inference\n\`\`\`\n\n## 8. 다음 시작점\n\n\`${summary.nextStartPoint}\`\n\nBanner 431개 review는 여기서 frozen한다. 다음 작업은 AH-5-0에 남은 non-Banner unreferenced 26개만 별도 domain review로 다룬다.\n\n## 9. 다시 열리는 조건\n\n- current Banner resolved relation/reference population 변경\n- explicit Banner asset owner/successor/supersession evidence 추가\n- repository Banner asset population 변경\n- AH-5-1 duplicate decision 변경\n- frozen path provenance baseline 변경 또는 contradiction 발견\n`;
}

export async function buildStage5BannerUnreferencedReview({ write = false } = {}) {
  const [contract, candidateReview, scopeSummary, duplicateReview, duplicateSummary, referenceMap, bannerRelations] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.stage5CandidateReview),
    json(PATHS.stage5ScopeSummary),
    json(PATHS.stage5DuplicateReview),
    json(PATHS.stage5DuplicateSummary),
    json(PATHS.stage2ReferenceMap),
    json(PATHS.bannerStage3AssetRelations),
  ]);

  const blockers = [];

  if (
    scopeSummary.status !== contract.predecessors.stage5ScopeFreeze.status ||
    scopeSummary.completion !== contract.predecessors.stage5ScopeFreeze.completion ||
    scopeSummary.freezeState !== contract.predecessors.stage5ScopeFreeze.freezeState ||
    scopeSummary.coverage?.deleteApprovedCount !== 0 ||
    scopeSummary.hardErrorCount !== 0
  ) blockers.push({ code: 'AH5_0_PREDECESSOR_CHANGED' });

  if (
    duplicateSummary.status !== contract.predecessors.stage5BannerDuplicateReview.status ||
    duplicateSummary.completion !== contract.predecessors.stage5BannerDuplicateReview.completion ||
    duplicateSummary.freezeState !== contract.predecessors.stage5BannerDuplicateReview.freezeState ||
    duplicateSummary.deleteApproved !== contract.predecessors.stage5BannerDuplicateReview.deleteApproved ||
    duplicateSummary.hardErrorCount !== 0
  ) blockers.push({ code: 'AH5_1_PREDECESSOR_CHANGED' });

  const targetGroup = candidateReview.unreferencedGroups.find((item) => item.root === contract.target.root);
  if (!targetGroup) throw new Error('AH-5-2 target Banner unreferenced group missing from AH-5-0');
  const targetPaths = [...targetGroup.repositoryPaths].sort((a, b) => a.localeCompare(b, 'en'));
  if (targetGroup.assetCount !== contract.target.expectedAssetCount || targetPaths.length !== contract.target.expectedAssetCount) {
    blockers.push({ code: 'BANNER_UNREFERENCED_POPULATION_CHANGED', actual: targetPaths.length, expected: contract.target.expectedAssetCount });
  }

  const physicalCount = bannerRelations.repositoryCensus?.totalFileCount;
  const currentResolvedUniquePathCount = bannerRelations.referenceCensus?.uniqueResolvedPathCount;
  const boundary = contract.bannerCurrentBoundary;
  if (physicalCount !== boundary.expectedPhysicalAssetCount) blockers.push({ code: 'BANNER_PHYSICAL_CENSUS_CHANGED', actual: physicalCount, expected: boundary.expectedPhysicalAssetCount });
  if (currentResolvedUniquePathCount !== boundary.expectedCurrentResolvedUniquePathCount) blockers.push({ code: 'BANNER_CURRENT_RESOLVED_POPULATION_CHANGED', actual: currentResolvedUniquePathCount, expected: boundary.expectedCurrentResolvedUniquePathCount });
  if (bannerRelations.policy?.canonicalAssetOwner !== boundary.canonicalAssetOwner) blockers.push({ code: 'BANNER_CANONICAL_OWNER_POLICY_CHANGED' });
  if (bannerRelations.policy?.assetMayMergeBannerDefinitions !== boundary.assetMayMergeBannerDefinitions) blockers.push({ code: 'BANNER_ASSET_MERGE_POLICY_CHANGED' });
  if (bannerRelations.policy?.crossRootFallbackAllowed !== boundary.crossRootFallbackAllowed) blockers.push({ code: 'BANNER_CROSS_ROOT_POLICY_CHANGED' });
  if (bannerRelations.policy?.filenameSimilarityAllowed !== boundary.filenameSimilarityAllowed) blockers.push({ code: 'BANNER_FILENAME_SIMILARITY_POLICY_CHANGED' });
  if (bannerRelations.policy?.perceptualImageEquivalence !== boundary.perceptualImageEquivalence) blockers.push({ code: 'BANNER_PERCEPTUAL_POLICY_CHANGED' });

  const resolvedPaths = new Set(bannerRelations.assets.flatMap((asset) => asset.repositoryPaths));
  if (resolvedPaths.size !== currentResolvedUniquePathCount) blockers.push({ code: 'BANNER_RESOLVED_PATH_SET_COUNT_MISMATCH', actual: resolvedPaths.size, expected: currentResolvedUniquePathCount });
  const targetSet = new Set(targetPaths);
  const overlap = targetPaths.filter((repositoryPath) => resolvedPaths.has(repositoryPath));
  if (overlap.length) blockers.push({ code: 'BANNER_UNREFERENCED_OVERLAPS_CURRENT_RELATION', count: overlap.length });
  if (resolvedPaths.size + targetSet.size !== physicalCount) blockers.push({ code: 'BANNER_501_PARTITION_PARITY_FAIL', resolved: resolvedPaths.size, unreferenced: targetSet.size, physical: physicalCount });

  const refsByPath = new Map(referenceMap.records.map((record) => [record.repositoryPath, record]));
  const historyByPath = gitHistoryByPath();
  const duplicateMembers = new Set(duplicateReview.members.map((member) => member.repositoryPath));
  if (duplicateReview.decision !== contract.reviewPolicy.duplicatePredecessorDecision || duplicateReview.deleteApproved !== false) {
    blockers.push({ code: 'AH5_1_DUPLICATE_DECISION_CHANGED' });
  }
  for (const duplicatePath of duplicateMembers) {
    if (!targetSet.has(duplicatePath)) blockers.push({ code: 'AH5_1_DUPLICATE_MEMBER_LEFT_TARGET_POPULATION', repositoryPath: duplicatePath });
  }

  const records = [];
  for (const repositoryPath of targetPaths) {
    const family = physicalFamily(repositoryPath);
    if (!contract.target.physicalFamilies.includes(family)) blockers.push({ code: 'BANNER_TARGET_OUTSIDE_APPROVED_PHYSICAL_FAMILY', repositoryPath, family });

    const refRecord = refsByPath.get(repositoryPath);
    if (!refRecord) {
      blockers.push({ code: 'REFERENCE_MAP_RECORD_MISSING', repositoryPath });
      continue;
    }
    const referenceCount = refRecord.references?.length ?? 0;
    if (referenceCount !== 0) blockers.push({ code: 'CURRENT_REFERENCE_APPEARED', repositoryPath, count: referenceCount });
    if (resolvedPaths.has(repositoryPath)) blockers.push({ code: 'CURRENT_BANNER_RELATION_APPEARED', repositoryPath });

    const history = historyByPath.get(repositoryPath) ?? [];
    if (history.length === 0) blockers.push({ code: 'GIT_PATH_HISTORY_MISSING', repositoryPath });
    const introduction = currentPathIntroduction(history);
    if (!introduction) blockers.push({ code: 'CURRENT_PATH_INTRODUCTION_EVIDENCE_MISSING', repositoryPath });
    const laterHistory = postIntroductionHistory(history, introduction);

    const isDuplicatePredecessorMember = duplicateMembers.has(repositoryPath);
    const decision = isDuplicatePredecessorMember
      ? contract.reviewPolicy.duplicatePredecessorDecision
      : contract.reviewPolicy.defaultSingletonDecision;

    records.push({
      repositoryPath,
      physicalFamily: family,
      sha256: refRecord.sha256,
      primaryClass: 'UNREFERENCED',
      currentReferenceCount: referenceCount,
      currentReferenceKinds: refRecord.referenceKinds ?? [],
      currentBannerResolvedRelation: false,
      gitPathHistoryCount: history.length,
      currentPathIntroduction: introduction,
      postIntroductionChangeCount: laterHistory.length,
      postIntroductionHistory: laterHistory,
      introductionMeaning: contract.reviewPolicy.introductionBatchMeaning,
      exactDuplicatePredecessorMember: isDuplicatePredecessorMember,
      decision,
      reviewRequired: true,
      reviewIsBlocking: false,
      deleteEligible: false,
      deleteApproved: false,
    });
  }
  records.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const introductionBatches = Object.entries(countBy(records.filter((record) => record.currentPathIntroduction), (record) => record.currentPathIntroduction.commit))
    .map(([commit, assetCount]) => {
      const first = records.find((record) => record.currentPathIntroduction?.commit === commit);
      return { commit, message: first?.currentPathIntroduction?.message ?? '', assetCount };
    })
    .sort((a, b) => a.commit.localeCompare(b.commit, 'en'));

  const targetPhysicalFamilyCounts = countBy(records, (record) => record.physicalFamily);
  const resolvedPhysicalFamilyCounts = countBy([...resolvedPaths], (repositoryPath) => physicalFamily(repositoryPath));
  const decisionCounts = countBy(records, (record) => record.decision);
  const pathHistoryCoverageCount = records.filter((record) => record.gitPathHistoryCount > 0).length;
  const introductionEvidenceCoverageCount = records.filter((record) => record.currentPathIntroduction).length;
  const postIntroductionChangedAssetCount = records.filter((record) => record.postIntroductionChangeCount > 0).length;

  const provenanceBaseline = contract.pathProvenanceBaseline;
  if (pathHistoryCoverageCount !== provenanceBaseline.expectedPathHistoryCoverageCount) blockers.push({ code: 'PATH_HISTORY_COVERAGE_CHANGED', actual: pathHistoryCoverageCount, expected: provenanceBaseline.expectedPathHistoryCoverageCount });
  if (introductionEvidenceCoverageCount !== provenanceBaseline.expectedIntroductionEvidenceCoverageCount) blockers.push({ code: 'INTRODUCTION_EVIDENCE_COVERAGE_CHANGED', actual: introductionEvidenceCoverageCount, expected: provenanceBaseline.expectedIntroductionEvidenceCoverageCount });
  if (introductionBatches.length !== provenanceBaseline.expectedIntroductionBatchCount) blockers.push({ code: 'INTRODUCTION_BATCH_COUNT_CHANGED', actual: introductionBatches.length, expected: provenanceBaseline.expectedIntroductionBatchCount });
  const expectedBatch = introductionBatches.find((item) => item.commit === provenanceBaseline.expectedIntroductionCommit);
  if (!expectedBatch || expectedBatch.message !== provenanceBaseline.expectedIntroductionMessage || expectedBatch.assetCount !== provenanceBaseline.expectedIntroductionAssetCount) {
    blockers.push({ code: 'INTRODUCTION_BATCH_BASELINE_CHANGED', actual: expectedBatch ?? null });
  }
  if (postIntroductionChangedAssetCount !== provenanceBaseline.expectedPostIntroductionChangedAssetCount) {
    blockers.push({ code: 'POST_INTRODUCTION_HISTORY_POPULATION_CHANGED', actual: postIntroductionChangedAssetCount, expected: provenanceBaseline.expectedPostIntroductionChangedAssetCount });
  }

  const hardErrorCount = blockers.length;
  const review = {
    version: 1,
    schemaId: 'asset-hygiene-stage5-banner-unreferenced-review/v1',
    stage: 'ASSET_HYGIENE_5_2',
    status: hardErrorCount === 0 ? 'REVIEW_FROZEN_NO_DELETE_APPROVAL' : 'BLOCKED',
    targetRoot: contract.target.root,
    recordCount: records.length,
    records,
    currentBannerBoundary: {
      physicalAssetCount: physicalCount,
      currentResolvedUniquePathCount,
      currentResolvedPhysicalFamilyCounts: resolvedPhysicalFamilyCounts,
      partitionParity: resolvedPaths.size + targetSet.size === physicalCount,
    },
    provenanceSummary: {
      pathHistoryCoverageCount,
      introductionEvidenceCoverageCount,
      postIntroductionChangedAssetCount,
      introductionBatchCount: introductionBatches.length,
      introductionBatches,
      meaning: provenanceBaseline.meaning,
    },
    decisionCounts,
    deleteEligibleCount: 0,
    deleteApprovedCount: 0,
  };

  const reviews = [
    { code: 'BANNER_UNREFERENCED_RETAINS_REVIEW_ONLY', count: records.length, blocking: false },
  ];
  if (postIntroductionChangedAssetCount > 0) {
    reviews.push({ code: 'BANNER_PATH_CHANGED_AFTER_INTRODUCTION_REVIEW_ONLY', count: postIntroductionChangedAssetCount, blocking: false });
  }

  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage5-banner-unreferenced-review-summary/v1',
    stage: 'ASSET_HYGIENE_5_2',
    status: hardErrorCount === 0 ? contract.finalState.status : 'BLOCKED',
    completion: hardErrorCount === 0 ? contract.finalState.completion : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? contract.finalState.freezeState : 'NOT_FROZEN',
    targetAssetCount: targetPaths.length,
    reviewedAssetCount: records.length,
    targetPhysicalFamilyCounts,
    currentReferenceCount: records.reduce((sum, record) => sum + record.currentReferenceCount, 0),
    currentBannerResolvedRelationCount: records.filter((record) => record.currentBannerResolvedRelation).length,
    bannerCurrentBoundary: {
      physicalAssetCount: physicalCount,
      currentResolvedUniquePathCount,
      currentResolvedPhysicalFamilyCounts: resolvedPhysicalFamilyCounts,
      resolvedPlusUnreferencedCount: resolvedPaths.size + targetSet.size,
      partitionParity: resolvedPaths.size + targetSet.size === physicalCount,
    },
    pathHistoryCoverageCount,
    introductionEvidenceCoverageCount,
    postIntroductionChangedAssetCount,
    introductionBatchCount: introductionBatches.length,
    introductionBatches,
    decisionCounts,
    deleteEligibleCount: 0,
    deleteApprovedCount: 0,
    reviews,
    blockers,
    hardErrorCount,
    forbiddenOperationCounts: {
      assetDelete: 0,
      assetMove: 0,
      assetRename: 0,
      formatConversion: 0,
      frontendMutation: 0,
      consumerRewrite: 0,
      resolverRewrite: 0,
      semanticRelationRecomputation: 0,
      canonicalRelationRecomputation: 0,
      filenameRoleInference: 0,
      filenameCanonicalIdentityInference: 0,
      importBatchRoleInference: 0,
      importBatchOwnerInference: 0,
      postIntroductionGitChangeSemanticRoleInference: 0,
      byteEqualitySemanticIdentityInference: 0,
      unreferencedToUnusedInference: 0,
      referenceAbsenceDeleteSafetyInference: 0,
      pathPatternSupersessionInference: 0,
    },
    nextStartPoint: hardErrorCount === 0 ? contract.finalState.nextStartPoint : 'ASSET_HYGIENE_5_2_REVIEW_REPAIR',
  };

  const checkpoint = checkpointMarkdown(summary);
  if (write) {
    for (const [repositoryPath, content] of [
      [PATHS.review, stable(review)],
      [PATHS.summary, stable(summary)],
      [PATHS.checkpoint, checkpoint],
    ]) {
      await mkdir(path.dirname(path.join(REPO_ROOT, repositoryPath)), { recursive: true });
      await writeFile(path.join(REPO_ROOT, repositoryPath), content);
    }
  }

  return { review, summary, checkpoint };
}
