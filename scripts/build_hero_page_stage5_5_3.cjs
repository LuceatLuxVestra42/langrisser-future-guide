'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');
const contractPath = path.join(dataDir, 'contracts', 'hero-page-stage5-5-3-output-contract.v1.json');
const outPath = path.join(dataDir, 'hero-page-stage5-5-3.v1.json');

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const recordsOf = rootValue => Array.isArray(rootValue) ? rootValue : (rootValue.records || []);
const byUniqueInt = (rows, field, label) => {
  const map = new Map();
  for (const row of rows) {
    if (!row || !Number.isInteger(row[field])) continue;
    if (map.has(row[field])) throw new Error(`${label} duplicate ${field}=${row[field]}`);
    map.set(row[field], row);
  }
  return map;
};

const contract = read(contractPath);
if (contract.status !== 'ACCEPTED') throw new Error('Stage 5-5-3 output contract is not ACCEPTED');

const master = recordsOf(read(path.join(dataDir, 'hero-name-master.v1.json')));
const rarityArtifact = read(path.join(validationDir, 'hero-page-stage5-5-2-rarity.v1.json'));
const factionArtifact = read(path.join(validationDir, 'hero-page-stage5-5-2-factions.v1.json'));
const cvArtifact = read(path.join(validationDir, 'hero-page-stage5-5-2-cv.v1.json'));
const originArtifact = read(path.join(validationDir, 'hero-page-stage5-5-2-origin.v1.json'));

for (const [name, artifact] of Object.entries({rarityArtifact, factionArtifact, cvArtifact, originArtifact})) {
  if (artifact.status !== 'PASS') throw new Error(`${name} is not PASS`);
}
if (master.length !== contract.canonicalHeroCount) {
  throw new Error(`Canonical master count mismatch: expected ${contract.canonicalHeroCount}, got ${master.length}`);
}

const heroInfo = read(path.join(configDir, 'ConfigDataHeroInfo.json'));
const charInfo = read(path.join(configDir, 'ConfigDataCharImageInfo.json'));
const skinInfo = read(path.join(configDir, 'ConfigDataHeroSkinInfo.json'));
const skinResourceInfo = read(path.join(configDir, 'ConfigDataCharImageSkinResourceInfo.json'));

const heroInfoById = byUniqueInt(heroInfo, 'ID', 'HeroInfo');
const charInfoById = byUniqueInt(charInfo, 'ID', 'CharImageInfo');
const skinInfoById = byUniqueInt(skinInfo, 'ID', 'HeroSkinInfo');
const skinResourceById = byUniqueInt(skinResourceInfo, 'ID', 'CharImageSkinResourceInfo');

const rarityByHero = byUniqueInt(rarityArtifact.heroes || [], 'heroId', 'rarity artifact');
const factionByHero = byUniqueInt(factionArtifact.heroes || [], 'heroId', 'faction artifact');
const factionById = byUniqueInt(factionArtifact.factions || [], 'factionId', 'faction artifact');
const cvByHero = byUniqueInt(cvArtifact.heroes || [], 'heroId', 'CV artifact');
const originByHero = byUniqueInt(originArtifact.heroes || [], 'heroId', 'origin artifact');

const ownerSkinIds = new Map();
for (const skin of skinInfo) {
  if (!Number.isInteger(skin?.SpecifiedHero) || !Number.isInteger(skin?.ID)) continue;
  const list = ownerSkinIds.get(skin.SpecifiedHero) || [];
  list.push(skin.ID);
  ownerSkinIds.set(skin.SpecifiedHero, list);
}

const originCategoryByProductionId = new Map();
for (const category of ['ORIGINAL', 'MOBILE_ORIGINAL', 'COLLAB']) {
  const ids = contract.originCategoryRule?.[category]?.productionIds || [];
  for (const id of ids) {
    if (originCategoryByProductionId.has(id)) throw new Error(`productionId ${id} appears in multiple origin categories`);
    originCategoryByProductionId.set(id, category);
  }
}
if (originCategoryByProductionId.size !== 32) throw new Error(`Expected 32 categorized production IDs; got ${originCategoryByProductionId.size}`);

const acquisitionLabels = Object.freeze({
  2: { labelCn: '光之回响', labelKr: '광휘의 메아리' },
  3: { labelCn: '命运星织', labelKr: '운명의 별짜기' },
  4: { labelCn: '英雄皮肤商店', labelKr: '영웅 스킨 상점' },
});

const errors = [];
const outputRecords = [];

function requireRow(map, id, label, heroId) {
  const row = map.get(id);
  if (!row) errors.push({ heroId, type: 'MISSING_JOIN', label, id });
  return row || null;
}

