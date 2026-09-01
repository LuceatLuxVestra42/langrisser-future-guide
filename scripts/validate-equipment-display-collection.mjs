import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort((left, right) => left - right);
}

function assertSameIds(actual, expected, label) {
  const left = JSON.stringify(sorted(actual));
  const right = JSON.stringify(sorted(expected));
  assert(left === right, `${label} mismatch: ${left} !== ${right}`);
}

const freshness = spawnSync(
  process.execPath,
  ["scripts/build-equipment-pass-classification.mjs", "--check"],
  {
    cwd: repoRoot,
    encoding: "utf8",
  },
);
assert(
  freshness.status === 0,
  `Equipment Pass generated classification is stale or unresolved.\n${freshness.stdout}${freshness.stderr}`,
);

const contract = readJson("data/contracts/equipment-pass-classification-contract.v1.json");
const evidence = readJson("data/presentation/equipment-pass-evidence.v1.json");
const generated = readJson("data/generated/equipment-pass-classification.v1.json");
const technical = readJson("data/generated/equipment_stage2_7_acquisition.json");
const audit = readJson("data/validation/equipment-p3-0-release-chronology-audit.v1.json");
const admission = readJson("data/presentation/equipment-public-admission-correction.v1.json");
const stage3General = readJson("data/generated/equipment_stage3_3_general_list.json");

assert(contract.status === "ACTIVE", "Equipment Pass classification contract must be ACTIVE.");
assert(
  contract.confirmationPolicy.explicitPassEquipmentIdListIsAuthoritative === false,
  "Explicit Equipment Pass ID lists must not be authoritative.",
);
assert(
  contract.confirmationPolicy.generatedPassEquipmentIdsAreOutputOnly === true,
  "Generated Equipment Pass IDs must be output-only.",
);
assert(
  contract.candidateDiscovery.technicalClassIsMembership === false,
  "Technical acquisition class must remain candidate-only.",
);
assert(generated.status === "PASS", `Generated Equipment Pass classification status is ${generated.status}.`);
assert(
  generated.policy.membershipMode === "EVIDENCE_CLASSIFICATION",
  "Runtime Equipment Pass membership must use evidence classification.",
);
assert(
  generated.counts.passCandidate === 0 && generated.counts.unresolved === 0,
  "Public Equipment Pass candidates must be fully resolved before runtime admission.",
);

const sourceById = new Map(audit.sources.map((source) => [source.id, source]));
const auditById = new Map(audit.records.map((record) => [record.equipmentId, record]));
const generatedById = new Map(generated.records.map((record) => [record.equipmentId, record]));
assert(generatedById.size === generated.records.length, "Generated classification contains duplicate IDs.");

for (const [sourceId, claim] of Object.entries(evidence.sourceClaims)) {
  const source = sourceById.get(sourceId);
  assert(source, `Evidence source claim ${sourceId} is absent from the release-evidence audit.`);
  assert(
    source.tier === claim.requiredSourceTier,
    `Evidence source ${sourceId} tier ${source.tier} !== ${claim.requiredSourceTier}.`,
  );
}

