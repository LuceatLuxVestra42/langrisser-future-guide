import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage5-banner-duplicate-review.v1.json',
  stage5CandidateReview: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-candidate-review.v1.json',
  stage5ScopeSummary: 'data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json',
  stage2ReferenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  bannerStage1ReferenceCensus: 'data/investigation/banner-stage1-6-asset-reference-census.v1.json',
  bannerStage3AssetRelations: 'data/generated/banner-stage3-1-asset-relations.v1.json',
  review: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-banner-duplicate-review.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage5-banner-duplicate-review-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage5-banner-duplicate-review.md',
};

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function gitLogForPath(repositoryPath) {
  const text = execFileSync('git', [
    'log', '--follow', '--format=%H%x09%s', '--', repositoryPath,
  ], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  if (!text) return [];
  return text.split('\n').map((line) => {
    const tab = line.indexOf('\t');
    return { commit: line.slice(0, tab), message: line.slice(tab + 1) };
  });
}

function checkpointMarkdown(summary, review) {
  const [a, b] = review.members;
  return `# Asset Hygiene Stage 5-1 — Banner Exact Duplicate Review\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. 대상\n\n- \`${a.repositoryPath}\`\n- \`${b.repositoryPath}\`\n- SHA-256: \`${review.sha256}\`\n\nAH-5-0에서 확정된 유일한 exact-byte duplicate group만 검토했다.\n\n## 2. 확정 사실\n\n- 두 파일의 SHA-256은 동일하다.\n- 두 파일 모두 AH-2 current reference count가 0이다.\n- 두 파일 모두 AH-3/AH-5-0에서 \`UNREFERENCED / REVIEW_CANDIDATE_UNREFERENCED\`다.\n- 두 파일의 path history는 각각 한 건이며 같은 \`${review.importEvidence.commit}\` / \`${review.importEvidence.message}\` commit에서 함께 도입됐다.\n- current Banner Stage 3-1 resolved relation에는 두 path 모두 없다.\n\n## 3. 확정되지 않은 것\n\n- semantic identity\n- Banner role equivalence\n- canonical asset ownership equivalence\n- 한 파일이 다른 파일의 successor/superseded target이라는 관계\n- 삭제 안전성\n\n같은 bytes와 같은 import batch는 위 관계를 증명하지 않는다.\n\n## 4. Banner authoritative boundary\n\nBanner Stage 1-6은 occurrence display asset reference가 canonical asset ownership 증거가 아니며, 동일 asset reference만으로 source/recurrence identity를 역추론하지 말라고 고정한다. Banner Stage 3-1도 canonical asset owner를 결정하지 않고 asset이 banner definition을 병합할 수 없도록 고정한다.\n\n따라서 filename의 \`OptionalWish\` / \`ReturnWish\` 문구를 역할 증거로 사용하지 않았다.\n\n## 5. 판정\n\n\`\`\`text\nexact byte duplicate: true\ncurrent reference absence: true\nsame import batch: true\nsemantic identity proven: false\nrole equivalence proven: false\nowner equivalence proven: false\ndelete eligible: false\ndelete approved: false\ndecision: ${review.decision}\n\`\`\`\n\n이 판정은 REVIEW이며 BLOCKER가 아니다. 파일은 현재 상태 그대로 유지한다.\n\n## 6. 다시 열리는 조건\n\n- 두 filename/role을 동일 logical asset으로 명시하는 authoritative manifest/source 발견\n- explicit canonical owner/successor decision 추가\n- current Banner relation/reference 변경\n- owner가 한 path를 canonical retained target으로 명시\n\n## 7. 다음 시작점\n\n\`${summary.nextStartPoint}\`\n\n431개 Banner unreferenced population을 이 duplicate fixture와 분리해 검토한다. 이 단계 결과로 두 파일 중 하나를 삭제하거나 431개 population 전체에 dedup 규칙을 확대하지 않는다.\n`;
}

export async function buildStage5BannerDuplicateReview({ write = false } = {}) {
  const [contract, candidateReview, scopeSummary, referenceMap, stage1Census, stage3Relations] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.stage5CandidateReview),
    json(PATHS.stage5ScopeSummary),
    json(PATHS.stage2ReferenceMap),
    json(PATHS.bannerStage1ReferenceCensus),
    json(PATHS.bannerStage3AssetRelations),
  ]);

  if (
    scopeSummary.status !== 'PASS_WITH_REVIEW' ||
    scopeSummary.completion !== 'COMPLETE' ||
    scopeSummary.freezeState !== 'ASSET_HYGIENE_STAGE5_DESTRUCTIVE_SCOPE_FROZEN' ||
    scopeSummary.coverage.deleteApprovedCount !== 0 ||
    scopeSummary.hardErrorCount !== 0
  ) throw new Error('AH-5-1 requires frozen AH-5-0 with zero delete approvals and zero hard errors');

  const group = candidateReview.exactDuplicateGroups.find((item) => item.groupId === contract.target.groupId);
  if (!group) throw new Error('target exact duplicate group missing from AH-5-0');
  if (group.assetCount !== 2 || group.deleteApproved !== false || group.deleteEligible !== false) {
    throw new Error('target exact duplicate group changed from frozen AH-5-0 boundary');
  }

  const targetPaths = [...contract.target.repositoryPaths].sort((a, b) => a.localeCompare(b, 'en'));
  const groupPaths = group.members.map((member) => member.repositoryPath).sort((a, b) => a.localeCompare(b, 'en'));
  if (JSON.stringify(targetPaths) !== JSON.stringify(groupPaths)) throw new Error('target duplicate path population mismatch');

  const refsByPath = new Map(referenceMap.records.map((record) => [record.repositoryPath, record]));
  const resolvedBannerPaths = new Set(stage3Relations.assets.flatMap((asset) => asset.repositoryPaths));
  const blockers = [];
  const members = [];
  let commonIntroductionCommit = null;
  let commonIntroductionMessage = null;

  for (const member of group.members) {
    if (member.sha256 !== contract.target.sha256) blockers.push({ code: 'DUPLICATE_SHA_CHANGED', repositoryPath: member.repositoryPath });
    const refRecord = refsByPath.get(member.repositoryPath);
    if (!refRecord) blockers.push({ code: 'REFERENCE_MAP_RECORD_MISSING', repositoryPath: member.repositoryPath });
    if (refRecord && refRecord.references.length !== 0) blockers.push({ code: 'CURRENT_REFERENCE_APPEARED', repositoryPath: member.repositoryPath, count: refRecord.references.length });
    if (resolvedBannerPaths.has(member.repositoryPath)) blockers.push({ code: 'CURRENT_BANNER_RELATION_APPEARED', repositoryPath: member.repositoryPath });

    const history = gitLogForPath(member.repositoryPath);
    if (history.length !== 1) blockers.push({ code: 'PATH_HISTORY_COUNT_CHANGED', repositoryPath: member.repositoryPath, count: history.length });
    const introduction = history[history.length - 1] ?? null;
    if (!introduction || introduction.commit !== contract.target.expectedIntroductionCommit || introduction.message !== contract.target.expectedIntroductionMessage) {
      blockers.push({ code: 'INTRODUCTION_HISTORY_CHANGED', repositoryPath: member.repositoryPath, introduction });
    }
    if (commonIntroductionCommit === null && introduction) {
      commonIntroductionCommit = introduction.commit;
      commonIntroductionMessage = introduction.message;
    } else if (introduction && (commonIntroductionCommit !== introduction.commit || commonIntroductionMessage !== introduction.message)) {
      blockers.push({ code: 'INTRODUCTION_BATCH_DIVERGED', repositoryPath: member.repositoryPath });
    }

    members.push({
      repositoryPath: member.repositoryPath,
      sha256: member.sha256,
      primaryClass: member.primaryClass,
      destructiveState: member.state,
      currentReferenceCount: refRecord?.references.length ?? null,
      currentReferenceKinds: refRecord?.referenceKinds ?? [],
      currentBannerResolvedRelation: resolvedBannerPaths.has(member.repositoryPath),
      gitPathHistory: history,
    });
  }
  members.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const stage1OwnershipDeferred = stage1Census.coreDecision?.canonicalAssetOwnershipDecided === false;
  const stage1ReverseReuseForbidden = typeof stage1Census.reuseDecision?.importantLimit === 'string';
  const stage3OwnerDeferred = stage3Relations.policy?.canonicalAssetOwner === false;
  const stage3MergeForbidden = stage3Relations.policy?.assetMayMergeBannerDefinitions === false;
  if (!stage1OwnershipDeferred || !stage1ReverseReuseForbidden || !stage3OwnerDeferred || !stage3MergeForbidden) {
    blockers.push({
      code: 'BANNER_IDENTITY_BOUNDARY_CHANGED',
      stage1OwnershipDeferred,
      stage1ReverseReuseForbidden,
      stage3OwnerDeferred,
      stage3MergeForbidden,
    });
  }

  const semanticIdentityProven = false;
  const roleEquivalenceProven = false;
  const ownerEquivalenceProven = false;
  const deleteEligible = false;
  const deleteApproved = false;
  const decision = contract.decisionPolicy.safeDefaultWithoutSuchEvidence;

  const review = {
    version: 1,
    schemaId: 'asset-hygiene-stage5-banner-duplicate-review/v1',
    stage: 'ASSET_HYGIENE_5_1',
    status: blockers.length ? 'BLOCKED' : 'REVIEW_FROZEN_NO_DELETE_APPROVAL',
    groupId: group.groupId,
    sha256: contract.target.sha256,
    members,
    evidence: {
      exactByteEquality: true,
      allCurrentReferencesAbsent: members.every((member) => member.currentReferenceCount === 0),
      allCurrentBannerResolvedRelationsAbsent: members.every((member) => member.currentBannerResolvedRelation === false),
      sameIntroductionCommit: commonIntroductionCommit === contract.target.expectedIntroductionCommit,
      sameIntroductionMessage: commonIntroductionMessage === contract.target.expectedIntroductionMessage,
      bannerStage1CanonicalAssetOwnershipDeferred: stage1OwnershipDeferred,
      bannerStage1ReverseAssetReuseInferenceForbidden: stage1ReverseReuseForbidden,
      bannerStage3CanonicalAssetOwnerFalse: stage3OwnerDeferred,
      bannerStage3AssetMayMergeBannerDefinitionsFalse: stage3MergeForbidden,
    },
    importEvidence: {
      commit: commonIntroductionCommit,
      message: commonIntroductionMessage,
      meaning: 'COMMON_INGEST_BATCH_ONLY_NOT_ROLE_IDENTITY',
    },
    semanticIdentityProven,
    roleEquivalenceProven,
    ownerEquivalenceProven,
    deleteEligible,
    deleteApproved,
    decision,
    reviewRequired: true,
    reviewIsBlocking: false,
    reopenConditions: [
      'AUTHORITATIVE_ROLE_EQUIVALENCE_EVIDENCE_APPEARS',
      'EXPLICIT_CANONICAL_OWNER_OR_SUCCESSOR_DECISION_APPEARS',
      'CURRENT_BANNER_RELATION_OR_REFERENCE_CHANGES',
      'OWNER_SELECTS_ONE_CANONICAL_RETAINED_PATH',
    ],
  };

  const hardErrorCount = blockers.length;
  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage5-banner-duplicate-review-summary/v1',
    stage: 'ASSET_HYGIENE_5_1',
    status: hardErrorCount === 0 ? contract.finalState.status : 'BLOCKED',
    completion: hardErrorCount === 0 ? contract.finalState.completion : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? contract.finalState.freezeState : 'NOT_FROZEN',
    targetGroupCount: 1,
    targetAssetCount: members.length,
    exactByteEquality: true,
    currentReferenceCount: members.reduce((sum, member) => sum + (member.currentReferenceCount ?? 0), 0),
    currentBannerResolvedRelationCount: members.filter((member) => member.currentBannerResolvedRelation).length,
    sameImportBatch: review.evidence.sameIntroductionCommit && review.evidence.sameIntroductionMessage,
    semanticIdentityProven,
    roleEquivalenceProven,
    ownerEquivalenceProven,
    deleteEligible,
    deleteApproved,
    decision,
    reviews: [{ code: 'BANNER_DUPLICATE_ROLE_OR_OWNER_EQUIVALENCE_NOT_PROVEN', count: 1, blocking: false }],
    blockers,
    hardErrorCount,
    forbiddenOperationCounts: {
      assetDelete: 0,
      assetMove: 0,
      assetRename: 0,
      consumerRewrite: 0,
      resolverRewrite: 0,
      semanticRelationRecomputation: 0,
      filenameRoleInference: 0,
      byteEqualityToSemanticIdentityInference: 0,
      sameImportBatchToRoleEquivalenceInference: 0,
      unreferencedToUnusedInference: 0,
    },
    nextStartPoint: hardErrorCount === 0 ? contract.finalState.nextStartPoint : 'ASSET_HYGIENE_5_1_REVIEW_REPAIR',
  };

  const checkpoint = checkpointMarkdown(summary, review);
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
