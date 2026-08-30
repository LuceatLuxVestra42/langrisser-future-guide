import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage5-non-banner-unreferenced-review.v1.json',
  stage5CandidateReview: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-candidate-review.v1.json',
  stage5ScopeSummary: 'data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json',
  stage5BannerSummary: 'data/validation/asset-intake-hygiene-stage5-banner-unreferenced-review-summary.v1.json',
  stage2ReferenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  movementContract: 'data/contracts/hero-soldier-movement-type-presentation.v1.json',
  movementIndex: 'data/generated/shared-movement-type-index.v1.json',
  spineRendererProgram: 'tools/spine-renderer/Program.cs',
  review: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage5-non-banner-unreferenced-review.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage5-non-banner-unreferenced-review-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage5-non-banner-unreferenced-review.md',
};

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));

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

function gitHistoryForPath(repositoryPath) {
  const output = execFileSync('git', [
    'log', '--follow', '--format=%H%x09%s', '--', repositoryPath,
  ], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  if (!output) return [];
  return output.split('\n').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    return {
      commit: tab >= 0 ? line.slice(0, tab) : line,
      message: tab >= 0 ? line.slice(tab + 1) : '',
    };
  });
}

function physicalSubscope(repositoryPath) {
  if (repositoryPath === 'public/favicon.ico') return 'PUBLIC_ROOT';
  if (repositoryPath.startsWith('public/images/heroes/portrait-samples/')) return 'HERO_PORTRAIT_SAMPLES_ROOT';
  if (repositoryPath.startsWith('public/images/shared/movement/')) return 'SHARED_MOVEMENT_ROOT';
  if (repositoryPath.startsWith('public/images/shared/stats/')) return 'SHARED_STATS_ROOT';
  if (repositoryPath.startsWith('src/assets/')) return 'SRC_ASSETS_ROOT';
  if (repositoryPath === 'tools/spine-renderer/input/Ymir_Skin01.png') return 'SPINE_RENDERER_INPUT_ROOT';
  return 'OUTSIDE_FROZEN_NON_BANNER_SCOPE';
}

