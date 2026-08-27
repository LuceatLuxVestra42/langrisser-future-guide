import fs from 'node:fs/promises';

const TARGET_IDS = [135,136,251,427,516,648,819,1033,1035,1037,1038,1039,1118];
const config = JSON.parse(await fs.readFile('data/configdata/ConfigDataSoldierInfo.json','utf8'));
const detail = JSON.parse(await fs.readFile('data/generated/soldier-detail-stage5-6.v1.json','utf8')).records;
const detailById = new Map(detail.map(r => [r.soldierId, r]));
const byId = new Map(config.map(r => [Number(r.ID), r]));
const rows = TARGET_IDS.map((id) => {
  const c = byId.get(id);
  const d = detailById.get(id);
  if (!c || !d) throw new Error(`missing target ${id}`);
  const model = c.Model ?? null;
  const model2 = c.Model2 ?? null;
  const modelStem = model ? model.split('/').at(-2) ?? null : null;
  const prefab = model ? model.split('/').at(-1) ?? null : null;
  return {
    soldierId: id,
    nameKr: d.identity?.nameKr ?? null,
    nameCn: c.Name ?? d.identity?.nameCn ?? null,
    armyType: d.identity?.armyType ?? null,
    rank: c.Rank ?? null,
    model,
    model2,
    modelStem,
    prefab,
    soldierSkinsId: c.SoldierSkins_ID ?? [],
    skillsId: c.Skills_ID ?? [],
  };
});
const output = {
  version: 1,
  stage: 'soldier-portrait-stage3f-latest-t3-model-keys',
  source: 'data/configdata/ConfigDataSoldierInfo.json targeted 13-ID extract',
  targetCount: rows.length,
  rows,
};
await fs.writeFile('data/validation/soldier-portrait-stage3f-latest-t3-models.v1.json', `${JSON.stringify(output,null,2)}\n`);
console.log(`STAGE3F_MODEL_KEYS count=${rows.length}`);
for (const r of rows) console.log(`${r.soldierId}\t${r.nameKr ?? '(null)'}\t${r.nameCn ?? ''}\t${r.modelStem ?? ''}\t${r.prefab ?? ''}`);
