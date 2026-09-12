'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const errors = [];
const checkpoint = readJson('data/validation/hero-soldier-command-modifiers-i3-f.v1.json');
const artifact = readJson('data/generated/hero-soldier-command-modifiers.v1.json');
const server = read('src/lib/hero-soldier-command.server.ts');
const functions = read('src/lib/hero-list.functions.ts');
const route = read('src/routes/heroes_.$heroId.tsx');
const component = read('src/components/hero-soldier-command-section.tsx');

if (checkpoint.status !== 'FINAL_FROZEN' || checkpoint.validation?.status !== 'PASS') errors.push('frozen checkpoint gate failed');
if (artifact.recordCount !== 267 || artifact.records?.length !== 267 || artifact.spVariantCount !== 25) errors.push('artifact population gate failed');
if (!server.includes('hero-soldier-command-modifiers.v1.json') || !server.includes('hero-soldier-command-modifiers-i3-f.v1.json')) errors.push('server consumer does not pin frozen artifact/checkpoint');
if (!functions.includes('readHeroSoldierCommand(data.heroId)')) errors.push('hero loader does not project frozen command record');
if (!route.includes('HeroSoldierCommandSection') || !route.includes('soldierCommand')) errors.push('hero route does not render command section');
if (!component.includes('기본 지휘') || !component.includes('중앙 유대') || !component.includes('최종')) errors.push('component does not preserve semantic breakdown');
if (route.includes('hero-soldier-command-modifiers.v1.json')) errors.push('route imports frozen artifact directly');

const leon = artifact.records.find((r) => r.heroId === 6);
if (!leon) errors.push('Leon fixture missing');
else {
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(leon.normal?.final, { hp: 40, at: 40, df: 10, magicDf: 10 })) errors.push(`Leon normal final mismatch ${JSON.stringify(leon.normal?.final)}`);
  if (!same(leon.sp?.final, { hp: 40, at: 40, df: 10, magicDf: 10 })) errors.push(`Leon SP final mismatch ${JSON.stringify(leon.sp?.final)}`);
}

const result = {
  stage: 'F0',
  status: errors.length ? 'FAIL' : 'PASS',
  owner: 'FRONTEND_HERO_SOLDIER_COMMAND_CONSUMER',
  canonicalHeroCount: artifact.recordCount,
  spVariantCount: artifact.spVariantCount,
  leonFixture: errors.some((e) => e.startsWith('Leon')) ? 'FAIL' : 'PASS',
  semanticRecomputation: false,
  rawConfigDataJoin: false,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