const passIds = [];
const nonPassIds = [];
const excludedCandidateIds = [];
for (const record of generated.records) {
  if (record.classificationState === "PASS_CONFIRMED" || record.classificationState === "NON_PASS_CONFIRMED") {
    const auditRecord = auditById.get(record.equipmentId);
    assert(auditRecord, `Confirmed Equipment ${record.equipmentId} is missing audited evidence.`);
    assert(
      auditRecord.sourceId === record.evidenceSourceId,
      `Equipment ${record.equipmentId} evidence source drift: ${auditRecord.sourceId} !== ${record.evidenceSourceId}.`,
    );
    const claim = evidence.sourceClaims[record.evidenceSourceId];
    assert(claim, `Equipment ${record.equipmentId} evidence source has no accepted classification claim.`);
    assert(
      claim.classificationState === record.classificationState,
      `Equipment ${record.equipmentId} classification state is not supported by its evidence claim.`,
    );
    const source = sourceById.get(record.evidenceSourceId);
    assert(
      source?.tier === claim.requiredSourceTier,
      `Equipment ${record.equipmentId} evidence tier does not satisfy the accepted source claim.`,
    );
  }

  if (record.classificationState === "PASS_CONFIRMED") {
    assert(record.displayCollection === 3, `Equipment ${record.equipmentId} confirmed Pass must map to display 3.`);
    passIds.push(record.equipmentId);
  } else if (record.classificationState === "NON_PASS_CONFIRMED") {
    assert(record.displayCollection === 2, `Equipment ${record.equipmentId} confirmed non-Pass must map to display 2.`);
    nonPassIds.push(record.equipmentId);
  } else if (record.classificationState === "NON_PUBLIC_EXCLUDED") {
    assert(
      admission.excludedEquipmentIds.includes(record.equipmentId),
      `Equipment ${record.equipmentId} classification says public-excluded but admission does not.`,
    );
    excludedCandidateIds.push(record.equipmentId);
  } else {
    throw new Error(
      `Equipment ${record.equipmentId} unresolved classification ${record.classificationState} reached validator.`,
    );
  }
}

assertSameIds(passIds, generated.confirmedEquipmentPassIds, "Generated confirmed Equipment Pass IDs");
assertSameIds(
  nonPassIds,
  generated.confirmedCurrentAdditionalNonPassIds,
  "Generated confirmed current-additional non-Pass IDs",
);
assertSameIds(
  excludedCandidateIds,
  generated.nonPublicExcludedCandidateIds,
  "Generated non-public candidate IDs",
);

const candidateClass = contract.candidateDiscovery.technicalAcquisitionClass;
const candidateIds = technical.records
  .filter((record) => record.acquisitionClass === candidateClass)
  .map((record) => record.equipmentId);
for (const equipmentId of candidateIds) {
  assert(
    generatedById.has(equipmentId),
    `Technical candidate Equipment ${equipmentId} is missing generated classification.`,
  );
}

const excludedIdSet = new Set(admission.excludedEquipmentIds);
const publicTechnicalRecords = technical.records.filter(
  (record) => [1, 2, 3].includes(record.siteTab) && !excludedIdSet.has(record.equipmentId),
);
const technicalCounts = Object.fromEntries(
  [1, 2, 3].map((tab) => [
    String(tab),
    publicTechnicalRecords.filter((record) => record.siteTab === tab).length,
  ]),
);
for (const tab of ["1", "2", "3"]) {
  assert(
    technicalCounts[tab] === generated.technicalPublicCounts[tab],
    `Generated technical public count ${tab} is stale: ${generated.technicalPublicCounts[tab]} !== ${technicalCounts[tab]}.`,
  );
}
assert(
  publicTechnicalRecords.length === admission.expectedPublicProjection.generalEquipmentCount,
  `Public technical population ${publicTechnicalRecords.length} !== ${admission.expectedPublicProjection.generalEquipmentCount}.`,
);

const stage3ById = new Map(stage3General.records.map((record) => [record.equipmentId, record]));
const {
  readEquipmentDetailPageData,
  readExclusiveEquipmentPageData,
  readGeneralEquipmentPageData,
} = await import("../src/lib/equipment-page.localized.server.ts");

const general = readGeneralEquipmentPageData();
const exclusive = readExclusiveEquipmentPageData();

assert(
  general.records.length === generated.displayCounts.total,
  `Runtime public general count ${general.records.length} !== generated ${generated.displayCounts.total}.`,
);
assert(exclusive.records.length === 167, `Runtime exclusive count ${exclusive.records.length} !== 167.`);

for (const tab of ["1", "2", "3"]) {
  assert(
    Number(general.tabs[tab]) === generated.displayCounts[tab],
    `Runtime display tab ${tab}: ${general.tabs[tab]} !== generated ${generated.displayCounts[tab]}.`,
  );
  assert(
    Number(general.technicalTabs[tab]) === generated.technicalPublicCounts[tab],
    `Runtime technical tab ${tab}: ${general.technicalTabs[tab]} !== generated ${generated.technicalPublicCounts[tab]}.`,
  );
}

