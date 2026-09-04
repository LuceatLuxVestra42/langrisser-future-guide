const LEON_HERO_ID = 6;

const LEON_SKIN_ACQUISITION_LABELS: Readonly<Record<number, string>> = {
  601: "스킨 상점 · 스킨권 구매",
  602: "빛의 메아리 보상",
  603: "형귀뽑기 보상",
  604: "서밋 아레나 패자 스킨 · 스킨권 구매",
  605: "빛의 메아리 보상",
  606: "7주년 출석체크 보상",
};

export function getHeroSkinAcquisitionDisplayLabel(
  heroId: number,
  skinId: number | null,
  sourceOrder: number | null,
): string {
  if (heroId === LEON_HERO_ID && skinId != null) {
    const label = LEON_SKIN_ACQUISITION_LABELS[skinId];
    if (label) return label;
  }

  return `스킨 ${sourceOrder ?? "-"} · ID ${skinId ?? "-"}`;
}
