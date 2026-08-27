// GitHub Pages deployment-only static build config.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import exclusiveEquipmentJson from "./data/generated/equipment_stage3_5_exclusive_consumer.json" with { type: "json" };
import generalEquipmentJson from "./data/generated/equipment_stage3_3_general_list.json" with { type: "json" };
import heroListJson from "./data/generated/hero-list-stage1.v1.json" with { type: "json" };
import soldierListJson from "./data/generated/soldier-list-stage5-8.v1.json" with { type: "json" };

type EquipmentIdRecord = { equipmentId: number };
type HeroIdRecord = { heroId: number };
type SoldierIdRecord = { soldierId: number };

const generalEquipmentIds = (generalEquipmentJson as unknown as { records: EquipmentIdRecord[] }).records.map((record) => record.equipmentId);
const exclusiveEquipmentIds = (exclusiveEquipmentJson as unknown as { detailRecords: EquipmentIdRecord[] }).detailRecords.map((record) => record.equipmentId);
const equipmentIds = [...generalEquipmentIds, ...exclusiveEquipmentIds];
const heroIds = (heroListJson as unknown as { records: HeroIdRecord[] }).records.map((record) => record.heroId);
const soldierIds = (soldierListJson as unknown as { records: SoldierIdRecord[] }).records.map((record) => record.soldierId);

if (equipmentIds.length !== 373 || new Set(equipmentIds).size !== 373) {
  throw new Error(`Expected 373 unique public equipment IDs; got ${equipmentIds.length} / ${new Set(equipmentIds).size}.`);
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