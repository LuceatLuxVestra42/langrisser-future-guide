import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { HomeUpdatesTable } from "@/components/home-updates-table";
import { heroImages, getHeroIndexForDate } from "@/lib/hero-images";
import clockIcon from "@/assets/clock_of_forgiveness.png";

import cardGacha from "@/assets/card-gacha.jpg";
import cardCharacter from "@/assets/card-character.png";
import cardEquip from "@/assets/card-equip.jpg";
import cardMerc from "@/assets/card-merc.jpg";

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
      <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-illustration-bg text-center sm:h-36 sm:w-36 lg:h-40 lg:w-40">
        <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground sm:text-sm">GUIDE</span>
      </div>
    );
  }

  return (
    <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl bg-illustration-bg sm:h-36 sm:w-36 lg:h-40 lg:w-40">
      <img
        src={category.image}
        alt=""
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className={`${
          category.imageClassName ?? "h-28 w-28 sm:h-32 sm:w-32 lg:h-36 lg:w-36"
        } object-contain transition-transform duration-200 group-hover:scale-105`}
      />
    </div>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const cardLayout =
    "card-nav group flex min-h-full flex-col items-center px-4 py-6 text-center sm:px-6 sm:py-8 lg:px-8 lg:py-9";

  if (category.status === "COMING_SOON") {
    return (
      <article aria-label={`${category.title} 준비 중`} className={`${cardLayout} opacity-75`}>
        <CategoryArtwork category={category} />
        <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground sm:mt-5 sm:text-xl lg:mt-6 lg:text-2xl">
          {category.title}
        </h3>
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
      aria-label={`${category.title} 페이지로 이동`}
      className={`${cardLayout} card-nav-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      <CategoryArtwork category={category} />
      <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground sm:mt-5 sm:text-xl lg:mt-6 lg:text-2xl">
        {category.title}
      </h3>
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
    <section
      className="relative isolate mx-auto w-[calc(100%-2rem)] max-w-[68rem] overflow-hidden sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]"
      aria-label="히어로 이미지 미리보기"
    >
      <div className="absolute inset-0 -z-10">
        <img
          src={hero.url}
          alt={hero.alt}
          className="h-full w-full object-cover object-[center_28%]"
        />
        <div className="absolute inset-0 bg-hero-scrim" />
        <div className="absolute inset-0 bg-hero-fade" />
      </div>

      <div className="mx-auto max-w-6xl px-12 pb-28 pt-16 text-center sm:px-16 sm:pb-32 sm:pt-20 lg:px-8 lg:pb-36 lg:pt-24">
        <h1 className="text-3xl font-bold tracking-tight text-hero-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] sm:text-4xl">
          랑그릿사 모바일 <span className="text-hero-accent">미래 정보</span>를 한 곳에서
        </h1>
        <p className="mt-3 text-sm text-hero-foreground/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)] sm:mt-4 sm:text-base">
          원하는 정보를 아래에서 눌러 바로 확인하세요.
        </p>
      </div>

      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="이전 히어로 이미지"
        className="absolute left-2 top-[42%] flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full p-2.5 text-hero-foreground/70 transition hover:bg-white/10 hover:text-hero-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-4"
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="다음 히어로 이미지"
        className="absolute right-2 top-[42%] flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full p-2.5 text-hero-foreground/70 transition hover:bg-white/10 hover:text-hero-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-4"
      >
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-1 sm:bottom-16 lg:bottom-20">
        {heroImages.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`${i + 1}번 히어로 이미지 보기`}
            aria-current={i === index ? "true" : undefined}
            className="flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-hero-foreground/75" : "w-1.5 bg-hero-foreground/35"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function UpdatesSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section aria-labelledby="home-updates-title" className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="home-updates-table"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-center gap-2 px-5 py-4 text-center transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-6"
      >
        <h2 id="home-updates-title" className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          업데이트 정리표
        </h2>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={`shrink-0 text-muted-foreground transition-transform sm:h-6 sm:w-6 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div id="home-updates-table" className="border-t border-border px-2 py-3 sm:px-3 sm:py-4">
          <HomeUpdatesTable />
        </div>
      ) : null}
    </section>
  );
}

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-1 sm:px-8">
          <img
            src={clockIcon}
            alt="용서의 시계"
            width={40}
            height={40}
            className="h-10 w-auto object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">미래시 시트</span>
        </div>
      </header>

      <HeroSection />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8">
        <UpdatesSection />

        <nav
          aria-label="정보 카테고리"
          className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:mt-7 lg:grid-cols-3 lg:gap-7"
        >
          {categories.map((category) => (
            <CategoryCard key={category.title} category={category} />
          ))}
        </nav>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl space-y-1 px-5 py-7 text-center text-sm leading-relaxed text-muted-foreground sm:px-8 sm:py-8">
          <p>본 사이트는 비영리·비수익 목적으로 운영되는 팬 정보 사이트입니다.</p>
          <p>게임 관련 이미지 및 자료의 권리는 각 권리자에게 있습니다.</p>
          <p className="pt-2 text-xs">제작·운영: 성검군단 서버 엑시즈</p>
        </div>
      </footer>
    </div>
  );
}
