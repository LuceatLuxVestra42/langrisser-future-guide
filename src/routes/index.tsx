import { createFileRoute, Link } from "@tanstack/react-router";

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-8 pb-20 pt-16">
        <section className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            랑그릿사 모바일 <span className="text-primary">미래 정보</span>를 한 곳에서
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            원하는 정보를 아래에서 눌러 바로 확인하세요.
          </p>
        </section>

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
        <div className="mx-auto max-w-6xl space-y-1.5 px-8 py-8 text-center text-xs leading-relaxed text-muted-foreground">
          <p>본 사이트는 비영리 · 비수익 목적으로 운영되는 팬 정보 사이트입니다.</p>
          <p>게임 관련 이미지 및 자료의 권리는 각 권리자에게 있습니다.</p>
          <p>본 포털은 BY·NC·SA 라이선스에 따라 배포됩니다 · 만든사람: 성검군단 서버 엑시즈</p>
        </div>
      </footer>
    </div>
  );
}
