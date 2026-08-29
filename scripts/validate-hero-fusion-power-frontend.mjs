import crypto from 'node:crypto';
import fs from 'node:fs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const fusion = JSON.parse(fs.readFileSync('data/generated/hero-fusion-power-presentation.v1.json', 'utf8'));
const assets = JSON.parse(fs.readFileSync('data/generated/hero-fusion-faction-assets.v1.json', 'utf8'));
const route = fs.readFileSync('src/routes/heroes.tsx', 'utf8');
const server = fs.readFileSync('src/lib/hero-fusion-power.server.ts', 'utf8');
const functions = fs.readFileSync('src/lib/hero-fusion-power.functions.ts', 'utf8');

check(fusion.status === 'PASS' && fusion.completion === 'COMPLETE', 'fusion presentation must be complete');
check(fusion.freezeState === 'HERO_FUSION_POWER_PRESENTATION_FROZEN', 'fusion presentation freeze mismatch');
check(fusion.summary?.canonicalHeroCount === 267, 'canonical Hero count must remain 267');
check(fusion.summary?.fusionPowerHeroCount === 35 && fusion.records.length === 35, 'fusion-power Hero count must be 35');
check(fusion.summary?.uniqueTargetFactionCount === 12, 'fusion target faction count must be 12');
check(fusion.summary?.pendingCount === 0 && fusion.summary?.hardErrorCount === 0, 'fusion presentation must have no pending/errors');
check(fusion.policy?.targetFactionField === 'SkillTypeParam2', 'target faction must come from SkillTypeParam2');
check(fusion.policy?.descriptionParsing === false, 'description parsing is forbidden');
check(fusion.policy?.skillNameInference === false, 'skill-name inference is forbidden');
check(fusion.policy?.skillIconNameInference === false, 'skill-icon inference is forbidden');
check(fusion.policy?.heroNameJoin === false && fusion.policy?.idArithmetic === false, 'name JOIN / ID arithmetic is forbidden');
check(fusion.policy?.semanticStageReopened === false, 'Hero semantic stage must remain closed');
check(fusion.policy?.productionRawConfigFallback === false, 'production raw ConfigData fallback is forbidden');

check(assets.status === 'PASS' && assets.completion === 'COMPLETE', 'faction assets must be complete');
check(assets.freezeState === 'HERO_FUSION_FACTION_ASSETS_FROZEN', 'faction asset freeze mismatch');
check(assets.sourceFreezeState === fusion.freezeState, 'faction asset predecessor mismatch');
check(assets.summary?.resolvedCount === 12 && assets.records.length === 12, 'faction asset count must be 12');
check(assets.sourcePolicy?.exactConfigDataFactionIconPath === true, 'faction icon must use exact ConfigData path');
check(assets.sourcePolicy?.exactBundleContainerPath === true, 'faction icon must use exact bundle container path');
check(assets.sourcePolicy?.remoteRuntimeHotlink === false, 'faction icon hotlink is forbidden');

const assetByFaction = new Map(assets.records.map((row) => [row.factionId, row]));
for (const row of assets.records) {
  check(row.assetStatus === 'RESOLVED', `Faction ${row.factionId} asset unresolved`);
  check(row.webAssetPath === `/images/factions/${row.factionId}.png`, `Faction ${row.factionId} web path mismatch`);
  check(row.localAssetPath === `public/images/factions/${row.factionId}.png`, `Faction ${row.factionId} local path mismatch`);
  check(fs.existsSync(row.localAssetPath), `Faction ${row.factionId} PNG missing`);
  const bytes = fs.readFileSync(row.localAssetPath);
  check(bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `Faction ${row.factionId} is not PNG`);
  check(crypto.createHash('sha256').update(bytes).digest('hex') === row.sha256, `Faction ${row.factionId} PNG SHA mismatch`);
}

const heroIds = new Set();
for (const row of fusion.records) {
  check(!heroIds.has(row.heroId), `duplicate Hero fusion row ${row.heroId}`);
  heroIds.add(row.heroId);
  check(row.skillType === 14 && row.skillTypeParam1 === 2, `Hero ${row.heroId} fusion type contract mismatch`);
  check(row.skillTypeParam2 === row.targetFactionId, `Hero ${row.heroId} fusion target relation mismatch`);
  const asset = assetByFaction.get(row.targetFactionId);
  check(asset?.iconSourcePath === row.iconSourcePath, `Hero ${row.heroId} faction icon source mismatch`);
  check(asset?.webAssetPath === row.webAssetPath, `Hero ${row.heroId} faction web asset mismatch`);
}
check(fusion.records.find((row) => row.heroId === 6)?.targetFactionId === 4, 'Hero 6 must project Empire faction mark');
check(fusion.records.find((row) => row.heroId === 12)?.targetFactionId === 2, 'Hero 12 must project Light faction mark');

check(functions.includes('readHeroFusionPowerIndex'), 'server function must expose fusion-power index');
check(server.includes('hero-fusion-power-presentation.v1.json'), 'server must consume frozen fusion projection');
check(server.includes('hero-fusion-faction-assets.v1.json'), 'server must consume frozen faction assets');
check(server.includes('productionRawConfigFallback !== false'), 'server must reject raw ConfigData fallback');
check(route.includes('getHeroFusionPowerIndex'), 'Hero list loader must consume fusion-power index');
check(route.includes('data-hero-fusion-power-marks="true"'), 'Hero list surface marker missing');
check(route.includes('data-hero-fusion-power-mark="true"'), 'Hero fusion faction mark element missing');
check(route.includes('data-target-faction-id='), 'Hero fusion mark target-faction marker missing');
check(!route.includes('SAMPLE_SUPER_BUFF_HERO_IDS'), 'sample-only super-buff projection must be removed');
check(!route.includes('hasSampleSuperBuff'), 'sample-only super-buff branch must be removed');
check(!route.includes('bg-fuchsia-950/85'), 'old SP card badge styling must be removed');

const cardStart = route.indexOf('function HeroGridCard');
check(cardStart >= 0, 'HeroGridCard missing');
const cardSource = route.slice(cardStart);
check(!cardSource.includes('{hero.rarity.baseLabel}'), 'Hero card must not render rarity text below the icon');
check(!cardSource.includes('hero.hasSp ?'), 'Hero card must not render an SP text badge');
check(!cardSource.includes('>\n                초절\n'), 'Hero card must not render a 초절 text badge');

console.log(JSON.stringify({
  status: 'PASS_HERO_FUSION_POWER_FRONTEND',
  canonicalHeroCount: 267,
  fusionPowerHeroCount: 35,
  factionAssetCount: 12,
  hero6TargetFactionId: 4,
  hero12TargetFactionId: 2,
  spCardTextBadgeRemoved: true,
  fusionTextBadgeRemoved: true,
  rarityCardTextRemoved: true,
  semanticStageReopened: false,
}, null, 2));
