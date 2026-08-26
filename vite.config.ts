// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import exclusiveEquipmentJson from "./data/generated/equipment_stage3_5_exclusive_consumer.json" with { type: "json" };
import generalEquipmentJson from "./data/generated/equipment_stage3_3_general_list.json" with { type: "json" };

type EquipmentIdRecord = {
  equipmentId: number;
};

const generalEquipmentIds = (
  generalEquipmentJson as unknown as { records: EquipmentIdRecord[] }
).records.map((record) => record.equipmentId);

const exclusiveEquipmentIds = (
  exclusiveEquipmentJson as unknown as { detailRecords: EquipmentIdRecord[] }
).detailRecords.map((record) => record.equipmentId);

const equipmentIds = [...generalEquipmentIds, ...exclusiveEquipmentIds];

if (equipmentIds.length !== 373 || new Set(equipmentIds).size !== 373) {
  throw new Error(
    `Expected 373 unique public equipment IDs for static pages; got ${equipmentIds.length} records / ${new Set(equipmentIds).size} unique.`,
  );
}

const equipmentDetailPages = equipmentIds.map((equipmentId) => ({
  path: `/equipment/${equipmentId}`,
  prerender: {
    enabled: true,
    outputPath: `/equipment/${equipmentId}/index.html`,
  },
}));

export default defineConfig({
  // GitHub Pages project site base path.
  vite: {
    base: "/langrisser-future-guide/",
  },
  // GitHub Pages is static hosting, so Nitro's server adapter is intentionally disabled.
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
      {
        path: "/",
        prerender: {
          enabled: true,
          outputPath: "/index.html",
        },
      },
      {
        path: "/banners",
        prerender: {
          enabled: true,
          outputPath: "/banners/index.html",
        },
      },
      {
        path: "/equipment",
        prerender: {
          enabled: true,
          outputPath: "/equipment/index.html",
        },
      },
      {
        path: "/equipment/exclusive",
        prerender: {
          enabled: true,
          outputPath: "/equipment/exclusive/index.html",
        },
      },
      ...equipmentDetailPages,
    ],
  },
});
