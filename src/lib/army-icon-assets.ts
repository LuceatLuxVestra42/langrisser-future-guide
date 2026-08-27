import armyIconManifestJson from "../../data/generated/army-icon-manifest.v1.json";

type ArmyIconManifestRecord = {
  armyType: string;
  armyId: number;
  label: string;
  iconNoBackLocator: string;
  fileName: string;
};

type ArmyIconManifest = {
  version: number;
  source: string;
  sourceField: "Icon_NoBack";
  publicRoot: string;
  assetsReady: boolean;
  records: ArmyIconManifestRecord[];
};

const armyIconManifest = armyIconManifestJson as ArmyIconManifest;
const armyIconByType = new Map(
  armyIconManifest.records.map((record) => [record.armyType, record]),
);

export function getOfficialArmyIconUrl(armyType: string): string | null {
  if (!armyIconManifest.assetsReady) return null;

  const record = armyIconByType.get(armyType);
  if (!record) return null;

  return `${import.meta.env.BASE_URL}${armyIconManifest.publicRoot}/${record.fileName}`;
}

export function getOfficialArmyIconLocator(armyType: string): string | null {
  return armyIconByType.get(armyType)?.iconNoBackLocator ?? null;
}

export function areOfficialArmyIconsReady(): boolean {
  return armyIconManifest.assetsReady;
}
