import fs from 'node:fs';

const routePath = 'src/routes/heroes.tsx';
let source = fs.readFileSync(routePath, 'utf8');

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing expected Hero route block: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Expected unique Hero route block: ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'import { getHeroListStage4Data } from "@/lib/hero-list.functions";\n',
  'import { getHeroCardIconIndex } from "@/lib/hero-card-icon-assets.functions";\nimport { getHeroListStage4Data } from "@/lib/hero-list.functions";\n',
  'card icon server function import',
);

replaceOnce(
  '  loader: () => getHeroListStage4Data(),\n',
  `  loader: async () => {\n    const [data, cardIcons] = await Promise.all([getHeroListStage4Data(), getHeroCardIconIndex()]);\n    if (\n      cardIcons.summary.total !== 267 ||\n      cardIcons.summary.resolved !== 267 ||\n      cardIcons.summary.pending !== 0 ||\n      cardIcons.summary.hardErrors !== 0 ||\n      cardIcons.records.length !== 267\n    ) {\n      throw new Error("Hero card icon frozen index is not production-ready.");\n    }\n    return { ...data, cardIcons };\n  },\n`,
  'route loader',
);

replaceOnce(
  `// Presentation-only portrait sample set kept as a defensive fallback.\n// The canonical resolver now covers all 267 Hero card artwork paths first.\nconst SAMPLE_HERO_CARD_PATHS: Readonly<Record<number, string>> = {\n  5: "/images/heroes/portrait-samples/5.webp",\n  6: "/images/heroes/portrait-samples/6.webp",\n  8: "/images/heroes/portrait-samples/8.webp",\n  12: "/images/heroes/portrait-samples/12.webp",\n  15: "/images/heroes/portrait-samples/15.webp",\n};\n\n`,
  '',
  'portrait sample fallback',
);

replaceOnce(
  `function getRarityFrameClass(baseLabel: string) {\n  switch (baseLabel) {\n    case "SSR":\n      return "from-amber-200 via-amber-400 to-yellow-700";\n    case "SR":\n      return "from-violet-200 via-violet-400 to-fuchsia-700";\n    case "R":\n      return "from-sky-200 via-sky-400 to-cyan-700";\n    default:\n      return "from-zinc-200 via-zinc-400 to-zinc-700";\n  }\n}\n\n`,
  '',
  'synthetic rarity frame helper',
);

replaceOnce(
  `  const [spOnly, setSpOnly] = useState(false);\n\n  const filteredHeroes = useMemo(() => {\n`,
  `  const [spOnly, setSpOnly] = useState(false);\n  const cardIconByHeroId = useMemo(\n    () => new Map(data.cardIcons.records.map((record) => [record.heroId, record])),\n    [data.cardIcons.records],\n  );\n\n  const filteredHeroes = useMemo(() => {\n`,
  'card icon index projection',
);

replaceOnce(
  `          <p className="hidden text-xs text-muted-foreground sm:block">\n            공식 초상화 267명 연결\n          </p>\n`,
  `          <p className="hidden text-xs text-muted-foreground sm:block">\n            공식 카드 아이콘 267명 연결\n          </p>\n`,
  'asset status label',
);

replaceOnce(
  `          <section\n            aria-label="영웅 목록"\n            className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"\n          >\n            {filteredHeroes.map((hero) => (\n              <HeroGridCard key={hero.heroId} hero={hero} />\n            ))}\n`,
  `          <section\n            aria-label="영웅 목록"\n            data-hero-card-icons="true"\n            className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"\n          >\n            {filteredHeroes.map((hero) => (\n              <HeroGridCard key={hero.heroId} hero={hero} cardIcon={cardIconByHeroId.get(hero.heroId)} />\n            ))}\n`,
  'hero grid card mapping',
);

const cardStart = source.indexOf('function HeroGridCard(');
if (cardStart < 0) throw new Error('Missing HeroGridCard function.');
const replacementCard = `function HeroGridCard({\n  hero,\n  cardIcon,\n}: {\n  hero: HeroListStage4Record;\n  cardIcon:\n    | {\n        heroId: number;\n        webAssetPath: string;\n        width: number;\n        height: number;\n        assetStatus: string;\n      }\n    | undefined;\n}) {\n  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;\n  const imageUrl = cardIcon?.assetStatus === "RESOLVED"\n    ? resolvePublicAssetUrl(cardIcon.webAssetPath)\n    : null;\n  const hasSampleSuperBuff = SAMPLE_SUPER_BUFF_HERO_IDS.has(hero.heroId);\n\n  return (\n    <Link\n      reloadDocument\n      to="/heroes/$heroId"\n      params={{ heroId: String(hero.heroId) }}\n      aria-label={\\`${displayName} ${hero.rarity.baseLabel} 상세 보기\\`}\n      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2"\n    >\n      <article className="overflow-hidden rounded-lg border border-border/70 bg-card p-1 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md">\n        <div className="relative aspect-square overflow-hidden rounded-md bg-muted/20">\n          {imageUrl ? (\n            <img\n              data-hero-card-icon="true"\n              data-hero-id={hero.heroId}\n              src={imageUrl}\n              alt=""\n              width={cardIcon?.width}\n              height={cardIcon?.height}\n              className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.015]"\n              loading="lazy"\n            />\n          ) : (\n            <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">\n              <UserRound\n                className="h-12 w-12 transition group-hover:text-foreground sm:h-14 sm:w-14"\n                strokeWidth={1.25}\n                aria-hidden="true"\n              />\n            </div>\n          )}\n\n          <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">\n            {hero.hasSp ? (\n              <span className="rounded border border-fuchsia-200/60 bg-fuchsia-950/85 px-1.5 py-0.5 text-[9px] font-black leading-none text-fuchsia-100 shadow-sm sm:text-[10px]">\n                SP\n              </span>\n            ) : null}\n            {hasSampleSuperBuff ? (\n              <span\n                className="rounded border border-white/30 bg-black/75 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm sm:text-[10px]"\n                title="초절 강화 보유"\n              >\n                초절\n              </span>\n            ) : null}\n          </div>\n        </div>\n\n        <div className="min-w-0 px-1 pb-1 pt-1.5 text-center">\n          <span className="block truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">\n            {displayName}\n          </span>\n          <span className="mt-0.5 block text-[9px] font-semibold leading-none text-muted-foreground">\n            {hero.rarity.baseLabel}\n          </span>\n        </div>\n      </article>\n    </Link>\n  );\n}\n`;
source = `${source.slice(0, cardStart)}${replacementCard}`;

if (source.includes('SAMPLE_HERO_CARD_PATHS') || source.includes('getRarityFrameClass') || source.includes('object-[center_20%]')) {
  throw new Error('Synthetic/cropped Hero card presentation residue remains.');
}
if (!source.includes('data-hero-card-icons="true"') || !source.includes('data-hero-card-icon="true"')) {
  throw new Error('Hero card icon QA markers are missing.');
}

fs.writeFileSync(routePath, source);
