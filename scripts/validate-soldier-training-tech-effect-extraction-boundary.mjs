import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const paths = {
  contract: "data/contracts/soldier-training-tech-effect-extraction-boundary.v1.json",
  classification: "data/generated/soldier-training-tech-classification-stage5.v1.json",
  validation: "data/validation/soldier-training-tech-classification-stage5.v1.json",
};
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const blob = (p) => {
  const b = readFileSync(resolve(root, p));
  return createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
};
const contract = read(paths.contract);
const classification = read(paths.classification);
const validation = read(paths.validation);
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };

check(contract.status === "DESIGN_FROZEN" && contract.completion === "COMPLETE" && contract.freezeState === "TRAINING_TECH_EFFECT_EXTRACTION_BOUNDARY_FROZEN", "Boundary contract is not frozen COMPLETE.");
check(blob(paths.classification) === contract.authoritativePredecessor.classification.gitBlobSha, "Stage 5 classification blob mismatch.");
check(blob(paths.validation) === contract.authoritativePredecessor.validation.gitBlobSha, "Stage 5 validation blob mismatch.");
for (const source of [classification, validation]) check(source.status === "PASS" && source.completion === "COMPLETE" && source.freezeState === "TRAINING_TECH_CLASSIFICATION_STAGE5_FULL_CLASSIFICATION_FROZEN", "Stage 5 predecessor is not PASS/COMPLETE/FROZEN.");
const labels = classification.classificationByLabel ?? {};
const expected = { SOLDIER_GROWTH: 129, COMMON_STAT: 84, COMMON_PASSIVE: 46, SOLDIER_SPECIFIC_PROGRESSION: 28, REVIEW_UNCLASSIFIED: 0 };
for (const [label, n] of Object.entries(expected)) check((labels[label] ?? []).length === n, `${label} population mismatch.`);
const all = Object.values(labels).flat();
check(all.length === 287 && new Set(all).size === 287, "Stage 5 labels do not partition 287 IDs exactly once.");
check((labels.COMMON_STAT ?? []).length + (labels.COMMON_PASSIVE ?? []).length === 130, "Extraction target population is not 130.");
check((labels.SOLDIER_GROWTH ?? []).length + (labels.SOLDIER_SPECIFIC_PROGRESSION ?? []).length === 157, "Excluded population is not 157.");
check(contract.frozenPopulationBoundary.extractionTargets.total === 130 && contract.frozenPopulationBoundary.excludedFromThisExtractionFamily.total === 157, "Contract target/exclusion counts drifted.");
check(contract.scope.effectExtractionPerformed === false, "Boundary stage must not perform effect extraction.");
check(contract.ownerSplit?.length === 2 && contract.ownerSplit[0]?.inputLabel === "COMMON_STAT" && contract.ownerSplit[1]?.inputLabel === "COMMON_PASSIVE", "Extraction owner split drifted.");
check(contract.nextOwner === "TrainingTech COMMON_STAT Effect Extraction", "Unexpected next owner.");
check(classification.sourceSnapshots?.trainingTech?.gitBlobSha === contract.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechGitBlobSha && classification.sourceSnapshots?.trainingTechLevel?.gitBlobSha === contract.futureExtractionEvidencePolicy.sourceSnapshotIdentity.trainingTechLevelGitBlobSha, "Source snapshot identity drifted.");

if (errors.length) {
  console.error(JSON.stringify({ status: "FAIL", blockers: errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", completion: "COMPLETE", extractionPerformed: false, targets: { COMMON_STAT: 84, COMMON_PASSIVE: 46, total: 130 }, excluded: { SOLDIER_GROWTH: 129, SOLDIER_SPECIFIC_PROGRESSION: 28, total: 157 }, blockers: [], reviews: [] }));
