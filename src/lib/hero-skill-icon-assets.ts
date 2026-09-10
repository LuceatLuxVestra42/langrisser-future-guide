import manifest from "../../data/generated/hero-skill-icon-assets.v1.json";

type ManifestRecord = (typeof manifest.records)[number];

const bySourcePath = new Map<string, ManifestRecord>(
  manifest.records.map((record) => [record.sourcePath, record]),
);

function resolvePublicAssetUrl(publicPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const basePrefix = base === "/" ? "" : base.replace(/\/$/, "");
  const normalizedPath = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${basePrefix}${normalizedPath}`;
}

export function getHeroSkillIconUrl(_heroId: number, sourcePath: string | null | undefined) {
  if (!sourcePath) return null;
  // Verified skill-icon admission is keyed by exact sourcePath. The manifest's current
  // Hero 6 scope describes the materialized seed set; it must not prevent another Hero
  // from reusing an already admitted asset with the same exact sourcePath.
  const record = bySourcePath.get(sourcePath);
  if (!record) return null;
  return resolvePublicAssetUrl(record.publicPath);
}
