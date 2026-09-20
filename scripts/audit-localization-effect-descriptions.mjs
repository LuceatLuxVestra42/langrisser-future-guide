import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const projectionPaths = [
  "data/presentation/equipment-effect-description-kr-general.part1.v1.json",
  "data/presentation/equipment-effect-description-kr-general.part2.v1.json",
  "data/presentation/equipment-effect-description-kr-exclusive.part1.v1.json",
  "data/presentation/equipment-effect-description-kr-exclusive.part2.v1.json",
];

const projections = projectionPaths.map((relativePath) => ({
  relativePath,
  data: readJson(relativePath),
}));
const generalDetail = readJson("data/generated/equipment_stage3_4_general_detail.json");
const exclusiveConsumer = readJson("data/generated/equipment_stage3_5_exclusive_consumer.json");

const expectedScopeCounts = {
  general: { sourceRows: 206, matched: 206, review: 0, parts: [103, 103] },
  exclusive: { sourceRows: 167, matched: 167, review: 0, parts: [84, 83] },
};

const generalIds = new Set(generalDetail.records.map((record) => record.equipmentId));
const exclusiveIds = new Set(exclusiveConsumer.detailRecords.map((record) => record.equipmentId));
const allIds = new Set();
let totalMatched = 0;

for (const scope of ["general", "exclusive"]) {
  const scoped = projections
    .filter(({ data }) => data.scope === scope)
    .sort((left, right) => left.data.part - right.data.part);
  const expected = expectedScopeCounts[scope];
  if (scoped.length !== 2) {
    throw new Error(`${scope}: expected 2 projection parts, got ${scoped.length}.`);
  }

  let scopedMatched = 0;
  for (let index = 0; index < scoped.length; index += 1) {
    const { relativePath, data } = scoped[index];
    if (
      data.version !== 1 ||
      data.status !== "FROZEN_PRESENTATION_INPUT" ||
      data.part !== index + 1 ||
      data.partCount !== 2 ||
      data.policy?.joinKey !== "equipmentId" ||
      data.policy?.runtimeNameJoin !== false ||
      data.policy?.nameMutation !== false ||
      data.policy?.effectNameLocalized !== false ||
      data.policy?.semanticStageReopened !== false ||
      data.policy?.effectTextRewrite !== false ||
      data.policy?.unmatchedRows !== "REVIEW_ONLY" ||
      data.counts?.sourceRows !== expected.sourceRows ||
      data.counts?.matched !== expected.matched ||
      data.counts?.review !== expected.review ||
      data.counts?.partMatched !== expected.parts[index]
    ) {
      throw new Error(`${relativePath}: projection contract mismatch.`);
    }

    const entries = Object.entries(data.byEquipmentId ?? {});
    if (entries.length !== data.counts.partMatched) {
      throw new Error(`${relativePath}: partMatched does not match record count.`);
    }

    for (const [equipmentIdRaw, effectTextKr] of entries) {
      const equipmentId = Number(equipmentIdRaw);
      if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
        throw new Error(`${relativePath}: invalid equipmentId ${equipmentIdRaw}.`);
      }
      if (typeof effectTextKr !== "string" || effectTextKr.trim().length === 0) {
        throw new Error(`${relativePath}: empty effect text for ${equipmentId}.`);
      }
      if (allIds.has(equipmentId)) {
        throw new Error(`${relativePath}: duplicate equipmentId ${equipmentId}.`);
      }
      if (scope === "general" && !generalIds.has(equipmentId)) {
        throw new Error(`${relativePath}: general Equipment ${equipmentId} is absent from frozen detail consumer.`);
      }
      if (scope === "exclusive" && !exclusiveIds.has(equipmentId)) {
        throw new Error(`${relativePath}: exclusive Equipment ${equipmentId} is absent from frozen detail consumer.`);
      }
      allIds.add(equipmentId);
    }

    scopedMatched += entries.length;
  }

  if (scopedMatched !== expected.matched) {
    throw new Error(`${scope}: matched ${scopedMatched} !== ${expected.matched}.`);
  }
  totalMatched += scopedMatched;
}

if (totalMatched !== 373 || allIds.size !== 373) {
  throw new Error(`total matched Equipment KR effect count must be 373, got ${allIds.size}.`);
}

console.log(
  `[localization-effect-description] PASS matched=${totalMatched} general=206 exclusive=167 review=0 nameMutation=0 semanticReopen=0`,
);