function sameStemFrontendSiblings(repositoryPath, referenceRecords) {
  if (!repositoryPath.startsWith('src/assets/')) return [];
  const parsed = path.posix.parse(repositoryPath);
  return referenceRecords
    .filter((record) => {
      if (record.repositoryPath === repositoryPath) return false;
      const other = path.posix.parse(record.repositoryPath);
      if (other.dir !== parsed.dir || other.name !== parsed.name) return false;
      return (record.references ?? []).some((reference) => reference.kind === 'FRONTEND_REF');
    })
    .map((record) => record.repositoryPath)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function checkpointMarkdown(summary) {
  const groups = Object.entries(summary.targetRootCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const subscopes = Object.entries(summary.physicalSubscopeCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const decisions = Object.entries(summary.decisionCounts).map(([key, count]) => `- \`${key}\`: ${count}`).join('\n');
  const batches = summary.introductionBatches.map((item) => `- \`${item.commit}\` — ${item.assetCount} files — ${item.message}`).join('\n');
  return `# Asset Hygiene Stage 5-3 — Non-Banner Unreferenced Review\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- AH-5-0 destructive scope: \`${PATHS.stage5ScopeSummary}\`\n- AH-5-2 Banner review: \`${PATHS.stage5BannerSummary}\`\n- AH-2 reference map: \`${PATHS.stage2ReferenceMap}\`\n- movement presentation contract/index: \`${PATHS.movementContract}\`, \`${PATHS.movementIndex}\`\n- Spine renderer exact input owner: \`${PATHS.spineRendererProgram}\`\n\nBanner 431개는 다시 열지 않았고 AH-5-0에 남은 non-Banner 26개만 검토했다.\n\n## 2. target coverage\n\n\`\`\`text\ntarget non-Banner unreferenced: ${summary.targetAssetCount}\nreviewed: ${summary.reviewedAssetCount}\ncurrent AH-2 reference edges: ${summary.currentReferenceCount}\nGit path history coverage: ${summary.pathHistoryCoverageCount}/${summary.targetAssetCount}\n\`\`\`\n\nFrozen AH-5-0 roots:\n${groups}\n\nPhysical subscopes:\n${subscopes}\n\n## 3. current evidence found\n\n\`\`\`text\nexact current tooling input: ${summary.evidenceCounts.currentToolExactRequiredInput}\nmovement source-identifier filename matches: ${summary.evidenceCounts.movementContractIdentifierMatch}\nsrc same-stem current frontend siblings: ${summary.evidenceCounts.sameStemCurrentFrontendSibling}\npost-introduction Git change paths: ${summary.postIntroductionChangedAssetCount}\n\`\`\`\n\n- \`tools/spine-renderer/input/Ymir_Skin01.png\`는 current Program.cs가 exact filename으로 RequireFile 하는 tooling input이라 삭제 대상에서 보호했다.\n- movement PNG 5개는 frozen movement contract/index의 source asset identifier filename과 일치한다. 다만 contract가 실제 extracted PNG delivery/web path를 별도 asset integration으로 남기므로 repository path binding은 확정하지 않았다.\n- src PNG와 same-stem frontend sibling이 존재해도 extension 차이만으로 successor/superseded/equivalent를 추론하지 않았다.\n\n## 4. Git provenance\n\n26개 전부 path history를 기록했다. Git history는 path provenance만 제공하며 semantic role, canonical owner, deletion safety를 만들지 않는다.\n\n${batches || '- 없음'}\n\n## 5. decisions\n\n${decisions}\n\n\`UNREFERENCED\`는 UNUSED가 아니다. current tooling exact use가 확인된 1개는 보호했고, movement 5개는 asset delivery binding이 명시적으로 별도 단계이므로 retain-pending으로 남겼다. 나머지는 review-only retain이다.\n\n## 6. Stage 5 review closure\n\n\`\`\`text\nAH-5-0 unreferenced population: ${summary.stage5ReviewClosure.totalUnreferencedPopulation}\nAH-5-2 Banner reviewed: ${summary.stage5ReviewClosure.bannerReviewed}\nAH-5-3 non-Banner reviewed: ${summary.stage5ReviewClosure.nonBannerReviewed}\ntotal reviewed: ${summary.stage5ReviewClosure.totalReviewed}\ndelete eligible: ${summary.deleteEligibleCount}\ndelete approved: ${summary.deleteApprovedCount}\n\`\`\`\n\n## 7. REVIEW / BLOCKER\n\nREVIEW:\n${summary.reviews.length ? summary.reviews.map((item) => `- \`${item.code}\`: ${item.count}`).join('\n') : '- 없음'}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\`${item.repositoryPath ? ` — ${item.repositoryPath}` : ''}`).join('\n') : '- 없음'}\n\n## 8. 하지 않은 것\n\n\`\`\`text\nasset delete / move / rename\nformat conversion\nfrontend / consumer / resolver rewrite\nsemantic / canonical relation recomputation\nUNREFERENCED -> UNUSED inference\nsame-stem / extension -> superseded inference\nmovement filename -> verified repository delivery binding inference\nHero sample filename -> Hero identity inference\nstat icon filename -> runtime binding inference\nGit history -> deletion safety inference\n\`\`\`\n\n## 9. 다음 시작점\n\n\`${summary.nextStartPoint}\`\n\nAH-5 review population 457개는 모두 domain review가 끝났고 destructive approval은 0이다. 새로운 authoritative owner/successor/delete-safety evidence가 없으면 여기서 STOP한다.\n\n## 10. 다시 열리는 조건\n\n- AH-5 frozen unreferenced population 변경\n- current exact tooling requirement 변경\n- movement PNG delivery/resolver binding이 authoritative하게 확정됨\n- explicit owner/successor/supersession/delete-safety evidence 추가\n- repository asset population 또는 AH-2 current-reference boundary 변경\n`;
}

