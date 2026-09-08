import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourceRootArg = process.argv.includes('--source-root')
  ? process.argv[process.argv.indexOf('--source-root') + 1]
  : null;
if (!sourceRootArg) throw new Error('missing --source-root');

const configRoot = path.join(path.resolve(sourceRootArg), 'data/configdata');
const outPath = path.join(ROOT, 'heart-fetter-population-stats-trace.json');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(configRoot, name), 'utf8'));
}
function collectRecords(root) {
  const out = [];
  function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (typeof v.ID === 'number') out.push(v);
    for (const child of Object.values(v)) if (child && typeof child === 'object') walk(child);
  }
  walk(root);
  return out;
}

const heartRows = collectRecords(load('ConfigDataHeroHeartFetterInfo.json'));
const skillById = new Map(collectRecords(load('ConfigDataSkillInfo.json')).map((r) => [r.ID, r]));
const buffById = new Map(collectRecords(load('ConfigDataBuffInfo.json')).map((r) => [r.ID, r]));

const rows = [];
for (const heart of heartRows) {
  const skillIds = Array.isArray(heart.HeroHeartFetterSkills) ? heart.HeroHeartFetterSkills : [];
  if (!skillIds.length) continue;
  const finalSkillId = skillIds.at(-1);
  const skill = skillById.get(finalSkillId);
  if (!skill) continue;
  const passiveIds = Array.isArray(skill.PassiveBuffs_ID) ? skill.PassiveBuffs_ID : [];
  const buffs = passiveIds.map((id) => buffById.get(id)).filter(Boolean);
  rows.push({
    heartRecordId: heart.ID,
    heroId: heart.HeroID ?? null,
    maxLevel: heart.HeroFetterMaxLevel ?? null,
    finalSkillId,
    skillName: skill.Name ?? null,
    skillDescribe: skill.SkillDescribe ?? null,
    passiveIds,
    buffs: buffs.map((b) => ({
      id: b.ID,
      comment: b.Comment ?? null,
      properties: [1,2,3,4,5,6].flatMap((i) => {
        const id = b[`Property${i}_ID`];
        const value = b[`Property${i}_Value`];
        return typeof id === 'number' && id !== 0 ? [{ id, value }] : [];
      }),
    })),
  });
}

const propertyUsage = {};
for (const row of rows) {
  for (const buff of row.buffs) {
    for (const p of buff.properties) {
      propertyUsage[p.id] ??= { count: 0, examples: [] };
      propertyUsage[p.id].count += 1;
      if (propertyUsage[p.id].examples.length < 12) {
        propertyUsage[p.id].examples.push({ heroId: row.heroId, finalSkillId: row.finalSkillId, describe: row.skillDescribe, value: p.value });
      }
    }
  }
}

const report = { rowCount: rows.length, propertyUsage, rows };
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TRACE_OUTPUT=${path.relative(ROOT, outPath)}`);
console.log(`ROW_COUNT=${rows.length}`);
console.log(`PROPERTY_USAGE=${JSON.stringify(Object.fromEntries(Object.entries(propertyUsage).map(([k,v]) => [k,v.count])))}`);
if (!rows.length) process.exitCode = 1;
