import soldierPortraitManifestJson from "../../data/generated/soldier-portrait-manifest.v1.json";

type SoldierPortraitManifestRecord = {
  soldierId: number;
  nameKr: string;
  fileName: string;
  driveFolderId: string;
  driveFileId: string;
  sourceFileName: "Default.png";
};

type SoldierPortraitManifest = {
  version: number;
  publicRoot: string;
  assetsReady: boolean;
  records: SoldierPortraitManifestRecord[];
};

const soldierPortraitManifest = soldierPortraitManifestJson as SoldierPortraitManifest;
const portraitBySoldierId = new Map(
  soldierPortraitManifest.records.map((record) => [record.soldierId, record]),
);

export function getOfficialSoldierPortraitUrl(soldierId: number): string | null {
  if (!soldierPortraitManifest.assetsReady) return null;
  const record = portraitBySoldierId.get(soldierId);
  if (!record) return null;
  return `${import.meta.env.BASE_URL}${soldierPortraitManifest.publicRoot}/${record.fileName}`;
}

export function getSoldierPortraitSource(soldierId: number) {
  return portraitBySoldierId.get(soldierId) ?? null;
}

export function areRepresentativeSoldierPortraitsReady(): boolean {
  return soldierPortraitManifest.assetsReady;
}
