import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "data/validation/equipment-stage4-7-whole-consumer-regression-summary.v1.json";
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => new Set(b).has(x));
const mustInclude = (source, markers, label) => {
  for (const marker of markers) assert(source.includes(marker), `${label} missing marker: ${marker}`);
};

const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stages = [
  readJson("data/validation/equipment-stage4-1-route-loader-summary.v1.json"),
  readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json"),
  readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json"),
  readJson("data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json"),
  readJson("data/validation/equipment-stage4-5-display-state-policy-summary.v1.json"),
  readJson("data/validation/equipment-stage4-6-admission-route-qa-summary.v1.json"),
];
const expectedFinals = [
  "STAGE4_1_ROUTE_LOADER_SCAFFOLD_READY",
  "STAGE4_2_GENERAL_LIST_UI_READY",
  "STAGE4_3_GENERAL_DETAIL_UI_READY",
  "STAGE4_4_EXCLUSIVE_UI_AND_OWNERSHIP_READY",
  "STAGE4_5_DISPLAY_STATE_POLICY_HARDENED",
  "STAGE4_6_ADMISSION_ROUTE_QA_READY",
];

assert(stage40.status === "FROZEN", "Stage 4-0 must remain FROZEN.");
stages.forEach((stage, index) => {
  assert(stage.status === "PASS", `Stage 4-${index + 1} must remain PASS.`);
  assert(stage.finalStageStatus === expectedFinals[index], `Stage 4-${index + 1} final status mismatch.`);
});
const stage46 = stages[5];

