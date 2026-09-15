'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-job-links.v1.json');
const OUTPUT = P('data/generated/hero-job-materials.v1.json');
const SUMMARY = P('data/validation/hero-job-materials-summary.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function indexUnique(rows, label) {
  const byId = new Map();
  const duplicates = [];
  for (const row of rows) {
    const id = row?.ID;
    if (!Number.isInteger(id) || id <= 0) continue;
    if (byId.has(id)) duplicates.push(id);
    else byId.set(id, row);
  }
  if (duplicates.length) throw new Error(`${label} duplicate IDs: ${[...new Set(duplicates)].sort((a,b)=>a-b).join(', ')}`);
  return byId;
}
function materialSnapshot(row) {
  return {
    jobMaterialId: row.ID,
    nameCn: row.Name ?? '',
    descriptionCn: row.Desc ?? '',
    rank: Number.isInteger(row.Rank) ? row.Rank : null,
    icon: row.Icon ?? null,
  };
}

function main() {
  const upstream = readJson(UPSTREAM);
  if (upstream?.status !== 'PASS') throw new Error(`hero-job-links status=${upstream?.status ?? 'missing'}`);

  const levelRows = loadArray('ConfigDataJobLevelInfo');
  const materialRows = loadArray('ConfigDataJobMaterialInfo');
  const levelById = indexUnique(levelRows, 'ConfigDataJobLevelInfo');
  const materialById = indexUnique(materialRows, 'ConfigDataJobMaterialInfo');
  const hardErrors = [];
  const usedMaterialIds = new Set();
  let connectionCount = 0;
  let jobLevelCount = 0;
  let materialEntryCount = 0;

  const records = (upstream.records || []).map((hero) => {
    const connections = (hero.connections || []).map((connection) => {
      connectionCount += 1;
      const levels = (connection.jobLevelIds || []).map((jobLevelId) => {
        jobLevelCount += 1;
        const sourceLevel = levelById.get(jobLevelId);
        if (!sourceLevel) {
          hardErrors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: missing JobLevel ${jobLevelId}`);
          return { jobLevelId, materials: [] };
        }
        const sourceMaterials = sourceLevel.Materials == null ? [] : sourceLevel.Materials;
        if (!Array.isArray(sourceMaterials)) {
          hardErrors.push(`JobLevel ${jobLevelId}: Materials is not an array`);
          return { jobLevelId, materials: [] };
        }
        const materials = sourceMaterials.map((goods, index) => {
          materialEntryCount += 1;
          const goodsType = goods?.GoodsType;
          const id = goods?.Id;
          const count = goods?.Count;
          if (!Number.isInteger(goodsType) || !Number.isInteger(id) || id <= 0 || !Number.isInteger(count) || count <= 0) {
            hardErrors.push(`JobLevel ${jobLevelId} Materials[${index}]: malformed Goods record`);
            return { goodsType: goodsType ?? null, id: id ?? null, count: count ?? null, jobMaterial: null };
          }
          if (goodsType !== 5) {
            hardErrors.push(`JobLevel ${jobLevelId} Materials[${index}]: unsupported GoodsType ${goodsType}`);
            return { goodsType, id, count, jobMaterial: null };
          }
          const master = materialById.get(id);
          if (!master) {
            hardErrors.push(`JobLevel ${jobLevelId} Materials[${index}]: missing JobMaterial ${id}`);
            return { goodsType, id, count, jobMaterial: null };
          }
          usedMaterialIds.add(id);
          return { goodsType, id, count, jobMaterial: materialSnapshot(master) };
        });
        return {
          jobLevelId,
          rankCode: Number.isInteger(sourceLevel.rank_code) ? sourceLevel.rank_code : null,
          heroLevelRequired: Number.isInteger(sourceLevel.JobLevelUpHeroLevel) ? sourceLevel.JobLevelUpHeroLevel : null,
          materials,
        };
      });
      return {
        jobConnectionId: connection.jobConnectionId,
        role: connection.role ?? null,
        jobId: connection.jobId ?? null,
        levels,
      };
    });
    return {
      heroId: hero.heroId,
      nameKr: hero.nameKr ?? null,
      nameCn: hero.nameCn ?? null,
      nameEn: hero.nameEn ?? null,
      connections,
    };
  });

  const status = hardErrors.length ? 'FAIL' : 'PASS';
  const output = {
    version: 1,
    domain: 'hero-job-materials',
    status,
    source: {
      upstream: 'data/generated/hero-job-links.v1.json',
      configDataContract: 'data/contracts/configdata-source-pack-contract.v1.json',
      jobLevelTable: 'ConfigDataJobLevelInfo',
      jobMaterialTable: 'ConfigDataJobMaterialInfo',
    },
    recordCount: records.length,
    records,
  };
  const summary = {
    version: 1,
    domain: 'hero-job-materials',
    status,
    heroCount: records.length,
    connectionCount,
    jobLevelCount,
    materialEntryCount,
    distinctJobMaterialCount: usedMaterialIds.size,
    sourceRecordCounts: {
      jobLevelInfo: levelRows.length,
      jobMaterialInfo: materialRows.length,
    },
    hardErrors,
  };
  writeJson(OUTPUT, output);
  writeJson(SUMMARY, summary);
  console.log(`HERO JOB MATERIAL BUILD: ${status}`);
  console.log(`heroes=${records.length} connections=${connectionCount} jobLevels=${jobLevelCount} materialEntries=${materialEntryCount} distinctJobMaterials=${usedMaterialIds.size} errors=${hardErrors.length}`);
  if (hardErrors.length) {
    for (const error of hardErrors.slice(0, 50)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
