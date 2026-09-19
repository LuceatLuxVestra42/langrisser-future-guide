import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync("data/generated/hero-casting-law-materials.v1.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("data/generated/hero-casting-law-summary-icon-assets.v1.json", "utf8"));
const summary = JSON.parse(fs.readFileSync("data/validation/hero-casting-law-summary-icon-assets-summary.v1.json", "utf8"));

const fail = (message) => { throw new Error(message); };
if (catalog?.status !== "PASS" || !Array.isArray(catalog?.templates) || catalog.templates.length !== 50) fail("catalog mismatch");
if (
  manifest?.schemaId !== "hero-casting-law-summary-icon-assets/v1" ||
  manifest?.status !== "FROZEN" ||
  manifest?.completion !== "COMPLETE" ||
  manifest?.semanticReopen !== false ||
  manifest?.summary?.recordCount !== 13 ||
  manifest?.summary?.accessoryIncluded !== false ||
  !Array.isArray(manifest?.records) ||
  manifest.records.length !== 13
) fail("summary icon manifest mismatch");

const byPath = new Map();
for (const row of manifest.records) {
  if (!row?.templateIconPath || !row?.labelKr || !row?.asset?.url || !/^[0-9a-f]{40}$/.test(row.asset?.gitBlobSha ?? "")) {
    fail("invalid summary icon record");
  }
  if (byPath.has(row.templateIconPath)) fail(`duplicate template icon path ${row.templateIconPath}`);
  byPath.set(row.templateIconPath, row);
}
const required = new Set();
for (const template of catalog.templates) {
  if (template.equipmentType === 3) continue;
  if (!template.icon) fail(`template ${template.templateId} missing icon`);
  required.add(template.icon);
  if (!byPath.has(template.icon)) fail(`template ${template.templateId} missing summary icon ${template.icon}`);
}
if (required.size !== 13 || byPath.size !== 13) fail(`coverage mismatch required=${required.size} mapped=${byPath.size}`);
if (
  summary?.status !== "PASS" ||
  summary?.completion !== "COMPLETE" ||
  summary?.recordCount !== 13 ||
  summary?.accessoryIncluded !== false ||
  summary?.duplicateTemplateIconPathCount !== 0 ||
  summary?.duplicateAssetUrlCount !== 0 ||
  !Array.isArray(summary?.hardErrors) ||
  summary.hardErrors.length !== 0
) fail("validation summary drift");

console.log(JSON.stringify({
  checkpoint: "HERO_CASTING_LAW_SUMMARY_ICONS",
  status: "PASS",
  requiredTemplateIconPaths: required.size,
  mappedTemplateIconPaths: byPath.size,
  accessoryIncluded: false,
}, null, 2));
