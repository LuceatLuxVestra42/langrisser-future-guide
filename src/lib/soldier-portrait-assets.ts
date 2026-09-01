import soldierPortraitManifestJson from "../../data/generated/soldier-portrait-web-manifest.v1.json";

// A7 storage boundary: production portrait URLs resolve only from the WebP manifest.
// Canonical source PNG bytes live in the pinned external source pack and are never fetched at runtime.
type SoldierPortraitManifestRecord = {
  soldierId: number;
  nameKr: string | null;
  fileName: string;
  sourceKind: string;
  sourceFileName?: string;
  resolutionMethod: string;
  driveFolderId?: string;
  driveFileId?: string;
  sourceUrl?: string;
  evidenceUrl?: string;
  evidenceName?: string;
  sha256: string;
  size: number;
};

type SoldierPortraitManifest = {
  version: number;
  status: string;
  publicRoot: string;
  assetsReady: boolean;
  coverage: {
    canonicalSoldierCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    resolvedSpCount: number;
  };
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

export function getResolvedSoldierPortraitCount(): number {
  return soldierPortraitManifest.coverage.resolvedCount;
}

export function areSoldierPortraitAssetsReady(): boolean {
  return (
    soldierPortraitManifest.assetsReady &&
    soldierPortraitManifest.coverage.canonicalSoldierCount === 224 &&
    soldierPortraitManifest.coverage.resolvedCount === portraitBySoldierId.size
  );
}

// Backward-compatible Stage 2 readiness helper. The frontend now consumes the
// latest evidence-backed portrait manifest, but callers using the old helper
// should keep working.
export function areRepresentativeSoldierPortraitsReady(): boolean {
  return areSoldierPortraitAssetsReady() && soldierPortraitManifest.coverage.resolvedCount >= 3;
}
