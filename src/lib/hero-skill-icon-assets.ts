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

export function getHeroSkillIconUrl(heroId: number, sourcePath: string | null | undefined) {
  if (heroId !== manifest.scope.heroId || !sourcePath) return null;
  const record = bySourcePath.get(sourcePath);
  if (!record) return null;
  return resolvePublicAssetUrl(record.publicPath);
}
