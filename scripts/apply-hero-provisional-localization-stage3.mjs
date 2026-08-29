import fs from 'node:fs';

function replaceOrVerify(file, from, to) {
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(to)) {
    if (before.includes(from)) throw new Error(`${file}: both predecessor and successor forms are present.`);
    return false;
  }
  const first = before.indexOf(from);
  if (first < 0) throw new Error(`${file}: expected predecessor form not found.`);
  if (before.indexOf(from, first + from.length) >= 0) throw new Error(`${file}: predecessor form is not unique.`);
  fs.writeFileSync(file, before.slice(0, first) + to + before.slice(first + from.length), 'utf8');
  return true;
}

let changed = 0;

const listRoute = 'src/routes/heroes.tsx';
changed += Number(replaceOrVerify(
  listRoute,
  'import type { HeroListRecord, HeroListStage4Record } from "@/lib/hero-list.server";',
  'import type { HeroListStage4Record } from "@/lib/hero-list.server";',
));
changed += Number(replaceOrVerify(
  listRoute,
  'function matchesHeroSearch(hero: HeroListRecord, normalizedQuery: string) {',
  'function matchesHeroSearch(hero: HeroListStage4Record, normalizedQuery: string) {',
));
changed += Number(replaceOrVerify(
  listRoute,
  '  return [hero.identity.nameKr, hero.identity.nameCn, hero.identity.nameEn]\n    .filter((name): name is string => Boolean(name))',
  '  return [\n    hero.localization.displayName,\n    hero.localization.displayNameKr,\n    hero.localization.officialNameKr,\n    hero.identity.nameKr,\n    hero.identity.nameCn,\n    hero.identity.nameEn,\n  ]\n    .filter((name): name is string => Boolean(name))',
));
changed += Number(replaceOrVerify(
  listRoute,
  '  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;',
  '  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);',
));
changed += Number(replaceOrVerify(
  listRoute,
  '      <article className="overflow-hidden rounded-lg border border-border/70 bg-card p-1 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md">',
  '      <article\n        data-name-kr-status={hero.localization.nameKrStatus}\n        data-name-source-authority={hero.localization.sourceAuthority}\n        className="overflow-hidden rounded-lg border border-border/70 bg-card p-1 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md"\n      >',
));

const detailRoute = 'src/routes/heroes_.$heroId.tsx';
changed += Number(replaceOrVerify(
  detailRoute,
  '${loaderData.hero.identity.nameKr ?? loaderData.hero.identity.nameCn} | 랑그릿사 모바일 영웅',
  '${loaderData.hero.localization.displayName || (loaderData.hero.identity.nameKr ?? loaderData.hero.identity.nameCn)} | 랑그릿사 모바일 영웅',
));
changed += Number(replaceOrVerify(
  detailRoute,
  '  const displayName = hero.identity.nameKr ?? hero.identity.nameCn;',
  '  const displayName = hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn);',
));
changed += Number(replaceOrVerify(
  detailRoute,
  '    <main className="min-h-screen bg-background">',
  '    <main\n      data-name-kr-status={hero.localization.nameKrStatus}\n      data-name-source-authority={hero.localization.sourceAuthority}\n      className="min-h-screen bg-background"\n    >',
));

const packageJson = 'package.json';
changed += Number(replaceOrVerify(
  packageJson,
  '    "validate:hero-provisional-localization-stage2": "node scripts/validate-hero-provisional-localization-stage2.mjs --check",',
  '    "validate:hero-provisional-localization-stage2": "node scripts/validate-hero-provisional-localization-stage2.mjs --check",\n    "audit:localization:stage7": "node scripts/audit-localization-stage7.mjs",\n    "audit:localization:stage7:check": "node scripts/audit-localization-stage7.mjs --check",\n    "validate:hero-provisional-localization-stage3": "node scripts/audit-localization-stage7.mjs --check",',
));

console.log(`Hero provisional localization Stage 3 patch: ${changed === 0 ? 'already applied' : `applied ${changed} replacements`}`);
