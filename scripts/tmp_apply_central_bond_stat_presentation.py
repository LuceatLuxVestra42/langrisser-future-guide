from pathlib import Path

server = Path("src/lib/hero-detail-stage5.server.ts")
text = server.read_text()
old = """  finalDisplayStats?: {
    status?: string | null;
    heroLevel?: number | null;
    star?: number | null;
    values?: {
      hp?: number | null;
      at?: number | null;
      magic?: number | null;
      df?: number | null;
      magicDf?: number | null;
      dex?: number | null;
    } | null;
  } | null;
"""
new = """  finalDisplayStats?: {
    status?: string | null;
    heroLevel?: number | null;
    star?: number | null;
    values?: {
      hp?: number | null;
      at?: number | null;
      magic?: number | null;
      df?: number | null;
      magicDf?: number | null;
      dex?: number | null;
    } | null;
    components?: {
      centralBond?: {
        rate?: number | null;
        percentDeltas?: {
          hp?: number | null;
          at?: number | null;
          magic?: number | null;
          df?: number | null;
          magicDf?: number | null;
          dex?: number | null;
        } | null;
        flat?: {
          hp?: number | null;
          at?: number | null;
          magic?: number | null;
          df?: number | null;
          magicDf?: number | null;
          dex?: number | null;
        } | null;
      } | null;
    } | null;
  } | null;
"""
assert text.count(old) == 1, ("server type", text.count(old))
text = text.replace(old, new)

anchor = "function projectJobBranches(jobTree: Stage6JobTree | null | undefined) {\n"
helper = """function projectCentralBondStats(finalDisplayStats: Stage6JobConnection[\"finalDisplayStats\"]) {
  const centralBond = finalDisplayStats?.components?.centralBond;
  const percentDeltas = centralBond?.percentDeltas;
  if (!percentDeltas) return null;
  const flat = centralBond?.flat;
  const total = (key: keyof NonNullable<typeof percentDeltas>) => {
    const percent = percentDeltas[key];
    if (typeof percent !== \"number\" || !Number.isFinite(percent)) return null;
    const flatValue = flat?.[key];
    return percent + (typeof flatValue === \"number\" && Number.isFinite(flatValue) ? flatValue : 0);
  };
  return {
    HP: total(\"hp\"),
    ATK: total(\"at\"),
    INT: total(\"magic\"),
    DEF: total(\"df\"),
    MDEF: total(\"magicDf\"),
    DEX: total(\"dex\"),
  };
}

function projectJobBranches(jobTree: Stage6JobTree | null | undefined) {
"""
assert text.count(anchor) == 1, ("job helper", text.count(anchor))
text = text.replace(anchor, helper)

old_values = """    const capstone = jobs.at(-1) ?? null;
    const values = capstone?.finalDisplayStats?.values;

    return {
"""
new_values = """    const capstone = jobs.at(-1) ?? null;
    const values = capstone?.finalDisplayStats?.values;
    const centralBondStats = projectCentralBondStats(capstone?.finalDisplayStats);

    return {
"""
assert text.count(old_values) == 1, ("values", text.count(old_values))
text = text.replace(old_values, new_values)

old_stats = """            finalStats: {
              HP: values?.hp ?? null,
              ATK: values?.at ?? null,
              INT: values?.magic ?? null,
              DEF: values?.df ?? null,
              MDEF: values?.magicDf ?? null,
              DEX: values?.dex ?? null,
            },
"""
new_stats = """            finalStats: {
              HP: values?.hp ?? null,
              ATK: values?.at ?? null,
              INT: values?.magic ?? null,
              DEF: values?.df ?? null,
              MDEF: values?.magicDf ?? null,
              DEX: values?.dex ?? null,
            },
            centralBondStats,
"""
assert text.count(old_stats) == 1, ("stats", text.count(old_stats))
text = text.replace(old_stats, new_stats)
server.write_text(text)

