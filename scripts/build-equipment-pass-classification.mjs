import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const paths = {
  contract: "data/contracts/equipment-pass-classification-contract.v1.json",
  technicalAcquisition: "data/generated/equipment_stage2_7_acquisition.json",
  releaseEvidenceAudit: "data/validation/equipment-p3-0-release-chronology-audit.v1.json",
  evidenceClaims: "data/presentation/equipment-pass-evidence.v1.json",
  publicAdmission: "data/presentation/equipment-public-admission-correction.v1.json",
  output: "data/generated/equipment-pass-classification.v1.json",
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right);
}

function countByTechnicalTab(records) {
  return Object.fromEntries(
    [1, 2, 3].map((tab) => [
      String(tab),
      records.filter((record) => record.siteTab === tab).length,
    ]),
  );
}

function buildClassification() {
  const contract = readJson(paths.contract);
  const technical = readJson(paths.technicalAcquisition);
  const audit = readJson(paths.releaseEvidenceAudit);
  const evidence = readJson(paths.evidenceClaims);
  const admission = readJson(paths.publicAdmission);

  assert(contract.status === "ACTIVE", "Equipment Pass classification contract must be ACTIVE.");
  assert(
    contract.completion === "EQUIPMENT_PASS_CLASSIFICATION_V1_ACTIVE",
    "Unexpected Equipment Pass classification contract completion marker.",
  );
  assert(
    contract.candidateDiscovery.technicalClassIsMembership === false,
    "Technical acquisition class must not define Equipment Pass membership.",
  );
  assert(
    contract.confirmationPolicy.explicitPassEquipmentIdListIsAuthoritative === false,
    "Explicit Equipment Pass ID lists must not be authoritative.",
  );
  assert(
    contract.confirmationPolicy.generatedPassEquipmentIdsAreOutputOnly === true,
    "Generated Equipment Pass IDs must be output-only.",
  );
  assert(
    evidence.policy.equipmentIdListDefinesPassMembership === false &&
      evidence.policy.releaseFamilyDefinesMembership === false &&
      evidence.policy.technicalSiteTabDefinesMembership === false,
    "Equipment Pass evidence policy contains a forbidden membership shortcut.",
  );

  const sourceById = new Map(audit.sources.map((source) => [source.id, source]));
  for (const [sourceId, claim] of Object.entries(evidence.sourceClaims)) {
    const source = sourceById.get(sourceId);
    assert(source, `Equipment Pass evidence source claim ${sourceId} is missing from the audited sources.`);
    assert(
      source.tier === claim.requiredSourceTier,
      `Equipment Pass evidence source ${sourceId} tier ${source.tier} !== ${claim.requiredSourceTier}.`,
    );
    assert(
      ["PASS_CONFIRMED", "NON_PASS_CONFIRMED", "PASS_CANDIDATE"].includes(
        claim.classificationState,
      ),
      `Equipment Pass source claim ${sourceId} has unsupported state ${claim.classificationState}.`,
    );
  }

  const technicalRecords = technical.records;
  assert(Array.isArray(technicalRecords), "Equipment Stage 2-7 records are missing.");
  const technicalById = new Map(technicalRecords.map((record) => [record.equipmentId, record]));
  assert(
    technicalById.size === technicalRecords.length,
    "Equipment Stage 2-7 contains duplicate equipmentId records.",
  );

  const auditById = new Map(audit.records.map((record) => [record.equipmentId, record]));
  assert(auditById.size === audit.records.length, "Equipment release-evidence audit contains duplicate IDs.");

  const excludedIds = new Set(admission.excludedEquipmentIds);
  assert(
    excludedIds.size === admission.excludedEquipmentIds.length,
    "Equipment public-admission exclusions contain duplicate IDs.",
  );

  const candidateClass = contract.candidateDiscovery.technicalAcquisitionClass;
  const candidateRecords = technicalRecords.filter(
    (record) => record.acquisitionClass === candidateClass,
  );
  const candidateIds = new Set(candidateRecords.map((record) => record.equipmentId));

  const positivelyClaimedAuditIds = audit.records
    .filter((record) => {
      const claim = evidence.sourceClaims[record.sourceId];
      return claim?.classificationState === "PASS_CONFIRMED" ||
        claim?.classificationState === "PASS_CANDIDATE";
    })
    .map((record) => record.equipmentId);

  const classificationIds = sortedNumbers(new Set([
    ...candidateIds,
    ...positivelyClaimedAuditIds,
  ]));

  const records = classificationIds.map((equipmentId) => {
    const technicalRecord = technicalById.get(equipmentId);
    assert(technicalRecord, `Classification evidence references missing Equipment ${equipmentId}.`);

    const auditRecord = auditById.get(equipmentId) ?? null;
    const claim = auditRecord ? evidence.sourceClaims[auditRecord.sourceId] ?? null : null;

    let classificationState;
    let evidenceSourceId = null;
    let displayCollection = null;

    if (excludedIds.has(equipmentId)) {
      classificationState = "NON_PUBLIC_EXCLUDED";
    } else if (claim) {
      classificationState = claim.classificationState;
      evidenceSourceId = auditRecord.sourceId;
      if (classificationState === "PASS_CONFIRMED") displayCollection = 3;
      if (classificationState === "NON_PASS_CONFIRMED") displayCollection = 2;
    } else if (candidateIds.has(equipmentId)) {
      classificationState = "UNRESOLVED";
    } else {
      throw new Error(
        `Equipment ${equipmentId} entered classification without candidate status or accepted evidence.`,
      );
    }

    return {
      equipmentId,
      nameCn: technicalRecord.nameCn,
      technicalAcquisitionClass: technicalRecord.acquisitionClass,
      technicalSiteTab: technicalRecord.siteTab,
      classificationState,
      evidenceSourceId,
      displayCollection,
    };
  });

  const publicGeneralRecords = technicalRecords.filter(
    (record) => [1, 2, 3].includes(record.siteTab) && !excludedIds.has(record.equipmentId),
  );
  const classificationById = new Map(records.map((record) => [record.equipmentId, record]));
  const technicalPublicCounts = countByTechnicalTab(publicGeneralRecords);
  const displayCounts = { "1": 0, "2": 0, "3": 0, total: 0 };
  const unresolvedRuntimeIds = [];

  for (const record of publicGeneralRecords) {
    const classification = classificationById.get(record.equipmentId);
    let displayCollection = null;

    if (classification?.classificationState === "PASS_CONFIRMED") {
      displayCollection = 3;
    } else if (classification?.classificationState === "NON_PASS_CONFIRMED") {
      displayCollection = 2;
    } else if (
      classification?.classificationState === "PASS_CANDIDATE" ||
      classification?.classificationState === "UNRESOLVED"
    ) {
      unresolvedRuntimeIds.push(record.equipmentId);
    } else if (record.siteTab === 1) {
      displayCollection = 1;
    } else if (record.siteTab === 2) {
      displayCollection = 2;
    } else if (record.siteTab === 3) {
      unresolvedRuntimeIds.push(record.equipmentId);
    }

    if (displayCollection !== null) {
      displayCounts[String(displayCollection)] += 1;
      displayCounts.total += 1;
    }
  }

  const publicCandidateIds = candidateRecords
    .filter((record) => !excludedIds.has(record.equipmentId) && [1, 2, 3].includes(record.siteTab))
    .map((record) => record.equipmentId);
  const passConfirmedIds = records
    .filter((record) => record.classificationState === "PASS_CONFIRMED")
    .map((record) => record.equipmentId);
  const nonPassConfirmedIds = records
    .filter((record) => record.classificationState === "NON_PASS_CONFIRMED")
    .map((record) => record.equipmentId);
  const excludedCandidateIds = records
    .filter((record) => record.classificationState === "NON_PUBLIC_EXCLUDED")
    .map((record) => record.equipmentId);
  const passCandidateIds = records
    .filter((record) => record.classificationState === "PASS_CANDIDATE")
    .map((record) => record.equipmentId);
  const unresolvedIds = records
    .filter((record) => record.classificationState === "UNRESOLVED")
    .map((record) => record.equipmentId);

  const blockingIds = sortedNumbers(new Set([
    ...passCandidateIds.filter((equipmentId) => !excludedIds.has(equipmentId)),
    ...unresolvedIds.filter((equipmentId) => !excludedIds.has(equipmentId)),
    ...unresolvedRuntimeIds,
  ]));

  const status = blockingIds.length === 0 ? "PASS" : "REVIEW_REQUIRED";

  return {
    version: 1,
    stage: "Equipment Pass Classification",
    status,
    completion: "EQUIPMENT_PASS_CLASSIFICATION_V1_GENERATED",
    sources: {
      contract: paths.contract,
      technicalAcquisition: paths.technicalAcquisition,
      releaseEvidenceAudit: paths.releaseEvidenceAudit,
      evidenceClaims: paths.evidenceClaims,
      publicAdmission: paths.publicAdmission,
    },
    policy: {
      candidateAcquisitionClass: candidateClass,
      candidateClassIsMembership: false,
      membershipMode: "EVIDENCE_CLASSIFICATION",
      explicitPassEquipmentIdListIsAuthoritative: false,
      generatedPassEquipmentIdsAreOutputOnly: true,
    },
    counts: {
      candidateTotal: candidateRecords.length,
      publicCandidateTotal: publicCandidateIds.length,
      nonPublicExcluded: excludedCandidateIds.length,
      passConfirmed: passConfirmedIds.length,
      nonPassConfirmed: nonPassConfirmedIds.length,
      passCandidate: passCandidateIds.length,
      unresolved: unresolvedIds.length,
    },
    technicalPublicCounts,
    displayCounts,
    confirmedEquipmentPassIds: sortedNumbers(passConfirmedIds),
    confirmedCurrentAdditionalNonPassIds: sortedNumbers(nonPassConfirmedIds),
    nonPublicExcludedCandidateIds: sortedNumbers(excludedCandidateIds),
    records,
    review: {
      blockers: blockingIds.length === 0
        ? []
        : [`Unresolved public Equipment classification IDs: ${blockingIds.join(", ")}`],
      nonBlocking: [
        "Current confirmed count is an output of accepted evidence claims, not a fixed expected count.",
        "Future public current-additional records without accepted evidence are emitted as UNRESOLVED and block runtime classification.",
      ],
    },
    nextStartPoint:
      "Add or update accepted evidence source claims, regenerate this artifact, then run the Equipment classification validator.",
  };
}

