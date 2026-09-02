from pathlib import Path

owners = Path('tools/project-check/contracts/owners.v1.json')
text = owners.read_text(encoding='utf-8')
owner_anchor = '    {"id":"hero-card-icon-source-pack-assets","validators":["hero-card-icon-source-pack-assets"]},\n'
if text.count(owner_anchor) != 1:
    raise SystemExit('owner insertion anchor mismatch')
text = text.replace(owner_anchor, owner_anchor + '    {"id":"hero-skill-icon-assets","validators":["hero-skill-icon-assets-readonly"]},\n', 1)

canonical_anchor = '    {\n      "id":"hero-canonical",'
if text.count(canonical_anchor) != 1:
    raise SystemExit('hero-canonical insertion anchor mismatch')
rules = '''    {
      "id":"hero-skill-icon-assets",
      "patterns":["data/generated/hero-skill-icon-*","data/validation/hero-skill-icon-*","data/contracts/hero-skill-icon-*","scripts/*hero-skill-icon*",".github/workflows/hero-skill-icon-*"],
      "owners":["hero-skill-icon-assets"]
    },
    {
      "id":"hero-skill-icon-public",
      "patterns":["public/images/heroes/skill-icons/**"],
      "owners":["hero-skill-icon-assets","hero-frontend"]
    },
    {
      "id":"hero-skill-icon-consumer",
      "patterns":["src/lib/hero-skill-icon-assets.ts"],
      "owners":["hero-skill-icon-assets"]
    },
'''
text = text.replace(canonical_anchor, rules + canonical_anchor, 1)

start = text.index('      "id":"hero-canonical"')
end = text.index('      "id":"hero-frontend"', start)
block = text[start:end]
old_tail = '".github/workflows/hero-card-icon-*"]'
new_tail = '".github/workflows/hero-card-icon-*","data/generated/hero-skill-icon-*","data/validation/hero-skill-icon-*","data/contracts/hero-skill-icon-*","scripts/*hero-skill-icon*",".github/workflows/hero-skill-icon-*"]'
if block.count(old_tail) != 1:
    raise SystemExit('hero-canonical exclusion anchor mismatch')
block = block.replace(old_tail, new_tail, 1)
text = text[:start] + block + text[end:]

hero_assets_old = '      "excludePatterns":["public/images/heroes/card-icons/**"],'
hero_assets_new = '      "excludePatterns":["public/images/heroes/card-icons/**","public/images/heroes/skill-icons/**"],'
if text.count(hero_assets_old) != 1:
    raise SystemExit('hero-assets exclusion anchor mismatch')
text = text.replace(hero_assets_old, hero_assets_new, 1)
owners.write_text(text, encoding='utf-8')

validators = Path('tools/project-check/contracts/validators.v1.json')
text = validators.read_text(encoding='utf-8')
validator_anchor = '''    {
      "id": "asset-intake",
      "phase": 30,
'''
validator_block = '''    {
      "id": "hero-skill-icon-assets-readonly",
      "phase": 30,
      "executable": "node",
      "args": ["scripts/validate-hero-skill-icon-assets-readonly.mjs"],
      "owner": "hero-skill-icon-assets",
      "coverage": "Read-only Leon Hero skill-icon manifest, official proof hashes, frozen Hero 6 icon-path coverage, PNG RGBA parity, and public delivery validation."
    },
'''
if text.count(validator_anchor) != 1:
    raise SystemExit('validator insertion anchor mismatch')
validators.write_text(text.replace(validator_anchor, validator_block + validator_anchor, 1), encoding='utf-8')

self_test = Path('tools/project-check/test/project-check-self-test.mjs')
text = self_test.read_text(encoding='utf-8')
test_anchor = '''expectOwners(
  'public/images/heroes/card-icons-webp/6.webp',
  ['hero-assets', 'hero-frontend'],
  ['hero-assets', 'production-build'],
);
'''
test_block = '''expectOwners(
  'data/generated/hero-skill-icon-assets.v1.json',
  ['hero-skill-icon-assets'],
  ['hero-skill-icon-assets-readonly'],
);
expectOwners(
  'public/images/heroes/skill-icons/Gift_Knight.png',
  ['hero-skill-icon-assets', 'hero-frontend'],
  ['hero-skill-icon-assets-readonly', 'production-build'],
);
expectOwners(
  'src/lib/hero-skill-icon-assets.ts',
  ['hero-skill-icon-assets', 'hero-frontend'],
  ['hero-skill-icon-assets-readonly', 'production-build'],
);
'''
if text.count(test_anchor) != 1:
    raise SystemExit('project-check self-test anchor mismatch')
self_test.write_text(text.replace(test_anchor, test_anchor + test_block, 1), encoding='utf-8')

