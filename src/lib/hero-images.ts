import hero1 from "@/assets/title_1.png";
import hero2 from "@/assets/title_2.png";
import hero3 from "@/assets/title_3.png";
import hero4 from "@/assets/title_4.png";
import hero5 from "@/assets/title_5.png";
import hero6 from "@/assets/title_6.png";
import hero7 from "@/assets/title_7.png";

/**
 * 히어로 배경 로딩화면 일러스트 목록.
 * 최신 중국서버 캐릭터 7종을 유지하려면 아래 배열의 항목을 교체하세요.
 * (가장 오래된 항목을 지우고 새 이미지를 추가하면 됩니다.)
 */
export const heroImages: { url: string; alt: string }[] = [
  { url: hero1, alt: "마안의 서큐버스 로딩화면 일러스트" },
  { url: hero2, alt: "물린 로딩화면 일러스트" },
  { url: hero3, alt: "타지 린 로딩화면 일러스트" },
  { url: hero4, alt: "히어로 로딩화면 일러스트 4" },
  { url: hero5, alt: "히어로 로딩화면 일러스트 5" },
  { url: hero6, alt: "히어로 로딩화면 일러스트 6" },
  { url: hero7, alt: "히어로 로딩화면 일러스트 7" },
];

/** 날짜 기준으로 하루에 한 번씩 순환하는 인덱스를 반환합니다. */
export function getHeroIndexForDate(date: Date = new Date()): number {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  return ((dayNumber % heroImages.length) + heroImages.length) % heroImages.length;
}
