import fs from "node:fs";
import { execFileSync } from "node:child_process";

const load = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const ids = (rows) => new Set((rows ?? []).map((row) => Number(row.equipmentId)));
const sameSet = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));
const intersects = (a, b) => [...a].some((value) => b.has(value));

const contract = load("data/contracts/equipment-stage4-1-route-loader.v1.json");
const stage40 = load(contract.dependsOn.stage40Summary);
const generalList = load(contract.dependsOn.generalList);
const generalDetail = load(contract.dependsOn.generalDetail);
const exclusive = load(contract.dependsOn.exclusiveConsumer);
const byEquipment = load(contract.dependsOn.exclusiveByEquipment);
const heroMaster = load(contract.dependsOn.heroMaster);
const special = load(contract.dependsOn.specialUnresolved);

assert(stage40.status === "PASS", `Stage 4-0 status ${stage40.status}`);
assert(
  stage40.finalStageStatus === "STAGE4_0_FRONTEND_CONSUMER_CONTRACT_FROZEN",
  `Stage 4-0 final status ${stage40.finalStageStatus}`,
);

const generalIds = ids(generalList.records);
const generalDetailIds = ids(generalDetail.records);
const exclusiveListIds = ids(exclusive.listRecords);
const exclusiveDetailIds = ids(exclusive.detailRecords);
const specialIds = ids(special.specialRecords);
const holdIds = ids(special.holdRecords);

assert(generalIds.size === 206, `general list count ${generalIds.size}`);
assert(generalDetailIds.size === 206, `general detail count ${generalDetailIds.size}`);
assert(exclusiveListIds.size === 167, `exclusive list count ${exclusiveListIds.size}`);
assert(exclusiveDetailIds.size === 167, `exclusive detail count ${exclusiveDetailIds.size}`);
assert(sameSet(generalIds, generalDetailIds), "general list/detail ID mismatch");
assert(sameSet(exclusiveListIds, exclusiveDetailIds), "exclusive list/detail ID mismatch");
assert(!intersects(generalIds, exclusiveListIds), "general/exclusive public overlap");

const publicIds = new Set([...generalIds, ...exclusiveListIds]);
assert(publicIds.size === 373, `public detail count ${publicIds.size}`);
assert(!intersects(publicIds, specialIds), "soul-special leaked into public detail set");
assert(!intersects(publicIds, holdIds), "HOLD leaked into public detail set");
assert(holdIds.size === 1 && holdIds.has(2013), `unexpected HOLD IDs ${JSON.stringify([...holdIds])}`);

const actualTabs = Object.fromEntries(
  [1, 2, 3].map((tab) => [
    String(tab),
    generalList.records.filter((record) => Number(record.siteTab) === tab).length,
  ]),
);
assert(
  JSON.stringify(actualTabs) === JSON.stringify({ "1": 94, "2": 80, "3": 32 }),
  `general tab counts ${JSON.stringify(actualTabs)}`,
);

const expectedTaxonomy = load(contract.dependsOn.stage40Contract).expected.filterTaxonomy;
const actualTaxonomy = generalList.filters.map((group) => ({
  group: group.group,
  groupKo: group.groupKo,
  subtypes: group.subtypes.map((subtype) => subtype.subtype),
}));
assert(
  JSON.stringify(actualTaxonomy) === JSON.stringify(expectedTaxonomy),
  "generated filter taxonomy differs from Stage 4-0 contract",
);

const byEquipmentIds = new Set(Object.keys(byEquipment.byEquipmentId ?? {}).map(Number));
assert(byEquipmentIds.size === 167, `byEquipment key count ${byEquipmentIds.size}`);
assert(sameSet(byEquipmentIds, exclusiveListIds), "byEquipment keys do not equal exclusive consumer IDs");

const heroIds = new Set((heroMaster.records ?? []).map((hero) => Number(hero.heroId)));
assert(heroIds.size === 267, `hero master count ${heroIds.size}`);
let ownerHeroMissing = 0;
let ownershipCardinalityMismatch = 0;
for (const equipmentId of exclusiveListIds) {
  const ownerIds = byEquipment.byEquipmentId[String(equipmentId)] ?? [];
  if (ownerIds.length !== 1) ownershipCardinalityMismatch++;
  for (const heroId of ownerIds) {
    if (!heroIds.has(Number(heroId))) ownerHeroMissing++;
  }
}
assert(ownershipCardinalityMismatch === 0, `ownership cardinality mismatch ${ownershipCardinalityMismatch}`);
assert(ownerHeroMissing === 0, `owner Hero missing ${ownerHeroMissing}`);

const sourceFiles = {
  serverData: read(contract.implementation.serverDataModule),
  serverFunctions: read(contract.implementation.serverFunctionsModule),
  generalRoute: read(contract.implementation.routes.general.file),
  exclusiveRoute: read(contract.implementation.routes.exclusive.file),
  detailRoute: read(contract.implementation.routes.detail.file),
};
const joinedSource = Object.values(sourceFiles).join("\n");

