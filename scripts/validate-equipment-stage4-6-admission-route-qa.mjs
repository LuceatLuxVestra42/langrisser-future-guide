import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function ids(records) {
  return records.map((record) => record.equipmentId);
}

function uniqueSet(values, label) {
  const set = new Set(values);
  assert(set.size === values.length, `${label} contains duplicate equipmentId values.`);
  return set;
}

function assertSetEqual(left, right, message) {
  assert(left.size === right.size, `${message} Size ${left.size} !== ${right.size}.`);
  for (const value of left) {
    assert(right.has(value), `${message} Missing ${value}.`);
  }
}

function assertDisjoint(left, right, message) {
  for (const value of left) {
    assert(!right.has(value), `${message} Overlap at equipmentId ${value}.`);
  }
}

function parseRouteParamLikeCurrentGuard(value) {
  if (!/^\d+$/.test(value)) return null;
  const equipmentId = Number(value);
  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) return null;
  return equipmentId;
}

const qaMatrix = readJson("data/contracts/equipment-stage4-6-admission-route-qa.v1.json");
const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stage41 = readJson("data/validation/equipment-stage4-1-route-loader-summary.v1.json");
const stage42 = readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json");
const stage43 = readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
const stage44 = readJson("data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json");
const stage45 = readJson("data/validation/equipment-stage4-5-display-state-policy-summary.v1.json");
const generalList = readJson("data/generated/equipment_stage3_3_general_list.json");
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const specialUnresolved = readJson("data/generated/equipment_stage3_6_special_unresolved.json");

const detailRouteSource = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");
const functionsSource = readText("src/lib/equipment-page.functions.ts");
const generalRouteSource = readText("src/routes/equipment.tsx");
const exclusiveRouteSource = readText("src/routes/equipment_.exclusive.tsx");

assert(qaMatrix.status === "FROZEN_QA_MATRIX", "Stage 4-6 QA matrix must be frozen.");
assert(stage40.status === "FROZEN", "Stage 4-0 contract must remain FROZEN.");
assert(stage41.status === "PASS" && stage41.finalStageStatus === "STAGE4_1_ROUTE_LOADER_SCAFFOLD_READY", "Stage 4-1 checkpoint mismatch.");
assert(stage42.status === "PASS" && stage42.finalStageStatus === "STAGE4_2_GENERAL_LIST_UI_READY", "Stage 4-2 checkpoint mismatch.");
assert(stage43.status === "PASS" && stage43.finalStageStatus === "STAGE4_3_GENERAL_DETAIL_UI_READY", "Stage 4-3 checkpoint mismatch.");
assert(stage44.status === "PASS" && stage44.finalStageStatus === "STAGE4_4_EXCLUSIVE_UI_AND_OWNERSHIP_READY", "Stage 4-4 checkpoint mismatch.");
assert(stage45.status === "PASS" && stage45.finalStageStatus === "STAGE4_5_DISPLAY_STATE_POLICY_HARDENED", "Stage 4-5 checkpoint mismatch.");

const generalListIds = uniqueSet(ids(generalList.records), "General List");
const generalDetailIds = uniqueSet(ids(generalDetail.records), "General Detail");
const exclusiveListIds = uniqueSet(ids(exclusive.listRecords), "Exclusive List");
const exclusiveDetailIds = uniqueSet(ids(exclusive.detailRecords), "Exclusive Detail");
const hiddenIds = uniqueSet(ids(specialUnresolved.specialRecords), "Hidden Special");
const holdIds = uniqueSet(ids(specialUnresolved.holdRecords), "HOLD");

assert(generalListIds.size === qaMatrix.expected.general, `Expected ${qaMatrix.expected.general} General List IDs.`);
assert(generalDetailIds.size === qaMatrix.expected.general, `Expected ${qaMatrix.expected.general} General Detail IDs.`);
assert(exclusiveListIds.size === qaMatrix.expected.exclusive, `Expected ${qaMatrix.expected.exclusive} Exclusive List IDs.`);
assert(exclusiveDetailIds.size === qaMatrix.expected.exclusive, `Expected ${qaMatrix.expected.exclusive} Exclusive Detail IDs.`);
assert(hiddenIds.size === qaMatrix.expected.hiddenSpecial, `Expected ${qaMatrix.expected.hiddenSpecial} hidden-special IDs.`);
assert(holdIds.size === qaMatrix.expected.hold, `Expected ${qaMatrix.expected.hold} HOLD ID.`);
assertSetEqual(generalListIds, generalDetailIds, "General List/Detail parity mismatch.");
assertSetEqual(exclusiveListIds, exclusiveDetailIds, "Exclusive List/Detail parity mismatch.");

