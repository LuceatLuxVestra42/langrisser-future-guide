'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const investigationPath = path.join(root, 'data/validation/hero-display-stat-investigation.v1.json');
const combatPath = path.join(root, 'data/generated/hero-basic-combat.v1.json');
const investigation = JSON.parse(fs.readFileSync(investigationPath, 'utf8'));
const combat = JSON.parse(fs.readFileSync(combatPath, 'utf8'));
const fixtureIds = new Set([6, 14, 16]);
const result = {};
for (const hero of combat.records || []) {
  if (!fixtureIds.has(hero.heroId)) continue;
  const jobs = [];
  for (const connection of hero.jobTree?.connections || []) {
    if (connection.job?.rank !== 4) continue;
    const levels = connection.levels || [];
    const finalLevel = levels[levels.length - 1] || null;
    jobs.push({
      jobConnectionId: connection.jobConnectionId,
      jobId: connection.jobId,
      jobNameCn: connection.job?.nameCn || null,
      jobRank: connection.job?.rank || null,
      finalJobLevelId: finalLevel?.jobLevelId || null,
      rawStatComponents: finalLevel?.rawStatComponents || null,
    });
  }
  result[String(hero.heroId)] = {
    heroId: hero.heroId,
    nameKr: hero.nameKr,
    nameCn: hero.nameCn,
    finalTierJobs: jobs,
  };
}
investigation.finalJobFixtures = result;
fs.writeFileSync(investigationPath, JSON.stringify(investigation, null, 2) + '\n');
