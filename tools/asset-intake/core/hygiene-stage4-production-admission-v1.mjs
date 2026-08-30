import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeAssetRequest } from './route-v1.mjs';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage4-production-admission.v1.json',
  classification: 'tools/asset-intake/hygiene/generated/asset-hygiene-classification.v1.json',
  verifiedEvidenceIndex: 'tools/asset-intake/hygiene/generated/asset-hygiene-verified-evidence-index.v1.json',
  stage3Summary: 'data/validation/asset-intake-hygiene-stage3-classification-summary.v1.json',
  operationalRoutingContract: 'tools/asset-intake/contract/operational-routing.v1.json',
  admissionIndex: 'tools/asset-intake/hygiene/generated/asset-hygiene-production-admission-index.v1.json',
  quarantineIndex: 'tools/asset-intake/hygiene/generated/asset-hygiene-production-quarantine-index.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage4-production-admission-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage4-production-admission.md',
};

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function canonicalKeyId(key) {
  return `${key.domain}:${key.assetKind}:${String(key.value)}`;
}

function lookupKeyForCanonical(key) {
  return `canonical:${canonicalKeyId(key)}`;
}

function sortedUnique(values) {
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

function classificationDisposition(record, { selectedPaths, pathOnlyPaths, blockingFlags }) {
  const activeBlockingFlags = record.flags.filter((flag) => blockingFlags.has(flag));
  if (activeBlockingFlags.length) {
    return {
      state: 'QUARANTINED',
      reasonCode: 'RISK_FLAG_FORCES_QUARANTINE',
      directProductionLookupAllowed: false,
      existingProductionUsePreserved: record.traits.activeProduction === true,
      blockingFlags: activeBlockingFlags,
    };
  }
  if (selectedPaths.has(record.repositoryPath)) {
    return {
      state: 'ADMITTED_CANONICAL_PROJECT_LOOKUP',
      reasonCode: 'ACTIVE_VERIFIED_CANONICAL_SINGLE_SELECTION',
      directProductionLookupAllowed: true,
      existingProductionUsePreserved: true,
      blockingFlags: [],
    };
  }
  if (pathOnlyPaths.has(record.repositoryPath) && record.primaryClass === 'ACTIVE_VERIFIED' && record.traits.activeProduction === true) {
    return {
      state: 'CURRENT_PRODUCTION_PATH_ONLY_REVIEW',
      reasonCode: 'CURRENT_ACTIVE_ASSET_HAS_NO_STAGE3_CANONICAL_KEY',
      directProductionLookupAllowed: false,
      existingProductionUsePreserved: true,
      blockingFlags: [],
    };
  }
  const reasonByClass = {
    ACTIVE_VERIFIED: 'ACTIVE_VERIFIED_NOT_CANONICALLY_ADMITTED',
    EVIDENCE_ONLY: 'VERIFIED_EVIDENCE_NOT_DIRECT_PRODUCTION',
    GENERATED_DERIVATIVE: 'DERIVATIVE_WITHOUT_ACTIVE_PRODUCTION_ADMISSION',
    SUPERSEDED: 'EXPLICIT_SUPERSEDED_EVIDENCE',
    UNREFERENCED: 'NO_CURRENT_REFERENCE_EDGE',
    PROVENANCE_UNKNOWN: 'CURRENT_REFERENCE_WITHOUT_VERIFIED_PROVENANCE',
  };
  return {
    state: 'QUARANTINED',
    reasonCode: reasonByClass[record.primaryClass] ?? 'NOT_ADMITTED_BY_STAGE4_POLICY',
    directProductionLookupAllowed: false,
    existingProductionUsePreserved: record.traits.activeProduction === true,
    blockingFlags: [],
  };
}

export function resolveProjectEvidence(canonicalKey, admissionIndex, quarantineIndex) {
  if (!canonicalKey || typeof canonicalKey !== 'object') throw new Error('canonicalKey is required');
  if (typeof canonicalKey.domain !== 'string' || !canonicalKey.domain) throw new Error('canonicalKey.domain is required');
  if (typeof canonicalKey.assetKind !== 'string' || !canonicalKey.assetKind) throw new Error('canonicalKey.assetKind is required');
  if (!['string', 'number'].includes(typeof canonicalKey.value)) throw new Error('canonicalKey.value must be string or number');

  const lookupKey = lookupKeyForCanonical(canonicalKey);
  const admitted = admissionIndex.entries.find((entry) => entry.lookupKey === lookupKey) ?? null;
  if (admitted) {
    return {
      status: 'RESOLVED',
      provenanceVerified: true,
      canonicalIdEvidenceVerified: true,
      evidenceRef: `${PATHS.admissionIndex}#${lookupKey}`,
      lookupDisposition: 'PRODUCTION_ADMITTED',
      repositoryPath: admitted.selectedAsset.repositoryPath,
      sha256: admitted.selectedAsset.sha256,
      primaryClass: admitted.selectedAsset.primaryClass,
    };
  }

  const canonicalQuarantine = quarantineIndex.canonicalEntries.find((entry) => entry.lookupKey === lookupKey) ?? null;
  return {
    status: 'NOT_FOUND',
    lookupDisposition: canonicalQuarantine ? 'QUARANTINED' : 'NO_ADMITTED_CANONICAL_PROJECT_ASSET',
    quarantineRef: canonicalQuarantine ? `${PATHS.quarantineIndex}#${lookupKey}` : null,
  };
}

function checkpointMarkdown(summary) {
  return `# Asset Hygiene Stage 4 — Production Admission / Quarantine\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- AH-3 classification: \`${PATHS.classification}\`\n- AH-3 verified evidence index: \`${PATHS.verifiedEvidenceIndex}\`\n- AH-3 summary: \`${PATHS.stage3Summary}\`\n- Asset Intake Stage 5 routing contract: \`${PATHS.operationalRoutingContract}\`\n\nAH-3의 frozen classification/evidence를 그대로 사용했고 AH-2/AH-3를 재계산하지 않았다. Stage 5 route order와 external source priority도 변경하지 않았다.\n\n## 2. population disposition\n\n\`\`\`text\nclassification records                 ${summary.coverage.classificationRecordCount}\nadmitted canonical lookup assets       ${summary.coverage.admittedUniqueAssetCount}\nadmitted canonical keys                ${summary.coverage.admittedCanonicalEntryCount}\ncurrent production path-only review     ${summary.coverage.currentProductionPathOnlyReviewCount}\nquarantined assets                      ${summary.coverage.quarantinedAssetCount}\nunassigned assets                       ${summary.coverage.unassignedAssetCount}\n\`\`\`\n\n세 disposition은 repository population을 빠짐없이 덮는다. path-only review는 기존 production 사용을 취소하지 않으며, AH-4가 canonical identity를 새로 만들지 않는다는 의미다.\n\n## 3. admission rule\n\n- primaryClass = \`ACTIVE_VERIFIED\`\n- activeProduction trait = true\n- AH-3 canonicalKey 존재\n- SHA-256 존재\n- \`RESOLVER_COLLISION\`, \`UNVERIFIED_EXTERNAL\` 없음\n- canonical key당 selected active asset 정확히 1개\n\n\`EXACT_DUPLICATE\`와 \`BASENAME_COLLISION\`은 resolver ambiguity 증거가 아니므로 자동 차단하지 않는다.\n\n## 4. router compatibility\n\n\`\`\`text\nadmitted canonical fixture PASS  ${summary.routerChecks.admittedRoutePassCount}/${summary.routerChecks.admittedRouteCheckCount}\nnon-admitted fixture PASS         ${summary.routerChecks.nonAdmittedRoutePassCount}/${summary.routerChecks.nonAdmittedRouteCheckCount}\nStage 5 route contract mutation   0\n\`\`\`\n\nadmitted key는 기존 Stage 5 request shape의 \`projectLookup.status=RESOLVED\`로 변환되어 \`USE_PROJECT_VERIFIED_ASSET\`에 도달한다. 미승격 key는 \`NOT_FOUND\`로 변환되어 기존 규칙대로 \`RUN_ASSET_INTAKE\`로 이동한다.\n\n## 5. REVIEW / BLOCKER\n\nREVIEW:\n${summary.reviews.length ? summary.reviews.map((item, index) => `${index + 1}. \`${item.code}\` — ${item.count}`).join('\n') : '- 없음'}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\` — ${item.count ?? 1}`).join('\n') : '- 없음'}\n\n## 6. 하지 않은 것\n\n\`\`\`text\nasset delete / move / rename\nformat conversion\nfrontend consumer rewrite\nexisting production consumer revocation\nexternal fetch\nraw ConfigData read\nsemantic recomputation\ncanonical relation recomputation\npath-only canonical promotion\nname JOIN / ID arithmetic / filename identity inference\n\`\`\`\n\n## 7. 완료 조건\n\n- frozen AH-3 predecessor PASS/COMPLETE\n- 2,188 record disposition coverage 100%\n- unassigned 0\n- admitted canonical entry가 모두 단일 ACTIVE asset으로 결정됨\n- admitted router fixtures 100% \`USE_PROJECT_VERIFIED_ASSET\`\n- non-admitted router fixtures 100% \`RUN_ASSET_INTAKE\`\n- hard error 0 / blocker 0\n\n## 8. 다음 시작점\n\n\`ASSET_HYGIENE_5_DEDUP_MOVE_DELETE_SEPARATE_WORK\`\n\nAH-5는 별도 destructive-review 작업이다. AH-4 완료가 삭제/이동 허가를 의미하지 않는다.\n\n## 9. 다시 열리는 조건\n\n- AH-3 classification 또는 verified evidence index 변경\n- Stage 5 operational routing contract 변경\n- current production resolver/source 변경으로 AH-2/AH-3 reopen condition 충족\n- canonical admission이 단일 active asset으로 결정되지 않음\n- explicit resolver collision / unverified external production evidence 발생\n\n## 10. 최종 판정\n\n\`\`\`text\n${summary.status}\n${summary.completion}\n${summary.freezeState}\ncoverage: ${summary.coverage.assignedAssetCount}/${summary.coverage.classificationRecordCount}\nhard error: ${summary.hardErrorCount}\nblocker: ${summary.blockers.length}\nnext: AH-5 separate destructive review\n\`\`\`\n`;
}