assertDisjoint(generalDetailIds, exclusiveDetailIds, "General/Exclusive public sets must be disjoint.");
assertDisjoint(generalDetailIds, hiddenIds, "General/Hidden sets must be disjoint.");
assertDisjoint(generalDetailIds, holdIds, "General/HOLD sets must be disjoint.");
assertDisjoint(exclusiveDetailIds, hiddenIds, "Exclusive/Hidden sets must be disjoint.");
assertDisjoint(exclusiveDetailIds, holdIds, "Exclusive/HOLD sets must be disjoint.");
assertDisjoint(hiddenIds, holdIds, "Hidden/HOLD sets must be disjoint.");

const publicIds = new Set([...generalDetailIds, ...exclusiveDetailIds]);
const canonicalIds = new Set([...publicIds, ...hiddenIds, ...holdIds]);
assert(publicIds.size === qaMatrix.expected.public, `Expected ${qaMatrix.expected.public} public IDs, got ${publicIds.size}.`);
assert(canonicalIds.size === qaMatrix.expected.canonical, `Expected ${qaMatrix.expected.canonical} canonical IDs, got ${canonicalIds.size}.`);
assertSetEqual(new Set(qaMatrix.expected.holdEquipmentIds), holdIds, "HOLD equipmentId contract mismatch.");

for (const record of specialUnresolved.specialRecords) {
  assert(record.disposition === "HIDDEN_SPECIAL", `Hidden equipment ${record.equipmentId} disposition mismatch.`);
  assert(record.pageAdmission === false, `Hidden equipment ${record.equipmentId} must remain pageAdmission=false.`);
}
for (const record of specialUnresolved.holdRecords) {
  assert(record.disposition === "HOLD_UNRESOLVED_ACQUISITION", `HOLD equipment ${record.equipmentId} disposition mismatch.`);
  assert(record.pageAdmission === false, `HOLD equipment ${record.equipmentId} must remain pageAdmission=false.`);
}

for (const raw of qaMatrix.invalidRouteParams) {
  assert(parseRouteParamLikeCurrentGuard(raw) === null, `Invalid route param unexpectedly passed syntax guard: ${JSON.stringify(raw)}.`);
}
for (const equipmentId of [generalDetail.records[0].equipmentId, exclusive.detailRecords[0].equipmentId, specialUnresolved.specialRecords[0].equipmentId, specialUnresolved.holdRecords[0].equipmentId]) {
  assert(parseRouteParamLikeCurrentGuard(String(equipmentId)) === equipmentId, `Valid numeric route param failed: ${equipmentId}.`);
}

const requiredDetailRouteMarkers = [
  'createFileRoute("/equipment/$equipmentId")',
  "if (!/^\\d+$/.test(params.equipmentId))",
  "Number.isSafeInteger(equipmentId) || equipmentId <= 0",
  "getEquipmentDetailPageData",
  "if (!data)",
  "throw notFound()",
  "notFoundComponent: EquipmentNotFound",
];
for (const marker of requiredDetailRouteMarkers) {
  assert(detailRouteSource.includes(marker), `Detail route missing Stage 4-6 admission marker: ${marker}`);
}
assert(functionsSource.includes("Number.isSafeInteger(input.equipmentId) || input.equipmentId <= 0"), "Server function validator lost positive safe-integer guard.");
assert(functionsSource.includes("readEquipmentDetailPageData(data.equipmentId)"), "Server function must delegate exact equipmentId lookup to page server.");
assert(serverSource.includes("generalDetailById.get(equipmentId)"), "General exact-ID lookup missing from page server.");
assert(serverSource.includes("exclusiveDetailById.get(equipmentId)"), "Exclusive exact-ID lookup missing from page server.");
assert(serverSource.includes("return null;"), "Page server must return null for non-public equipment IDs.");
assert(!serverSource.includes("equipment_stage3_6_special_unresolved"), "Public page server must not import Stage 3-6 hidden/HOLD data.");
assert(!functionsSource.includes("equipment_stage3_6_special_unresolved"), "Public server function layer must not import Stage 3-6 hidden/HOLD data.");
for (const source of [detailRouteSource, generalRouteSource, exclusiveRouteSource, serverSource, functionsSource]) {
  assert(!source.includes("ConfigDataEquipmentInfo"), "Equipment public route/page composition must not read raw ConfigDataEquipmentInfo.");
}
assert(generalRouteSource.includes('params={{ equipmentId: String(record.equipmentId) }}'), "General List must navigate with exact record equipmentId.");
assert(exclusiveRouteSource.includes('params={{ equipmentId: String(record.equipmentId) }}'), "Exclusive List must navigate with exact record equipmentId.");

const serverModule = await import(pathToFileURL(path.join(ROOT, "src/lib/equipment-page.server.ts")).href);
const {
  readEquipmentDetailPageData,
  readGeneralEquipmentPageData,
  readExclusiveEquipmentPageData,
} = serverModule;

