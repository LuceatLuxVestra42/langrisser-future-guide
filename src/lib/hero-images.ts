import hero1 from "@/assets/hero-1.png.asset.json";
import hero2 from "@/assets/hero-2.png.asset.json";
import hero3 from "@/assets/hero-3.png.asset.json";

/**
 * 히어로 배경 로딩화면 일러스트 목록.
 * 최신 중국서버 캐릭터 7종을 유지하려면 아래 배열의 항목을 교체하세요.
 * (가장 오래된 항목을 지우고 새 이미지를 추가하면 됩니다.)
 */
export const heroImages: { url: string; alt: string }[] = [
  { url: hero1.url, alt: "마안의 서큐버스 로딩화면 일러스트" },
  { url: hero2.url, alt: "물린 로딩화면 일러스트" },
  { url: hero3.url, alt: "타지 린 로딩화면 일러스트" },
];

/** 날짜 기준으로 하루에 한 번씩 순환하는 인덱스를 반환합니다. */
export function getHeroIndexForDate(date: Date = new Date()): number {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  return ((dayNumber % heroImages.length) + heroImages.length) % heroImages.length;
}