export async function buildStage4ProductionAdmission({ write = false } = {}) {
  const [contract, classification, evidenceIndex, stage3Summary, routingContract] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.classification),
    json(PATHS.verifiedEvidenceIndex),
    json(PATHS.stage3Summary),
    json(PATHS.operationalRoutingContract),
  ]);

  if (
    stage3Summary.status !== 'PASS_WITH_REVIEW' ||
    stage3Summary.completion !== 'COMPLETE' ||
    stage3Summary.freezeState !== 'ASSET_HYGIENE_BASELINE_FROZEN' ||
    stage3Summary.hardErrorCount !== 0
  ) throw new Error('AH-4 requires frozen PASS_WITH_REVIEW/COMPLETE AH-3 with zero hard errors');

  if (routingContract.status !== 'DESIGN_FROZEN' || routingContract.schemaId !== 'asset-intake-operational-routing/v1') {
    throw new Error('AH-4 requires the frozen Asset Intake Stage 5 operational routing contract');
  }
  if (evidenceIndex.status !== 'FROZEN_READ_ONLY_INDEX' || evidenceIndex.productionAdoption !== false) {
    throw new Error('AH-4 requires the read-only AH-3 verified evidence index before adoption');
  }
  if (
    classification.recordCount !== contract.population.expectedClassificationRecordCount ||
    classification.records.length !== contract.population.expectedClassificationRecordCount ||
    evidenceIndex.canonicalEntryCount !== contract.population.expectedCanonicalEntryCount ||
    evidenceIndex.pathEntryCount !== contract.population.expectedPathEntryCount
  ) throw new Error('AH-4 predecessor population mismatch');

  const classificationByPath = new Map();
  for (const record of classification.records) {
    if (classificationByPath.has(record.repositoryPath)) throw new Error(`duplicate AH-3 classification path: ${record.repositoryPath}`);
    classificationByPath.set(record.repositoryPath, record);
  }

  const blockingFlags = new Set(contract.admissionPolicy.blockingFlags);
  const admissionEntries = [];
  const canonicalQuarantineEntries = [];
  const blockers = [];
  const selectedPaths = new Set();
  const canonicalMembershipByPath = new Map();

  for (const entry of evidenceIndex.canonicalEntries) {
    const candidates = [];
    const rejectedAssets = [];
    for (const asset of entry.assets) {
      const record = classificationByPath.get(asset.repositoryPath);
      if (!record) throw new Error(`canonical evidence path missing classification: ${asset.repositoryPath}`);
      if (record.sha256 !== asset.sha256) throw new Error(`canonical evidence SHA mismatch: ${asset.repositoryPath}`);
      if (!canonicalMembershipByPath.has(asset.repositoryPath)) canonicalMembershipByPath.set(asset.repositoryPath, []);
      canonicalMembershipByPath.get(asset.repositoryPath).push(entry.lookupKey);

      const riskFlags = record.flags.filter((flag) => blockingFlags.has(flag));
      const eligible =
        record.primaryClass === contract.admissionPolicy.requiredPrimaryClass &&
        record.traits.activeProduction === true &&
        typeof record.sha256 === 'string' && record.sha256.length > 0 &&
        riskFlags.length === 0;
      if (eligible) candidates.push({ record, asset });
      else rejectedAssets.push({
        repositoryPath: record.repositoryPath,
        sha256: record.sha256,
        primaryClass: record.primaryClass,
        flags: record.flags,
        activeProduction: record.traits.activeProduction,
        reasonCode: riskFlags.length ? 'RISK_FLAG_FORCES_QUARANTINE' : 'NOT_ACTIVE_VERIFIED_ADMISSION_CANDIDATE',
      });

      if (record.traits.activeProduction === true && riskFlags.length) {
        blockers.push({ code: 'ACTIVE_PRODUCTION_RISK_FLAG', repositoryPath: record.repositoryPath, flags: riskFlags });
      }
    }

    if (candidates.length > 1) {
      blockers.push({
        code: 'MULTIPLE_ACTIVE_ADMISSION_CANDIDATES',
        lookupKey: entry.lookupKey,
        count: candidates.length,
        repositoryPaths: candidates.map(({ record }) => record.repositoryPath).sort((a, b) => a.localeCompare(b, 'en')),
      });
    }

    if (candidates.length === 1) {
      const selected = candidates[0].record;
      selectedPaths.add(selected.repositoryPath);
      admissionEntries.push({
        lookupKey: entry.lookupKey,
        canonicalKey: entry.canonicalKey,
        admissionState: 'PRODUCTION_ADMITTED',
        selectedAsset: {
          repositoryPath: selected.repositoryPath,
          sha256: selected.sha256,
          primaryClass: selected.primaryClass,
          referenceKinds: selected.referenceKinds,
          activeProduction: selected.traits.activeProduction,
          explicitDerivative: selected.traits.explicitDerivative,
          candidateFlags: selected.flags.filter((flag) => contract.admissionPolicy.nonBlockingCandidateFlags.includes(flag)),
        },
        evidenceAlternatives: rejectedAssets,
        verification: 'AH4_ADMISSION_FROM_FROZEN_AH3',
      });
    } else {
      canonicalQuarantineEntries.push({
        lookupKey: entry.lookupKey,
        canonicalKey: entry.canonicalKey,
        admissionState: 'QUARANTINED_NO_SINGLE_ACTIVE_ASSET',
        candidateCount: candidates.length,
        evidenceAssets: rejectedAssets,
      });
    }
  }

  admissionEntries.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey, 'en'));
  canonicalQuarantineEntries.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey, 'en'));

  const pathOnlyPaths = new Set();
  for (const entry of evidenceIndex.pathEntries) {
    const record = classificationByPath.get(entry.repositoryPath);
    if (!record) throw new Error(`path-only evidence missing classification: ${entry.repositoryPath}`);
    if (record.sha256 !== entry.sha256) throw new Error(`path-only evidence SHA mismatch: ${entry.repositoryPath}`);
    pathOnlyPaths.add(entry.repositoryPath);
  }

  const dispositions = classification.records.map((record) => {
    const disposition = classificationDisposition(record, { selectedPaths, pathOnlyPaths, blockingFlags });
    return {
      repositoryPath: record.repositoryPath,
      sha256: record.sha256,
      primaryClass: record.primaryClass,
      flags: record.flags,
      activeProduction: record.traits.activeProduction,
      explicitDerivative: record.traits.explicitDerivative,
      canonicalLookupKeys: sortedUnique(canonicalMembershipByPath.get(record.repositoryPath) ?? []),
      ...disposition,
    };
  }).sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const admittedRecords = dispositions.filter((record) => record.state === 'ADMITTED_CANONICAL_PROJECT_LOOKUP');
  const pathOnlyReviewRecords = dispositions.filter((record) => record.state === 'CURRENT_PRODUCTION_PATH_ONLY_REVIEW');
  const quarantinedRecords = dispositions.filter((record) => record.state === 'QUARANTINED');
  const assignedAssetCount = admittedRecords.length + pathOnlyReviewRecords.length + quarantinedRecords.length;
  const unassignedAssetCount = classification.records.length - assignedAssetCount;
  if (unassignedAssetCount !== 0) blockers.push({ code: 'UNASSIGNED_ASSET_DISPOSITION', count: unassignedAssetCount });

  const admissionIndex = {
    version: 1,
    schemaId: 'asset-hygiene-production-admission-index/v1',
    stage: 'ASSET_HYGIENE_4',
    status: blockers.length ? 'BLOCKED' : 'PRODUCTION_ADMISSION_FROZEN',
    productionAdoption: true,
    adoptionScope: 'ASSET_INTAKE_PROJECT_EVIDENCE_LOOKUP',
    predecessor: PATHS.verifiedEvidenceIndex,
    canonicalEntryCount: admissionEntries.length,
    admittedUniqueAssetCount: selectedPaths.size,
    entries: admissionEntries,
  };

  const quarantineIndex = {
    version: 1,
    schemaId: 'asset-hygiene-production-quarantine-index/v1',
    stage: 'ASSET_HYGIENE_4',
    status: blockers.length ? 'BLOCKED' : 'QUARANTINE_AND_PATH_ONLY_REVIEW_FROZEN',
    directProductionLookupAllowed: false,
    existingProductionConsumerRevocation: false,
    canonicalEntryCount: canonicalQuarantineEntries.length,
    canonicalEntries: canonicalQuarantineEntries,
    assetRecordCount: pathOnlyReviewRecords.length + quarantinedRecords.length,
    records: [...pathOnlyReviewRecords, ...quarantinedRecords].sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en')),
  };

  let admittedRoutePassCount = 0;
  for (const entry of admissionEntries) {
    const projectLookup = resolveProjectEvidence(entry.canonicalKey, admissionIndex, quarantineIndex);
    const routed = routeAssetRequest({
      requestId: `ah4:${entry.lookupKey}`,
      canonicalKey: entry.canonicalKey,
      projectLookup,
      assetIntake: { status: 'NOT_RUN' },
      externalAttempts: [],
    });
    if (routed.status === 'ROUTE_READY' && routed.decision.action === 'USE_PROJECT_VERIFIED_ASSET' && routed.decision.terminal === true) admittedRoutePassCount += 1;
    else blockers.push({ code: 'ADMITTED_ROUTE_FIXTURE_FAILED', lookupKey: entry.lookupKey });
  }

  const nonAdmittedFixtures = [
    { domain: 'skin', assetKind: 'static', value: 102 },
    { domain: 'equipment', assetKind: 'icon', value: 405 },
    { domain: 'banner', assetKind: 'image', value: 'fixture' },
  ];
  let nonAdmittedRoutePassCount = 0;
  for (const canonicalKey of nonAdmittedFixtures) {
    const projectLookup = resolveProjectEvidence(canonicalKey, admissionIndex, quarantineIndex);
    const routed = routeAssetRequest({
      requestId: `ah4:non-admitted:${canonicalKeyId(canonicalKey)}`,
      canonicalKey,
      projectLookup,
      assetIntake: { status: 'NOT_RUN' },
      externalAttempts: [],
    });
    if (routed.status === 'ROUTE_READY' && routed.decision.action === 'RUN_ASSET_INTAKE' && routed.decision.terminal === false) nonAdmittedRoutePassCount += 1;
    else blockers.push({ code: 'NON_ADMITTED_ROUTE_FIXTURE_FAILED', canonicalKey });
  }

  const reviews = [];
  if (pathOnlyReviewRecords.length) reviews.push({ code: 'CURRENT_PRODUCTION_PATH_ONLY_NOT_CANONICAL_ROUTABLE', count: pathOnlyReviewRecords.length });
  const quarantineReasonCounts = countBy(quarantinedRecords, (record) => record.reasonCode);
  for (const [reasonCode, count] of Object.entries(quarantineReasonCounts)) reviews.push({ code: reasonCode, count });

  const hardErrorCount = blockers.length;
  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage4-production-admission-summary/v1',
    stage: 'ASSET_HYGIENE_4',
    status: hardErrorCount === 0 ? contract.finalState.status : 'BLOCKED',
    completion: hardErrorCount === 0 ? contract.finalState.completion : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? contract.finalState.freezeState : 'NOT_FROZEN',
    predecessors: contract.predecessors,
    coverage: {
      classificationRecordCount: classification.records.length,
      assignedAssetCount,
      admittedUniqueAssetCount: admittedRecords.length,
      admittedCanonicalEntryCount: admissionEntries.length,
      currentProductionPathOnlyReviewCount: pathOnlyReviewRecords.length,
      quarantinedAssetCount: quarantinedRecords.length,
      unassignedAssetCount,
    },
    admissionDomains: countBy(admissionEntries, (entry) => entry.canonicalKey.domain),
    quarantineReasonCounts,
    routerChecks: {
      admittedRouteCheckCount: admissionEntries.length,
      admittedRoutePassCount,
      nonAdmittedRouteCheckCount: nonAdmittedFixtures.length,
      nonAdmittedRoutePassCount,
      existingStage5ContractMutationCount: 0,
    },
    reviews,
    blockers,
    hardErrorCount,
    forbiddenOperationCounts: {
      assetMutation: 0,
      assetMove: 0,
      assetDelete: 0,
      assetRename: 0,
      formatConversion: 0,
      frontendMutation: 0,
      productionConsumerRewrite: 0,
      externalFetch: 0,
      rawConfigDataRead: 0,
      semanticRecomputation: 0,
      canonicalRelationRecomputation: 0,
      pathOnlyCanonicalPromotion: 0,
    },
    productionAdoption: {
      assetIntakeProjectEvidenceLookup: hardErrorCount === 0,
      frontendConsumers: false,
      existingProductionConsumerRevocation: false,
    },
    nextStartPoint: hardErrorCount === 0 ? contract.finalState.nextStartPoint : 'ASSET_HYGIENE_4_ADMISSION_REPAIR',
  };

  const checkpoint = checkpointMarkdown(summary);

  if (write) {
    const outputs = [
      [PATHS.admissionIndex, stable(admissionIndex)],
      [PATHS.quarantineIndex, stable(quarantineIndex)],
      [PATHS.summary, stable(summary)],
      [PATHS.checkpoint, checkpoint],
    ];
    for (const [repositoryPath, content] of outputs) {
      await mkdir(path.dirname(path.join(REPO_ROOT, repositoryPath)), { recursive: true });
      await writeFile(path.join(REPO_ROOT, repositoryPath), content);
    }
  }

  return { admissionIndex, quarantineIndex, summary, checkpoint };
}