const runtimeGeneral = readGeneralEquipmentPageData();
const runtimeExclusive = readExclusiveEquipmentPageData();
assertSetEqual(uniqueSet(ids(runtimeGeneral.records), "Runtime General List"), generalListIds, "Runtime General List admission mismatch.");
assertSetEqual(uniqueSet(ids(runtimeExclusive.records), "Runtime Exclusive List"), exclusiveListIds, "Runtime Exclusive List admission mismatch.");

let generalResolved = 0;
let exclusiveResolved = 0;
for (const equipmentId of generalDetailIds) {
  const data = readEquipmentDetailPageData(equipmentId);
  assert(data?.kind === "general", `Public general equipment ${equipmentId} failed runtime admission.`);
  assert(data.equipmentId === equipmentId, `General runtime route key mismatch for ${equipmentId}.`);
  generalResolved += 1;
}
for (const equipmentId of exclusiveDetailIds) {
  const data = readEquipmentDetailPageData(equipmentId);
  assert(data?.kind === "exclusive", `Public exclusive equipment ${equipmentId} failed runtime admission.`);
  assert(data.equipmentId === equipmentId, `Exclusive runtime route key mismatch for ${equipmentId}.`);
  assert(data.ownerHero?.heroId > 0, `Exclusive runtime owner Hero missing for ${equipmentId}.`);
  exclusiveResolved += 1;
}

let hiddenResolved = 0;
for (const equipmentId of hiddenIds) {
  if (readEquipmentDetailPageData(equipmentId) !== null) hiddenResolved += 1;
}
let holdResolved = 0;
for (const equipmentId of holdIds) {
  if (readEquipmentDetailPageData(equipmentId) !== null) holdResolved += 1;
}
assert(hiddenResolved === 0, `${hiddenResolved} hidden-special IDs leaked through runtime public detail admission.`);
assert(holdResolved === 0, `${holdResolved} HOLD IDs leaked through runtime public detail admission.`);

const unknownCandidates = [999999, 888888888, Number.MAX_SAFE_INTEGER].filter((id) => !canonicalIds.has(id));
assert(unknownCandidates.length >= 2, "Need at least two representative unknown positive IDs for QA.");
let unknownResolved = 0;
for (const equipmentId of unknownCandidates) {
  if (readEquipmentDetailPageData(equipmentId) !== null) unknownResolved += 1;
}
assert(unknownResolved === 0, `${unknownResolved} unknown positive IDs unexpectedly resolved.`);

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const routeTreeSource = readText("src/routeTree.gen.ts");
for (const marker of ["/equipment/exclusive", "/equipment/$equipmentId", "/equipment"]) {
  assert(routeTreeSource.includes(marker), `Generated route tree missing ${marker}.`);
}

const summary = {
  version: 1,
  stage: "4-6",
  status: "PASS",
  finalStageStatus: "STAGE4_6_ADMISSION_ROUTE_QA_READY",
  upstream: {
    stage40: stage40.status,
    stage41: stage41.finalStageStatus,
    stage42: stage42.finalStageStatus,
    stage43: stage43.finalStageStatus,
    stage44: stage44.finalStageStatus,
    stage45: stage45.finalStageStatus,
  },
  population: {
    canonical: canonicalIds.size,
    public: publicIds.size,
    general: generalDetailIds.size,
    exclusive: exclusiveDetailIds.size,
    hiddenSpecial: hiddenIds.size,
    hold: holdIds.size,
    holdEquipmentIds: [...holdIds],
  },
  parity: {
    generalListDetailExact: true,
    exclusiveListDetailExact: true,
    publicGeneralExclusiveDisjoint: true,
    canonicalPartitionDisjoint: true,
    canonicalPartitionClosed: true,
  },
  runtimeAdmission: {
    generalResolved,
    exclusiveResolved,
    hiddenResolved,
    holdResolved,
    unknownPositiveIdsTested: unknownCandidates,
    unknownResolved,
  },
  routeGuards: {
    invalidParamsTested: qaMatrix.invalidRouteParams.length,
    invalidParamsRejected: qaMatrix.invalidRouteParams.length,
    digitsOnlyBeforeNumericConversion: true,
    positiveSafeIntegerRequired: true,
    missingPublicDataToNotFound: true,
    explicitNotFoundComponent: true,
    canonicalNavigationUsesRecordEquipmentId: true,
  },
  routes: {
    generalList: "/equipment",
    exclusiveList: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    generatedRouteTreeVerified: true,
  },
  sourceDiscipline: {
    hiddenHoldImportedByPublicServer: false,
    directConfigDataReads: false,
    publicAdmissionReclassified: false,
    ownershipRederived: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-7 whole consumer regression",
};

const outPath = path.join(ROOT, "data/validation/equipment-stage4-6-admission-route-qa-summary.v1.json");
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Stage 4-6 PASS: ${publicIds.size} public IDs admitted, ${hiddenIds.size + holdIds.size} hidden/HOLD IDs blocked.`);
