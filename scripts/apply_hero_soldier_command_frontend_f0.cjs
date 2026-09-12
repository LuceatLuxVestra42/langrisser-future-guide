'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function patchFile(relativePath, replacements) {
  const file = path.join(ROOT, relativePath);
  let content = fs.readFileSync(file, 'utf8');
  for (const { from, to, label } of replacements) {
    const matches = content.split(from).length - 1;
    if (matches !== 1) throw new Error(`${relativePath}: ${label} anchor count=${matches}`);
    content = content.replace(from, to);
  }
  fs.writeFileSync(file, content, 'utf8');
}

patchFile('src/lib/hero-list.functions.ts', [
  {
    label: 'command server import',
    from: 'import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";\n',
    to: 'import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";\nimport { readHeroSoldierCommand } from "./hero-soldier-command.server";\n',
  },
  {
    label: 'Stage5 command loader projection',
    from: '      : routeData.detail.talent;\n\n    return {\n      ...routeData,\n      hero: projectSharedHeroNameLocalization(routeData.hero),\n',
    to: '      : routeData.detail.talent;\n\n    return {\n      ...routeData,\n      hero: projectSharedHeroNameLocalization(routeData.hero),\n      soldierCommand: readHeroSoldierCommand(data.heroId),\n',
  },
]);

patchFile('src/routes/heroes_.$heroId.tsx', [
  {
    label: 'command section import',
    from: 'import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";\n',
    to: 'import { HeroExclusiveEquipmentSection } from "@/components/hero-exclusive-equipment-section";\nimport { HeroSoldierCommandSection } from "@/components/hero-soldier-command-section";\n',
  },
  {
    label: 'loader destructure',
    from: '  const { hero, detail, exclusiveEquipment, factionMarks, soldierCards } = Route.useLoaderData();\n',
    to: '  const { hero, detail, soldierCommand, exclusiveEquipment, factionMarks, soldierCards } = Route.useLoaderData();\n',
  },
  {
    label: 'command section render',
    from: '        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle title="유대" />\n',
    to: '        <HeroSoldierCommandSection soldierCommand={soldierCommand} />\n\n        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">\n          <SectionTitle title="유대" />\n',
  },
]);

console.log('F0 frontend integration patch applied.');
