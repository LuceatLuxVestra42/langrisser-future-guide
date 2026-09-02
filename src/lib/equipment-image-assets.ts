import equipmentSsrFrameCheckpointJson from "../../data/checkpoints/equipment-image-ssr-frame-provenance.v1.json";
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

type EquipmentSsrFrameCheckpoint = {
  status: string;
  completion: string;
  rankProof: {
    currentPublicEquipmentPopulation: number;
    currentPublicEquipmentRank4Count: number;
    currentPublicEquipmentRank5Count: number;
  };
  exactAssetBinding: {
    runtimeLocator: string;
    officialApkBundleEntry: string;
    objectType: string;
    objectName: string;
    width: number;
    height: number;
    hasAlpha: boolean;
    evidencePngSha256: string;
    evidencePngBytes: number;
  };
  blockers: unknown[];
};

const stage2Summary = equipmentImageStage2SummaryJson as EquipmentImageStage2Summary;
const ssrFrameCheckpoint = equipmentSsrFrameCheckpointJson as EquipmentSsrFrameCheckpoint;

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

const EQUIPMENT_SSR_FRAME_READY =
  ssrFrameCheckpoint.status === "PASS_EQUIPMENT_SSR_FRAME_PROVENANCE" &&
  ssrFrameCheckpoint.completion === "COMPLETE" &&
  ssrFrameCheckpoint.rankProof.currentPublicEquipmentPopulation === 373 &&
  ssrFrameCheckpoint.rankProof.currentPublicEquipmentRank4Count === 373 &&
  ssrFrameCheckpoint.rankProof.currentPublicEquipmentRank5Count === 0 &&
  ssrFrameCheckpoint.exactAssetBinding.runtimeLocator ===
    "UI/Common_New_ABS/Border_Icon_Colour.png" &&
  ssrFrameCheckpoint.exactAssetBinding.officialApkBundleEntry ===
    "assets/ExportAssetBundle/begin_ui_common_new_abs.b" &&
  ssrFrameCheckpoint.exactAssetBinding.objectType === "Sprite" &&
  ssrFrameCheckpoint.exactAssetBinding.objectName === "Border_Icon_Colour" &&
  ssrFrameCheckpoint.exactAssetBinding.width === 169 &&
  ssrFrameCheckpoint.exactAssetBinding.height === 169 &&
  ssrFrameCheckpoint.exactAssetBinding.hasAlpha === true &&
  ssrFrameCheckpoint.exactAssetBinding.evidencePngSha256 ===
    "128c96f8ff3c2e2def6a0f1a76169587dcf0402cb9b251e436bd423a0b16bbd1" &&
  ssrFrameCheckpoint.exactAssetBinding.evidencePngBytes === 25295 &&
  ssrFrameCheckpoint.blockers.length === 0;

export function getOfficialEquipmentImageUrl(equipmentId: number): string {
  if (!EQUIPMENT_IMAGE_STAGE2_READY) {
    throw new Error("Equipment Image Stage 2 frozen predecessor is not ready.");
  }

  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
    throw new Error(`Invalid equipmentId for image resolution: ${equipmentId}`);
  }

  return `${import.meta.env.BASE_URL}images/equipment/${equipmentId}.png`;
}

export function getOfficialEquipmentSsrFrameUrl(): string {
  if (!EQUIPMENT_SSR_FRAME_READY) {
    throw new Error("Equipment SSR frame frozen provenance is not ready.");
  }

  return `${import.meta.env.BASE_URL}images/equipment/frame-ssr.png`;
}

export function areOfficialEquipmentImagesReady(): boolean {
  return EQUIPMENT_IMAGE_STAGE2_READY;
}

export function isOfficialEquipmentSsrFrameReady(): boolean {
  return EQUIPMENT_SSR_FRAME_READY;
}