const generated = buildClassification();
const outputPath = path.join(repoRoot, paths.output);
const serialized = `${JSON.stringify(generated, null, 2)}\n`;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const current = fs.readFileSync(outputPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      `${paths.output} is stale. Run node scripts/build-equipment-pass-classification.mjs and review any unresolved candidates.`,
    );
  }
  if (generated.status !== "PASS") {
    throw new Error(generated.review.blockers.join("; "));
  }
  console.log(JSON.stringify({
    status: "PASS",
    stage: "equipment-pass-classification-freshness",
    candidateTotal: generated.counts.candidateTotal,
    passConfirmed: generated.counts.passConfirmed,
    nonPassConfirmed: generated.counts.nonPassConfirmed,
    unresolved: generated.counts.unresolved,
    displayCounts: generated.displayCounts,
  }, null, 2));
} else {
  fs.writeFileSync(outputPath, serialized, "utf8");
  console.log(JSON.stringify({
    status: generated.status,
    output: paths.output,
    candidateTotal: generated.counts.candidateTotal,
    passConfirmed: generated.counts.passConfirmed,
    nonPassConfirmed: generated.counts.nonPassConfirmed,
    unresolved: generated.counts.unresolved,
  }, null, 2));
  if (generated.status !== "PASS") {
    process.exitCode = 2;
  }
}
