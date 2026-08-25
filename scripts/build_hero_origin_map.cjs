'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');
const masterRoot = JSON.parse(fs.readFileSync(path.join(dataDir, 'hero-name-master.v1.json'), 'utf8'));
const heroes = Array.isArray(masterRoot) ? masterRoot : (masterRoot.records || []);
const heroInfo = JSON.parse(fs.readFileSync(path.join(configDir, 'ConfigDataHeroInfo.json'), 'utf8'));
const outPath = path.join(validationDir, 'hero-page-stage5-5-2-origin.v1.json');

if (!Array.isArray(heroInfo)) throw new Error('ConfigDataHeroInfo must be an array');
if (heroes.length !== 267) throw new Error(`Expected 267 canonical heroes; got ${heroes.length}`);

// Canonical source-display labels validated against HeroBelongProduction groups and Bilibili Wiki 出典 labels.
// Korean localization, if desired, is a separate presentation-layer task.
const ORIGIN_LABELS_CN = Object.freeze({
  1: '空之轨迹',
  2: '樱花大战',
  3: '梦幻模拟战手游I',
  4: '梦幻模拟战I',
  5: '梦幻模拟战II',
  6: '梦幻模拟战III',
  7: '梦幻模拟战IV',
  8: '梦幻模拟战V',
  9: '梦幻模拟战·转生',
  10: '幽☆游☆白书',
  11: '罗德斯岛',
  12: '梦幻模拟战手游II',
  13: '闪之轨迹',
  14: 'OVERLORD',
  15: '魔神英雄传',
  16: '魔神坛斗士',
  17: '银魂',
  18: '梦幻模拟战手游III',
  19: '战场女武神',
  20: '黎之轨迹',
  21: '光明之响',
  22: '梦幻模拟战手游IV',
  23: '秀逗魔导士',
  24: '强殖装甲凯普',
  25: '梦幻模拟战·千年纪WS',
  26: '名将战队',
  27: '死或生',
  28: '妖精的尾巴',
  29: '莱莎的炼金工房3 ～终结之炼金术士与秘密钥匙～',
  30: '梦幻模拟战·千年纪DC',
  31: '宇宙骑士',
  32: '天空战记',
});

const EXPECTED_GROUP_ANCHORS = Object.freeze({
  1: [69, 70, 71, 72, 73, 74],
  2: [79, 80, 81],
  3: [1, 3, 4],
  4: [5, 9, 10],
  5: [6, 7, 8, 12],
  6: [25, 26, 27, 28],
  7: [51, 52, 53, 54],
  8: [60, 61, 62],
  9: [110, 111, 112],
  10: [82, 83, 84, 85, 86],
  11: [77, 78],
  12: [93, 95, 96],
  13: [131, 132, 133],
  14: [134, 135, 136],
  15: [137, 138, 139],
  16: [140, 141, 142],
  17: [143, 144, 145],
  18: [99164, 99165, 99166, 99167],
  19: [146, 147, 148],
  20: [99194, 99195, 99196],
  21: [99197, 99198, 99199],
  22: [99207, 99208, 99209],
  23: [99203, 99204, 99205],
  24: [99212, 99213, 99214],
  25: [99224],
  26: [99235, 99236],
  27: [99244],
  28: [99247, 99248, 99249],
  29: [99258, 99259, 99260],
  30: [99269, 99270, 99271],
  31: [99276, 99277, 99278],
  32: [99284, 99285, 99286],
});

const masterById = new Map(heroes.map(h => [Number(h.heroId), h]));
const infoById = new Map();
for (const row of heroInfo) {
  if (!row || !Number.isInteger(row.ID)) continue;
  const list = infoById.get(row.ID) || [];
  list.push(row);
  infoById.set(row.ID, list);
}

const mapped = [];
const missingHeroIds = [];
const duplicateHeroIds = [];
const invalidOriginHeroIds = [];
const unknownProductionIds = new Set();
const groups = new Map();

for (const hero of heroes) {
  const heroId = Number(hero.heroId);
  const rows = infoById.get(heroId) || [];
  if (!rows.length) { missingHeroIds.push(heroId); continue; }
  if (rows.length > 1) duplicateHeroIds.push(heroId);
  const row = rows[0];
  const origins = row.HeroBelongProduction;
  if (!Array.isArray(origins) || origins.length !== 1 || !Number.isInteger(origins[0])) {
    invalidOriginHeroIds.push(heroId);
    continue;
  }
  const productionId = origins[0];
  const labelCn = ORIGIN_LABELS_CN[productionId] || null;
  if (!labelCn) unknownProductionIds.add(productionId);
  const m = {
    heroId,
    nameKr: hero.nameKr ?? null,
    nameCn: hero.nameCn ?? null,
    nameEn: hero.nameEn ?? null,
    productionId,
    originLabelCn: labelCn,
  };
  mapped.push(m);
  const list = groups.get(productionId) || [];
  list.push(m);
  groups.set(productionId, list);
}

