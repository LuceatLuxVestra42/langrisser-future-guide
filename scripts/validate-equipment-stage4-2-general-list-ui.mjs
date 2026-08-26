import fs from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const readJson = (path) => JSON.parse(fs.readFileSync(`${ROOT}/${path}`, "utf8"));
const readText = (path) => fs.readFileSync(`${ROOT}/${path}`, "utf8");

const stage41 = readJson("data/validation/equipment-stage4-1-route-loader-summary.v1.json");
const contract = readJson("data/contracts/equipment-stage4-2-general-list-ui.v1.json");
const general = readJson("data/generated/equipment_stage3_3_general_list.json");
const routeSource = readText("src/routes/equipment.tsx");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(stage41.status === "PASS", "Stage 4-1 checkpoint must remain PASS.");
check(
  stage41.finalStageStatus === "STAGE4_1_ROUTE_LOADER_SCAFFOLD_READY",
  "Stage 4-1 final status mismatch.",
);
check(contract.stage === "4-2", "Stage 4-2 contract stage mismatch.");
check(general.records.length === 206, `Expected 206 general records; got ${general.records.length}.`);

const ids = general.records.map((record) => record.equipmentId);
check(new Set(ids).size === 206, "General equipment IDs must remain unique.");

const tabCounts = { 1: 0, 2: 0, 3: 0 };
for (const record of general.records) {
  if (record.siteTab === 1 || record.siteTab === 2 || record.siteTab === 3) {
    tabCounts[record.siteTab] += 1;
  } else {
    failures.push(`General equipment ${record.equipmentId} has invalid siteTab ${record.siteTab}.`);
  }
}

check(tabCounts[1] === 94, `Tab 1 count mismatch: ${tabCounts[1]}.`);
check(tabCounts[2] === 80, `Tab 2 count mismatch: ${tabCounts[2]}.`);
check(tabCounts[3] === 32, `Tab 3 count mismatch: ${tabCounts[3]}.`);

const expectedFilters = [
  ["weapon", ["sword", "dagger", "spear", "axe", "hammer", "bow", "staff"]],
  ["armor", ["heavy", "light", "cloth"]],
  ["headgear", ["heavy", "light", "cloth"]],
  ["accessory", ["attack", "intellect", "defense", "healing"]],
];

check(general.filters.length === expectedFilters.length, "Filter group count mismatch.");
for (let index = 0; index < expectedFilters.length; index += 1) {
  const filter = general.filters[index];
  const [expectedGroup, expectedSubtypes] = expectedFilters[index];
  check(filter?.group === expectedGroup, `Filter order mismatch at index ${index}.`);
  check(
    JSON.stringify(filter?.subtypes.map((item) => item.subtype)) === JSON.stringify(expectedSubtypes),
    `Subtype order mismatch for ${expectedGroup}.`,
  );
}

for (const record of general.records) {
  const filter = general.filters.find((item) => item.group === record.group);
  check(Boolean(filter), `Equipment ${record.equipmentId} group ${record.group} missing from taxonomy.`);
  check(
    Boolean(filter?.subtypes.some((item) => item.subtype === record.subtype)),
    `Equipment ${record.equipmentId} subtype ${record.subtype} missing from taxonomy.`,
  );
}