route = Path("src/routes/heroes_.$heroId.tsx")
text = route.read_text()
old_import = 'import { useCallback, useEffect, useMemo, useState } from "react";'
new_import = 'import { Fragment, useCallback, useEffect, useMemo, useState } from "react";'
assert text.count(old_import) == 1, ("import", text.count(old_import))
text = text.replace(old_import, new_import)

old_rows = """                    return (
                      <tr key={branch.branchIndex} className=\"border-b border-border last:border-b-0\">
                        <th scope=\"row\" className=\"px-4 py-3 text-left\">
                          <div className=\"font-bold text-foreground\">{capstone.nameCn ?? `Job ${capstone.jobId ?? \"?\"}`}</div>
                        </th>
                        <JobStatCell value={capstone.finalStats.HP} />
                        <JobStatCell value={capstone.finalStats.ATK} />
                        <JobStatCell value={capstone.finalStats.INT} />
                        <JobStatCell value={capstone.finalStats.DEF} />
                        <JobStatCell value={capstone.finalStats.MDEF} />
                        <JobStatCell value={capstone.finalStats.DEX} />
                      </tr>
                    );
"""
new_rows = """                    return (
                      <Fragment key={branch.branchIndex}>
                        <tr className=\"border-b border-border/60\">
                          <th scope=\"row\" className=\"px-4 pb-2 pt-3 text-left\">
                            <div className=\"font-bold text-foreground\">{capstone.nameCn ?? `Job ${capstone.jobId ?? \"?\"}`}</div>
                          </th>
                          <JobStatCell value={capstone.finalStats.HP} />
                          <JobStatCell value={capstone.finalStats.ATK} />
                          <JobStatCell value={capstone.finalStats.INT} />
                          <JobStatCell value={capstone.finalStats.DEF} />
                          <JobStatCell value={capstone.finalStats.MDEF} />
                          <JobStatCell value={capstone.finalStats.DEX} />
                        </tr>
                        {capstone.centralBondStats ? (
                          <tr className=\"border-b border-border last:border-b-0 bg-muted/20\" data-hero-central-bond-stat-row=\"true\">
                            <th scope=\"row\" className=\"px-4 pb-3 pt-2 text-left text-xs font-semibold text-muted-foreground\">└ 중앙유대</th>
                            <JobStatBonusCell value={capstone.centralBondStats.HP} />
                            <JobStatBonusCell value={capstone.centralBondStats.ATK} />
                            <JobStatBonusCell value={capstone.centralBondStats.INT} />
                            <JobStatBonusCell value={capstone.centralBondStats.DEF} />
                            <JobStatBonusCell value={capstone.centralBondStats.MDEF} />
                            <JobStatBonusCell value={capstone.centralBondStats.DEX} />
                          </tr>
                        ) : null}
                      </Fragment>
                    );
"""
assert text.count(old_rows) == 1, ("rows", text.count(old_rows))
text = text.replace(old_rows, new_rows)

old_helper = """function SectionTitle({ title }: { title: string }) { return <h2 className=\"font-bold text-foreground\">{title}</h2>; }
function JobStatCell({ value }: { value: number | null }) { return <td className=\"px-4 py-3 text-right font-bold tabular-nums text-foreground\">{value ?? \"-\"}</td>; }
"""
new_helper = """function SectionTitle({ title }: { title: string }) { return <h2 className=\"font-bold text-foreground\">{title}</h2>; }
function JobStatCell({ value }: { value: number | null }) { return <td className=\"px-4 pb-2 pt-3 text-right font-bold tabular-nums text-foreground\">{value ?? \"-\"}</td>; }
function JobStatBonusCell({ value }: { value: number | null }) { return <td className=\"px-4 pb-3 pt-2 text-right text-xs font-semibold tabular-nums text-muted-foreground\">{value == null ? \"-\" : `+${value}`}</td>; }
"""
assert text.count(old_helper) == 1, ("cell helper", text.count(old_helper))
text = text.replace(old_helper, new_helper)
route.write_text(text)
