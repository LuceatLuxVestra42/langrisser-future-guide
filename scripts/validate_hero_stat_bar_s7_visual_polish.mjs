import fs from "node:fs";

const component = fs.readFileSync("src/components/hero-final-job-stats-section.tsx", "utf8");
const errors = [];

const expected = {
  hp: ["bg-lime-400", "text-lime-600", "lime"],
  at: ["bg-red-500", "text-red-600", "red"],
  magic: ["bg-blue-500", "text-blue-600", "blue"],
  df: ["bg-orange-400", "text-orange-600", "orange"],
  magicDf: ["bg-indigo-400", "text-indigo-600", "indigo"],
  dex: ["bg-purple-500", "text-purple-600", "purple"],
};

for (const [stat, [fill, value, tone]] of Object.entries(expected)) {
  if (!component.includes(`${stat}: { fill: "${fill}"`)) errors.push(`${stat}: fill color drift`);
  if (!component.includes(`value: "${value}`)) errors.push(`${stat}: value color drift`);
  if (!component.includes(`tone: "${tone}"`)) errors.push(`${stat}: tone marker drift`);
}

if (!component.includes('className="h-4 min-w-0 overflow-hidden bg-muted/80"')) errors.push("track thickness is not h-4");
if (component.includes('rounded-full bg-muted') || component.includes('h-full rounded-full')) errors.push("rounded stat bars returned");
if (!component.includes('className={`h-full ${style.fill} transition-[width] duration-300`}')) errors.push("stat fill class is not style-driven");
if (!component.includes('className={`tabular-nums text-sm font-extrabold ${style.value}`}')) errors.push("numeric value color is not style-driven");
if (!component.includes('data-stat-tone={style.tone}')) errors.push("stat tone marker missing");

for (const invariant of [
  'const MINIMUM_FILL_PERCENT = 25',
  'const MAXIMUM_FILL_PERCENT = 100',
  'const ratio = (value - domain.min) / (domain.max - domain.min)',
  'MINIMUM_FILL_PERCENT + ratio * (MAXIMUM_FILL_PERCENT - MINIMUM_FILL_PERCENT)',
  'data-final-job-card="true"',
  'row.variant === "SP"',
]) {
  if (!component.includes(invariant)) errors.push(`presentation invariant missing: ${invariant}`);
}

if (component.includes("finalStats") || component.includes("rank === 4") || component.includes("normalBondedStats") || component.includes("spBondedStats")) {
  errors.push("S7 reopened semantic/stat calculation sources");
}

const result = {
  version: 1,
  stage: "hero-stat-bar-s7-visual-polish-validator",
  status: errors.length ? "FAIL" : "PASS",
  colors: {
    hp: "lime",
    at: "red",
    magic: "blue",
    df: "orange",
    magicDf: "light-indigo",
    dex: "purple",
  },
  squareEnds: true,
  thickness: "h-4",
  numericColorMatched: true,
  minimumFillPercent: 25,
  semanticRecomputation: false,
  errors,
  hardErrorCount: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
