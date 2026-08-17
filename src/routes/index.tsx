import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { heroImages, getHeroIndexForDate } from "@/lib/hero-images";


import cardUpdate from "@/assets/card-update.png";
import cardGacha from "@/assets/card-gacha.png";
import cardCharacter from "@/assets/card-character.png";
import cardEquip from "@/assets/card-equip.png";
import cardSkin from "@/assets/card-skin.png";
import cardMerc from "@/assets/card-merc.png";
import cardEvent from "@/assets/card-event-regular.png";
import cardRift from "@/assets/card-rift.png";
import cardSummit from "@/assets/card-summit.png";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "랑그릿사 모바일 미래시 정보 | 유저 정보 사이트" },
      {
        name: "description",
        content:
          "랑그릿사 모바일 한국 서버의 업데이트, 가챠 배너, 전용장비·율정, 스킨, 시공, 이벤트 미래 정보를 한 곳에서 확인하세요.",
      },
      { property: "og:title", content: "랑그릿사 모바일 미래시 정보" },
      {
        property: "og:description",
        content: "업데이트 · 가챠 배너 · 전용장비 · 스킨 · 시공 · 이벤트 미래 정보를 한 곳에서.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Category = {
  title: string;
  image: string;
  to: string;
  primary?: boolean;
};

const categories: Category[] = [
  { title: "업데이트", image: cardUpdate, to: "/", primary: true },
  { title: "가챠 배너", image: cardGacha, to: "/" },
  { title: "캐릭터", image: cardCharacter, to: "/" },
  { title: "장비", image: cardEquip, to: "/" },
  { title: "스킨", image: cardSkin, to: "/" },
  { title: "용병", image: cardMerc, to: "/" },
  { title: "이벤트", image: cardEvent, to: "/" },
  { title: "시공", image: cardRift, to: "/" },
  { title: "서밋 신규맵", image: cardSummit, to: "/" },
];

function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      to={category.to}
      aria-label={category.title}
      className={`card-nav card-nav-hover group flex flex-col items-center px-8 py-9 ${
        category.primary ? "card-nav-primary" : ""
      }`}
    >
      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl bg-illustration-bg">
        <img
          src={category.image}
          alt=""
          width={512}
          height={512}
          loading="lazy"
          className="h-36 w-36 object-contain transition-transform duration-200 group-hover:scale-105"
        />
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">{category.title}</h3>
    </Link>
  );
}

function HeroSection() {
  // 기본값은 날짜 기반 자동 선택. 화살표/점을 누르면 수동 미리보기로만 전환됩니다.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(getHeroIndexForDate());
  }, []);

  const hero = heroImages[index] ?? heroImages[0]!;
  const step = (delta: number) =>
    setIndex((i) => (i + delta + heroImages.length) % heroImages.length);

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img
          src={hero.url}
          alt={hero.alt}
          className="h-full w-full object-cover object-[center_28%]"
        />
        {/* 밝기/색이 제각각인 일러스트에서도 문구가 읽히도록 하는 은은한 스크림 */}
        <div className="absolute inset-0 bg-hero-scrim" />
        {/* 아래로 갈수록 페이지 배경으로 자연스럽게 사라지는 그라데이션 */}
        <div className="absolute inset-0 bg-hero-fade" />
      </div>

      <div className="mx-auto max-w-6xl px-8 pt-20 pb-28 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-hero-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          랑그릿사 모바일 <span className="text-hero-accent">미래 정보</span>를 한 곳에서
        </h1>
        <p className="mt-4 text-base text-hero-foreground/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
          원하는 정보를 아래에서 눌러 바로 확인하세요.
        </p>
      </div>

      {/* 개발용 임시 미리보기 컨트롤 (히어로 확정 후 제거 예정) */}
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="이전 히어로 이미지 미리보기"
        className="absolute left-4 top-[42%] -translate-y-1/2 rounded-full p-2 text-hero-foreground/50 transition hover:bg-white/10 hover:text-hero-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="다음 히어로 이미지 미리보기"
        className="absolute right-4 top-[42%] -translate-y-1/2 rounded-full p-2 text-hero-foreground/50 transition hover:bg-white/10 hover:text-hero-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <ChevronRight size={22} />
      </button>
      <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2">
        {heroImages.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`${i + 1}번 히어로 이미지 미리보기`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-hero-foreground/75" : "w-1.5 bg-hero-foreground/35"
            }`}
          />
        ))}
      </div>
    </section>
  );
}


function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-8 py-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            랑
          </span>
          <span className="text-xl font-bold tracking-tight text-foreground">랑그릿사 모바일</span>
        </div>
      </header>

      <HeroSection />

      <main className="mx-auto -mt-10 w-full max-w-6xl flex-1 px-8 pb-20">


        <nav aria-label="정보 카테고리" className="mt-14 grid grid-cols-3 gap-7">
          {categories.map((category) => (
            <CategoryCard key={category.title} category={category} />
          ))}
        </nav>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          미래시 관련 정보는 계속해서 보강됩니다.
        </p>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl space-y-2 px-8 py-9 text-center text-sm leading-relaxed text-muted-foreground">
          <p>본 사이트는 비영리·비수익 목적으로 운영되는 팬 정보 사이트입니다.</p>
          <p>게임 관련 이미지 및 자료의 권리는 각 권리자에게 있습니다.</p>
          <p>본 사이트에서 직접 작성한 정보는 BY-NC-SA 라이선스에 따라 배포됩니다.</p>
          <p className="text-xs">만든사람: 성검군단 서버 엑시즈</p>
        </div>
      </footer>
    </div>
  );
}
