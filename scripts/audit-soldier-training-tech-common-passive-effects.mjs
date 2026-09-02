import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const P = {
  boundary: "data/contracts/soldier-training-tech-effect-extraction-boundary.v1.json",
  stage5: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  stage5Validation: "data/validation/soldier-training-tech-classification-stage5.v1.json",
  stage1: "data/generated/soldier-training-tech-classification-stage1-census.v1.json",
};
const sourcePath = process.env.TRAINING_TECH_LEVEL_SOURCE;
const outPath = process.env.COMMON_PASSIVE_AUDIT_OUT;
const text = (p) => readFileSync(resolve(root, p), "utf8");
const json = (p) => JSON.parse(text(p));
const blobBytes = (b) => createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const blob = (p) => blobBytes(readFileSync(resolve(root, p)));
const req = (ok, msg) => { if (!ok) throw new Error(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

req(sourcePath && existsSync(sourcePath), "TRAINING_TECH_LEVEL_SOURCE must point to the recovered frozen source.");
req(outPath, "COMMON_PASSIVE_AUDIT_OUT is required.");
const boundary = json(P.boundary), stage5 = json(P.stage5), stage5Validation = json(P.stage5Validation), stage1 = json(P.stage1);
const sourceBytes = readFileSync(sourcePath);
const levelRows = JSON.parse(sourceBytes.toString("utf8"));

req(boundary.status === "DESIGN_FROZEN" && boundary.completion === "COMPLETE" && boundary.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Effect extraction boundary is not frozen COMPLETE.");
req(boundary.parallelOwner === "TrainingTech COMMON_PASSIVE Effect Extraction", "Boundary does not expose COMMON_PASSIVE as the separate extraction owner.");
req(blob(P.stage5) === boundary.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
req(blob(P.stage5Validation) === boundary.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [stage5, stage5Validation]) req(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
req(stage1.status === "PASS" && stage1.population?.trainingTech === 287 && stage1.population?.trainingTechLevel === 2945, "Stage 1 census drifted.");
req(stage1.sourceSnapshots?.trainingTech?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha, "TrainingTech source identity drifted.");
req(stage1.sourceSnapshots?.trainingTechLevel?.gitBlobSha === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "TrainingTechLevel source identity drifted in Stage 1.");
req(blobBytes(sourceBytes) === boundary.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Recovered TrainingTechLevel source blob does not match the frozen boundary.");
req(Array.isArray(levelRows) && levelRows.length === 2945, "TrainingTechLevel source population is not 2945.");

const targetIds = stage5.classificationByLabel?.COMMON_PASSIVE ?? [];
req(targetIds.length === 46 && new Set(targetIds).size === 46, "Frozen COMMON_PASSIVE membership is not 46 unique Tech IDs.");
req(boundary.frozenPopulationBoundary?.extractionTargets?.COMMON_PASSIVE === 46, "Boundary COMMON_PASSIVE population drifted.");
const excluded = new Set([...(stage5.classificationByLabel?.SOLDIER_GROWTH ?? []), ...(stage5.classificationByLabel?.COMMON_STAT ?? []), ...(stage5.classificationByLabel?.SOLDIER_SPECIFIC_PROGRESSION ?? []), ...(stage5.classificationByLabel?.REVIEW_UNCLASSIFIED ?? [])]);
for (const id of targetIds) req(!excluded.has(id), `COMMON_PASSIVE target overlaps excluded label: ${id}`);

const censusById = new Map();
for (const row of stage1.records ?? []) {
  req(Number.isInteger(row.id), "Stage 1 census contains a non-integer Tech ID.");
  req(!censusById.has(row.id), `Duplicate Stage 1 Tech ID: ${row.id}`);
  censusById.set(row.id, row);
}
req(censusById.size === 287, "Stage 1 census unique Tech count is not 287.");
const levelById = new Map();
for (const row of levelRows) {
  req(Number.isInteger(row?.ID), "TrainingTechLevel source contains a non-integer ID.");
  req(!levelById.has(row.ID), `Duplicate TrainingTechLevel source ID: ${row.ID}`);
  levelById.set(row.ID, row);
}
req(levelById.size === 2945, "TrainingTechLevel unique ID count is not 2945.");

const stripTags = (s) => s.replace(/<color=[^>]+>/g, "").replace(/<\/color>/g, "");
const skeletonOf = (s) => stripTags(s).replace(/[+-]?\d+(?:\.\d+)?%?/g, "{N}").replace(/\s+/g, " ").trim();
const highlightedValues = (s) => [...s.matchAll(/<color=[^>]+>\s*([^<]+?)\s*<\/color>/g)].map((m) => m[1].trim());
const outsideNumbers = (s) => {
  const outside = s.replace(/<color=[^>]+>[\s\S]*?<\/color>/g, " ");
  return [...stripTags(outside).matchAll(/[+-]?\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
};

const skeletonMap = new Map();
const referenced = [];
let rowsWithOutsideNumbers = 0;
let highlightedTokenCount = 0;
const records = targetIds.map((techId) => {
  const census = censusById.get(techId);
  req(census, `Missing Stage 1 TrainingTech row: ${techId}`);
  const raw = census.raw ?? {};
  req(raw.ID === techId, `COMMON_PASSIVE Tech ${techId} explicit ID drifted.`);
  const refs = raw.TechLevelupInfoList;
  req(Array.isArray(refs) && refs.length > 0, `COMMON_PASSIVE Tech ${techId} lacks TechLevelupInfoList.`);
  req(same(refs, census.explicitLevelReferences), `Stage 1 explicit level reference projection drifted for Tech ${techId}.`);
  const skeletons = new Set();
  const descriptions = [];
  let techOutsideRows = 0;
  refs.forEach((levelId) => {
    req(Number.isInteger(levelId), `Tech ${techId} has a non-integer level reference.`);
    const source = levelById.get(levelId);
    req(source, `Unresolved TrainingTechLevel ID ${levelId} referenced by Tech ${techId}.`);
    req(typeof source.Description === "string" && source.Description.length > 0, `TrainingTechLevel ${levelId} lacks Description.`);
    referenced.push(levelId);
    const skeleton = skeletonOf(source.Description);
    const highlighted = highlightedValues(source.Description);
    const outside = outsideNumbers(source.Description);
    highlightedTokenCount += highlighted.length;
    if (outside.length) { rowsWithOutsideNumbers++; techOutsideRows++; }
    skeletons.add(skeleton);
    descriptions.push(source.Description);
    const current = skeletonMap.get(skeleton) ?? { skeleton, techIds: new Set(), levelRowCount: 0, sampleDescription: source.Description, rowsWithOutsideNumbers: 0 };
    current.techIds.add(techId);
    current.levelRowCount++;
    if (outside.length) current.rowsWithOutsideNumbers++;
    skeletonMap.set(skeleton, current);
  });
  return {
    techId,
    levelRowCount: refs.length,
    uniqueSkeletonCount: skeletons.size,
    rowsWithOutsideNumbers: techOutsideRows,
    firstDescription: descriptions[0],
    lastDescription: descriptions[descriptions.length - 1],
    skeletons: [...skeletons],
  };
});

req(records.length === 46, "Audit Tech record count is not 46.");
req(new Set(referenced).size === referenced.length, "COMMON_PASSIVE level references are not globally unique.");
const skeletonCatalog = [...skeletonMap.values()].map((x) => ({ ...x, techIds: [...x.techIds].sort((a,b) => a-b) })).sort((a,b) => a.skeleton.localeCompare(b.skeleton));
const audit = {
  version: 1,
  schemaId: "soldier-training-tech-common-passive-effect-audit/v1",
  stage: "TrainingTech COMMON_PASSIVE Effect Extraction Audit",
  status: "PASS",
  completion: "AUDIT_COMPLETE",
  purpose: "Read-only structural audit of all frozen COMMON_PASSIVE source Description rows before semantic extraction. No passive meaning is inferred by this artifact.",
  authority: {
    boundaryGitBlobSha: blob(P.boundary),
    stage5ClassificationGitBlobSha: blob(P.stage5),
    stage5ValidationGitBlobSha: blob(P.stage5Validation),
    stage1GitBlobSha: blob(P.stage1),
    trainingTechLevelGitBlobSha: blobBytes(sourceBytes),
  },
  policy: {
    inputLabel: "COMMON_PASSIVE",
    classificationAuthority: "STAGE5_FROZEN_MEMBERSHIP_ONLY",
    explicitTechLevelupInfoListJoinOnly: true,
    semanticInferencePerformed: false,
    skeletonNormalizationOnly: true,
    nameJoinPerformed: false,
    idArithmeticPerformed: false,
    missingValueImputationPerformed: false,
    historicalOutputFallbackUsed: false,
  },
  coverage: {
    targetTechCount: 46,
    materializedTechCount: records.length,
    referencedLevelRowCount: referenced.length,
    uniqueReferencedLevelRowCount: new Set(referenced).size,
    uniqueSkeletonCount: skeletonCatalog.length,
    rowsWithNumericTokensOutsideColorTags: rowsWithOutsideNumbers,
    highlightedTokenCount,
    unresolvedLevelReferenceCount: 0,
    duplicateReferencedLevelIdCount: 0,
  },
  records,
  skeletonCatalog,
};
writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ status: audit.status, coverage: audit.coverage }));
