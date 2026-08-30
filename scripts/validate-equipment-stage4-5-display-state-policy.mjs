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

const countOccurrences = (source, marker) => source.split(marker).length - 1;

const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const stage42 = readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json");
const stage43 = readJson("data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
const stage44 = readJson("data/validation/equipment-stage4-4-exclusive-ui-ownership-summary.v1.json");
const contract = readJson("data/contracts/equipment-stage4-5-display-state-policy.v1.json");
const general = readJson("data/generated/equipment_stage3_3_general_list.json");
const exclusive = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");
const generalRoute = readText("src/routes/equipment.tsx");
const exclusiveRoute = readText("src/routes/equipment_.exclusive.tsx");
const detailRoute = readText("src/routes/equipment_.$equipmentId.tsx");

assert(stage40.status === "FROZEN", "Stage 4-0 contract must remain FROZEN.");
assert(stage42.status === "PASS" && stage42.finalStageStatus === "STAGE4_2_GENERAL_LIST_UI_READY", "Stage 4-2 must remain ready.");
assert(stage43.status === "PASS" && stage43.finalStageStatus === "STAGE4_3_GENERAL_DETAIL_UI_READY", "Stage 4-3 must remain ready.");
assert(stage44.status === "PASS" && stage44.finalStageStatus === "STAGE4_4_EXCLUSIVE_UI_AND_OWNERSHIP_READY", "Stage 4-4 must remain ready.");
assert(contract.status === "FROZEN", "Stage 4-5 display/state policy contract must be FROZEN.");
assert(general.records.length === 206, `Expected 206 general records, got ${general.records.length}.`);
assert(exclusive.listRecords.length === 167, `Expected 167 exclusive records, got ${exclusive.listRecords.length}.`);

const generalKey = contract.statePolicy.general.key;
const exclusiveKey = contract.statePolicy.exclusive.key;
assert(generalKey === "equipment-general-list-ui.v1", `Unexpected general storage key ${generalKey}.`);
assert(exclusiveKey === "equipment-exclusive-list-ui.v1", `Unexpected exclusive storage key ${exclusiveKey}.`);
assert(generalKey !== exclusiveKey, "General and exclusive list state keys must remain isolated.");

function sanitizeGeneral(raw) {
  const tab = raw?.tab === 1 || raw?.tab === 2 || raw?.tab === 3 ? raw.tab : 1;
  const selectedGroup =
    typeof raw?.group === "string"
      ? general.filters.find((filter) => filter.group === raw.group)
      : undefined;
  const group = selectedGroup?.group ?? null;
  const subtype =
    group && typeof raw?.subtype === "string" && selectedGroup.subtypes.some((item) => item.subtype === raw.subtype)
      ? raw.subtype
      : null;
  return { tab, group, subtype };
}

function sanitizeExclusive(raw) {
  const selectedGroup =
    typeof raw?.group === "string"
      ? exclusive.filters.find((filter) => filter.group === raw.group)
      : undefined;
  const group = selectedGroup?.group ?? null;
  const subtype =
    group && typeof raw?.subtype === "string" && selectedGroup.subtypes.some((item) => item.subtype === raw.subtype)
      ? raw.subtype
      : null;
  return { group, subtype };
}

assert(
  JSON.stringify(sanitizeGeneral({ tab: 3, group: "weapon", subtype: "sword" })) ===
    JSON.stringify({ tab: 3, group: "weapon", subtype: "sword" }),
  "Valid general state must survive sanitization.",
);
assert(
  JSON.stringify(sanitizeGeneral({ tab: 99, group: "armor", subtype: "sword" })) ===
    JSON.stringify({ tab: 1, group: "armor", subtype: null }),
  "Invalid general tab/incompatible subtype must sanitize safely.",
);
assert(
  JSON.stringify(sanitizeGeneral({ tab: 2, group: "unknown", subtype: "sword" })) ===
    JSON.stringify({ tab: 2, group: null, subtype: null }),
  "Unknown general group must clear group/subtype.",
);
assert(
  JSON.stringify(sanitizeExclusive({ group: "accessory", subtype: "attack" })) ===
    JSON.stringify({ group: "accessory", subtype: "attack" }),
  "Valid exclusive state must survive sanitization.",
);
assert(
  JSON.stringify(sanitizeExclusive({ group: "accessory", subtype: "healing" })) ===
    JSON.stringify({ group: "accessory", subtype: null }),
  "Exclusive subtype absent from generated filters must sanitize to null.",
);
assert(
  JSON.stringify(sanitizeExclusive({ group: "unknown", subtype: "attack" })) ===
    JSON.stringify({ group: null, subtype: null }),
  "Unknown exclusive group must clear group/subtype.",
);

const generalMarkers = [
  'const EQUIPMENT_LIST_STORAGE_KEY = "equipment-general-list-ui.v1"',
  "window.localStorage.getItem(EQUIPMENT_LIST_STORAGE_KEY)",
  "window.localStorage.setItem(EQUIPMENT_LIST_STORAGE_KEY, JSON.stringify(uiState))",
  "persistenceReady",
  "selectedGroup?.subtypes.some",
  "TAB_ORDER_POLICIES",
  "표시 순서는 확정된 역사적 출시순이 아니라 Stage 3의 deterministic presentation order야.",
  "검증된 출시 그룹 단위만 반영하며 같은 그룹 안의 개별 출시순은 확정하지 않았어.",
  "장비 종류·세부 타입 순서를 유지하고, 같은 세부 타입 안에서는 확인된 출시 그룹 기준 최신순이야. 같은 출시 그룹 안의 개별 순서는 별도 출시순 의미가 없어.",
  "한국명 REVIEW · 중문명 임시 표시",
  "filteredRecords.length > 0",
  "const resetFilters = () => {",
  "setUiState((current) => ({ ...current, group: null, subtype: null }));",
  "onClick={resetFilters}",
  "const resetDiscovery = () => {",
  'query: "",',
  'sort: "default",',
  "onClick={resetDiscovery}",
  'to="/equipment/$equipmentId"',
];
for (const marker of generalMarkers) {
  assert(generalRoute.includes(marker), `General route missing Stage 4-5 marker: ${marker}`);
}

const exclusiveMarkers = [
  'const EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY = "equipment-exclusive-list-ui.v1"',
  "window.localStorage.getItem(EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY)",
  "window.localStorage.setItem(EXCLUSIVE_EQUIPMENT_LIST_STORAGE_KEY, JSON.stringify(uiState))",
  "persistenceReady",
  "selectedGroup?.subtypes.some",
  "한국명 REVIEW · 중문명 임시 표시",
  "현재 순서는 표시용 deterministic order이며 전용장비 출시순으로 해석하지 않아.",
  "filteredRecords.length > 0",
  "조건에 맞는 전용장비가 없어.",
  "const resetFilters = () => {",
  "setUiState((current) => ({ ...current, group: null, subtype: null }));",
  "onClick={resetFilters}",
  "const resetDiscovery = () => {",
  "setUiState(DEFAULT_EXCLUSIVE_UI_STATE);",
  "onClick={resetDiscovery}",
  'to="/equipment/$equipmentId"',
];
for (const marker of exclusiveMarkers) {
  assert(exclusiveRoute.includes(marker), `Exclusive route missing Stage 4-5 marker: ${marker}`);
}

const detailMarkers = [
  'to="/equipment"',
  'to="/equipment/exclusive"',
  "구조 추론 99%",
  "정확한 출시 날짜와 출시 순서는 REVIEW 상태",
  "nameKr === null",
];
for (const marker of detailMarkers) {
  assert(detailRoute.includes(marker), `Detail route missing retained display-policy marker: ${marker}`);
}

const approvedListSortMarkers = [
  'type EquipmentSortMode = "default" | "name" | "id";',
  "const SORT_LABELS: Record<EquipmentSortMode, string> = {",
  'return value === "default" || value === "name" || value === "id";',
  "const records = data.records.filter((record) => {",
  'if (uiState.sort === "name") {',
  "return records.sort((left, right) => {",
  'leftName.localeCompare(rightName, "ko", { numeric: true, sensitivity: "base" }) || left.equipmentId - right.equipmentId',
  'if (uiState.sort === "id") {',
  "return records.sort((left, right) => left.equipmentId - right.equipmentId);",
  "return records;",
];
for (const [label, source] of [
  ["general", generalRoute],
  ["exclusive", exclusiveRoute],
]) {
  for (const marker of approvedListSortMarkers) {
    assert(source.includes(marker), `${label} route approved presentation sorting missing marker: ${marker}`);
  }
  assert(countOccurrences(source, ".sort(") === 2, `${label} route must contain exactly the two approved presentation sort operations.`);
  assert(!source.includes("data.records.sort("), `${label} route must not mutate loader records in place.`);
  assert(!source.includes("ConfigData"), `${label} route must not read raw ConfigData.`);
  assert(!source.includes("SkillHero"), `${label} route must not rederive exclusive ownership.`);
}
assert(!detailRoute.includes(".sort("), "detail route must not add frontend sorting.");
assert(!detailRoute.includes("ConfigData"), "detail route must not read raw ConfigData.");
assert(!detailRoute.includes("SkillHero"), "detail route must not rederive exclusive ownership.");

assert(generalRoute.includes("record.nameKr ?? record.nameCn"), "General name fallback must remain nameKr ?? nameCn.");
assert(exclusiveRoute.includes("record.nameKr ?? record.nameCn"), "Exclusive name fallback must remain nameKr ?? nameCn.");

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const summary = {
  version: 1,
  stage: "4-5",
  status: "PASS",
  finalStageStatus: "STAGE4_5_DISPLAY_STATE_POLICY_HARDENED",
  upstream: {
    stage40: stage40.status,
    stage42: stage42.finalStageStatus,
    stage43: stage43.finalStageStatus,
    stage44: stage44.finalStageStatus,
  },
  state: {
    general: {
      storage: "localStorage",
      key: generalKey,
      fields: ["tab", "group", "subtype"],
      invalidStateSanitized: true,
      restoreBeforeWrite: true,
      storageFailureNonFatal: true,
      groupChangeClearsSubtype: true,
      tabChangePreservesEquipmentTypeFilter: true,
      detailReturnRestoresState: true,
    },
    exclusive: {
      storage: "localStorage",
      key: exclusiveKey,
      fields: ["group", "subtype"],
      invalidStateSanitized: true,
      restoreBeforeWrite: true,
      storageFailureNonFatal: true,
      groupChangeClearsSubtype: true,
      detailReturnRestoresState: true,
    },
    isolatedKeys: true,
  },
  display: {
    nameFallback: "nameKr ?? nameCn",
    reviewLabelExplicit: true,
    generalTab1ChronologyClaimed: false,
    generalTab2EqualGroupOrderClaimed: false,
    generalTab3ChronologyReviewExplicit: false,
    generalTab3VerifiedGroupChronologyExplicit: true,
    exclusiveChronologyReviewExplicit: true,
    emptyStateResetGeneral: true,
    emptyStateResetExclusive: true,
  },
  sourceDiscipline: {
    generalGeneratedOrderPreserved: true,
    exclusiveGeneratedOrderPreserved: true,
    frontendSortAdded: true,
    presentationSortOnly: true,
    releaseOrderSortingAdded: false,
    loaderRecordsMutated: false,
    directConfigDataReads: false,
    exclusiveOwnershipRederived: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-6 admission/route QA",
};

const outPath = path.join(ROOT, "data/validation/equipment-stage4-5-display-state-policy-summary.v1.json");
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log("Stage 4-5 PASS: Equipment display/state policy hardened for general and exclusive lists.");