assert(
  sourceFiles.generalRoute.includes('createFileRoute("/equipment")'),
  "general route path missing",
);
assert(
  sourceFiles.exclusiveRoute.includes('createFileRoute("/equipment_/exclusive")'),
  "exclusive sibling route id missing",
);
assert(
  sourceFiles.detailRoute.includes('createFileRoute("/equipment_/$equipmentId")'),
  "detail sibling route id missing",
);
assert(sourceFiles.detailRoute.includes("throw notFound()"), "detail public notFound gate missing");
assert(
  sourceFiles.serverFunctions.includes("createServerFn"),
  "equipment server functions do not use createServerFn",
);
assert(
  sourceFiles.serverFunctions.includes("./equipment-page.server"),
  "server functions do not delegate to .server module",
);
assert(
  sourceFiles.serverData.includes("equipment_stage3_3_general_list.json") &&
    sourceFiles.serverData.includes("equipment_stage3_4_general_detail.json") &&
    sourceFiles.serverData.includes("equipment_stage3_5_exclusive_consumer.json") &&
    sourceFiles.serverData.includes("hero-exclusive-equipment-by-equipment.v1.json") &&
    sourceFiles.serverData.includes("hero-name-master.v1.json"),
  "server data module does not import the frozen consumer/ownership sources",
);

for (const forbidden of [
  "data/configdata",
  "ConfigDataEquipmentInfo",
  "SkillHero",
  "MissionType 77",
]) {
  assert(!joinedSource.includes(forbidden), `forbidden Stage 4 source reference: ${forbidden}`);
}

const tsconfig = load("tsconfig.json");
assert(tsconfig.compilerOptions?.resolveJsonModule === true, "tsconfig resolveJsonModule must be true");

execFileSync("bun", ["run", "build"], {
  stdio: "inherit",
  env: process.env,
});

const routeTree = read("src/routeTree.gen.ts");
for (const path of ["/equipment", "/equipment/exclusive", "/equipment/$equipmentId"]) {
  assert(routeTree.includes(path), `generated route tree missing ${path}`);
}
const detailRouteTreeBlock = routeTree.match(
  /const EquipmentEquipmentIdRoute = EquipmentEquipmentIdRouteImport\.update\([\s\S]*?\n\} as any\)/,
)?.[0] ?? "";
const exclusiveRouteTreeBlock = routeTree.match(
  /const EquipmentExclusiveRoute = EquipmentExclusiveRouteImport\.update\([\s\S]*?\n\} as any\)/,
)?.[0] ?? "";
assert(
  detailRouteTreeBlock.includes("getParentRoute: () => rootRouteImport"),
  "detail route is nested under /equipment instead of being a root-level sibling",
);
assert(
  exclusiveRouteTreeBlock.includes("getParentRoute: () => rootRouteImport"),
  "exclusive route is nested under /equipment instead of being a root-level sibling",
);

const summary = {
  version: 1,
  stage: "4-1",
  status: "PASS",
  finalStageStatus: contract.completion.passStatus,
  upstream: {
    stage40: stage40.status,
    stage40Final: stage40.finalStageStatus,
  },
  routes: {
    general: "/equipment",
    exclusive: "/equipment/exclusive",
    detail: "/equipment/$equipmentId",
    generatedRouteTreeVerified: true,
    nonNestedSiblingScaffold: true,
  },
  loaderCoverage: {
    generalList: generalIds.size,
    generalDetail: generalDetailIds.size,
    exclusiveList: exclusiveListIds.size,
    exclusiveDetail: exclusiveDetailIds.size,
    publicUniqueEquipmentIds: publicIds.size,
    generalTabs: actualTabs,
  },
  ownership: {
    byEquipmentKeys: byEquipmentIds.size,
    relationCount: [...byEquipmentIds].reduce(
      (sum, equipmentId) => sum + (byEquipment.byEquipmentId[String(equipmentId)] ?? []).length,
      0,
    ),
    ownershipCardinalityMismatch,
    ownerHeroMissing,
  },
  admission: {
    hiddenSpecial: specialIds.size,
    hold: holdIds.size,
    holdEquipmentIds: [...holdIds],
    publicHiddenLeak: 0,
    publicHoldLeak: 0,
  },
  sourceDiscipline: {
    createServerFnBoundary: true,
    rawGeneratedJsonOnlyInServerModule: true,
    directConfigDataReads: false,
    directSkillHeroOwnershipReads: false,
    ownershipRederivation: false,
  },
  build: {
    command: "bun run build",
    pass: true,
    routeTreeGenerated: true,
  },
  uiScope: {
    diagnosticScaffoldOnly: true,
    finalGeneralListUiDeferredTo: "4-2",
    finalGeneralDetailUiDeferredTo: "4-3",
    finalExclusiveUiDeferredTo: "4-4",
  },
  completionMeaning: contract.completion.meaning,
  nextStage: contract.completion.nextStage,
};

fs.mkdirSync("data/validation", { recursive: true });
fs.writeFileSync(
  "data/validation/equipment-stage4-1-route-loader-summary.v1.json",
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
