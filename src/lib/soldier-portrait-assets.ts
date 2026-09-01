import soldierPortraitWebCurrentJson from "../../data/generated/soldier-portrait-web-current.v1.json";
import soldierPortraitAssetLocatorJson from "../../data/contracts/soldier-portrait-assets-current.v1.json";

// Production portrait selection is stable: this module consumes the rolling current selector,
// then resolves exactly the immutable WebP manifest named by that selector. No highest-version
// discovery, semantic JOIN, or source-PNG fallback is allowed here.
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
  sourceManifest: string;
  coverage: {
    canonicalSoldierCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    resolvedSpCount: number;
  };
  records: SoldierPortraitManifestRecord[];
};

type SoldierPortraitWebCurrent = {
  version: number;
  schemaId: string;
  status: string;
  sourceLocator: string;
  sourceWebManifest: string;
  role: {
    semanticAuthority: boolean;
    rollingProjectionOnly: boolean;
    exactPointerSelection: boolean;
    versionDiscovery: boolean;
    semanticRecomputation: boolean;
    canonicalJoinRecomputation: boolean;
    duplicatesManifestCoverage: boolean;
    duplicatesManifestRecords: boolean;
  };
};

type SoldierPortraitAssetLocator = {
  schemaId: string;
  status: string;
  currentSourceManifest: string;
  currentWebManifest: string;
};

const soldierPortraitWebCurrent = soldierPortraitWebCurrentJson as SoldierPortraitWebCurrent;
const soldierPortraitAssetLocator = soldierPortraitAssetLocatorJson as SoldierPortraitAssetLocator;

if (
  soldierPortraitWebCurrent.schemaId !== "soldier-portrait-web-current/v1" ||
  soldierPortraitWebCurrent.status !== "CURRENT" ||
  soldierPortraitWebCurrent.sourceLocator !== "data/contracts/soldier-portrait-assets-current.v1.json" ||
  soldierPortraitWebCurrent.role.semanticAuthority !== false ||
  soldierPortraitWebCurrent.role.rollingProjectionOnly !== true ||
  soldierPortraitWebCurrent.role.exactPointerSelection !== true ||
  soldierPortraitWebCurrent.role.versionDiscovery !== false ||
  soldierPortraitWebCurrent.role.semanticRecomputation !== false ||
  soldierPortraitWebCurrent.role.canonicalJoinRecomputation !== false ||
  soldierPortraitWebCurrent.role.duplicatesManifestCoverage !== false ||
  soldierPortraitWebCurrent.role.duplicatesManifestRecords !== false
) {
  throw new Error("Invalid Soldier portrait web-current projection boundary.");
}

if (
  soldierPortraitAssetLocator.schemaId !== "soldier-portrait-assets-current/v1" ||
  soldierPortraitAssetLocator.status !== "CURRENT" ||
  soldierPortraitWebCurrent.sourceWebManifest !== soldierPortraitAssetLocator.currentWebManifest
) {
  throw new Error("Soldier portrait web-current projection does not match the current asset locator.");
}

const webManifestModules = import.meta.glob(
  "../../data/generated/soldier-portrait-web-manifest.*.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const selectedWebManifestImportKey = `../../${soldierPortraitWebCurrent.sourceWebManifest}`;
const selectedWebManifestJson = webManifestModules[selectedWebManifestImportKey];
if (!selectedWebManifestJson) {
  throw new Error(`Selected Soldier portrait WebP manifest is not available: ${soldierPortraitWebCurrent.sourceWebManifest}`);
}

const soldierPortraitManifest = selectedWebManifestJson as SoldierPortraitManifest;
if (soldierPortraitManifest.sourceManifest !== soldierPortraitAssetLocator.currentSourceManifest) {
  throw new Error("Selected Soldier portrait WebP manifest does not match the current source manifest.");
}

const portraitBySoldierId = new Map(
  soldierPortraitManifest.records.map((record) => [record.soldierId, record]),
);

export function getOfficialSoldierPortraitUrl(soldierId: number): string | null {
  if (!areSoldierPortraitAssetsReady()) return null;
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
  const recordCount = soldierPortraitManifest.records.length;
  return (
    soldierPortraitManifest.status === "PASS" &&
    soldierPortraitManifest.assetsReady &&
    soldierPortraitManifest.coverage.unresolvedCount === 0 &&
    soldierPortraitManifest.coverage.canonicalSoldierCount === recordCount &&
    soldierPortraitManifest.coverage.resolvedCount === recordCount &&
    portraitBySoldierId.size === recordCount
  );
}

// Backward-compatible Stage 2 readiness helper.
export function areRepresentativeSoldierPortraitsReady(): boolean {
  return areSoldierPortraitAssetsReady() && soldierPortraitManifest.coverage.resolvedCount >= 3;
}
