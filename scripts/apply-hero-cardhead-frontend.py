import pathlib
import re

path = pathlib.Path("src/routes/heroes.tsx")
text = path.read_text(encoding="utf-8")

text, count = re.subn(
    r'\n// Presentation-only portrait sample set kept as a defensive fallback\.\n// The canonical resolver now covers all 267 Hero card artwork paths first\.\nconst SAMPLE_HERO_CARD_PATHS: Readonly<Record<number, string>> = \{.*?\n\};\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f"sample portrait fallback block replacement count={count}")

old_rarity = '''function getRarityFrameClass(baseLabel: string) {
  switch (baseLabel) {
    case "SSR":
      return "from-amber-200 via-amber-400 to-yellow-700";
    case "SR":
      return "from-violet-200 via-violet-400 to-fuchsia-700";
    case "R":
      return "from-sky-200 via-sky-400 to-cyan-700";
    default:
      return "from-zinc-200 via-zinc-400 to-zinc-700";
  }
}
'''
new_rarity = '''function getRarityFrameClass(baseLabel: string) {
  switch (baseLabel) {
    case "SSR":
      return "border-amber-400/80";
    case "SR":
      return "border-violet-400/80";
    case "R":
      return "border-sky-400/80";
    default:
      return "border-border";
  }
}
'''
if old_rarity not in text:
    raise RuntimeError("rarity frame function source drift")
text = text.replace(old_rarity, new_rarity, 1)
text = text.replace("공식 초상화 267명 연결", "공식 CardHead 아이콘 267명 연결", 1)

hero_card_start = text.find("function HeroGridCard({ hero }: { hero: HeroListStage4Record }) {")
if hero_card_start < 0:
    raise RuntimeError("HeroGridCard function not found")

new_card = '''function HeroGridCard({ hero }: { hero: HeroListStage4Record }) {
  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;
  const imageUrl = resolvePublicAssetUrl(`/images/heroes/card-head/${hero.heroId}.png`);
  const rarityFrameClass = getRarityFrameClass(hero.rarity.baseLabel);
  const hasSampleSuperBuff = SAMPLE_SUPER_BUFF_HERO_IDS.has(hero.heroId);

  return (
    <Link
      reloadDocument
      to="/heroes/$heroId"
      params={{ heroId: String(hero.heroId) }}
      aria-label={`${displayName} ${hero.rarity.baseLabel} 상세 보기`}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2"
    >
      <article
        className={`overflow-hidden rounded-lg border-2 bg-card shadow-sm transition duration-200 ${rarityFrameClass} group-hover:-translate-y-0.5 group-hover:shadow-md`}
      >
        <div className="relative aspect-square overflow-hidden bg-muted/40">
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.025]"
            loading="lazy"
          />

          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
            {hero.hasSp ? (
              <span className="rounded border border-fuchsia-200/50 bg-fuchsia-950/85 px-1.5 py-0.5 text-[9px] font-black leading-none text-fuchsia-100 shadow-sm sm:text-[10px]">
                SP
              </span>
            ) : null}
            {hasSampleSuperBuff ? (
              <span
                className="rounded border border-white/25 bg-black/75 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm sm:text-[10px]"
                title="초절 강화 보유"
              >
                초절
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border/70 bg-card px-1.5 py-1.5 text-center">
          <span className="line-clamp-1 text-[11px] font-bold leading-tight text-foreground sm:text-xs">
            {displayName}
          </span>
        </div>
      </article>
    </Link>
  );
}
'''
text = text[:hero_card_start] + new_card

if "SAMPLE_HERO_CARD_PATHS" in text:
    raise RuntimeError("old portrait fallback still present")
if '/images/heroes/card-head/${hero.heroId}.png' not in text:
    raise RuntimeError("CardHead web asset route missing")
if "hero.card.webAssetPath" in text:
    raise RuntimeError("old full artwork list consumer still present")

path.write_text(text, encoding="utf-8")
print("Hero list consumer switched to exact CardHead assets")
