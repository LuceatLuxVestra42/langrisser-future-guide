import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "data/validation/equipment-stage4-7-whole-consumer-regression-summary.v1.json";
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const uniqueIds = (rows, label) => {
  const ids = rows.map((row) => Number(row.equipmentId));
  assert(new Set(ids).size === ids.length, `${label} contains duplicate equipmentId values.`);
  return ids;
};
const sameSet = (a, b) => a.length === b.length && a.every((value) => new Set(b).has(value));
const mustInclude = (source, markers, label) => {
  for (const marker of markers) {
    assert(source.includes(marker), `${label} missing marker: ${marker}`);
  }
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

const generalList = readJson("data/generated/equipment_stage3_3_general_list.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const special = readJson("data/generated/equipment_stage3_6_special_unresolved.json");
const byEquipment = readJson("data/generated/hero-exclusive-equipment-by-equipment.v1.json");
const heroMaster = readJson("data/hero-name-master.v1.json");

const generalListIds = uniqueIds(generalList.records, "General List");
const generalDetailIds = uniqueIds(generalDetail.records, "General Detail");
const exclusiveListIds = uniqueIds(exclusive.listRecords, "Exclusive List");
const exclusiveDetailIds = uniqueIds(exclusive.detailRecords, "Exclusive Detail");
const hiddenIds = uniqueIds(special.specialRecords, "Hidden Special");
const holdIds = uniqueIds(special.holdRecords, "HOLD");
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

const tabCounts = generalList.records.reduce((acc, record) => {
  acc[String(record.siteTab)] = (acc[String(record.siteTab)] ?? 0) + 1;
  return acc;
}, {});
assert(
  JSON.stringify(tabCounts) === JSON.stringify({ "1": 94, "2": 80, "3": 32 }),
  `General tabs drifted: ${JSON.stringify(tabCounts)}.`,
);

const ownershipKeys = Object.keys(byEquipment.byEquipmentId).map(Number);
assert(sameSet(ownershipKeys, exclusiveDetailIds), "byEquipment ownership keys must equal exclusive IDs.");
const heroIds = new Set(heroMaster.records.map((hero) => Number(hero.heroId)));
let ownershipCardinalityMismatch = 0;
let ownerHeroMissing = 0;
for (const equipmentId of exclusiveDetailIds) {
  const owners = byEquipment.byEquipmentId[String(equipmentId)] ?? [];
  if (owners.length !== 1) ownershipCardinalityMismatch += 1;
  if (owners.some((heroId) => !heroIds.has(Number(heroId)))) ownerHeroMissing += 1;
}
assert(ownershipCardinalityMismatch === 0, "Exclusive ownership cardinality drifted.");
assert(ownerHeroMissing === 0, "Exclusive owner Hero missing from Hero master.");

const generalRoute = readText("src/routes/equipment.tsx");
const exclusiveRoute = readText("src/routes/equipment_.exclusive.tsx");
const detailRoute = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");
const localizedServerSource = readText("src/lib/equipment-page.localized.server.ts");
const functionSource = readText("src/lib/equipment-page.functions.ts");

mustInclude(generalRoute, [
  'createFileRoute("/equipment")',
  'const EQUIPMENT_LIST_STORAGE_KEY = "equipment-general-list-ui.v1"',
  "window.localStorage.getItem(EQUIPMENT_LIST_STORAGE_KEY)",
  "window.localStorage.setItem(EQUIPMENT_LIST_STORAGE_KEY, JSON.stringify(uiState))",
  "TAB_ORDER_POLICIES",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
  "getOfficialEquipmentImageUrl(record.equipmentId)",
], "General route");
mustInclude(exclusiveRoute, [
  'createFileRoute("/equipment_/exclusive")',
  'const EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY = "equipment-exclusive-list-ui.v1"',
  "record.ownerHero.nameKr",
  'to="/equipment/$equipmentId"',
  "params={{ equipmentId: String(record.equipmentId) }}",
  "getOfficialEquipmentImageUrl(record.equipmentId)",
], "Exclusive route");
mustInclude(detailRoute, [
  'createFileRoute("/equipment_/$equipmentId")',
  '!/^\\d+$/.test(params.equipmentId)',
  "Number.isSafeInteger(equipmentId)",
  "equipmentId <= 0",
  "throw notFound()",
  "notFoundComponent: EquipmentNotFound",
  'data.kind === "exclusive"',
  "getOfficialEquipmentImageUrl(equipmentId)",
  "src={imageUrl}",
], "Detail route");
for (const [label, source] of [["general", generalRoute], ["exclusive", exclusiveRoute], ["detail", detailRoute]]) {
  assert(!source.includes(".sort("), `${label} route added frontend sorting.`);
  assert(!source.includes("ConfigData"), `${label} route must not read raw ConfigData.`);
  assert(!source.includes("SkillHero"), `${label} route must not rederive ownership.`);
}

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
], "Equipment base server");
mustInclude(localizedServerSource, [
  'from "./equipment-page.server"',
  "equipment-name-kr-user-approved.v1.json",
  "byEquipmentId",
], "Equipment localized server");
mustInclude(functionSource, [
  'from "./equipment-page.localized.server"',
  "getEquipmentDetailPageData",
  "Number.isSafeInteger(input.equipmentId)",
  "input.equipmentId <= 0",
  "readEquipmentDetailPageData(data.equipmentId)",
], "Equipment server function");
for (const source of [serverSource, localizedServerSource, functionSource]) {
  for (const forbidden of ["ConfigDataEquipmentInfo", "SkillHero", "MissionType 77"]) {
    assert(!source.includes(forbidden), `Equipment server boundary contains forbidden marker: ${forbidden}.`);
  }
}
assert(!serverSource.includes("equipment_stage3_6_special_unresolved.json"), "Public base server must not import hidden/HOLD consumer data.");