route = Path('src/routes/heroes_.$heroId.tsx')
text = route.read_text(encoding='utf-8')
import_anchor = 'import { getHeroDetailRouteStage5Data } from "@/lib/hero-list.functions";\n'
if text.count(import_anchor) != 1:
    raise SystemExit('Hero route import anchor mismatch')
text = text.replace(import_anchor, import_anchor + 'import { getHeroSkillIconUrl } from "@/lib/hero-skill-icon-assets";\n', 1)

direct_old = '<SkillCard key={`direct-${skill.skillId}`} skill={skill} sourceLabel="Hero 직접 보유" />'
direct_new = '<SkillCard key={`direct-${skill.skillId}`} heroId={hero.heroId} skill={skill} sourceLabel="Hero 직접 보유" />'
if text.count(direct_old) != 1:
    raise SystemExit('direct SkillCard anchor mismatch')
text = text.replace(direct_old, direct_new, 1)

job_old = '<SkillCard key={`job-${row.acquisitionOrder ?? "x"}-${row.skillId}`} skill={row.skill} sourceLabel={`${row.jobNameCn ?? `Job ${row.jobId ?? "?"}`} · Hero Lv.${row.jobLevelUpHeroLevel ?? "-"}`} />'
job_new = '<SkillCard key={`job-${row.acquisitionOrder ?? "x"}-${row.skillId}`} heroId={hero.heroId} skill={row.skill} sourceLabel={`${row.jobNameCn ?? `Job ${row.jobId ?? "?"}`} · Hero Lv.${row.jobLevelUpHeroLevel ?? "-"}`} />'
if text.count(job_old) != 1:
    raise SystemExit('job SkillCard anchor mismatch')
text = text.replace(job_old, job_new, 1)

talent_old = '''                <article key={`${row.star}-${row.skillId}`} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-foreground">{row.star}성 · {row.skill.nameCn ?? `Skill ${row.skillId}`}</h3>
                    <span className="shrink-0 rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{row.skillId}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(row.skill.desc)}</p>
                </article>'''
talent_new = '''                <article key={`${row.star}-${row.skillId}`} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <HeroSkillIcon heroId={hero.heroId} skill={row.skill} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-foreground">{row.star}성 · {row.skill.nameCn ?? `Skill ${row.skillId}`}</h3>
                        <span className="shrink-0 rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{row.skillId}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(row.skill.desc)}</p>
                    </div>
                  </div>
                </article>'''
if text.count(talent_old) != 1:
    raise SystemExit('talent card anchor mismatch')
text = text.replace(talent_old, talent_new, 1)

skill_old = '''function SkillCard({ skill, sourceLabel }: { skill: SkillView; sourceLabel: string }) {
  return <article className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-muted-foreground">{sourceLabel}</p><h4 className="mt-1 font-bold text-foreground">{skill.nameCn ?? `Skill ${skill.skillId}`}</h4></div><span className="rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{skill.skillId}</span></div><div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">{skill.displayType ? <span className="rounded-md border border-border bg-background px-2 py-1 font-semibold text-foreground">{skill.displayType}</span> : null}{skill.cooldown ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">쿨 {skill.cooldown}</span> : null}{skill.range ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">사거리 {skill.range}</span> : null}{skill.areaOrTarget ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">대상 {skill.areaOrTarget}</span> : null}</div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.desc)}</p></article>;
}'''
skill_new = '''function HeroSkillIcon({ heroId, skill }: { heroId: number; skill: SkillView }) {
  const iconUrl = getHeroSkillIconUrl(heroId, skill.iconPath);
  if (!iconUrl) return null;
  return <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-sm"><img src={iconUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" /></div>;
}

function SkillCard({ heroId, skill, sourceLabel }: { heroId: number; skill: SkillView; sourceLabel: string }) {
  return <article className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-start gap-3"><HeroSkillIcon heroId={heroId} skill={skill} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-muted-foreground">{sourceLabel}</p><h4 className="mt-1 font-bold text-foreground">{skill.nameCn ?? `Skill ${skill.skillId}`}</h4></div><span className="rounded-md bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">#{skill.skillId}</span></div><div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">{skill.displayType ? <span className="rounded-md border border-border bg-background px-2 py-1 font-semibold text-foreground">{skill.displayType}</span> : null}{skill.cooldown ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">쿨 {skill.cooldown}</span> : null}{skill.range ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">사거리 {skill.range}</span> : null}{skill.areaOrTarget ? <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">대상 {skill.areaOrTarget}</span> : null}</div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{stripConfigMarkup(skill.desc)}</p></div></div></article>;
}'''
if text.count(skill_old) != 1:
    raise SystemExit('SkillCard function anchor mismatch')
route.write_text(text.replace(skill_old, skill_new, 1), encoding='utf-8')
