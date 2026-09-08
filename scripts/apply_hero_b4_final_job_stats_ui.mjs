import fs from "node:fs";

const routePath = "src/routes/heroes_.$heroId.tsx";
let source = fs.readFileSync(routePath, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`B4 patch marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`B4 patch marker duplicated: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";\n',
  'import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";\nimport { HeroFinalJobStatsSection } from "@/components/hero-final-job-stats-section";\n',
  "component import",
);
replaceOnce(
  'import { getHeroExclusiveEquipmentPresentation } from "@/lib/hero-exclusive-equipment.functions";\n',
  'import { getHeroExclusiveEquipmentPresentation } from "@/lib/hero-exclusive-equipment.functions";\nimport { getHeroFinalJobStatsPresentation } from "@/lib/hero-final-job-extrema.functions";\n',
  "server function import",
);
replaceOnce(
  '    const exclusiveEquipment = await getHeroExclusiveEquipmentPresentation({ data: { heroId } });\n',
  '    const exclusiveEquipment = await getHeroExclusiveEquipmentPresentation({ data: { heroId } });\n    const finalJobStats = await getHeroFinalJobStatsPresentation({ data: { heroId } });\n',
  "loader call",
);
replaceOnce(
  '    return { ...data, exclusiveEquipment, factionMarks, soldierCards };\n',
  '    return { ...data, exclusiveEquipment, finalJobStats, factionMarks, soldierCards };\n',
  "loader return",
);
replaceOnce(
  '  const { hero, detail, exclusiveEquipment, factionMarks, soldierCards } = Route.useLoaderData();\n',
  '  const { hero, detail, exclusiveEquipment, finalJobStats, factionMarks, soldierCards } = Route.useLoaderData();\n',
  "loader destructure",
);
replaceOnce(
  '  const finalJobBranches = detail.jobs.branches.filter((branch) => branch.capstone?.rank === 4);\n',
  '',
  "legacy frontend rank filter",
);

const sectionStart = '        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle title="최종 직업 스탯" />';
const nextSection = '        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle title="유대" />';
const start = source.indexOf(sectionStart);
if (start < 0) throw new Error("B4 legacy final-job section start marker missing");
const end = source.indexOf(nextSection, start);
if (end < 0) throw new Error("B4 bond section boundary marker missing");
const oldSection = source.slice(start, end);
if (!oldSection.includes("capstone.finalStats.HP") || !oldSection.includes("finalJobBranches.map")) {
  throw new Error("B4 legacy final-job section shape drifted");
}
source = source.slice(0, start) + '        <HeroFinalJobStatsSection data={finalJobStats} />\n\n' + source.slice(end);

if (source.includes("finalJobBranches") || source.includes("capstone.finalStats.HP")) {
  throw new Error("B4 legacy frontend-derived final-job stats remain after patch");
}
if (!source.includes("<HeroFinalJobStatsSection data={finalJobStats} />")) {
  throw new Error("B4 frozen consumer section was not installed");
}

fs.writeFileSync(routePath, source);
console.log(JSON.stringify({ status: "PASS", stage: "hero-b4-final-job-stats-ui-patch", changedPath: routePath }, null, 2));