const serverModule = await import(pathToFileURL(path.join(ROOT, "src/lib/equipment-page.server.ts")).href);
let generalResolved = 0;
let exclusiveResolved = 0;
let blockedResolved = 0;
let unknownResolved = 0;
for (const equipmentId of generalDetailIds) {
  const data = serverModule.readEquipmentDetailPageData(equipmentId);
  assert(data?.kind === "general" && data.equipmentId === equipmentId, `General runtime mismatch ${equipmentId}.`);
  generalResolved += 1;
}
for (const equipmentId of exclusiveDetailIds) {
  const data = serverModule.readEquipmentDetailPageData(equipmentId);
  assert(data?.kind === "exclusive" && data.equipmentId === equipmentId, `Exclusive runtime mismatch ${equipmentId}.`);
  assert(data.ownerHero?.heroId > 0, `Exclusive owner missing ${equipmentId}.`);
  exclusiveResolved += 1;
}
for (const equipmentId of blockedIds) {
  if (serverModule.readEquipmentDetailPageData(equipmentId) !== null) blockedResolved += 1;
}
const unknown = [999999, 888888888, Number.MAX_SAFE_INTEGER];
for (const equipmentId of unknown) {
  if (serverModule.readEquipmentDetailPageData(equipmentId) !== null) unknownResolved += 1;
}
assert(blockedResolved === 0, `${blockedResolved} blocked Equipment IDs resolved publicly.`);
assert(unknownResolved === 0, `${unknownResolved} unknown Equipment IDs resolved publicly.`);

execFileSync("bun", ["run", "build"], { cwd: ROOT, stdio: "inherit", env: process.env });
const routeTree = readText("src/routeTree.gen.ts");
for (const route of ["/equipment", "/equipment/exclusive", "/equipment/$equipmentId"]) {
  assert(routeTree.includes(route), `Generated route tree missing ${route}.`);
}

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
    runtimeGeneralResolved: generalResolved,
    runtimeExclusiveResolved: exclusiveResolved,
  },
  statePolicy: {
    generalStorageKey: "equipment-general-list-ui.v1",
    exclusiveStorageKey: "equipment-exclusive-list-ui.v1",
    restoreAndSanitizeMarkersPresent: true,
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
    unknownPositiveIdsTested: unknown,
    unknownResolved,
  },
  routes: {
    generalList: "/equipment",
    exclusiveList: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    siblingRouteIdsVerified: true,
    generatedRouteTreeVerified: true,
  },
  localizationBoundary: {
    localizedPresentationAdapter: true,
    baseServerDelegationPreserved: true,
    identityKey: "equipmentId",
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
