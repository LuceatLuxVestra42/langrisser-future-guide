import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveConfigDataFile } from "./configdata-source-pack-maintenance-root.mjs";

const root = process.cwd();
const readJson = (path) => {
  const physicalPath = path.startsWith("data/configdata/")
    ? resolveConfigDataFile(path.slice("data/configdata/".length))
    : resolve(root, path);
  return JSON.parse(readFileSync(physicalPath, "utf8"));
};
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const stage2 = readJson("data/validation/soldier-training-tech-classification-stage2.v1.json");
const techs = readJson("data/configdata/ConfigDataTrainingTechInfo.json");
const levels = readJson("data/configdata/ConfigDataTrainingTechLevelInfo.json");
const soldierDetail = readJson("data/generated/soldier-detail-stage5-4.v1.json");

if (stage2.status !== "PASS" || stage2.completion !== "COMPLETE" || stage2.freezeState !== "TRAINING_TECH_CLASSIFICATION_STAGE2_EVIDENCE_FROZEN") {
  throw new Error("Stage 2 evidence contract is not frozen PASS/COMPLETE.");
}

const levelById = new Map(levels.map((record) => [record.ID, record]));
const protectedGrowthTechIds = new Set(
  soldierDetail.records
    .filter((record) => record.identity?.tier === 3 && record.identity?.isSp === false && record.training?.techId != null)
    .map((record) => record.training.techId),
);

if (protectedGrowthTechIds.size !== 129) {
  throw new Error(`Expected 129 protected growth Tech IDs, got ${protectedGrowthTechIds.size}`);
}

const relationShape = (tech) => {
  const army = has(tech, "ArmyIDRelated");
  const soldier = has(tech, "SoldierIDRelated");
  if (army && soldier) return "ARMY_AND_SOLDIER";
  if (army) return "ARMY_ONLY";
  if (soldier) return "SOLDIER_ONLY";
  return "NONE";
};

const skillLevelupShape = (records) => {
  const values = records.filter((record) => has(record, "SoldierSkillLevelup")).map((record) => record.SoldierSkillLevelup);
  if (values.length === 0) return "NONE";
  const exact = values.every((value, index) => value === index + 1);
  return exact ? `EXACT_1_TO_${values.length}` : "OTHER";
};

const projectLevelEvidence = (record) => {
  const out = { ID: record.ID, Description: record.Description };
  for (const key of ["PreTechIDs", "SoldierIDUnlocked", "SoldierSkillID", "SoldierSkillLevelup", "SpSoidlierDescription"]) {
    if (has(record, key)) out[key] = record[key];
  }
  return out;
};

const nonGrowth = [];
for (let sourceIndex = 0; sourceIndex < techs.length; sourceIndex += 1) {
  const tech = techs[sourceIndex];
  if (protectedGrowthTechIds.has(tech.ID)) continue;
  const referencedLevels = tech.TechLevelupInfoList.map((id) => {
    const level = levelById.get(id);
    if (!level) throw new Error(`Missing TrainingTechLevelInfo ${id} referenced by Tech ${tech.ID}`);
    return level;
  });
  const unlockedSoldierIds = [...new Set(referencedLevels.filter((record) => has(record, "SoldierIDUnlocked")).map((record) => record.SoldierIDUnlocked))].sort((a, b) => a - b);
  const signature = {
    techTypeRaw: tech.TechType,
    relationShape: relationShape(tech),
    levelCount: referencedLevels.length,
    skillLevelupShape: skillLevelupShape(referencedLevels),
    hasPreTech: has(tech, "PreTechIDs"),
    hasRoomLevelRequired: has(tech, "RoomLevelRequired"),
    hasLevelUnlockField: unlockedSoldierIds.length > 0,
    hasSpDescription: referencedLevels.some((record) => has(record, "SpSoidlierDescription")),
  };
  const signatureKey = Object.entries(signature).map(([key, value]) => `${key}=${value}`).join("|");
  nonGrowth.push({ sourceIndex, tech, referencedLevels, unlockedSoldierIds, signature, signatureKey });
}

const grouped = new Map();
for (const entry of nonGrowth) {
  const group = grouped.get(entry.signatureKey) ?? [];
  group.push(entry);
  grouped.set(entry.signatureKey, group);
}

const structuralGroups = [...grouped.entries()]
  .map(([signatureKey, entries]) => {
    entries.sort((a, b) => a.sourceIndex - b.sourceIndex);
    const representative = entries[0];
    return {
      signatureKey,
      signature: representative.signature,
      count: entries.length,
      techIds: entries.map((entry) => entry.tech.ID).sort((a, b) => a - b),
      representativeSelection: "LOWEST_SOURCE_INDEX_WITHIN_STRUCTURAL_SIGNATURE_FOR_LOCATOR_ONLY",
      representative: {
        sourceIndex: representative.sourceIndex,
        techId: representative.tech.ID,
        rawTech: representative.tech,
        explicitUnlockedSoldierIds: representative.unlockedSoldierIds,
        levelEvidence: representative.referencedLevels.map(projectLevelEvidence),
      },
    };
  })
  .sort((a, b) => a.representative.sourceIndex - b.representative.sourceIndex);

const groupSummary = structuralGroups.map((group) => ({
  signatureKey: group.signatureKey,
  count: group.count,
  representativeTechId: group.representative.techId,
  representativeName: group.representative.rawTech.Name,
  explicitUnlockedSoldierIds: group.representative.explicitUnlockedSoldierIds,
  firstDescription: group.representative.levelEvidence[0]?.Description ?? null,
}));

const output = {
  version: 1,
  schemaId: "soldier-training-tech-classification-stage3-candidate-evidence/v1",
  stage: "TrainingTech Classification Stage 3 - Representative Semantic Evidence Investigation",
  status: "INVESTIGATION_ONLY",
  predecessor: "data/validation/soldier-training-tech-classification-stage2.v1.json",
  sourceSnapshots: stage2.sourceSnapshots,
  policy: {
    semanticClassificationPerformed: false,
    representativeSelectionUsesSourceOrderAsMeaning: false,
    representativeSelectionSourceOrderRole: "deterministic locator within an already-defined structural signature only",
    nameKeywordClassificationPerformed: false,
    descriptionKeywordClassificationPerformed: false,
    idArithmeticPerformed: false,
    techTypeMeaningAssigned: false,
  },
  coverage: {
    totalTrainingTech: techs.length,
    protectedGrowthTech: protectedGrowthTechIds.size,
    nonGrowthTech: nonGrowth.length,
    structuralGroupCount: structuralGroups.length,
    representedNonGrowthTech: structuralGroups.reduce((sum, group) => sum + group.count, 0),
  },
  groupSummary,
  structuralGroups,
};

const outPath = resolve(root, "data/evidence/soldier-training-tech-classification-stage3-candidates.v1.json");
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.coverage));
