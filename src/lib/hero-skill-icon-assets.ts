import manifest from "../../data/generated/hero-skill-icon-assets.v1.json";

type ManifestAssetRecord = {
  sourcePath: string;
  publicPath: string;
};

const admittedRecords: ManifestAssetRecord[] = [
  ...manifest.records,
  ...manifest.awakeningRecords,
];

const bySourcePath = new Map<string, ManifestAssetRecord>(
  admittedRecords.map((record) => [record.sourcePath, record]),
);

function resolvePublicAssetUrl(publicPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const basePrefix = base === "/" ? "" : base.replace(/\/$/, "");
  const normalizedPath = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${basePrefix}${normalizedPath}`;
}

export function getHeroSkillIconUrl(_heroId: number, sourcePath: string | null | undefined) {
  if (!sourcePath) return null;
  const record = bySourcePath.get(sourcePath);
  if (!record) return null;
  return resolvePublicAssetUrl(record.publicPath);
}
