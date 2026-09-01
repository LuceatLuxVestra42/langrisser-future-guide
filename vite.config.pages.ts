// GitHub Pages deployment-only static build config.
// Public Equipment membership is projected from the frozen admission correction.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import exclusiveEquipmentJson from "./data/generated/equipment_stage3_5_exclusive_consumer.json" with { type: "json" };
import generalEquipmentJson from "./data/generated/equipment_stage3_3_general_list.json" with { type: "json" };
import equipmentPublicAdmissionCorrectionJson from "./data/presentation/equipment-public-admission-correction.v1.json" with { type: "json" };
import heroListJson from "./data/generated/hero-list-stage1.v1.json" with { type: "json" };
import soldierListJson from "./data/generated/soldier-list-stage5-8.v1.json" with { type: "json" };

const correction = equipmentPublicAdmissionCorrectionJson;
const excludedEquipmentIds = new Set(correction.excludedEquipmentIds);
const technicalGeneralEquipmentIds = generalEquipmentJson.records.map((record) => record.equipmentId);
const generalEquipmentIds = technicalGeneralEquipmentIds.filter((equipmentId) => !excludedEquipmentIds.has(equipmentId));
const exclusiveEquipmentIds = exclusiveEquipmentJson.detailRecords.map((record) => record.equipmentId);
const equipmentIds = [...generalEquipmentIds, ...exclusiveEquipmentIds];
const heroIds = heroListJson.records.map((record) => record.heroId);
const soldierIds = soldierListJson.records.map((record) => record.soldierId);

if (
  correction.status !== "FROZEN" ||
  correction.policy.joinKey !== "equipmentId" ||
  correction.policy.canonicalIdentityChanged !== false ||
  correction.policy.exclusiveEquipmentChanged !== false ||
  correction.expectedPublicProjection.generalEquipmentCount !== 198 ||
  correction.expectedPublicProjection.excludedCount !== 8 ||
  excludedEquipmentIds.size !== 8
) {
  throw new Error("Equipment public-admission correction contract is inconsistent for Pages prerendering.");
}
if (technicalGeneralEquipmentIds.length !== 206 || generalEquipmentIds.length !== 198) {
  throw new Error(`Expected technical/public general Equipment 206/198; got ${technicalGeneralEquipmentIds.length}/${generalEquipmentIds.length}.`);
}
if (exclusiveEquipmentIds.length !== 167 || new Set(exclusiveEquipmentIds).size !== 167) {
  throw new Error(`Expected 167 unique public exclusive Equipment IDs; got ${exclusiveEquipmentIds.length}/${new Set(exclusiveEquipmentIds).size}.`);
}
if (equipmentIds.length !== 365 || new Set(equipmentIds).size !== 365) {
  throw new Error(`Expected 365 unique public Equipment IDs; got ${equipmentIds.length}/${new Set(equipmentIds).size}.`);
}
for (const equipmentId of excludedEquipmentIds) {
  if (equipmentIds.includes(equipmentId)) {
    throw new Error(`Implementation-excluded Equipment ${equipmentId} leaked into Pages prerender membership.`);
  }
}
if (heroIds.length !== 267 || new Set(heroIds).size !== 267) {
  throw new Error(`Expected 267 unique Hero IDs; got ${heroIds.length}/${new Set(heroIds).size}.`);
}
if (soldierIds.length !== 224 || new Set(soldierIds).size !== 224) {
  throw new Error(`Expected 224 unique Soldier IDs; got ${soldierIds.length}/${new Set(soldierIds).size}.`);
}

const equipmentDetailPages = equipmentIds.map((equipmentId) => ({
  path: `/equipment/${equipmentId}`,
  prerender: { enabled: true, outputPath: `/equipment/${equipmentId}/index.html` },
}));
const heroDetailPages = heroIds.map((heroId) => ({
  path: `/heroes/${heroId}`,
  prerender: { enabled: true, outputPath: `/heroes/${heroId}/index.html` },
}));
const soldierDetailPages = soldierIds.map((soldierId) => ({
  path: `/soldiers/${soldierId}`,
  prerender: { enabled: true, outputPath: `/soldiers/${soldierId}/index.html` },
}));

export default defineConfig({
  vite: { base: "/langrisser-future-guide/" },
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      crawlLinks: false,
      failOnError: true,
    },
    pages: [
      { path: "/", prerender: { enabled: true, outputPath: "/index.html" } },
      { path: "/banners", prerender: { enabled: true, outputPath: "/banners/index.html" } },
      { path: "/equipment", prerender: { enabled: true, outputPath: "/equipment/index.html" } },
      { path: "/equipment/exclusive", prerender: { enabled: true, outputPath: "/equipment/exclusive/index.html" } },
      { path: "/soldiers", prerender: { enabled: true, outputPath: "/soldiers/index.html" } },
      { path: "/heroes", prerender: { enabled: true, outputPath: "/heroes/index.html" } },
      ...equipmentDetailPages,
      ...heroDetailPages,
      ...soldierDetailPages,
    ],
  },
});
