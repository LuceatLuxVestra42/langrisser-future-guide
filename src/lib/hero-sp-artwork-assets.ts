const HERO_SP_ARTWORK_PATH_BY_ID = new Map<number, string>([
  [6, "/images/heroes/sp/6.webp"],
]);

export function getHeroSpArtworkPath(heroId: number) {
  return HERO_SP_ARTWORK_PATH_BY_ID.get(heroId) ?? null;
}