const runtimeById = new Map(general.records.map((record) => [record.equipmentId, record]));
const display3Ids = [];
const runtimeTechnical3Ids = [];

for (const record of general.records) {
  const frozen = stage3ById.get(record.equipmentId);
  assert(frozen, `Runtime public Equipment ${record.equipmentId} missing from frozen Stage 3-3 source.`);
  assert(
    record.technicalSiteTab === frozen.siteTab,
    `Equipment ${record.equipmentId} technical siteTab changed: ${record.technicalSiteTab} !== ${frozen.siteTab}.`,
  );
  assert(
    record.siteTab === record.displayCollection,
    `Equipment ${record.equipmentId} UI siteTab compatibility alias diverges from displayCollection.`,
  );
  if (record.siteTab === 3) display3Ids.push(record.equipmentId);
  if (record.technicalSiteTab === 3) runtimeTechnical3Ids.push(record.equipmentId);
}

const expectedTechnical3Ids = publicTechnicalRecords
  .filter((record) => record.siteTab === 3)
  .map((record) => record.equipmentId);
assertSameIds(display3Ids, passIds, "Runtime Equipment Pass IDs derived from accepted evidence");
assertSameIds(runtimeTechnical3Ids, expectedTechnical3Ids, "Runtime public technical siteTab 3 IDs");

for (const equipmentId of passIds) {
  const record = runtimeById.get(equipmentId);
  assert(record, `Confirmed Equipment Pass ${equipmentId} is not public.`);
  assert(record.displayCollection === 3, `Confirmed Equipment Pass ${equipmentId} must display under tab 3.`);
  const detail = readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Confirmed Equipment Pass ${equipmentId} detail must resolve as general.`);
  assert(
    detail.detail.classification.siteTab === 3 &&
      detail.detail.classification.displayCollection === 3,
    `Confirmed Equipment Pass ${equipmentId} detail presentation classification must be tab 3.`,
  );
}

for (const equipmentId of nonPassIds) {
  const record = runtimeById.get(equipmentId);
  assert(record, `Confirmed current-additional non-Pass ${equipmentId} is not public.`);
  assert(
    record.displayCollection === 2 && record.siteTab === 2,
    `Confirmed current-additional non-Pass ${equipmentId} must display under previous additional.`,
  );
  const detail = readEquipmentDetailPageData(equipmentId);
  assert(detail?.kind === "general", `Confirmed current-additional non-Pass ${equipmentId} detail must resolve.`);
  assert(
    detail.detail.classification.displayCollection === 2,
    `Confirmed current-additional non-Pass ${equipmentId} detail displayCollection must be 2.`,
  );
}

for (const equipmentId of admission.excludedEquipmentIds) {
  assert(!runtimeById.has(equipmentId), `Excluded Equipment ${equipmentId} leaked into public list.`);
  assert(
    readEquipmentDetailPageData(equipmentId) === null,
    `Excluded Equipment ${equipmentId} direct detail resolved.`,
  );
}

console.log(JSON.stringify({
  status: "PASS",
  stage: "equipment-pass-evidence-classification",
  membershipMode: generated.policy.membershipMode,
  runtimePublicGeneral: general.records.length,
  runtimeExclusive: exclusive.records.length,
  candidateTotal: generated.counts.candidateTotal,
  confirmedEquipmentPassCount: passIds.length,
  confirmedCurrentAdditionalNonPassCount: nonPassIds.length,
  unresolvedCount: generated.counts.unresolved,
  technicalTabs: general.technicalTabs,
  displayCollections: general.tabs,
  explicitPassEquipmentIdListIsAuthoritative: false,
  currentConfirmedCountIsFixedInvariant: false,
  stage2AcquisitionClassificationChanged: false,
  technicalSiteTabChanged: false,
  releaseChronologyRecomputed: false,
  nextStartPoint: generated.nextStartPoint,
}, null, 2));
