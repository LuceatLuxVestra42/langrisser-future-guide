import fs from "node:fs";
import { execFileSync } from "node:child_process";

const COST_PATH = "data/generated/soldier-training-tech-level-costs.v1.json";
const EXISTING_PATH = "data/generated/soldier-training-material-iteminfo.v1.json";
const CONTRACT_PATH = "data/contracts/configdata-source-pack-contract.v1.json";
const INTAKE_PATH = "data/presentation/soldier-training-cost-material-localization-intake.v1.json";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`[soldier-training-cost-material-localization-intake] FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const cost = readJson(COST_PATH);
const existing = readJson(EXISTING_PATH);
const contract = readJson(CONTRACT_PATH);
const intake = readJson(INTAKE_PATH);

assert(cost.status === "PASS", "cost predecessor status must be PASS");
assert(cost.completion === "COMPLETE", "cost predecessor completion must be COMPLETE");
assert(cost.freezeState === "SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN", "cost predecessor must remain frozen");
assert(cost.coverage?.targetTechCount === 130, "cost predecessor must contain 130 TrainingTech targets");
assert(cost.coverage?.uniqueMaterialReferenceCount === 48, "cost predecessor must contain 48 unique material refs");

assert(existing.status === "PASS", "existing material source status must be PASS");
assert(existing.summary?.targetItemIdCount === 24, "existing material source must remain the verified 24-item set");
assert(new Set(existing.items.map((item) => item.itemId)).size === 24, "existing material source IDs must be unique");

assert(contract.status === "PASS", "source-pack contract status must be PASS");
const sourceCommit = contract.authoritativePredecessor?.sourceCommitSha;
assert(typeof sourceCommit === "string" && sourceCommit.length === 40, "source-pack contract must pin sourceCommitSha");
assert(intake.authority?.sourceCommitSha === sourceCommit, "intake sourceCommitSha must match current source-pack contract");
assert(intake.authority?.sourcePackContract === CONTRACT_PATH, "intake must name the current source-pack contract");
assert(intake.authority?.costPredecessor === COST_PATH, "intake must name the frozen cost predecessor");
assert(intake.authority?.existingMaterialSource === EXISTING_PATH, "intake must name the current 24-material source");

const tupleKeys = new Set();
const materialIds = new Set();
for (const record of cost.records ?? []) {
  for (const level of record.levels ?? []) {
    for (const material of level.materials ?? []) {
      assert(Number.isInteger(material.goodsType), `malformed goodsType in Tech ${record.techId}`);
      assert(Number.isInteger(material.id), `malformed item id in Tech ${record.techId}`);
      assert(Number.isFinite(material.count) && material.count > 0, `malformed count in Tech ${record.techId}`);
      assert(material.goodsType === 6, `unexpected GoodsType ${material.goodsType} for item ${material.id}`);
      tupleKeys.add(`${material.goodsType}:${material.id}`);
      materialIds.add(material.id);
    }
  }
}
assert(tupleKeys.size === 48, `derived unique tuple count ${tupleKeys.size} != 48`);
assert(materialIds.size === 48, `derived unique item id count ${materialIds.size} != 48`);

const existingIds = new Set(existing.items.map((item) => item.itemId));
for (const id of existingIds) {
  assert(materialIds.has(id), `existing presentation item ${id} is not referenced by frozen costs`);
}
const unresolvedIds = [...materialIds].filter((id) => !existingIds.has(id)).sort((a, b) => a - b);
assert(unresolvedIds.length === 24, `derived unresolved count ${unresolvedIds.length} != 24`);

assert(intake.version === 1, "intake version must be 1");
assert(intake.schemaId === "soldier-training-cost-material-localization-intake/v1", "unexpected intake schemaId");
assert(intake.stage === "D", "intake stage must be D");
assert(intake.status === "PASS_WITH_REVIEW", "intake status must be PASS_WITH_REVIEW");
assert(intake.completion === "COMPLETE", "intake completion must be COMPLETE");
assert(intake.coverage?.frozenCostUniqueMaterialReferenceCount === 48, "intake frozen coverage must remain 48");
assert(intake.coverage?.existingVerifiedPresentationCount === 24, "intake existing coverage must remain 24");
assert(intake.coverage?.targetUnresolvedReferenceCount === 24, "intake target coverage must remain 24");
assert(intake.coverage?.sourceMetadataExactCount === 24, "intake source metadata coverage must remain 24");
assert(intake.coverage?.koreanCandidateCount === 24, "intake Korean candidate coverage must remain 24");
assert(intake.coverage?.productionEligibleCount === 0, "Stage D must not admit production material presentation");
assert(intake.coverage?.reviewRequiredCount === 24, "all Stage D candidates must remain REVIEW");

for (const [key, expected] of Object.entries({
  semanticRecomputation: false,
  canonicalIdentityMutation: false,
  relationMutation: false,
  costMutation: false,
  productionConsumerMutation: false,
  assetAdmissionMutation: false,
  localizationPromotion: false,
  nameJoin: false,
  idArithmetic: false,
  screenOrderAsSemanticRule: false,
})) {
  assert(intake.boundary?.[key] === expected, `boundary ${key} drifted`);
}

assert(Array.isArray(intake.records) && intake.records.length === 24, "intake must contain exactly 24 records");
const intakeById = new Map();
for (const record of intake.records) {
  assert(record.goodsType === 6, `intake item ${record.itemId} must remain GoodsType 6`);
  assert(Number.isInteger(record.itemId), "intake itemId must be an integer");
  assert(!intakeById.has(record.itemId), `duplicate intake item ${record.itemId}`);
  assert(record.localizationStatus === "review-existing-korean-sheet", `item ${record.itemId} localization status drifted`);
  assert(record.productionEligible === false, `item ${record.itemId} must not be production eligible in Stage D`);
  assert(typeof record.displayNameKrCandidate === "string" && record.displayNameKrCandidate.trim(), `item ${record.itemId} missing Korean candidate`);
  intakeById.set(record.itemId, record);
}
const intakeIds = [...intakeById.keys()].sort((a, b) => a - b);
assert(JSON.stringify(intakeIds) === JSON.stringify(unresolvedIds), "intake IDs must equal the exact current unresolved set");

const itemInfoPath = intake.authority?.itemInfoPath;
assert(itemInfoPath === "data/configdata/ConfigDataItemInfo.json", "unexpected ItemInfo logical path");
const itemInfoBlobSha = execFileSync("git", ["rev-parse", `${sourceCommit}:${itemInfoPath}`], { encoding: "utf8" }).trim();
assert(itemInfoBlobSha === intake.authority?.itemInfoGitBlobSha, "pinned ItemInfo git blob SHA drifted");

const itemInfoText = execFileSync("git", ["show", `${sourceCommit}:${itemInfoPath}`], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const itemInfo = JSON.parse(itemInfoText);
const itemInfoById = new Map();
for (const row of itemInfo) {
  if (!Number.isInteger(row.ID)) continue;
  const list = itemInfoById.get(row.ID) ?? [];
  list.push(row);
  itemInfoById.set(row.ID, list);
}

for (const id of unresolvedIds) {
  const sourceRows = itemInfoById.get(id) ?? [];
  assert(sourceRows.length === 1, `pinned ItemInfo ID ${id} matched ${sourceRows.length} rows`);
  const source = sourceRows[0];
  const record = intakeById.get(id);
  assert(record.nameCn === source.Name, `ItemInfo name mismatch for ${id}`);
  assert(record.iconPath === source.Icon, `ItemInfo icon mismatch for ${id}`);
  assert(record.rank === source.Rank, `ItemInfo rank mismatch for ${id}`);
}

console.log(JSON.stringify({
  status: "PASS_WITH_REVIEW",
  completion: "COMPLETE",
  stage: "D",
  sourceCommit,
  itemInfoBlobSha,
  frozenCostUniqueMaterialReferenceCount: materialIds.size,
  existingVerifiedPresentationCount: existingIds.size,
  targetUnresolvedReferenceCount: unresolvedIds.length,
  sourceMetadataExactCount: unresolvedIds.length,
  koreanCandidateCount: intake.records.length,
  productionEligibleCount: 0,
  reviewRequiredCount: intake.records.length,
  unresolvedIds,
  nextOwner: intake.handoff?.nextOwner,
}, null, 2));
