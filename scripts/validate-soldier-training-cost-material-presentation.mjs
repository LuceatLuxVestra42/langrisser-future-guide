import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const COST_PATH = "data/generated/soldier-training-tech-level-costs.v1.json";
const ITEMINFO_PATH = "data/generated/soldier-training-material-iteminfo.v1.json";
const LOCALIZATION_PATH = "data/presentation/soldier-training-material-name-kr.v1.json";
const ASSET_DIR = "public/images/soldier-training-materials";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function fail(message) {
  throw new Error(`[soldier-training-cost-material-presentation] ${message}`);
}

function uniqueIndex(rows, key, label) {
  const index = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (!Number.isInteger(value)) fail(`${label} has malformed ${key}.`);
    if (index.has(value)) fail(`${label} duplicates ${key}=${value}.`);
    index.set(value, row);
  }
  return index;
}

function materialRefKey(goodsType, id) {
  return `${goodsType}:${id}`;
}

const costs = readJson(COST_PATH);
const itemInfo = readJson(ITEMINFO_PATH);
const localization = readJson(LOCALIZATION_PATH);

if (
  costs.status !== "PASS" ||
  costs.completion !== "COMPLETE" ||
  costs.freezeState !== "SOLDIER_TRAINING_TECH_LEVEL_COSTS_FROZEN" ||
  costs.coverage?.targetTechCount !== 130 ||
  costs.coverage?.uniqueMaterialReferenceCount !== 48
) {
  fail("Frozen TrainingTech cost predecessor is not the expected 130-Tech / 48-material-reference projection.");
}

if (itemInfo.status !== "PASS" || itemInfo.summary?.targetItemIdCount !== 24 || itemInfo.items?.length !== 24) {
  fail("Frozen Soldier training material ItemInfo source is not the expected 24-item projection.");
}

if (
  localization.status !== "PASS" ||
  localization.completion !== "COMPLETE" ||
  localization.coverage?.targetItemCount !== 24 ||
  localization.coverage?.recordCount !== 24 ||
  localization.records?.length !== 24
) {
  fail("Frozen Soldier training material Korean presentation source is not the expected 24-item projection.");
}

const itemInfoById = uniqueIndex(itemInfo.items, "itemId", "material ItemInfo");
const localizationById = uniqueIndex(localization.records, "itemId", "material localization");

for (const [itemId, item] of itemInfoById) {
  const display = localizationById.get(itemId);
  if (!display) fail(`Missing Korean presentation for itemId=${itemId}.`);
  if (display.nameCn !== item.name) fail(`Chinese-name parity mismatch for itemId=${itemId}.`);
  if (display.status !== "project-display-confirmed" || !display.displayNameKr?.trim()) {
    fail(`Presentation status/name is not confirmed for itemId=${itemId}.`);
  }
  const pngPath = path.join(ROOT, ASSET_DIR, `${itemId}.png`);
  if (!fs.existsSync(pngPath)) fail(`Missing verified training material asset ${ASSET_DIR}/${itemId}.png.`);
}

const refs = new Map();
let materialEntryCount = 0;
for (const record of costs.records ?? []) {
  for (const level of record.levels ?? []) {
    for (const material of level.materials ?? []) {
      materialEntryCount += 1;
      if (
        !Number.isInteger(material.goodsType) ||
        !Number.isInteger(material.id) ||
        !Number.isInteger(material.count) ||
        material.count <= 0
      ) {
        fail(`Malformed cost material at Tech ${record.techId} Lv.${level.level}.`);
      }
      const key = materialRefKey(material.goodsType, material.id);
      const previous = refs.get(key);
      if (previous) {
        previous.occurrenceCount += 1;
      } else {
        refs.set(key, {
          goodsType: material.goodsType,
          id: material.id,
          occurrenceCount: 1,
        });
      }
    }
  }
}

if (materialEntryCount !== costs.coverage.materialEntryCount) {
  fail(`Material entry count drifted: computed=${materialEntryCount}, declared=${costs.coverage.materialEntryCount}.`);
}
if (refs.size !== costs.coverage.uniqueMaterialReferenceCount) {
  fail(`Unique material reference count drifted: computed=${refs.size}, declared=${costs.coverage.uniqueMaterialReferenceCount}.`);
}

const sortedRefs = [...refs.values()].sort((a, b) => a.goodsType - b.goodsType || a.id - b.id);
const nonItemInfoNamespaceRefs = sortedRefs.filter((ref) => ref.goodsType !== 6);
if (nonItemInfoNamespaceRefs.length > 0) {
  fail(
    `Frozen common TrainingTech costs contain non-ItemInfo GoodsType refs: ${nonItemInfoNamespaceRefs
      .map((ref) => materialRefKey(ref.goodsType, ref.id))
      .join(", ")}.`,
  );
}

const resolvedRefs = [];
const unresolvedRefs = [];
for (const ref of sortedRefs) {
  const item = itemInfoById.get(ref.id);
  const display = localizationById.get(ref.id);
  if (item && display) {
    resolvedRefs.push({
      ...ref,
      nameCn: item.name,
      displayNameKr: display.displayNameKr,
      asset: `${ASSET_DIR}/${ref.id}.png`,
    });
  } else {
    unresolvedRefs.push(ref);
  }
}

const summary = {
  status: "PASS",
  scope: "presentation coverage only; no canonical identity/relation/cost mutation",
  predecessor: {
    costPath: COST_PATH,
    freezeState: costs.freezeState,
    targetTechCount: costs.coverage.targetTechCount,
    materialEntryCount,
    uniqueMaterialReferenceCount: refs.size,
  },
  namespace: {
    goodsType: 6,
    policy: "exact (goodsType,id) cost identity; ItemInfo presentation is eligible only in GoodsType 6",
  },
  presentationCoverage: {
    verifiedMaterialSourceCount: itemInfoById.size,
    resolvedReferenceCount: resolvedRefs.length,
    unresolvedReferenceCount: unresolvedRefs.length,
  },
  resolvedRefs,
  unresolvedRefs,
};

console.log(JSON.stringify(summary, null, 2));