const generalList = readJson("data/generated/equipment_stage3_3_general_list.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const special = readJson("data/generated/equipment_stage3_6_special_unresolved.json");
const byEquipment = readJson("data/generated/hero-exclusive-equipment-by-equipment.v1.json");
const heroMaster = readJson("data/hero-name-master.v1.json");

const generalListIds = generalList.records.map((x) => x.equipmentId);
const generalDetailIds = generalDetail.records.map((x) => x.equipmentId);
const exclusiveListIds = exclusive.listRecords.map((x) => x.equipmentId);
const exclusiveDetailIds = exclusive.detailRecords.map((x) => x.equipmentId);
const hiddenIds = special.specialRecords.map((x) => x.equipmentId);
const holdIds = special.holdRecords.map((x) => x.equipmentId);
const publicIds = [...generalDetailIds, ...exclusiveDetailIds];
const blockedIds = [...hiddenIds, ...holdIds];
const canonicalIds = [...publicIds, ...blockedIds];

assert(generalListIds.length === 206 && generalDetailIds.length === 206, "General population must remain 206/206.");
assert(exclusiveListIds.length === 167 && exclusiveDetailIds.length === 167, "Exclusive population must remain 167/167.");
assert(hiddenIds.length === 16, "Hidden special population must remain 16.");
assert(holdIds.length === 1 && holdIds[0] === 2013, "HOLD must remain equipmentId 2013 only.");
assert(sameSet(generalListIds, generalDetailIds), "General list/detail parity mismatch.");
assert(sameSet(exclusiveListIds, exclusiveDetailIds), "Exclusive list/detail parity mismatch.");
assert(new Set(publicIds).size === 373, "Public general/exclusive union must contain 373 unique IDs.");
assert(canonicalIds.length === 390 && new Set(canonicalIds).size === 390, "Canonical partition must close at 390 unique IDs.");
const publicSet = new Set(publicIds);
assert(blockedIds.every((id) => !publicSet.has(id)), "Hidden/HOLD equipment leaked into public consumer sets.");

const tabCounts = generalList.records.reduce((acc, x) => {
  acc[String(x.siteTab)] = (acc[String(x.siteTab)] ?? 0) + 1;
  return acc;
}, {});
assert(tabCounts["1"] === 94 && tabCounts["2"] === 80 && tabCounts["3"] === 32, "General tabs must remain 94/80/32.");

const taxonomy = stage40.expected.filterTaxonomy;
assert(generalList.filters.length === taxonomy.length && exclusive.filters.length === taxonomy.length, "Filter group count drift.");
for (let i = 0; i < taxonomy.length; i += 1) {
  const expected = taxonomy[i];
  const general = generalList.filters[i];
  const ex = exclusive.filters[i];
  assert(general.group === expected.group && general.groupKo === expected.groupKo, `General filter group drift at ${i}.`);
  assert(JSON.stringify(general.subtypes.map((x) => x.subtype)) === JSON.stringify(expected.subtypes), `General subtype drift for ${expected.group}.`);
  assert(ex.group === expected.group && ex.groupKo === expected.groupKo, `Exclusive filter group drift at ${i}.`);
  const positions = new Map(expected.subtypes.map((x, n) => [x, n]));
  let previous = -1;
  for (const subtype of ex.subtypes.map((x) => x.subtype)) {
    assert(positions.has(subtype), `Unknown exclusive subtype ${expected.group}/${subtype}.`);
    const current = positions.get(subtype);
    assert(current > previous, `Exclusive subtype order drift for ${expected.group}.`);
    previous = current;
  }
}

const generalNameReview = generalList.records.filter((x) => x.nameKr === null).length;
const exclusiveNameReview = exclusive.listRecords.filter((x) => x.nameKr === null).length;
assert(generalNameReview === 59, `General Korean-name REVIEW count drifted: ${generalNameReview}.`);
assert(exclusiveNameReview === 128, `Exclusive Korean-name REVIEW count drifted: ${exclusiveNameReview}.`);

const generalReleaseDatesByTab = { "1": 0, "2": 0, "3": 0 };
for (const x of generalDetail.records) {
  if (x.acquisition.releaseGroupDate !== null) generalReleaseDatesByTab[String(x.classification.siteTab)] += 1;
}
const exclusiveReleaseDates = exclusive.detailRecords.filter((x) => x.acquisition.releaseGroupDate !== null).length;
assert(JSON.stringify(generalReleaseDatesByTab) === JSON.stringify({ "1": 0, "2": 80, "3": 0 }), "General release-date boundary drifted.");
assert(exclusiveReleaseDates === 0, "Exclusive chronology must remain REVIEW.");

let detailIntegrityChecked = 0;
for (const x of [...generalDetail.records, ...exclusive.detailRecords]) {
  assert(x.stats.maxLevel === 50, `Equipment ${x.equipmentId} maxLevel drifted.`);
  assert(x.effect.effectSegments.map((segment) => segment.text).join("") === x.effect.effectText, `Equipment ${x.equipmentId} effect segment parity failed.`);
  detailIntegrityChecked += 1;
}
assert(detailIntegrityChecked === 373, "Detail integrity must cover all 373 public equipment.");

const ownershipKeys = Object.keys(byEquipment.byEquipmentId).map(Number);
assert(sameSet(ownershipKeys, exclusiveDetailIds), "byEquipment ownership keys must equal the exclusive consumer IDs.");
const heroIds = new Set(heroMaster.records.map((x) => x.heroId));
let ownershipCardinalityMismatch = 0;
let ownerHeroMissing = 0;
for (const id of exclusiveDetailIds) {
  const owners = byEquipment.byEquipmentId[String(id)] ?? [];
  if (owners.length !== 1) ownershipCardinalityMismatch += 1;
  if (owners.some((heroId) => !heroIds.has(heroId))) ownerHeroMissing += 1;
}
assert(ownershipCardinalityMismatch === 0, "Exclusive ownership cardinality drifted.");
assert(ownerHeroMissing === 0, "Exclusive owner Hero missing from Hero master.");

const generalRoute = readText("src/routes/equipment.tsx");
const exclusiveRoute = readText("src/routes/equipment_.exclusive.tsx");
const detailRoute = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");
const functionSource = readText("src/lib/equipment-page.functions.ts");
const routeTree = readText("src/routeTree.gen.ts");

mustInclude(generalRoute, [
  'createFileRoute("/equipment")',
  "equipment-general-list-ui.v1",
  "window.localStorage.getItem",
  "window.localStorage.setItem",
  "TAB_ORDER_POLICIES",
  "한국명 REVIEW · 중문명 임시 표시",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
], "General route");
assert(!generalRoute.includes(".sort("), "General route added frontend sorting.");

mustInclude(exclusiveRoute, [
  'createFileRoute("/equipment/exclusive")',
  "equipment-exclusive-list-ui.v1",
  "window.localStorage.getItem",
  "window.localStorage.setItem",
  "record.ownerHero.nameKr",
  "전용장비 출시순으로 해석하지 않아",
  "한국명 REVIEW · 중문명 임시 표시",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
], "Exclusive route");
assert(!exclusiveRoute.includes(".sort("), "Exclusive route added frontend sorting.");

mustInclude(detailRoute, [
  'createFileRoute("/equipment/$equipmentId")',
  '!/^\\d+$/.test(params.equipmentId)',
  "Number.isSafeInteger(equipmentId)",
  "equipmentId <= 0",
  "throw notFound()",
  "notFoundComponent: EquipmentNotFound",
  'data.kind === "exclusive"',
  "ownerHero.nameKr",
  "ownerHero.nameCn",
  "한국명이 아직 검수 확정되지 않아",
  "정확한 출시 순서는 REVIEW 상태",
], "Detail route");
assert(!detailRoute.includes(".sort("), "Detail route added invented chronology sorting.");

mustInclude(serverSource, [
  "generalDetailById",
  "exclusiveDetailById",
  "readEquipmentDetailPageData",
  "resolveExclusiveOwnerHero",
  "return null",
  "equipment_stage3_3_general_list.json",
  "equipment_stage3_4_general_detail.json",
  "equipment_stage3_5_exclusive_consumer.json",
  "hero-exclusive-equipment-by-equipment.v1.json",
], "Equipment server");
for (const forbidden of ["equipment_stage3_6_special_unresolved.json", "ConfigDataEquipmentInfo", "SkillHero", "MissionType 77"]) {
  assert(!serverSource.includes(forbidden), `Public server contains forbidden source/rederivation marker: ${forbidden}`);
}
mustInclude(functionSource, [
  "getEquipmentDetailPageData",
  "Number.isSafeInteger(input.equipmentId)",
  "input.equipmentId <= 0",
  "readEquipmentDetailPageData(data.equipmentId)",
], "Equipment server function");
for (const route of ["/equipment", "/equipment/exclusive", "/equipment/$equipmentId"]) {
  assert(routeTree.includes(route), `Generated route tree missing ${route}.`);
}

const probe = `
import { readEquipmentDetailPageData } from "./src/lib/equipment-page.server.ts";
const general = ${JSON.stringify(generalDetailIds)};
const exclusive = ${JSON.stringify(exclusiveDetailIds)};
const blocked = ${JSON.stringify(blockedIds)};
const unknown = [999999, 888888888, 9007199254740991];
const out = { generalResolved: 0, exclusiveResolved: 0, blockedResolved: 0, unknownResolved: 0, kindMismatch: 0, idMismatch: 0, ownerMismatch: 0, unknown };
for (const id of general) {
  const data = readEquipmentDetailPageData(id);
  if (data) out.generalResolved += 1;
  if (!data || data.kind !== "general") out.kindMismatch += 1;
  if (!data || data.equipmentId !== id) out.idMismatch += 1;
  if (!data || data.ownerHero !== null) out.ownerMismatch += 1;
}
for (const id of exclusive) {
  const data = readEquipmentDetailPageData(id);
  if (data) out.exclusiveResolved += 1;
  if (!data || data.kind !== "exclusive") out.kindMismatch += 1;
  if (!data || data.equipmentId !== id) out.idMismatch += 1;
  if (!data || !data.ownerHero) out.ownerMismatch += 1;
}
for (const id of blocked) if (readEquipmentDetailPageData(id) !== null) out.blockedResolved += 1;
for (const id of unknown) if (readEquipmentDetailPageData(id) !== null) out.unknownResolved += 1;
console.log(JSON.stringify(out));
`;
const runtime = JSON.parse(execFileSync("bun", ["-e", probe], { cwd: ROOT, encoding: "utf8" }).trim());
assert(runtime.generalResolved === 206 && runtime.exclusiveResolved === 167, "Runtime public resolution drifted.");
assert(runtime.blockedResolved === 0 && runtime.unknownResolved === 0, "Runtime admission leaked blocked/unknown IDs.");
assert(runtime.kindMismatch === 0 && runtime.idMismatch === 0 && runtime.ownerMismatch === 0, "Runtime consumer payload mismatch.");

execFileSync("bun", ["run", "build"], { cwd: ROOT, stdio: "inherit" });

const summary = {
  version: 1,
  stage: "4-7",
  status: "PASS",
  finalStageStatus: "STAGE4_7_WHOLE_CONSUMER_REGRESSION_READY",
  upstream: {
    stage40: stage40.status,
    stage41: stages[0].finalStageStatus,
    stage42: stages[1].finalStageStatus,
    stage43: stages[2].finalStageStatus,
    stage44: stages[3].finalStageStatus,
    stage45: stages[4].finalStageStatus,
    stage46: stages[5].finalStageStatus,
  },
  population: {
    canonical: 390,
    public: 373,
    general: 206,
    exclusive: 167,
    hiddenSpecial: 16,
    hold: 1,
    holdEquipmentIds: holdIds,
    generalTabs: tabCounts,
  },
  consumerChain: {
    generalListDetailExact: true,
    exclusiveListDetailExact: true,
    exactEquipmentIdNavigation: true,
    runtimeGeneralResolved: runtime.generalResolved,
    runtimeExclusiveResolved: runtime.exclusiveResolved,
    runtimeKindMismatch: runtime.kindMismatch,
    runtimeEquipmentIdMismatch: runtime.idMismatch,
    exclusiveOwnerPayloadMismatch: runtime.ownerMismatch,
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
    detailIntegrityChecked,
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
    unknownPositiveIdsTested: runtime.unknown,
    unknownResolved: runtime.unknownResolved,
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
  build: { command: "bun run build", pass: true },
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