for (const hero of master) {
  const heroId = Number(hero.heroId);
  const h = requireRow(heroInfoById, heroId, 'ConfigDataHeroInfo.ID', heroId);
  const rarity = requireRow(rarityByHero, heroId, 'rarityArtifact.heroId', heroId);
  const factionHero = requireRow(factionByHero, heroId, 'factionArtifact.heroId', heroId);
  const cv = requireRow(cvByHero, heroId, 'cvArtifact.heroId', heroId);
  const origin = requireRow(originByHero, heroId, 'originArtifact.heroId', heroId);
  if (!h || !rarity || !factionHero || !cv || !origin) continue;

  const charImageId = h.CharImage_ID;
  const c = requireRow(charInfoById, charImageId, 'ConfigDataCharImageInfo.ID', heroId);
  const heroPainting = typeof c?.HeroPainting === 'string' && c.HeroPainting.trim() ? c.HeroPainting.trim() : null;
  if (!heroPainting) errors.push({ heroId, type: 'MISSING_REQUIRED_VALUE', field: 'artwork.sourceAssetPath' });

  const factionIds = Array.isArray(factionHero.factionIds) ? [...factionHero.factionIds].sort((a,b)=>a-b) : [];
  if (!factionIds.length) errors.push({ heroId, type: 'EMPTY_REQUIRED_ARRAY', field: 'factions' });
  const factions = factionIds.map(factionId => {
    const f = factionById.get(factionId);
    if (!f) {
      errors.push({ heroId, type: 'MISSING_JOIN', label: 'factionArtifact.factions.factionId', id: factionId });
      return null;
    }
    return {
      factionId,
      nameCn: f.nameCn ?? null,
      nameKr: null,
      iconSourcePath: f.icon ?? null,
    };
  }).filter(Boolean);

  const productionId = origin.productionId;
  const originCategory = originCategoryByProductionId.get(productionId) || null;
  if (!originCategory) errors.push({ heroId, type: 'UNKNOWN_ORIGIN_CATEGORY', productionId });

  let skinIds;
  if (Array.isArray(h.Skins_ID)) {
    skinIds = h.Skins_ID.map(Number);
  } else {
    const reverseOwned = ownerSkinIds.get(heroId) || [];
    if (reverseOwned.length) {
      errors.push({ heroId, type: 'OMITTED_SKIN_LIST_HAS_OWNER_ROWS', skinIds: reverseOwned });
      skinIds = [];
    } else {
      skinIds = [];
    }
  }

  const skins = skinIds.map((skinId, index) => {
    const s = skinInfoById.get(skinId);
    if (!s) {
      errors.push({ heroId, type: 'MISSING_SKIN_INFO', skinId });
      return null;
    }
    if (Number(s.SpecifiedHero) !== heroId) {
      errors.push({ heroId, type: 'SKIN_OWNER_MISMATCH', skinId, specifiedHero: s.SpecifiedHero ?? null });
    }
    const resourceId = s.CharImageSkinResource_ID;
    const r = skinResourceById.get(resourceId);
    if (!r) {
      errors.push({ heroId, type: 'MISSING_SKIN_RESOURCE', skinId, resourceId });
      return null;
    }
    const typeCode = Number.isInteger(s.GetPathType) ? s.GetPathType : null;
    const labels = typeCode === null ? null : acquisitionLabels[typeCode];
    if (typeCode !== null && !labels) errors.push({ heroId, type: 'UNKNOWN_GET_PATH_TYPE', skinId, typeCode });
    return {
      skinId,
      order: index + 1,
      nameCn: typeof s.Name === 'string' ? s.Name : null,
      nameKr: null,
      sourceImagePath: typeof r.Image === 'string' && r.Image.trim() ? r.Image.trim() : null,
      sourceSpinePath: typeof r.SpineAssetPath === 'string' && r.SpineAssetPath.trim() ? r.SpineAssetPath.trim() : null,
      acquisition: typeCode === null ? {
        state: 'UNENCODED',
        typeCode: null,
        labelCn: null,
        labelKr: null,
      } : {
        state: 'ENCODED',
        typeCode,
        labelCn: labels?.labelCn ?? null,
        labelKr: labels?.labelKr ?? null,
      },
    };
  }).filter(Boolean);

  outputRecords.push({
    heroId,
    identity: {
      nameKr: hero.nameKr ?? null,
      nameCn: hero.nameCn ?? null,
      nameEn: hero.nameEn ?? null,
    },
    rarity: {
      rank: rarity.rank,
      baseLabel: rarity.rarity,
    },
    factions,
    cv: {
      state: cv.voiceActorStatus === 'NONE_CONFIRMED' ? 'NONE' : 'NAMED',
      sourceValue: cv.cvNameRaw ?? null,
      nameKr: null,
    },
    origin: {
      productionId,
      nameCn: origin.originLabelCn ?? null,
      nameKr: null,
      category: originCategory,
    },
    artwork: {
      sourceAssetPath: heroPainting,
    },
    skins,
  });
}

outputRecords.sort((a,b)=>a.heroId-b.heroId);

const result = {
  version: 1,
  stage: 'hero-page-5-5',
  substage: '5-5-3',
  status: errors.length ? 'FAIL' : 'GENERATED',
  contract: 'data/contracts/hero-page-stage5-5-3-output-contract.v1.json',
  recordCount: outputRecords.length,
  records: outputRecords,
  generationErrors: errors,
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  status: result.status,
  recordCount: result.recordCount,
  skinCount: outputRecords.reduce((n,h)=>n+h.skins.length,0),
  generationErrorCount: errors.length,
  generationErrors: errors.slice(0,30),
  output: path.relative(root, outPath),
}, null, 2));
if (errors.length) process.exitCode = 1;