export async function buildStage5NonBannerUnreferencedReview({ write = false } = {}) {
  const [contract, candidateReview, scopeSummary, bannerSummary, referenceMap, movementContract, movementIndex, spineProgram] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.stage5CandidateReview),
    json(PATHS.stage5ScopeSummary),
    json(PATHS.stage5BannerSummary),
    json(PATHS.stage2ReferenceMap),
    json(PATHS.movementContract),
    json(PATHS.movementIndex),
    readFile(path.join(REPO_ROOT, PATHS.spineRendererProgram), 'utf8'),
  ]);

  const blockers = [];
  if (
    scopeSummary.status !== contract.predecessors.stage5ScopeFreeze.status ||
    scopeSummary.completion !== contract.predecessors.stage5ScopeFreeze.completion ||
    scopeSummary.freezeState !== contract.predecessors.stage5ScopeFreeze.freezeState ||
    scopeSummary.coverage?.unreferencedReviewCandidateCount !== 457 ||
    scopeSummary.coverage?.deleteApprovedCount !== 0 ||
    scopeSummary.hardErrorCount !== 0
  ) blockers.push({ code: 'AH5_0_PREDECESSOR_CHANGED' });

  if (
    bannerSummary.status !== contract.predecessors.stage5BannerUnreferencedReview.status ||
    bannerSummary.completion !== contract.predecessors.stage5BannerUnreferencedReview.completion ||
    bannerSummary.freezeState !== contract.predecessors.stage5BannerUnreferencedReview.freezeState ||
    bannerSummary.targetAssetCount !== contract.predecessors.stage5BannerUnreferencedReview.targetAssetCount ||
    bannerSummary.deleteApprovedCount !== 0 ||
    bannerSummary.hardErrorCount !== 0
  ) blockers.push({ code: 'AH5_2_PREDECESSOR_CHANGED' });

  const targetGroups = [];
  for (const expected of contract.target.groups) {
    const group = candidateReview.unreferencedGroups.find((item) => item.root === expected.root);
    if (!group) {
      blockers.push({ code: 'TARGET_ROOT_GROUP_MISSING', root: expected.root });
      continue;
    }
    if (group.assetCount !== expected.expectedAssetCount || group.repositoryPaths.length !== expected.expectedAssetCount) {
      blockers.push({ code: 'TARGET_ROOT_COUNT_CHANGED', root: expected.root, actual: group.repositoryPaths.length, expected: expected.expectedAssetCount });
    }
    targetGroups.push(group);
  }
  const targetPaths = uniqueSorted(targetGroups.flatMap((group) => group.repositoryPaths));
  if (targetPaths.length !== contract.target.expectedAssetCount) blockers.push({ code: 'NON_BANNER_TARGET_POPULATION_CHANGED', actual: targetPaths.length, expected: contract.target.expectedAssetCount });
  if (targetPaths.some((repositoryPath) => repositoryPath.startsWith('public/images/banners/'))) blockers.push({ code: 'BANNER_PATH_LEAKED_INTO_AH5_3' });

  const refsByPath = new Map(referenceMap.records.map((record) => [record.repositoryPath, record]));
  const movementContractNames = uniqueSorted(movementContract.definitions.map((item) => item.iconFileName));
  const movementIndexNames = uniqueSorted(movementIndex.definitions.map((item) => item.iconFileName));
  if (JSON.stringify(movementContractNames) !== JSON.stringify(movementIndexNames) || movementContractNames.length !== 5) {
    blockers.push({ code: 'MOVEMENT_IDENTIFIER_SOURCE_DIVERGED', contractCount: movementContractNames.length, indexCount: movementIndexNames.length });
  }
  const movementDeliverySeparated = movementContract.runtimeConsumption?.iconRule?.includes('separate frontend/asset integration step') === true;
  if (!movementDeliverySeparated) blockers.push({ code: 'MOVEMENT_ASSET_DELIVERY_BOUNDARY_CHANGED' });

  const toolTarget = contract.evidenceBoundaries.spineRequiredInputPath;
  const toolExactLiteral = spineProgram.includes('Path.Combine(inputDir, "Ymir_Skin01.png")');
  const toolRequiresTexture = spineProgram.includes('RequireFile(texturePath)');
  const toolExactRequiredInput = toolExactLiteral && toolRequiresTexture;
  if (!targetPaths.includes(toolTarget)) blockers.push({ code: 'SPINE_TOOL_TARGET_LEFT_FROZEN_POPULATION' });
  if (!toolExactRequiredInput) blockers.push({ code: 'SPINE_TOOL_EXACT_INPUT_EVIDENCE_CHANGED' });

  const records = [];
  for (const repositoryPath of targetPaths) {
    const refRecord = refsByPath.get(repositoryPath);
    if (!refRecord) {
      blockers.push({ code: 'REFERENCE_MAP_RECORD_MISSING', repositoryPath });
      continue;
    }
    const references = refRecord.references ?? [];
    if (references.length !== 0) blockers.push({ code: 'CURRENT_REFERENCE_APPEARED', repositoryPath, count: references.length });

    const subscope = physicalSubscope(repositoryPath);
    if (subscope === 'OUTSIDE_FROZEN_NON_BANNER_SCOPE') blockers.push({ code: 'TARGET_OUTSIDE_EXPECTED_PHYSICAL_SUBSCOPE', repositoryPath });

    const history = gitHistoryForPath(repositoryPath);
    if (history.length === 0) blockers.push({ code: 'GIT_PATH_HISTORY_MISSING', repositoryPath });
    const introduction = history.at(-1) ?? null;
    const postIntroductionHistory = history.length > 1 ? history.slice(0, -1) : [];

    const movementIdentifierMatch = subscope === 'SHARED_MOVEMENT_ROOT' && movementContractNames.includes(path.posix.basename(repositoryPath));
    if (subscope === 'SHARED_MOVEMENT_ROOT' && !movementIdentifierMatch) blockers.push({ code: 'MOVEMENT_FILE_IDENTIFIER_NOT_IN_CURRENT_CONTRACT', repositoryPath });
    const sameStemSiblings = sameStemFrontendSiblings(repositoryPath, referenceMap.records);
    const exactToolInput = repositoryPath === toolTarget && toolExactRequiredInput;

    let decision = contract.reviewPolicy.defaultDecision;
    if (exactToolInput) decision = contract.reviewPolicy.toolExactRequiredInputDecision;
    else if (movementIdentifierMatch) decision = contract.reviewPolicy.movementIdentifierMatchDecision;

    records.push({
      repositoryPath,
      frozenRoot: targetGroups.find((group) => group.repositoryPaths.includes(repositoryPath))?.root ?? null,
      physicalSubscope: subscope,
      sha256: refRecord.sha256,
      primaryClass: 'UNREFERENCED',
      currentReferenceCount: references.length,
      currentReferenceKinds: uniqueSorted(references.map((reference) => reference.kind)),
      evidence: {
        currentToolExactRequiredInput: exactToolInput,
        movementContractIdentifierMatch: movementIdentifierMatch,
        movementRepositoryDeliveryBindingProven: false,
        sameStemCurrentFrontendSiblings: sameStemSiblings,
        sameStemSiblingMeaning: sameStemSiblings.length ? contract.reviewPolicy.sameStemFrontendSiblingMeaning : null,
      },
      gitPathHistoryCount: history.length,
      currentPathIntroduction: introduction,
      postIntroductionChangeCount: postIntroductionHistory.length,
      postIntroductionHistory,
      gitHistoryMeaning: contract.reviewPolicy.gitHistoryMeaning,
      decision,
      reviewRequired: decision !== contract.reviewPolicy.toolExactRequiredInputDecision,
      reviewIsBlocking: false,
      deleteEligible: false,
      deleteApproved: false,
    });
  }
  records.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const actualSubscopeCounts = countBy(records, (record) => record.physicalSubscope);
  for (const [subscope, expected] of Object.entries(contract.target.physicalSubscopes)) {
    if ((actualSubscopeCounts[subscope] ?? 0) !== expected) blockers.push({ code: 'PHYSICAL_SUBSCOPE_COUNT_CHANGED', subscope, actual: actualSubscopeCounts[subscope] ?? 0, expected });
  }

  const introductionBatchMap = new Map();
  for (const record of records) {
    const intro = record.currentPathIntroduction;
    if (!intro) continue;
    if (!introductionBatchMap.has(intro.commit)) introductionBatchMap.set(intro.commit, { commit: intro.commit, message: intro.message, assetCount: 0 });
    introductionBatchMap.get(intro.commit).assetCount += 1;
  }
  const introductionBatches = [...introductionBatchMap.values()].sort((a, b) => a.commit.localeCompare(b.commit, 'en'));

  const decisionCounts = countBy(records, (record) => record.decision);
  const sameStemCount = records.filter((record) => record.evidence.sameStemCurrentFrontendSiblings.length > 0).length;
  const movementMatchCount = records.filter((record) => record.evidence.movementContractIdentifierMatch).length;
  const toolInputCount = records.filter((record) => record.evidence.currentToolExactRequiredInput).length;
  const defaultReviewCount = decisionCounts[contract.reviewPolicy.defaultDecision] ?? 0;
  const postIntroductionChangedAssetCount = records.filter((record) => record.postIntroductionChangeCount > 0).length;

  if (movementMatchCount !== 5) blockers.push({ code: 'MOVEMENT_IDENTIFIER_MATCH_COUNT_CHANGED', actual: movementMatchCount, expected: 5 });
  if (toolInputCount !== 1) blockers.push({ code: 'CURRENT_TOOL_INPUT_PROTECTION_COUNT_CHANGED', actual: toolInputCount, expected: 1 });
  if (records.some((record) => record.deleteEligible || record.deleteApproved)) blockers.push({ code: 'DESTRUCTIVE_APPROVAL_DETECTED' });

  const hardErrorCount = blockers.length;
  const reviews = [
    { code: 'NON_BANNER_RETAIN_REVIEW_ONLY', count: defaultReviewCount, blocking: false },
    { code: 'MOVEMENT_ASSET_DELIVERY_BINDING_PENDING', count: movementMatchCount, blocking: false },
  ];
  if (sameStemCount) reviews.push({ code: 'SRC_SAME_STEM_FRONTEND_SIBLING_NOT_SUPERSESSION', count: sameStemCount, blocking: false });
  if (postIntroductionChangedAssetCount) reviews.push({ code: 'NON_BANNER_PATH_CHANGED_AFTER_INTRODUCTION_REVIEW_ONLY', count: postIntroductionChangedAssetCount, blocking: false });

  const review = {
    version: 1,
    schemaId: 'asset-hygiene-stage5-non-banner-unreferenced-review/v1',
    stage: 'ASSET_HYGIENE_5_3',
    status: hardErrorCount === 0 ? 'REVIEW_FROZEN_NO_DESTRUCTIVE_APPROVAL' : 'BLOCKED',
    recordCount: records.length,
    records,
  };

  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage5-non-banner-unreferenced-review-summary/v1',
    stage: 'ASSET_HYGIENE_5_3',
    status: hardErrorCount === 0 ? contract.finalState.status : 'BLOCKED',
    completion: hardErrorCount === 0 ? contract.finalState.completion : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? contract.finalState.freezeState : 'NOT_FROZEN',
    targetAssetCount: contract.target.expectedAssetCount,
    reviewedAssetCount: records.length,
    targetRootCounts: Object.fromEntries(contract.target.groups.map((group) => [group.root, group.expectedAssetCount])),
    physicalSubscopeCounts: actualSubscopeCounts,
    currentReferenceCount: records.reduce((sum, record) => sum + record.currentReferenceCount, 0),
    pathHistoryCoverageCount: records.filter((record) => record.gitPathHistoryCount > 0).length,
    introductionEvidenceCoverageCount: records.filter((record) => record.currentPathIntroduction?.commit).length,
    postIntroductionChangedAssetCount,
    introductionBatchCount: introductionBatches.length,
    introductionBatches,
    evidenceCounts: {
      currentToolExactRequiredInput: toolInputCount,
      movementContractIdentifierMatch: movementMatchCount,
      movementRepositoryDeliveryBindingProven: records.filter((record) => record.evidence.movementRepositoryDeliveryBindingProven).length,
      sameStemCurrentFrontendSibling: sameStemCount,
    },
    decisionCounts,
    deleteEligibleCount: records.filter((record) => record.deleteEligible).length,
    deleteApprovedCount: records.filter((record) => record.deleteApproved).length,
    stage5ReviewClosure: {
      totalUnreferencedPopulation: scopeSummary.coverage.unreferencedReviewCandidateCount,
      bannerReviewed: bannerSummary.reviewedAssetCount,
      nonBannerReviewed: records.length,
      totalReviewed: bannerSummary.reviewedAssetCount + records.length,
      deleteApprovedCount: 0,
      allFrozenUnreferencedReviewed: bannerSummary.reviewedAssetCount + records.length === scopeSummary.coverage.unreferencedReviewCandidateCount,
    },
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
      unreferencedToUnusedInference: 0,
      referenceAbsenceDeleteSafetyInference: 0,
      pathNameSemanticRoleInference: 0,
      extensionSupersessionInference: 0,
      sameStemSiblingEquivalenceInference: 0,
      sameStemSiblingSupersessionInference: 0,
      movementFilenameVerifiedDeliveryBindingInference: 0,
      heroSampleFilenameHeroIdentityInference: 0,
      statIconFilenameRuntimeBindingInference: 0,
      gitHistoryCanonicalOwnershipInference: 0,
      gitHistoryDeleteSafetyInference: 0
    },
    nextStartPoint: hardErrorCount === 0 ? contract.finalState.nextStartPoint : 'ASSET_HYGIENE_5_3_REVIEW_REPAIR',
  };

  if (summary.stage5ReviewClosure.totalReviewed !== 457 || summary.stage5ReviewClosure.allFrozenUnreferencedReviewed !== true) {
    summary.blockers.push({ code: 'AH5_UNREFERENCED_REVIEW_CLOSURE_PARITY_FAIL', closure: summary.stage5ReviewClosure });
    summary.hardErrorCount = summary.blockers.length;
    summary.status = 'BLOCKED';
    summary.completion = 'INCOMPLETE';
    summary.freezeState = 'NOT_FROZEN';
    summary.nextStartPoint = 'ASSET_HYGIENE_5_3_REVIEW_REPAIR';
    review.status = 'BLOCKED';
  }

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
