import equipmentImageStage2SummaryJson from "../../data/validation/equipment-image-stage2-final-summary.v3.json";

type EquipmentImageStage2Summary = {
  status: string;
  completion: string;
  freezeState: string;
  productionJoinKey: string;
  counts: {
    publicEquipment: number;
    heldResolved: number;
    verifiedRepositoryAssets: number;
    existingAssetsChanged: number;
    missing: number;
    invalidPng: number;
    ambiguousLocator: number;
    hardErrors: number;
  };
  finalStage2Complete: boolean;
};

const stage2Summary = equipmentImageStage2SummaryJson as EquipmentImageStage2Summary;

const EQUIPMENT_IMAGE_STAGE2_READY =
  stage2Summary.status === "PASS_EQUIPMENT_IMAGE_STAGE2" &&
  stage2Summary.completion === "COMPLETE" &&
  stage2Summary.freezeState === "EQUIPMENT_IMAGE_STAGE2_FROZEN" &&
  stage2Summary.productionJoinKey === "equipmentId" &&
  stage2Summary.finalStage2Complete === true &&
  stage2Summary.counts.publicEquipment === 373 &&
  stage2Summary.counts.heldResolved === 29 &&
  stage2Summary.counts.verifiedRepositoryAssets === 373 &&
  stage2Summary.counts.existingAssetsChanged === 0 &&
  stage2Summary.counts.missing === 0 &&
  stage2Summary.counts.invalidPng === 0 &&
  stage2Summary.counts.ambiguousLocator === 0 &&
  stage2Summary.counts.hardErrors === 0;

export function getOfficialEquipmentImageUrl(equipmentId: number): string {
  if (!EQUIPMENT_IMAGE_STAGE2_READY) {
    throw new Error("Equipment Image Stage 2 frozen predecessor is not ready.");
  }

  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
    throw new Error(`Invalid equipmentId for image resolution: ${equipmentId}`);
  }

  return `${import.meta.env.BASE_URL}images/equipment/${equipmentId}.png`;
}

export function areOfficialEquipmentImagesReady(): boolean {
  return EQUIPMENT_IMAGE_STAGE2_READY;
}