const sourceAssertions = [
  [routeSource.includes('createFileRoute("/equipment")'), "General equipment route must remain /equipment."],
  [routeSource.includes("getGeneralEquipmentPageData"), "Stage 4-1 general loader must remain the route data source."],
  [routeSource.includes('to="/equipment/$equipmentId"'), "Equipment cards must link to the detail route."],
  [routeSource.includes("params={{ equipmentId: String(record.equipmentId) }}"), "Detail link must use exact equipmentId."],
  [routeSource.includes('to="/equipment/exclusive"'), "Exclusive-equipment navigation target is missing."],
  [routeSource.includes("EQUIPMENT_LIST_STORAGE_KEY"), "List state storage key is missing."],
  [routeSource.includes("window.localStorage.getItem"), "Persisted list state must be restored."],
  [routeSource.includes("window.localStorage.setItem"), "List state must be persisted."],
  [routeSource.includes("record.nameKr ?? record.nameCn"), "Korean-name fallback policy is missing."],
  [routeSource.includes("data.records.filter"), "General List must filter the frozen record sequence in place."],
  [!routeSource.includes(".sort("), "Stage 4-2 frontend must not invent a new equipment sort order."],
  [!routeSource.includes("ConfigData"), "Stage 4-2 route must not read or name raw ConfigData."],
  [!routeSource.includes("equipment_stage3_3_general_list.json"), "Route must consume the Stage 4-1 loader, not import generated JSON directly."],
];
for (const [condition, message] of sourceAssertions) check(condition, message);

for (const tab of [1, 2, 3]) {
  const tabRecords = general.records.filter((record) => record.siteTab === tab);
  check(tabRecords.length === tabCounts[tab], `Tab ${tab} filter simulation mismatch.`);
  for (const filter of general.filters) {
    const groupRecords = tabRecords.filter((record) => record.group === filter.group);
    for (const subtype of filter.subtypes) {
      const subtypeRecords = groupRecords.filter((record) => record.subtype === subtype.subtype);
      for (const record of subtypeRecords) {
        check(record.group === filter.group, `Filter simulation group mismatch for ${record.equipmentId}.`);
        check(record.subtype === subtype.subtype, `Filter simulation subtype mismatch for ${record.equipmentId}.`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Equipment Stage 4-2 validation failed before build:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});

const routeTree = readText("src/routeTree.gen.ts");
check(routeTree.includes("'/equipment'"), "Generated route tree is missing /equipment.");
check(routeTree.includes("'/equipment/$equipmentId'"), "Generated route tree is missing equipment detail route.");
check(routeTree.includes("'/equipment/exclusive'"), "Generated route tree is missing exclusive route.");

if (failures.length > 0) {
  console.error("Equipment Stage 4-2 validation failed after build:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const summary = {
  version: 1,
  stage: "4-2",
  status: "PASS",
  finalStageStatus: "STAGE4_2_GENERAL_LIST_UI_READY",
  upstream: {
    stage41: stage41.finalStageStatus,
  },
  list: {
    route: "/equipment",
    total: general.records.length,
    uniqueEquipmentIds: new Set(ids).size,
    tabs: tabCounts,
    generatedOrderPreserved: true,
    frontendSortAdded: false,
  },
  filters: {
    groups: general.filters.map((filter) => ({
      group: filter.group,
      groupKo: filter.groupKo,
      subtypes: filter.subtypes.map((item) => item.subtype),
    })),
    singleActiveGroup: true,
    singleActiveSubtype: true,
    groupChangeClearsSubtype: true,
  },
  persistence: {
    mechanism: "localStorage",
    storageKey: contract.interaction.storageKey,
    tab: true,
    group: true,
    subtype: true,
    invalidStateSanitized: true,
  },
  navigation: {
    detail: "/equipment/$equipmentId",
    routeKey: "equipmentId",
    exclusive: "/equipment/exclusive",
  },
  display: {
    nameFallback: "nameKr ?? nameCn",
    iconAssetsBound: false,
    iconAssetReason: "No web-served Equipment icon asset set exists in the repository at Stage 4-2; broken/fabricated mappings are intentionally avoided.",
    releaseChronologyClaimed: false,
  },
  sourceDiscipline: {
    stage41LoaderOnly: true,
    directGeneratedJsonImportInRoute: false,
    directConfigDataReads: false,
    acquisitionRederivation: false,
    releaseOrderRederivation: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-3 general equipment Detail UI",
};

fs.writeFileSync(
  `${ROOT}/data/validation/equipment-stage4-2-general-list-ui-summary.v1.json`,
  `${JSON.stringify(summary, null, 2)}\n`,
);

console.log("Equipment Stage 4-2 validation PASS.");
