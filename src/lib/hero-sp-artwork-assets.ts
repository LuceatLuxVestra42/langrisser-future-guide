const HERO_SP_ARTWORK_BY_HERO_ID: Readonly<Record<number, string>> = {
  1: "/images/heroes/sp/1.webp",
  3: "/images/heroes/sp/3.webp",
  4: "/images/heroes/sp/4.webp",
  6: "/images/heroes/sp/6.webp",
  7: "/images/heroes/sp/7.webp",
  8: "/images/heroes/sp/8.webp",
  9: "/images/heroes/sp/9.webp",
  10: "/images/heroes/sp/10.webp",
  11: "/images/heroes/sp/11.webp",
  12: "/images/heroes/sp/12.webp",
  13: "/images/heroes/sp/13.webp",
  14: "/images/heroes/sp/14.webp",
  25: "/images/heroes/sp/25.webp",
  26: "/images/heroes/sp/26.webp",
  27: "/images/heroes/sp/27.webp",
  29: "/images/heroes/sp/29.webp",
  33: "/images/heroes/sp/33.webp",
  37: "/images/heroes/sp/37.webp",
  40: "/images/heroes/sp/40.webp",
  53: "/images/heroes/sp/53.webp",
  55: "/images/heroes/sp/55.webp",
  56: "/images/heroes/sp/56.webp",
  60: "/images/heroes/sp/60.webp",
  67: "/images/heroes/sp/67.webp",
  89: "/images/heroes/sp/89.webp",
};

export function getHeroSpArtworkSource(heroId: number) {
  return HERO_SP_ARTWORK_BY_HERO_ID[heroId] ?? null;
}
