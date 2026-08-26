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

const stage42 = readJson("data/validation/equipment-stage4-2-general-list-ui-summary.v1.json");
const stage40 = readJson("data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json");
const detail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const restrictions = readJson("data/generated/equipment_stage2_6_restrictions.json");
const jobIndex = readJson("data/generated/equipment_stage2_6_job_index.json");
const routeSource = readText("src/routes/equipment_.$equipmentId.tsx");
const serverSource = readText("src/lib/equipment-page.server.ts");

assert(stage42.status === "PASS", "Stage 4-2 checkpoint must remain PASS.");
assert(stage42.finalStageStatus === "STAGE4_2_GENERAL_LIST_UI_READY", "Stage 4-2 final status mismatch.");
assert(stage40.status === "FROZEN", "Stage 4-0 consumer contract must remain frozen.");
assert(detail.status === "COMPLETE_WITH_REVIEW", "Stage 3-4 detail source status mismatch.");
assert(detail.records.length === 206, `Expected 206 general detail records, got ${detail.records.length}.`);

const ids = detail.records.map((record) => record.equipmentId);
assert(new Set(ids).size === 206, "General detail equipmentId values must be unique.");

let nameKrReview = 0;
let releaseDateTab1 = 0;
let releaseDateTab2 = 0;
let releaseDateTab3 = 0;
let oneProperty = 0;
let twoProperties = 0;
const restrictionModeCounts = {};

for (const record of detail.records) {
  assert(record.identity?.equipmentId === record.equipmentId, `Identity mismatch for ${record.equipmentId}.`);
  assert(typeof record.identity?.nameCn === "string" && record.identity.nameCn.length > 0, `Missing nameCn for ${record.equipmentId}.`);
  if (record.identity.nameKr === null) nameKrReview += 1;

  assert([1, 2, 3].includes(record.classification?.siteTab), `Invalid siteTab for ${record.equipmentId}.`);
  assert(record.stats?.maxLevel === 50, `Expected Lv50 stats for ${record.equipmentId}.`);
  assert(Array.isArray(record.stats?.properties), `Missing stat properties for ${record.equipmentId}.`);
  assert([1, 2].includes(record.stats.properties.length), `Unexpected property count for ${record.equipmentId}.`);
  if (record.stats.properties.length === 1) oneProperty += 1;
  if (record.stats.properties.length === 2) twoProperties += 1;
  for (const property of record.stats.properties) {
    assert(typeof property.propertyKo === "string" && property.propertyKo.length > 0, `Missing propertyKo for ${record.equipmentId}.`);
    assert(Number.isFinite(property.maxValue), `Invalid maxValue for ${record.equipmentId}.`);
  }

  assert(typeof record.effect?.effectName === "string", `Missing effectName for ${record.equipmentId}.`);
  assert(typeof record.effect?.effectText === "string", `Missing effectText for ${record.equipmentId}.`);
  assert(Array.isArray(record.effect?.effectSegments), `Missing effectSegments for ${record.equipmentId}.`);
  assert(
    record.effect.effectSegments.map((segment) => segment.text).join("") === record.effect.effectText,
    `Effect segments do not preserve effectText for ${record.equipmentId}.`,
  );

  const restriction = record.restriction;
  assert(restriction && typeof restriction.mode === "string", `Missing restriction for ${record.equipmentId}.`);
  restrictionModeCounts[restriction.mode] = (restrictionModeCounts[restriction.mode] ?? 0) + 1;
  for (const armyId of restriction.generalArmyIds) {
    assert(restrictions.armyIndex[String(armyId)], `Missing Army display index ${armyId} for ${record.equipmentId}.`);
  }
  for (const jobId of restriction.specialJobIds) {
    assert(jobIndex.jobs[String(jobId)], `Missing Job display index ${jobId} for ${record.equipmentId}.`);
  }

  const dateKnown = record.acquisition?.releaseGroupDate !== null;
  if (dateKnown && record.classification.siteTab === 1) releaseDateTab1 += 1;
  if (dateKnown && record.classification.siteTab === 2) releaseDateTab2 += 1;
  if (dateKnown && record.classification.siteTab === 3) releaseDateTab3 += 1;
}