const observedProductionIds = [...groups.keys()].sort((a,b) => a-b);
const dictionaryProductionIds = Object.keys(ORIGIN_LABELS_CN).map(Number).sort((a,b)=>a-b);
const missingDictionaryIds = observedProductionIds.filter(id => !ORIGIN_LABELS_CN[id]);
const unusedDictionaryIds = dictionaryProductionIds.filter(id => !groups.has(id));

const anchorMismatches = [];
for (const [idText, anchorIds] of Object.entries(EXPECTED_GROUP_ANCHORS)) {
  const productionId = Number(idText);
  const actual = new Set((groups.get(productionId) || []).map(h => h.heroId));
  const missingAnchors = anchorIds.filter(id => masterById.has(id) && !actual.has(id));
  if (missingAnchors.length) anchorMismatches.push({ productionId, missingAnchorHeroIds: missingAnchors });
}

const groupSummaries = observedProductionIds.map(productionId => {
  const rows = groups.get(productionId) || [];
  return {
    productionId,
    originLabelCn: ORIGIN_LABELS_CN[productionId] || null,
    heroCount: rows.length,
    heroIds: rows.map(r => r.heroId).sort((a,b)=>a-b),
    heroNamesKr: rows.map(r => r.nameKr),
  };
});

const errors = [];
if (missingHeroIds.length) errors.push('canonical heroes missing ConfigDataHeroInfo row');
if (duplicateHeroIds.length) errors.push('canonical hero IDs duplicated in ConfigDataHeroInfo');
if (invalidOriginHeroIds.length) errors.push('HeroBelongProduction is not exactly one integer ID for a canonical hero');
if (unknownProductionIds.size) errors.push('observed HeroBelongProduction ID lacks dictionary label');
if (missingDictionaryIds.length) errors.push('observed production IDs are missing from dictionary');
if (unusedDictionaryIds.length) errors.push('dictionary contains production IDs not observed in canonical heroes');
if (anchorMismatches.length) errors.push('known representative hero does not belong to expected production group');

const result = {
  version: 1,
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Validated display dictionary for ConfigDataHeroInfo.HeroBelongProduction.',
  semantics: {
    acceptedSource: 'ConfigDataHeroInfo.HeroBelongProduction',
    valueType: 'integer[]',
    canonicalShape: 'one-element integer array for every canonical playable Hero',
    meaning: 'source/origin work (Bilibili Wiki 出典 semantics)',
    sourceDisplayLanguage: 'zh-CN',
    localizationRule: 'originLabelCn is the validated source-display title. Korean title localization may be layered separately without changing productionId semantics.',
  },
  coverage: {
    canonicalHeroCount: heroes.length,
    mappedHeroCount: mapped.length,
    productionPointerCount: mapped.length,
    distinctProductionIdCount: observedProductionIds.length,
    missingHeroIds,
    duplicateHeroIds,
    invalidOriginHeroIds,
    unknownProductionIds: [...unknownProductionIds].sort((a,b)=>a-b),
    missingDictionaryIds,
    unusedDictionaryIds,
    anchorMismatches,
  },
  dictionary: dictionaryProductionIds.map(productionId => ({
    productionId,
    originLabelCn: ORIGIN_LABELS_CN[productionId],
    heroCount: (groups.get(productionId) || []).length,
  })),
  groups: groupSummaries,
  heroes: mapped.sort((a,b)=>a.heroId-b.heroId),
  externalValidation: {
    primaryReference: 'Bilibili Langrisser Wiki 出典 labels and representative hero biography pages',
    latestAddedGroupNote: 'Production 32 label 天空战记 is additionally confirmed by the official 2026 collaboration announcement for 修罗王秋亚人/夜叉王凯/迦楼罗王力伽.',
  },
  errors,
};

fs.mkdirSync(validationDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  canonicalHeroCount: result.coverage.canonicalHeroCount,
  mappedHeroCount: result.coverage.mappedHeroCount,
  distinctProductionIdCount: result.coverage.distinctProductionIdCount,
  dictionary: result.dictionary,
  errors,
  output: path.relative(root, outPath),
}, null, 2));
if (errors.length) process.exitCode = 1;
