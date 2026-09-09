import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { heroImages, getHeroIndexForDate } from "@/lib/hero-images";
import clockIcon from "@/assets/clock_of_forgiveness.png";

import cardUpdate from "@/assets/card-update.jpg";
import cardGacha from "@/assets/card-gacha.jpg";
import cardCharacter from "@/assets/card-character.png";
import cardEquip from "@/assets/card-equip.jpg";
import cardSkin from "@/assets/card-skin.jpg";
import cardMerc from "@/assets/card-merc.jpg";
import cardEvent from "@/assets/card-event-regular.jpg";
import cardRift from "@/assets/card-rift.jpg";
import cardSummit from "@/assets/card-summit.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "랑그릿사 모바일 미래시 정보 | 유저 정보 사이트" },
      {
        name: "description",
        content:
          "랑그릿사 모바일 한국 서버의 업데이트, 가챠 배너, 영웅, 장비, 용병, 스킨, PVE, 이벤트 미래 정보를 한 곳에서 확인하세요.",
      },
      { property: "og:title", content: "랑그릿사 모바일 미래시 정보" },
      {
        property: "og:description",
        content: "업데이트 · 가챠 배너 · 영웅 · 장비 · 용병 · 스킨 · PVE · 이벤트 미래 정보를 한 곳에서.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Category = {
  title: string;
  image?: string;
  status: "LIVE" | "COMING_SOON";
  to?: string;
  imageClassName?: string;
};

const categories: Category[] = [
  { title: "가챠 배너", image: cardGacha, status: "LIVE", to: "/banners" },
  { title: "영웅", image: cardCharacter, status: "LIVE", to: "/heroes" },
  { title: "장비", image: cardEquip, status: "LIVE", to: "/equipment" },
  { title: "용병", image: cardMerc, status: "LIVE", to: "/soldiers" },
  { title: "스킨", image: cardSkin, status: "COMING_SOON" },
  { title: "PVE 던전", image: cardRift, status: "COMING_SOON" },
  {
    title: "이벤트",
    image: cardEvent,
    status: "COMING_SOON",
    imageClassName: "h-[132px] w-[132px]",
  },
  {
    title: "서밋",
    image: cardSummit,
    status: "COMING_SOON",
    imageClassName: "h-[132px] w-[132px]",
  },
  { title: "뉴비 가이드", status: "COMING_SOON" },
];

function resolveCategoryHref(to: string) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = to.replace(/^\/+|\/+$/g, "");
  return normalizedPath ? `${normalizedBase}${normalizedPath}/` : normalizedBase;
}

function navigateWithFreshDocument(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  const separator = href.includes("?") ? "&" : "?";
  window.location.assign(`${href}${separator}fresh=${Date.now()}`);
}

function CategoryArtwork({ category }: { category: Category }) {
  if (!category.image) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-xl bg-illustration-bg text-center">
        <span className="text-sm font-semibold tracking-[0.18em] text-muted-foreground">GUIDE</span>
      </div>
    );
  }

  return (
    <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl bg-illustration-bg">
      <img
        src={category.image}
        alt=""
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className={`${
          category.imageClassName ?? "h-36 w-36"
        } object-contain transition-transform duration-200 group-hover:scale-105`}
      />
    </div>
  );
}

function CategoryCard({ category }: { category: Category }) {
  if (category.status === "COMING_SOON") {
    return (
      <article
        aria-label={`${category.title} 준비 중`}
        className="card-nav group flex flex-col items-center px-8 py-9 opacity-75"
      >
        <CategoryArtwork category={category} />
        <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">{category.title}</h3>
        <span className="mt-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          준비 중
        </span>
      </article>
    );
  }

  const href = resolveCategoryHref(category.to!);

  return (
    <a
      href={href}
      onClick={(event) => navigateWithFreshDocument(event, href)}
      aria-label={category.title}
      className="card-nav card-nav-hover group flex flex-col items-center px-8 py-9"
    >
      <CategoryArtwork category={category} />
      <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">{category.title}</h3>
    </a>
  );
}

function HeroSection() {
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
        <div className="absolute inset-0 bg-hero-scrim" />
        <div className="absolute inset-0 bg-hero-fade" />
      </div>

      <div className="mx-auto max-w-6xl px-8 pt-24 pb-36 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-hero-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          랑그릿사 모바일 <span className="text-hero-accent">미래 정보</span>를 한 곳에서
        </h1>
        <p className="mt-4 text-base text-hero-foreground/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
          원하는 정보를 아래에서 눌러 바로 확인하세요.
        </p>
      </div>

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

function UpdatesSection() {
  return (
    <section aria-labelledby="home-updates-title" className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-5">
        <div className="hidden h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-illustration-bg sm:flex">
          <img
            src={cardUpdate}
            alt=""
            width={512}
            height={512}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 object-contain"
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">최근 정보</p>
          <h2 id="home-updates-title" className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            업데이트
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            신규 영웅, 용병, 장비와 주요 콘텐츠 업데이트를 한 흐름에서 확인할 수 있도록 준비 중입니다.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReportSection() {
  return (
    <section aria-labelledby="home-report-title" className="rounded-2xl border border-border bg-card px-6 py-5 text-center">
      <h2 id="home-report-title" className="text-lg font-semibold text-foreground">
        오탈자 · 정보 수정 제보
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        검증된 제보 접수 경로를 연결하기 전까지는 이 영역에서 외부 링크를 제공하지 않습니다.
      </p>
    </section>
  );
}

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-8 py-1">
          <img
            src={clockIcon}
            alt="용서의 시계"
            width={40}
            height={40}
            className="h-10 w-auto object-contain"
          />
          <span className="text-2xl font-bold tracking-tight text-foreground">미래시 시트</span>
        </div>
      </header>

      <HeroSection />

      <main className="mx-auto -mt-12 w-full max-w-6xl flex-1 px-8 pb-12">
        <UpdatesSection />

        <nav aria-label="정보 카테고리" className="mt-7 grid grid-cols-3 gap-7">
          {categories.map((category) => (
            <CategoryCard key={category.title} category={category} />
          ))}
        </nav>

        <div className="mt-7">
          <ReportSection />
        </div>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl space-y-1 px-8 py-8 text-center text-sm leading-relaxed text-muted-foreground">
          <p>본 사이트는 비영리·비수익 목적으로 운영되는 팬 정보 사이트입니다.</p>
          <p>게임 관련 이미지 및 자료의 권리는 각 권리자에게 있습니다.</p>
          <p className="pt-2 text-xs">제작·운영: 성검군단 서버 엑시즈</p>
        </div>
      </footer>
    </div>
  );
}
