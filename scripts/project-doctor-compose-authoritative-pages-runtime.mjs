import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one source match, got ${count}`);
  }
  return source.replace(from, to);
}

const serverPath = "src/lib/hero-detail-stage5.server.ts";
let server = fs.readFileSync(serverPath, "utf8");

if (!server.includes('readHeroSkinPresentation')) {
  server = replaceOnce(
    server,
    'import { readHeroDetailRouteStage4Data } from "./hero-list.server";',
    'import { readHeroSkinPresentation } from "./skin-detail.server";\nimport { readHeroDetailRouteStage4Data } from "./hero-list.server";',
    "Hero server Skin import",
  );

  server = replaceOnce(
    server,
    '  const shell = readHeroDetailRouteStage4Data(heroId);\n  if (!shell) return null;\n',
    '  const shell = readHeroDetailRouteStage4Data(heroId);\n  if (!shell) return null;\n  const skinPresentation = readHeroSkinPresentation(heroId);\n  if (!skinPresentation) return null;\n',
    "Hero server Skin lookup",
  );

  server = replaceOnce(
    server,
    '  const shard = await loadShard();\n  if (!shard || shard.heroId !== heroId) throw new Error(`Hero ${heroId} Stage 6 shard identity mismatch.`);\n  return {\n',
    '  const shard = await loadShard();\n  if (!shard || shard.heroId !== heroId) throw new Error(`Hero ${heroId} Stage 6 shard identity mismatch.`);\n  const detail = projectStage6Shard(shard);\n  if (detail.presentation.skinCount !== skinPresentation.items.length) {\n    throw new Error(`Hero ${heroId} Stage 6/Skin frozen relation count mismatch.`);\n  }\n  return {\n',
    "Hero server Skin parity gate",
  );

  server = replaceOnce(
    server,
    '    detail: projectStage6Shard(shard),\n',
    '    detail: {\n      ...detail,\n      presentation: {\n        ...detail.presentation,\n        skins: skinPresentation.items,\n        skinSource: skinPresentation.source,\n      },\n    },\n',
    "Hero server Skin projection",
  );
}

for (const token of [
  'readHeroSkinPresentation',
  'detail.presentation.skinCount !== skinPresentation.items.length',
  'skins: skinPresentation.items',
  'skinSource: skinPresentation.source',
]) {
  if (!server.includes(token)) throw new Error(`Hero server composition missing ${token}`);
}
fs.writeFileSync(serverPath, server);

const routePath = 'src/routes/heroes_.$heroId.tsx';
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes('detail.presentation.skins')) {
  route = replaceOnce(
    route,
    'import { useState, type ReactNode } from "react";',
    'import { useEffect, useState, type ReactNode } from "react";',
    "Hero route React carousel imports",
  );

  route = replaceOnce(
    route,
    '  BriefcaseBusiness,\n  Database,',
    '  BriefcaseBusiness,\n  ChevronLeft,\n  ChevronRight,\n  Database,',
    "Hero route carousel icons",
  );

  route = replaceOnce(
    route,
    'function resolvePublicAssetUrl(webAssetPath: string) {\n  const base = import.meta.env.BASE_URL || "/";\n  return `${base.replace(/\\/$/, "")}${webAssetPath}`;\n}\n\nfunction stripConfigMarkup',
    'function resolvePublicAssetUrl(webAssetPath: string) {\n  const base = import.meta.env.BASE_URL || "/";\n  const basePrefix = base === "/" ? "" : base.replace(/\\/$/, "");\n  const normalizedPath = webAssetPath.startsWith("/") ? webAssetPath : `/${webAssetPath}`;\n  return `${basePrefix}${normalizedPath}`;\n}\n\ntype HeroVisual = {\n  kind: "hero" | "skin";\n  src: string;\n  label: string;\n  skinId: number | null;\n  sourceOrder: number | null;\n};\n\nfunction stripConfigMarkup',
    "Hero route public asset resolver",
  );

  route = replaceOnce(
    route,
    '  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;\n\n  return (',
    '  const imageUrl = hero.card.webAssetPath ? resolvePublicAssetUrl(hero.card.webAssetPath) : null;\n  const visuals: HeroVisual[] = [];\n  if (imageUrl) {\n    visuals.push({ kind: "hero", src: imageUrl, label: "대표 일러스트", skinId: null, sourceOrder: null });\n  }\n  for (const skin of detail.presentation.skins) {\n    visuals.push({\n      kind: "skin",\n      src: resolvePublicAssetUrl(skin.publicPath),\n      label: `스킨 ${skin.sourceOrder}`,\n      skinId: skin.skinId,\n      sourceOrder: skin.sourceOrder,\n    });\n  }\n\n  const [visualIndex, setVisualIndex] = useState(0);\n  useEffect(() => setVisualIndex(0), [hero.heroId]);\n  const activeVisual = visuals[visualIndex] ?? null;\n  const moveVisual = (delta: number) => {\n    if (visuals.length <= 1) return;\n    setVisualIndex((current) => (current + delta + visuals.length) % visuals.length);\n  };\n\n  return (',
    "Hero route carousel state",
  );

  const currentVisualBlock = '              {imageUrl ? (\n                <img src={imageUrl} alt={`${displayName} 대표 일러스트`} className="absolute inset-0 h-full w-full object-contain object-bottom px-3 pt-4 sm:px-6 sm:pt-6" />\n              ) : (\n                <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-muted-foreground">\n                  <UserRound className="h-20 w-20" strokeWidth={1.05} aria-hidden="true" />\n                  <span className="inline-flex items-center gap-1 text-xs font-semibold"><ImageOff className="h-3.5 w-3.5" aria-hidden="true" />이미지 연결 대기</span>\n                </div>\n              )}\n              <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2 sm:bottom-5 sm:left-5">\n                <span className="rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">{hero.rarity.baseLabel}</span>\n                {detail.systems.spReleased ? <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />SP</span> : null}\n              </div>';

  const carouselVisualBlock = '              {activeVisual ? (\n                <img src={activeVisual.src} alt={`${displayName} ${activeVisual.label}`} className="absolute inset-0 h-full w-full object-contain object-bottom px-3 pt-4 sm:px-6 sm:pt-6" />\n              ) : (\n                <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-muted-foreground">\n                  <UserRound className="h-20 w-20" strokeWidth={1.05} aria-hidden="true" />\n                  <span className="inline-flex items-center gap-1 text-xs font-semibold"><ImageOff className="h-3.5 w-3.5" aria-hidden="true" />이미지 연결 대기</span>\n                </div>\n              )}\n\n              {visuals.length > 1 ? (\n                <>\n                  <button type="button" onClick={() => moveVisual(-1)} aria-label="이전 일러스트" className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-background sm:left-4">\n                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />\n                  </button>\n                  <button type="button" onClick={() => moveVisual(1)} aria-label="다음 일러스트" className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-background sm:right-4">\n                    <ChevronRight className="h-5 w-5" aria-hidden="true" />\n                  </button>\n                </>\n              ) : null}\n\n              <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2 sm:bottom-5 sm:left-5">\n                <span className="rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">{hero.rarity.baseLabel}</span>\n                {detail.systems.spReleased ? <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/90 px-3 py-1 text-xs font-bold text-foreground backdrop-blur"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />SP</span> : null}\n              </div>\n\n              {activeVisual ? (\n                <div className="absolute bottom-4 right-4 z-20 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-right text-[11px] font-semibold text-foreground shadow-sm backdrop-blur sm:bottom-5 sm:right-5">\n                  <div>{activeVisual.kind === "hero" ? "대표 일러스트" : `스킨 ${activeVisual.sourceOrder} · ID ${activeVisual.skinId}`}</div>\n                  <div className="mt-0.5 text-muted-foreground">{visualIndex + 1} / {visuals.length}</div>\n                </div>\n              ) : null}';

  route = replaceOnce(route, currentVisualBlock, carouselVisualBlock, "Hero route carousel visual block");
}

for (const token of [
  'detail.presentation.skins',
  'resolvePublicAssetUrl(skin.publicPath)',
  'aria-label="이전 일러스트"',
  'aria-label="다음 일러스트"',
  '스킨 ${activeVisual.sourceOrder} · ID ${activeVisual.skinId}',
]) {
  if (!route.includes(token)) throw new Error(`Hero route composition missing ${token}`);
}
fs.writeFileSync(routePath, route);

console.log(JSON.stringify({
  status: "PASS_AUTHORITATIVE_PAGES_RUNTIME_COMPOSITION",
  semanticStageReopened: false,
  deploymentOnlyOverlay: true,
}, null, 2));