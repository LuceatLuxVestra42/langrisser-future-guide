import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "data/validation/equipment-stage4-7-whole-consumer-regression-summary.v1.json";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameNumberSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return new Set(left).size === left.length && left.every((value) => rightSet.has(value));
}

const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stage41 = readJson("data/validation/equipment-stage4-1-route-loader-summary.v1.json");
const stage42 = readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json");
const stage43 = readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
const stage44 = readJson("data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json");
const stage45 = readJson("data/validation/equipment-stage4-5-display-state-policy-summary.v1.json");
const stage46 = readJson("data/validation/equipment-stage4-6-admission-route-qa-summary.v1.json");

const generalList = readJson("data/generated/equipment_stage3_3_general_list.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const special = readJson("data/generated/equipment_stage3_6_special_unresolved.json");
const byEquipment = readJson("data/generated/hero-exclusive-equipment-by-equipment.v1.json");
const heroMaster = readJson("data/hero-name-master.v1.json");

const generalRoute = readText("src/routes/equipment.tsx");
const exclusiveRoute = readText("src/routes/equipment_.exclusive.tsx");
const detailRoute = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");
const functionSource = readText("src/lib/equipment-page.functions.ts");
const routeTree = readText("src/routeTree.gen.ts");

assert(stage40.status === "FROZEN", "Stage 4-0 must remain FROZEN.");
assert(stage41.status === "PASS" && stage41.finalStageStatus === "STAGE4_1_ROUTE_LOADER_SCAFFOLD_READY", "Stage 4-1 checkpoint mismatch.");
assert(stage42.status === "PASS" && stage42.finalStageStatus === "STAGE4_2_GENERAL_LIST_UI_READY", "Stage 4-2 checkpoint mismatch.");
assert(stage43.status === "PASS" && stage43.finalStageStatus === "STAGE4_3_GENERAL_DETAIL_UI_READY", "Stage 4-3 checkpoint mismatch.");
assert(stage44.status === "PASS" && stage44.finalStageStatus === "STAGE4_4_EXCLUSIVE_UI_AND_OWNERSHIP_READY", "Stage 4-4 checkpoint mismatch.");
assert(stage45.status === "PASS" && stage45.finalStageStatus === "STAGE4_5_DISPLAY_STATE_POLICY_HARDENED", "Stage 4-5 checkpoint mismatch.");
assert(stage46.status === "PASS" && stage46.finalStageStatus === "STAGE4_6_ADMISSION_ROUTE_QA_READY", "Stage 4-6 checkpoint mismatch.");

const generalListIds = generalList.records.map((record) => record.equipmentId);
const generalDetailIds = generalDetail.records.map((record) => record.equipmentId);
const exclusiveListIds = exclusive.listRecords.map((record) => record.equipmentId);
const exclusiveDetailIds = exclusive.detailRecords.map((record) => record.equipmentId);
const hiddenIds = special.specialRecords.map((record) => record.equipmentId);
const holdIds = special.holdRecords.map((record) => record.equipmentId);
const publicIds = [...generalDetailIds, ...exclusiveDetailIds];
const blockedIds = [...hiddenIds, ...holdIds];
const canonicalIds = [...publicIds, ...blockedIds];

assert(generalListIds.length === 206, `Expected 206 general list records, got ${generalListIds.length}.`);
assert(generalDetailIds.length === 206, `Expected 206 general detail records, got ${generalDetailIds.length}.`);
assert(exclusiveListIds.length === 167, `Expected 167 exclusive list records, got ${exclusiveListIds.length}.`);
assert(exclusiveDetailIds.length === 167, `Expected 167 exclusive detail records, got ${exclusiveDetailIds.length}.`);
assert(hiddenIds.length === 16, `Expected 16 hidden special records, got ${hiddenIds.length}.`);
assert(holdIds.length === 1 && holdIds[0] === 2013, "Expected sole HOLD equipmentId 2013.");
assert(sameNumberSet(generalListIds, generalDetailIds), "General list/detail equipmentId parity mismatch.");
assert(sameNumberSet(exclusiveListIds, exclusiveDetailIds), "Exclusive list/detail equipmentId parity mismatch.");
assert(new Set(publicIds).size === 373, "Public equipment IDs must be unique across general/exclusive.");
assert(new Set(canonicalIds).size === 390, "Canonical equipment partition must contain 390 unique IDs.");
assert(canonicalIds.length === 390, "Canonical equipment partition length mismatch.");

const publicIdSet = new Set(publicIds);
for (const id of blockedIds) {
  assert(!publicIdSet.has(id), `Blocked equipment ${id} leaked into public sets.`);
}

const tabCounts = generalList.records.reduce((counts, record) => {
  counts[String(record.siteTab)] = (counts[String(record.siteTab)] ?? 0) + 1;
  return counts;
}, {});
assert(tabCounts["1"] === 94 && tabCounts["2"] === 80 && tabCounts["3"] === 32, "General tab population must remain 94/80/32.");

const expectedTaxonomy = stage40.expected.filterTaxonomy;
assert(generalList.filters.length === expectedTaxonomy.length, "General filter group count drifted.");
assert(exclusive.filters.length === expectedTaxonomy.length, "Exclusive filter group count drifted.");
for (let index = 0; index < expectedTaxonomy.length; index += 1) {
  const expected = expectedTaxonomy[index];
  const general = generalList.filters[index];
  const exclusiveFilter = exclusive.filters[index];

  assert(general.group === expected.group && general.groupKo === expected.groupKo, `General filter group mismatch at ${index}.`);
  assert(
    JSON.stringify(general.subtypes.map((item) => item.subtype)) === JSON.stringify(expected.subtypes),
    `General subtype taxonomy mismatch for ${expected.group}.`,
  );

  assert(exclusiveFilter.group === expected.group && exclusiveFilter.groupKo === expected.groupKo, `Exclusive filter group mismatch at ${index}.`);
  const expectedPositions = new Map(expected.subtypes.map((subtype, position) => [subtype, position]));
  const exclusiveSubtypeIds = exclusiveFilter.subtypes.map((item) => item.subtype);
  assert(new Set(exclusiveSubtypeIds).size === exclusiveSubtypeIds.length, `Duplicate exclusive subtype in ${expected.group}.`);
  let lastPosition = -1;
  for (const subtype of exclusiveSubtypeIds) {
    assert(expectedPositions.has(subtype), `Unknown exclusive subtype ${expected.group}/${subtype}.`);
    const position = expectedPositions.get(subtype);
    assert(position > lastPosition, `Exclusive subtype order drifted for ${expected.group}.`);
    lastPosition = position;
  }
}

const generalNameReview = generalList.records.filter((record) => record.nameKr === null).length;
const exclusiveNameReview = exclusive.listRecords.filter((record) => record.nameKr === null).length;
assert(generalNameReview === 59, `Expected 59 general Korean-name REVIEW records, got ${generalNameReview}.`);
assert(exclusiveNameReview === 128, `Expected 128 exclusive Korean-name REVIEW records, got ${exclusiveNameReview}.`);

const generalReleaseDatesByTab = { "1": 0, "2": 0, "3": 0 };
for (const record of generalDetail.records) {
  if (record.acquisition.releaseGroupDate !== null) {
    generalReleaseDatesByTab[String(record.classification.siteTab)] += 1;
  }
}
const exclusiveReleaseDates = exclusive.detailRecords.filter((record) => record.acquisition.releaseGroupDate !== null).length;
assert(
  generalReleaseDatesByTab["1"] === 0 &&
    generalReleaseDatesByTab["2"] === 80 &&
    generalReleaseDatesByTab["3"] === 0,
  `General release-date review boundary drifted: ${JSON.stringify(generalReleaseDatesByTab)}.`,
);
assert(exclusiveReleaseDates === 0, `Exclusive release chronology must remain REVIEW; found ${exclusiveReleaseDates} dates.`);

let effectParityChecked = 0;
let maxLevel50Checked = 0;
for (const record of [...generalDetail.records, ...exclusive.detailRecords]) {
  assert(record.stats.maxLevel === 50, `Equipment ${record.equipmentId} maxLevel drifted from 50.`);
  maxLevel50Checked += 1;
  assert(
    record.effect.effectSegments.map((segment) => segment.text).join("") === record.effect.effectText,
    `Equipment ${record.equipmentId} effect segment parity failed.`,
  );
  effectParityChecked += 1;
}
assert(effectParityChecked === 373 && maxLevel50Checked === 373, "Whole detail checks must cover all 373 public records.");

const ownershipKeys = Object.keys(byEquipment.byEquipmentId).map(Number);
const heroIds = new Set(heroMaster.records.map((hero) => hero.heroId));
assert(sameNumberSet(ownershipKeys, exclusiveDetailIds), "Exclusive ownership key set must equal exclusive detail IDs.");
let ownershipCardinalityMismatch = 0;
let ownerHeroMissing = 0;
for (const equipmentId of exclusiveDetailIds) {
  const ownerIds = byEquipment.byEquipmentId[String(equipmentId)] ?? [];
  if (ownerIds.length !== 1) ownershipCardinalityMismatch += 1;
  for (const heroId of ownerIds) {
    if (!heroIds.has(heroId)) ownerHeroMissing += 1;
  }
}
assert(ownershipCardinalityMismatch === 0, `Exclusive ownership cardinality mismatches: ${ownershipCardinalityMismatch}.`);
assert(ownerHeroMissing === 0, `Exclusive owner Heroes missing from master: ${ownerHeroMissing}.`);

for (const marker of [
  'createFileRoute("/equipment")',
  'equipment-general-list-ui.v1',
  "window.localStorage.getItem",
  "window.localStorage.setItem",
  "TAB_ORDER_POLICIES",
  "한국명 REVIEW · 중문명 임시 표시",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
]) {
  assert(generalRoute.includes(marker), `General route missing whole-consumer marker: ${marker}`);
}
assert(!generalRoute.includes(".sort("), "General list must preserve generated order.");

for (const marker of [
  'createFileRoute("/equipment/exclusive")',
  'equipment-exclusive-list-ui.v1',
  "window.localStorage.getItem",
  "window.localStorage.setItem",
  "record.ownerHero.nameKr",
  "전용장비 출시순으로 해석하지 않아",
  "한국명 REVIEW · 중문명 임시 표시",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
]) {
  assert(exclusiveRoute.includes(marker), `Exclusive route missing whole-consumer marker: ${marker}`);
}
assert(!exclusiveRoute.includes(".sort("), "Exclusive list must preserve generated order.");

for (const marker of [
  'createFileRoute("/equipment/$equipmentId")',
  '!/^\\d+$/.test(params.equipmentId)',
  "Number.isSafeInteger(equipmentId)",
  "equipmentId <= 0",
  "if (!data)",
  "throw notFound()",
  "notFoundComponent: EquipmentNotFound",
  'data.kind === "exclusive"',
  "ExclusiveEquipmentDetail",
  "ownerHero.nameKr",
  "ownerHero.nameCn",
  "한국명이 아직 검수 확정되지 않아",
  "정확한 출시 순서는 REVIEW 상태",
]) {
  assert(detailRoute.includes(marker), `Detail route missing whole-consumer marker: ${marker}`);
}
assert(!detailRoute.includes(".sort("), "Detail route must not invent chronology.");

for (const marker of [
  "generalDetailById",
  "exclusiveDetailById",
  "readEquipmentDetailPageData",
  "resolveExclusiveOwnerHero",
  "return null",
  "equipment_stage3_3_general_list.json",
  "equipment_stage3_4_general_detail.json",
  "equipment_stage3_5_exclusive_consumer.json",
  "hero-exclusive-equipment-by-equipment.v1.json",
]) {
  assert(serverSource.includes(marker), `Server consumer missing marker: ${marker}`);
}
for (const forbidden of [
  "equipment_stage3_6_special_unresolved.json",
  "ConfigDataEquipmentInfo",
  "SkillHero",
  "MissionType 77",
]) {
  assert(!serverSource.includes(forbidden), `Public server must not import/rederive forbidden source: ${forbidden}`);
}

for (const marker of [
  "getEquipmentDetailPageData",
  "Number.isSafeInteger(input.equipmentId)",
  "input.equipmentId <= 0",
  "readEquipmentDetailPageData(data.equipmentId)",
]) {
  assert(functionSource.includes(marker), `Server function boundary missing marker: ${marker}`);
}

for (const marker of [
  "/equipment",
  "/equipment/exclusive",
  "/equipment/$equipmentId",
]) {
  assert(routeTree.includes(marker), `Generated route tree missing ${marker}.`);
}

const runtimeProbeSource = `
import { readEquipmentDetailPageData } from "./src/lib/equipment-page.server.ts";
const generalIds = ${JSON.stringify(generalDetailIds)};
const exclusiveIds = ${JSON.stringify(exclusiveDetailIds)};
const blockedIds = ${JSON.stringify(blockedIds)};
const unknownIds = [999999, 888888888, 9007199254740991];

let generalResolved = 0;
let exclusiveResolved = 0;
let blockedResolved = 0;
let unknownResolved = 0;
let kindMismatch = 0;
let equipmentIdMismatch = 0;
let ownerMismatch = 0;

for (const id of generalIds) {
  const data = readEquipmentDetailPageData(id);
  if (data) generalResolved += 1;
  if (!data || data.kind !== "general") kindMismatch += 1;
  if (!data || data.equipmentId !== id) equipmentIdMismatch += 1;
  if (!data || data.ownerHero !== null) ownerMismatch += 1;
}
for (const id of exclusiveIds) {
  const data = readEquipmentDetailPageData(id);
  if (data) exclusiveResolved += 1;
  if (!data || data.kind !== "exclusive") kindMismatch += 1;
  if (!data || data.equipmentId !== id) equipmentIdMismatch += 1;
  if (!data || !data.ownerHero) ownerMismatch += 1;
}
for (const id of blockedIds) {
  if (readEquipmentDetailPageData(id) !== null) blockedResolved += 1;
}
for (const id of unknownIds) {
  if (readEquipmentDetailPageData(id) !== null) unknownResolved += 1;
}

console.log(JSON.stringify({
  generalResolved,
  exclusiveResolved,
  blockedResolved,
  unknownResolved,
  kindMismatch,
  equipmentIdMismatch,
  ownerMismatch,
  unknownIds
}));
`;

const runtimeProbe = JSON.parse(
  execFileSync("bun", ["-e", runtimeProbeSource], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim(),
);

assert(runtimeProbe.generalResolved === 206, `Runtime general resolve count ${runtimeProbe.generalResolved}.`);
assert(runtimeProbe.exclusiveResolved === 167, `Runtime exclusive resolve count ${runtimeProbe.exclusiveResolved}.`);
assert(runtimeProbe.blockedResolved === 0, `Blocked records resolved at runtime: ${runtimeProbe.blockedResolved}.`);
assert(runtimeProbe.unknownResolved === 0, `Unknown positive IDs resolved at runtime: ${runtimeProbe.unknownResolved}.`);
assert(runtimeProbe.kindMismatch === 0, `Runtime detail kind mismatches: ${runtimeProbe.kindMismatch}.`);
assert(runtimeProbe.equipmentIdMismatch === 0, `Runtime equipmentId mismatches: ${runtimeProbe.equipmentIdMismatch}.`);
assert(runtimeProbe.ownerMismatch === 0, `Runtime ownership payload mismatches: ${runtimeProbe.ownerMismatch}.`);

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const summary = {
  version: 1,
  stage: "4-7",
  status: "PASS",
  finalStageStatus: "STAGE4_7_WHOLE_CONSUMER_REGRESSION_READY",
  upstream: {
    stage40: stage40.status,
    stage41: stage41.finalStageStatus,
    stage42: stage42.finalStageStatus,
    stage43: stage43.finalStageStatus,
    stage44: stage44.finalStageStatus,
    stage45: stage45.finalStageStatus,
    stage46: stage46.finalStageStatus,
  },
  population: {
    canonical: canonicalIds.length,
    public: publicIds.length,
    general: generalDetailIds.length,
    exclusive: exclusiveDetailIds.length,
    hiddenSpecial: hiddenIds.length,
    hold: holdIds.length,
    holdEquipmentIds: holdIds,
    generalTabs: tabCounts,
  },
  consumerChain: {
    generalListDetailExact: true,
    exclusiveListDetailExact: true,
    exactEquipmentIdNavigation: true,
    runtimeGeneralResolved: runtimeProbe.generalResolved,
    runtimeExclusiveResolved: runtimeProbe.exclusiveResolved,
    runtimeKindMismatch: runtimeProbe.kindMismatch,
    runtimeEquipmentIdMismatch: runtimeProbe.equipmentIdMismatch,
    exclusiveOwnerPayloadMismatch: runtimeProbe.ownerMismatch,
  },
  statePolicy: {
    generalStorageKey: "equipment-general-list-ui.v1",
    exclusiveStorageKey: "equipment-exclusive-list-ui.v1",
    isolatedKeys: true,
    restoreAndSanitizeMarkersPresent: true,
  },
  displayPolicy: {
    nameFallback: "nameKr ?? nameCn",
    generalNameReview,
    exclusiveNameReview,
    reviewPromoted: false,
    generalReleaseDatesByTab,
    exclusiveReleaseDates,
    generatedOrderPreserved: true,
    frontendSortAdded: false,
    effectSegmentParityChecked,
    maxLevel50Checked,
  },
  ownership: {
    source: "data/generated/hero-exclusive-equipment-by-equipment.v1.json#byEquipmentId",
    keys: ownershipKeys.length,
    cardinalityMismatch: ownershipCardinalityMismatch,
    ownerHeroMissing,
    rederived: false,
  },
  admission: {
    hiddenResolved: 0,
    holdResolved: 0,
    blockedRecordCount: blockedIds.length,
    unknownPositiveIdsTested: runtimeProbe.unknownIds,
    unknownResolved: runtimeProbe.unknownResolved,
    publicServerImportsHiddenHold: false,
  },
  routes: {
    generalList: "/equipment",
    exclusiveList: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    generatedRouteTreeVerified: true,
    invalidParamGuardPreservedFromStage46: stage46.routeGuards.invalidParamsRejected === stage46.routeGuards.invalidParamsTested,
    notFoundBoundaryPresent: true,
  },
  sourceDiscipline: {
    stage3ConsumersUsed: true,
    rawConfigDataReads: false,
    exclusiveOwnershipRederived: false,
    publicAdmissionReclassified: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-FINAL closure / PC-first review ready",
};

fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: summary.status,
  finalStageStatus: summary.finalStageStatus,
  population: summary.population,
  consumerChain: summary.consumerChain,
  admission: summary.admission,
  nextStage: summary.nextStage,
}, null, 2));
