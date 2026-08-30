// GitHub Pages deployment-only static build config.
//
// Public Equipment prerender membership is projected from the frozen public-admission
// correction artifact. Do not use the technical general-equipment population directly.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import exclusiveEquipmentJson from "./data/generated/equipment_stage3_5_exclusive_consumer.json" with { type: "json" };
import generalEquipmentJson from "./data/generated/equipment_stage3_3_general_list.json" with { type: "json" };
import equipmentPublicAdmissionCorrectionJson from "./data/presentation/equipment-public-admission-correction.v1.json" with { type: "json" };
import heroListJson from "./data/generated/hero-list-stage1.v1.json" with { type: "json" };
import soldierListJson from "./data/generated/soldier-list-stage5-8.v1.json" with { type: "json" };

type EquipmentIdRecord = { equipmentId: number };
type HeroIdRecord = { heroId: number };
type SoldierIdRecord = { soldierId: number };
type EquipmentPublicAdmissionCorrection = {
  status: string;
  policy: { joinKey: string; canonicalIdentityChanged: boolean; exclusiveEquipmentChanged: boolean };
  excludedEquipmentIds: number[];
  expectedPublicProjection: { generalEquipmentCount: number; excludedCount: number };
};

const correction = equipmentPublicAdmissionCorrectionJson as unknown as EquipmentPublicAdmissionCorrection;
if (
  correction.status !== "FROZEN" ||
  correction.policy.joinKey !== "equipmentId" ||
  correction.policy.canonicalIdentityChanged !== false ||
  correction.policy.exclusiveEquipmentChanged !== false ||
  correction.excludedEquipmentIds.length !== correction.expectedPublicProjection.excludedCount
) {
  throw new Error("Equipment public-admission correction contract is inconsistent for Pages prerendering.");
}

const excludedEquipmentIds = new Set(correction.excludedEquipmentIds);
if (excludedEquipmentIds.size !== correction.excludedEquipmentIds.length) {
  throw new Error("Equipment public-admission exclusion IDs contain duplicates.");
}

const technicalGeneralEquipmentIds = (generalEquipmentJson as unknown as { records: EquipmentIdRecord[] }).records.map((record) => record.equipmentId);
const generalEquipmentIds = technicalGeneralEquipmentIds.filter((equipmentId) => !excludedEquipmentIds.has(equipmentId));
const exclusiveEquipmentIds = (exclusiveEquipmentJson as unknown as { detailRecords: EquipmentIdRecord[] }).detailRecords.map((record) => record.equipmentId);
const equipmentIds = [...generalEquipmentIds, ...exclusiveEquipmentIds];
const heroIds = (heroListJson as unknown as { records: HeroIdRecord[] }).records.map((record) => record.heroId);
const soldierIds = (soldierListJson as unknown as { records: SoldierIdRecord[] }).records.map((record) => record.soldierId);

if (
  technicalGeneralEquipmentIds.length !== correction.expectedPublicProjection.generalEquipmentCount + correction.expectedPublicProjection.excludedCount ||
  generalEquipmentIds.length !== correction.expectedPublicProjection.generalEquipmentCount ||
  generalEquipmentIds.some((equipmentId) => excludedEquipmentIds.has(equipmentId))
) {
  throw new Error(
    `Expected ${correction.expectedPublicProjection.generalEquipmentCount} admitted general Equipment IDs after excluding ${correction.expectedPublicProjection.excludedCount}; got technical=${technicalGeneralEquipmentIds.length}, admitted=${generalEquipmentIds.length}.`,
  );
}
if (exclusiveEquipmentIds.length !== 167 || new Set(exclusiveEquipmentIds).size !== 167) {
  throw new Error(`Expected 167 unique public exclusive Equipment IDs; got ${exclusiveEquipmentIds.length} / ${new Set(exclusiveEquipmentIds).size}.`);
}
if (equipmentIds.length !== 365 || new Set(equipmentIds).size !== 365) {
  throw new Error(`Expected 365 unique public Equipment IDs; got ${equipmentIds.length} / ${new Set(equipmentIds).size}.`);
}
for (const equipmentId of excludedEquipmentIds) {
  if (equipmentIds.includes(equipmentId)) {
    throw new Error(`Implementation-excluded Equipment ${equipmentId} leaked into Pages prerender membership.`);
  }
}
if (heroIds.length !== 267 || new Set(heroIds).size !== 267) {
  throw new Error(`Expected 267 unique Hero IDs; got ${heroIds.length} / ${new Set(heroIds).size}.`);
}
if (soldierIds.length !== 224 || new Set(soldierIds).size !== 224) {
  throw new Error(`Expected 224 unique Soldier IDs; got ${soldierIds.length} / ${new Set(soldierIds).size}.`);
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