assert(nameKrReview === 59, `Expected 59 REVIEW Korean names, got ${nameKrReview}.`);
assert(oneProperty === 1 && twoProperties === 205, `Unexpected property distribution ${oneProperty}/${twoProperties}.`);
assert(releaseDateTab1 === 0, `Tab 1 must not claim release dates; got ${releaseDateTab1}.`);
assert(releaseDateTab2 === 80, `Tab 2 must retain 80 verified release-group dates; got ${releaseDateTab2}.`);
assert(releaseDateTab3 === 0, `Tab 3 must remain REVIEW without release dates; got ${releaseDateTab3}.`);
assert(restrictions.semantics.confidence === 0.99, "Restriction semantic confidence must remain 0.99.");
assert(restrictions.semantics.status === "structural-inference", "Restriction semantics must remain structural-inference.");

const requiredRouteMarkers = [
  'if (data.kind === "exclusive")',
  "Lv50 능력치",
  "effect.effectSegments.map",
  "restriction.generalArmies",
  "restriction.specialJobs",
  "구조 추론 99%",
  "acquisition.releaseGroupDate",
  "정확한 출시 순서는 REVIEW 상태",
  'to="/equipment"',
];
for (const marker of requiredRouteMarkers) {
  assert(routeSource.includes(marker), `Detail route is missing required Stage 4-3 marker: ${marker}`);
}
assert(!routeSource.includes("ConfigData"), "Detail route must not read or reference raw ConfigData.");
assert(!routeSource.includes(".sort("), "Detail route must not reconstruct release order.");
assert(!routeSource.includes("maxRaw"), "Detail UI must consume frozen maxValue instead of exposing/recomputing maxRaw.");

const requiredServerMarkers = [
  'equipment_stage3_4_general_detail.json',
  'equipment_stage2_6_restrictions.json',
  'equipment_stage2_6_job_index.json',
  "resolveGeneralRestrictionPresentation",
  "generalArmies",
  "specialJobs",
  "semanticConfidence",
];
for (const marker of requiredServerMarkers) {
  assert(serverSource.includes(marker), `Server composition is missing required Stage 4-3 marker: ${marker}`);
}
assert(!serverSource.includes("ConfigDataEquipmentInfo"), "Stage 4-3 must not reopen Equipment ConfigData.");
assert(!serverSource.includes("ConfigDataJobInfo"), "Stage 4-3 must not directly read Job ConfigData.");

execFileSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});

const summary = {
  version: 1,
  stage: "4-3",
  status: "PASS",
  finalStageStatus: "STAGE4_3_GENERAL_DETAIL_UI_READY",
  upstream: {
    stage40: "FROZEN",
    stage42: "STAGE4_2_GENERAL_LIST_UI_READY",
    stage34: detail.status,
  },
  route: {
    path: "/equipment/$equipmentId",
    routeKey: "equipmentId",
    generalDetailCount: detail.records.length,
    uniqueEquipmentIds: new Set(ids).size,
    exclusiveBranchDeferredTo: "4-4",
  },
  stats: {
    maxLevel: 50,
    oneProperty,
    twoProperties,
    frontendRecalculation: false,
    displayField: "maxValue",
  },
  effects: {
    sourceTextPreserved: true,
    segmentParityChecked: true,
    semanticRewrite: false,
  },
  restrictions: {
    modeCounts: restrictionModeCounts,
    armyLabelsFrom: "data/generated/equipment_stage2_6_restrictions.json#armyIndex",
    specialJobLabelsFrom: "data/generated/equipment_stage2_6_job_index.json#jobs",
    semantics: restrictions.semantics.status,
    confidence: restrictions.semantics.confidence,
    runtimeDirectProofClaimed: false,
  },
  acquisition: {
    verifiedReleaseGroupDatesByTab: {
      "1": releaseDateTab1,
      "2": releaseDateTab2,
      "3": releaseDateTab3,
    },
    chronologyInvented: false,
    tab3ReviewPreserved: true,
  },
  naming: {
    fallback: "nameKr ?? nameCn",
    verified: 206 - nameKrReview,
    review: nameKrReview,
    reviewPromoted: false,
  },
  assets: {
    equipmentIconBound: false,
    reason: "No web-served Equipment icon asset set exists yet; Stage 4-3 preserves the Stage 3 icon field without fabricating a public asset mapping.",
  },
  sourceDiscipline: {
    detailSource: "data/generated/equipment_stage3_4_general_detail.json",
    supportingRestrictionIndexesOnly: true,
    directConfigDataReads: false,
    statsRecalculated: false,
    effectTextRewritten: false,
    acquisitionReclassified: false,
  },
  build: {
    command: "bun run build",
    pass: true,
  },
  nextStage: "4-4 exclusive equipment UI + Hero ownership display",
};

const outPath = path.join(ROOT, "data/validation/equipment-stage4-3-general-detail-ui-summary.v1.json");
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Stage 4-3 PASS: ${detail.records.length} general Equipment detail routes validated.`);
