import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const stage43 = readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stageB = readJson("data/validation/hero-exclusive-equipment-relation-stageB-final.v1.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const byEquipment = readJson("data/generated/hero-exclusive-equipment-by-equipment.v1.json");
const heroMaster = readJson("data/hero-name-master.v1.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const restrictions = readJson("data/generated/equipment_stage2_6_restrictions.json");
const jobIndex = readJson("data/generated/equipment_stage2_6_job_index.json");
const exclusiveRoute = readText("src/routes/equipment_.exclusive.tsx");
const detailRoute = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");

assert(stage43.status === "PASS", "Stage 4-3 checkpoint must remain PASS.");
assert(stage43.finalStageStatus === "STAGE4_3_GENERAL_DETAIL_UI_READY", "Stage 4-3 final status mismatch.");
assert(stage40.status === "FROZEN", "Stage 4-0 consumer contract must remain frozen.");
assert(stageB.status === "PASS_ACCEPTED", "Stage B FINAL must remain PASS_ACCEPTED.");
assert(exclusive.status === "COMPLETE_WITH_REVIEW", "Stage 3-5 exclusive consumer status mismatch.");
assert(exclusive.listRecords.length === 167, `Expected 167 exclusive list records, got ${exclusive.listRecords.length}.`);
assert(exclusive.detailRecords.length === 167, `Expected 167 exclusive detail records, got ${exclusive.detailRecords.length}.`);

const listIds = exclusive.listRecords.map((record) => record.equipmentId);
const detailIds = exclusive.detailRecords.map((record) => record.equipmentId);
const listIdSet = new Set(listIds);
const detailIdSet = new Set(detailIds);
assert(listIdSet.size === 167, "Exclusive list equipmentId values must be unique.");
assert(detailIdSet.size === 167, "Exclusive detail equipmentId values must be unique.");
assert(listIds.every((id) => detailIdSet.has(id)), "Exclusive list/detail ID parity mismatch.");

const generalIds = new Set(generalDetail.records.map((record) => record.equipmentId));
const generalLeak = listIds.filter((id) => generalIds.has(id));
assert(generalLeak.length === 0, `General equipment leaked into exclusive set: ${generalLeak.join(", ")}`);

const ownershipKeys = Object.keys(byEquipment.byEquipmentId).map(Number);
const ownershipKeySet = new Set(ownershipKeys);
assert(ownershipKeys.length === 167, `Expected 167 byEquipment keys, got ${ownershipKeys.length}.`);
assert(ownershipKeys.every((id) => detailIdSet.has(id)), "byEquipment key set must equal exclusive equipment IDs.");
assert(detailIds.every((id) => ownershipKeySet.has(id)), "Every exclusive equipment must have a byEquipment owner entry.");

const heroIds = new Set(heroMaster.records.map((hero) => hero.heroId));
let ownershipCardinalityMismatch = 0;
let ownerHeroMissing = 0;
for (const equipmentId of detailIds) {
  const ownerIds = byEquipment.byEquipmentId[String(equipmentId)] ?? [];
  if (ownerIds.length !== 1) ownershipCardinalityMismatch += 1;
  for (const heroId of ownerIds) {
    if (!heroIds.has(heroId)) ownerHeroMissing += 1;
  }
}
assert(ownershipCardinalityMismatch === 0, `Exclusive ownership cardinality mismatch: ${ownershipCardinalityMismatch}.`);
assert(ownerHeroMissing === 0, `Exclusive owner Hero missing from master: ${ownerHeroMissing}.`);

const expectedTaxonomy = stage40.expected.filterTaxonomy;
assert(exclusive.filters.length === expectedTaxonomy.length, "Exclusive filter group count mismatch.");
for (let index = 0; index < expectedTaxonomy.length; index += 1) {
  const expected = expectedTaxonomy[index];
  const actual = exclusive.filters[index];
  assert(actual.group === expected.group, `Exclusive filter group order mismatch at ${index}.`);
  assert(actual.groupKo === expected.groupKo, `Exclusive filter Korean label mismatch for ${expected.group}.`);

  let previousSubtypeIndex = -1;
  const seenSubtypes = new Set();
  for (const item of actual.subtypes) {
    const subtypeIndex = expected.subtypes.indexOf(item.subtype);
    assert(subtypeIndex >= 0, `Unexpected exclusive subtype ${item.subtype} for ${expected.group}.`);
    assert(subtypeIndex > previousSubtypeIndex, `Exclusive subtype order mismatch for ${expected.group}.`);
    assert(!seenSubtypes.has(item.subtype), `Duplicate exclusive subtype ${item.subtype} for ${expected.group}.`);
    seenSubtypes.add(item.subtype);
    previousSubtypeIndex = subtypeIndex;
  }
}

let nameKrReview = 0;
let releaseDateKnown = 0;
let twoProperties = 0;
const restrictionModeCounts = {};

for (const record of exclusive.detailRecords) {
  assert(record.identity?.equipmentId === record.equipmentId, `Identity mismatch for ${record.equipmentId}.`);
  assert(record.classification?.acquisitionClass === "exclusive-equipment", `Invalid acquisition class for ${record.equipmentId}.`);
  assert(record.classification?.siteTab === null, `Exclusive equipment ${record.equipmentId} must not have a general siteTab.`);
  if (record.identity.nameKr === null) nameKrReview += 1;

  assert(record.stats?.maxLevel === 50, `Expected Lv50 stats for ${record.equipmentId}.`);
  assert(record.stats?.properties?.length === 2, `Exclusive equipment ${record.equipmentId} must have two stat properties.`);
  twoProperties += 1;
  for (const property of record.stats.properties) {
    assert(Number.isFinite(property.maxValue), `Invalid maxValue for ${record.equipmentId}.`);
  }

  assert(Array.isArray(record.effect?.effectSegments), `Missing effect segments for ${record.equipmentId}.`);
  assert(
    record.effect.effectSegments.map((segment) => segment.text).join("") === record.effect.effectText,
    `Effect segments do not preserve effectText for ${record.equipmentId}.`,
  );

  restrictionModeCounts[record.restriction.mode] = (restrictionModeCounts[record.restriction.mode] ?? 0) + 1;
  for (const armyId of record.restriction.generalArmyIds) {
    assert(restrictions.armyIndex[String(armyId)], `Missing Army display index ${armyId} for ${record.equipmentId}.`);
  }
  for (const jobId of record.restriction.specialJobIds) {
    assert(jobIndex.jobs[String(jobId)], `Missing Job display index ${jobId} for ${record.equipmentId}.`);
  }

  if (record.acquisition?.releaseGroupDate !== null) releaseDateKnown += 1;
}

assert(nameKrReview === 128, `Expected 128 REVIEW Korean names, got ${nameKrReview}.`);
assert(twoProperties === 167, `Expected 167 two-property exclusive records, got ${twoProperties}.`);
assert(releaseDateKnown === 0, `Exclusive release chronology must remain REVIEW; found ${releaseDateKnown} dates.`);
assert(restrictions.semantics.status === "structural-inference", "Restriction semantics must remain structural-inference.");
assert(restrictions.semantics.confidence === 0.99, "Restriction semantic confidence must remain 0.99.");

const requiredExclusiveRouteMarkers = [
  'createFileRoute("/equipment_/exclusive")',
  "data.filters.map",
  "record.ownerHero.nameKr",
  'to="/equipment/$equipmentId"',
  "getOfficialEquipmentImageUrl",
  "deterministic order",
  "전용장비 출시순으로 해석하지 않아",
];
for (const marker of requiredExclusiveRouteMarkers) {
  assert(exclusiveRoute.includes(marker), `Exclusive route missing Stage 4-4 marker: ${marker}`);
}
assert(!exclusiveRoute.includes("SkillHero"), "Exclusive route must not derive ownership from SkillHero.");
assert(!exclusiveRoute.includes("MissionType 77"), "Exclusive route must not use MissionType 77 as ownership authority.");
assert(!exclusiveRoute.includes(".sort("), "Exclusive route must preserve generated presentation order.");
assert(!exclusiveRoute.includes("ConfigData"), "Exclusive route must not read raw ConfigData.");

const requiredDetailMarkers = [
  "ExclusiveEquipmentDetail",
  "ownerHero.nameKr",
  "ownerHero.nameCn",
  "StatsSection stats={stats}",
  "EffectSection effect={effect}",
  "RestrictionSection restriction={restriction}",
  "equipmentId → heroIds",
  "정확한 출시 날짜와 출시 순서는 REVIEW 상태",
];
for (const marker of requiredDetailMarkers) {
  assert(detailRoute.includes(marker), `Detail route missing exclusive Stage 4-4 marker: ${marker}`);
}
assert(!detailRoute.includes("SkillHero"), "Detail route must not derive ownership from SkillHero.");
assert(!detailRoute.includes(".sort("), "Detail route must not invent exclusive release order.");

const requiredServerMarkers = [
  'hero-exclusive-equipment-by-equipment.v1.json',
  'hero-name-master.v1.json',
  "resolveExclusiveOwnerHero",
  "resolveExclusiveRestrictionPresentation",
  "exclusiveConsumer.filters",
  "ownerHero: resolveExclusiveOwnerHero",
];
for (const marker of requiredServerMarkers) {
  assert(serverSource.includes(marker), `Server composition missing Stage 4-4 marker: ${marker}`);
}
for (const forbidden of ["ConfigDataEquipmentInfo", "SkillHero", "MissionType 77"]) {
  assert(!serverSource.includes(forbidden), `Server must not use forbidden ownership source: ${forbidden}`);
}

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const summary = {
  version: 1,
  stage: "4-4",
  status: "PASS",
  finalStageStatus: "STAGE4_4_EXCLUSIVE_UI_AND_OWNERSHIP_READY",
  upstream: {
    stage40: stage40.status,
    stage43: stage43.finalStageStatus,
    stageB: stageB.status,
    stage35: exclusive.status,
  },
  routes: {
    list: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    routeKey: "equipmentId",
  },
  population: {
    exclusiveList: exclusive.listRecords.length,
    exclusiveDetail: exclusive.detailRecords.length,
    uniqueEquipmentIds: detailIdSet.size,
    generalEquipmentLeak: generalLeak.length,
  },
  ownership: {
    source: "data/generated/hero-exclusive-equipment-by-equipment.v1.json#byEquipmentId",
    metadataJoin: "data/hero-name-master.v1.json#records by exact heroId",
    byEquipmentKeys: ownershipKeys.length,
    cardinalityMismatch: ownershipCardinalityMismatch,
    ownerHeroMissing,
    ownershipRederivation: false,
  },
  filters: {
    source: "data/generated/equipment_stage3_5_exclusive_consumer.json#filters",
    generatedTaxonomyPreserved: true,
    missingSubtypesAllowedWhenNoExclusiveRecordsExist: true,
    groups: exclusive.filters.map((filter) => ({
      group: filter.group,
      groupKo: filter.groupKo,
      subtypes: filter.subtypes.map((item) => item.subtype),
    })),
  },
  detail: {
    maxLevel: 50,
    twoProperties,
    effectSegmentParityChecked: true,
    restrictionModeCounts,
    restrictionSemantics: restrictions.semantics.status,
    restrictionConfidence: restrictions.semantics.confidence,
  },
  naming: {
    fallback: "nameKr ?? nameCn",
    verified: 167 - nameKrReview,
    review: nameKrReview,
    reviewPromoted: false,
  },
  release: {
    knownDates: releaseDateKnown,
    chronologyStatus: "REVIEW",
    presentationOrderOnly: true,
    chronologyInvented: false,
  },
  assets: {
    equipmentIconBound: true,
    resolver: "getOfficialEquipmentImageUrl(equipmentId)",
    identityKey: "equipmentId",
  },
  sourceDiscipline: {
    stage35DisplayDetailOnly: true,
    stageBOwnershipOnly: true,
    directConfigDataReads: false,
    directSkillHeroOwnershipReads: false,
    missionType77OwnershipReads: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-5 display/state policy hardening",
};

const outPath = path.join(ROOT, "data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json");
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Stage 4-4 PASS: ${exclusive.detailRecords.length} exclusive Equipment records and owners validated.`);
