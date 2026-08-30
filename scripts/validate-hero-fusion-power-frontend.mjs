import crypto from 'node:crypto';
import fs from 'node:fs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const baseline = JSON.parse(fs.readFileSync('data/generated/hero-fusion-power-presentation.v1.json', 'utf8'));
const exceptions = JSON.parse(fs.readFileSync('data/generated/hero-fusion-power-exceptions.v1.json', 'utf8'));
const factionAssets = JSON.parse(fs.readFileSync('data/generated/hero-fusion-faction-assets.v1.json', 'utf8'));
const armyIcons = JSON.parse(fs.readFileSync('data/generated/army-icon-manifest.v1.json', 'utf8'));
const route = fs.readFileSync('src/routes/heroes.tsx', 'utf8');
const server = fs.readFileSync('src/lib/hero-fusion-power.server.ts', 'utf8');
const functions = fs.readFileSync('src/lib/hero-fusion-power.functions.ts', 'utf8');

check(baseline.status === 'PASS' && baseline.completion === 'COMPLETE', 'baseline fusion presentation must be complete');
check(baseline.freezeState === 'HERO_FUSION_POWER_PRESENTATION_FROZEN', 'baseline fusion presentation freeze mismatch');
check(baseline.summary?.canonicalHeroCount === 267, 'canonical Hero count must remain 267');
check(baseline.summary?.fusionPowerHeroCount === 35 && baseline.records.length === 35, 'baseline fusion-power Hero count must remain 35');
check(baseline.summary?.uniqueTargetFactionCount === 12, 'baseline fusion target faction count must be 12');
check(baseline.summary?.pendingCount === 0 && baseline.summary?.hardErrorCount === 0, 'baseline fusion presentation must have no pending/errors');
check(baseline.policy?.targetFactionField === 'SkillTypeParam2', 'baseline target faction must come from SkillTypeParam2');
check(baseline.policy?.descriptionParsing === false, 'baseline description parsing is forbidden');
check(baseline.policy?.skillNameInference === false, 'baseline skill-name inference is forbidden');
check(baseline.policy?.skillIconNameInference === false, 'baseline skill-icon inference is forbidden');
check(baseline.policy?.heroNameJoin === false && baseline.policy?.idArithmetic === false, 'baseline name JOIN / ID arithmetic is forbidden');
check(baseline.policy?.semanticStageReopened === false, 'Hero foundation semantic stage must remain closed');
check(baseline.policy?.productionRawConfigFallback === false, 'production raw ConfigData fallback is forbidden');

check(exceptions.status === 'PASS' && exceptions.completion === 'COMPLETE', 'fusion exception expansion must be complete');
check(exceptions.freezeState === 'HERO_FUSION_POWER_EXCEPTION_EXPANSION_FROZEN', 'fusion exception freeze mismatch');
check(exceptions.predecessorFreezeState === baseline.freezeState, 'fusion exception predecessor mismatch');
check(exceptions.policy?.baselinePreserved === true, 'baseline fusion set must be preserved');
check(exceptions.policy?.triggerAgnostic === true, 'fusion definition must be trigger agnostic');
check(exceptions.policy?.groupWideEffectRequired === true, 'fusion exception must require a group-wide effect');
check(exceptions.policy?.manualVerifiedExceptionOnly === true, 'fusion exception rows must be verified exceptions');
check(exceptions.policy?.heroNameJoin === false && exceptions.policy?.idArithmetic === false, 'exception name JOIN / ID arithmetic is forbidden');
check(exceptions.policy?.productionRawConfigFallback === false, 'exception production raw fallback is forbidden');
check(exceptions.summary?.baselineHeroCount === 35, 'exception predecessor count must be 35');
check(exceptions.summary?.exceptionHeroCount === 8 && exceptions.records.length === 8, 'fusion exception count must be 8');
check(exceptions.summary?.expandedHeroCount === 43, 'expanded fusion-power count must be 43');
check(exceptions.summary?.factionTargetExceptionCount === 6, 'faction exception count must be 6');
check(exceptions.summary?.classTargetExceptionCount === 2, 'class exception count must be 2');
check(exceptions.summary?.expandedFactionTargetHeroCount === 41, 'expanded faction fusion count must be 41');
check(exceptions.summary?.expandedClassTargetHeroCount === 2, 'expanded class fusion count must be 2');
check(exceptions.summary?.pendingCount === 0 && exceptions.summary?.hardErrorCount === 0, 'fusion exception expansion must have no pending/errors');

check(factionAssets.status === 'PASS' && factionAssets.completion === 'COMPLETE', 'faction assets must be complete');
check(factionAssets.freezeState === 'HERO_FUSION_FACTION_ASSETS_FROZEN', 'faction asset freeze mismatch');
check(factionAssets.sourceFreezeState === baseline.freezeState, 'faction asset predecessor mismatch');
check(factionAssets.summary?.resolvedCount === 12 && factionAssets.records.length === 12, 'faction asset count must be 12');
check(factionAssets.sourcePolicy?.exactConfigDataFactionIconPath === true, 'faction icon must use exact ConfigData path');
check(factionAssets.sourcePolicy?.exactBundleContainerPath === true, 'faction icon must use exact bundle container path');
check(factionAssets.sourcePolicy?.remoteRuntimeHotlink === false, 'faction icon hotlink is forbidden');

check(armyIcons.source === 'data/configdata/ConfigDataArmyInfo.json', 'class mark source must be ConfigDataArmyInfo');
check(armyIcons.sourceField === 'Icon_NoBack', 'class mark must use Icon_NoBack');
check(armyIcons.assetsReady === true && armyIcons.importedAssetCount === 10, 'official class icon manifest must be ready');

const assetByFaction = new Map(factionAssets.records.map((row) => [row.factionId, row]));
for (const row of factionAssets.records) {
  check(row.assetStatus === 'RESOLVED', `Faction ${row.factionId} asset unresolved`);
  check(row.webAssetPath === `/images/factions/${row.factionId}.png`, `Faction ${row.factionId} web path mismatch`);
  check(row.localAssetPath === `public/images/factions/${row.factionId}.png`, `Faction ${row.factionId} local path mismatch`);
  check(fs.existsSync(row.localAssetPath), `Faction ${row.factionId} PNG missing`);
  const bytes = fs.readFileSync(row.localAssetPath);
  check(bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `Faction ${row.factionId} is not PNG`);
  check(crypto.createHash('sha256').update(bytes).digest('hex') === row.sha256, `Faction ${row.factionId} PNG SHA mismatch`);
}

const armyById = new Map(armyIcons.records.map((row) => [row.armyId, row]));
for (const classId of [2, 8, 9]) {
  const row = armyById.get(classId);
  check(row, `required class icon ${classId} missing from army manifest`);
  const localPath = `public/${armyIcons.publicRoot}/${row.fileName}`;
  check(fs.existsSync(localPath), `required class icon file missing: ${localPath}`);
}
check(armyById.get(9)?.fileName === 'Icon_Occupation_Monster.png', 'Monster class mark must use the official Monster icon');
check(armyById.get(2)?.fileName === 'Icon_Occupation_Infantryman.png', 'Infantry class mark must use the official Infantry icon');
check(armyById.get(8)?.fileName === 'Icon_Occupation_Monk.png', 'Holy class mark must use the official Monk icon');

const baselineHeroIds = new Set();
for (const row of baseline.records) {
  check(!baselineHeroIds.has(row.heroId), `duplicate baseline Hero fusion row ${row.heroId}`);
  baselineHeroIds.add(row.heroId);
  check(row.skillType === 14 && row.skillTypeParam1 === 2, `Hero ${row.heroId} baseline fusion type contract mismatch`);
  check(row.skillTypeParam2 === row.targetFactionId, `Hero ${row.heroId} baseline fusion target relation mismatch`);
  const asset = assetByFaction.get(row.targetFactionId);
  check(asset?.iconSourcePath === row.iconSourcePath, `Hero ${row.heroId} baseline faction icon source mismatch`);
  check(asset?.webAssetPath === row.webAssetPath, `Hero ${row.heroId} baseline faction web asset mismatch`);
}

const expectedExceptions = new Map([
  [124, ['FACTION', '6']],
  [99197, ['FACTION', '10']],
  [99192, ['FACTION', '7']],
  [99218, ['FACTION', '11']],
  [99237, ['FACTION', '9']],
  [99287, ['FACTION', '12']],
  [99264, ['CLASS', '9']],
  [99184, ['CLASS', '2,8']],
]);
const exceptionHeroIds = new Set();
for (const row of exceptions.records) {
  check(row.evidenceStatus === 'VERIFIED', `Hero ${row.heroId} exception evidence is not verified`);
  check(!baselineHeroIds.has(row.heroId), `Hero ${row.heroId} must not duplicate the baseline 35`);
  check(!exceptionHeroIds.has(row.heroId), `duplicate exception Hero ${row.heroId}`);
  exceptionHeroIds.add(row.heroId);
  const expected = expectedExceptions.get(row.heroId);
  check(expected, `unexpected fusion exception Hero ${row.heroId}`);
  check(row.targetType === expected[0], `Hero ${row.heroId} exception target type mismatch`);
  check(row.targetIds.join(',') === expected[1], `Hero ${row.heroId} exception target IDs mismatch`);
}
check(exceptionHeroIds.size === expectedExceptions.size, 'not all expanded fusion Heroes are present');

check(functions.includes('readHeroFusionPowerIndex'), 'server function must expose fusion-power index');
check(server.includes('hero-fusion-power-presentation.v1.json'), 'server must preserve frozen baseline fusion projection');
check(server.includes('hero-fusion-power-exceptions.v1.json'), 'server must consume frozen fusion exceptions');
check(server.includes('army-icon-manifest.v1.json'), 'server must consume frozen official class icons');
check(server.includes('HERO_FUSION_POWER_EXPANDED_FROZEN'), 'server must expose expanded fusion freeze state');
check(route.includes('getHeroFusionPowerIndex'), 'Hero list loader must consume fusion-power index');
check(route.includes('fusionPowers.summary.total !== 43'), 'Hero list loader must require 43 expanded fusion Heroes');
check(route.includes('data-hero-fusion-power-marks="true"'), 'Hero list surface marker missing');
check(route.includes('data-hero-fusion-power-mark="true"'), 'Hero fusion mark element missing');
check(route.includes('data-target-type='), 'Hero fusion mark target-type marker missing');
check(route.includes('data-target-faction-id='), 'Hero fusion mark target-faction marker missing');
check(route.includes('data-target-class-ids='), 'Hero fusion mark target-class marker missing');
check(route.includes('clipPath: "polygon(0 0, 100% 0, 0 100%)"'), 'composite class mark first diagonal half missing');
check(route.includes('clipPath: "polygon(100% 0, 100% 100%, 0 100%)"'), 'composite class mark second diagonal half missing');
check(route.includes('h-[28px] w-[28px]'), 'mobile fusion mark size must be restored to 28px');
check(route.includes('sm:h-[32px] sm:w-[32px]'), 'sm+ fusion mark size must be restored to 32px');
check(route.includes('right-1.5 top-1.5'), 'inset positioning must remain at 6px');
check(!route.includes('h-[36px] w-[36px]'), 'enlarged 36px mobile fusion mark must be removed');
check(!route.includes('sm:h-[42px] sm:w-[42px]'), 'enlarged 42px sm fusion mark must be removed');
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
  status: 'PASS_HERO_FUSION_POWER_EXPANDED_FRONTEND',
  canonicalHeroCount: 267,
  baselineFusionHeroCount: 35,
  expandedFusionHeroCount: 43,
  factionFusionHeroCount: 41,
  classFusionHeroCount: 2,
  factionAssetCount: 12,
  classAssetCount: 3,
  heavenDefierClassTargetIds: [9],
  lightbringerClassTargetIds: [2, 8],
  fusionMarkMobileSizePx: 28,
  fusionMarkSmSizePx: 32,
  fusionMarkInsetPx: 6,
  heroFoundationSemanticStageReopened: false,
  fusionSemanticExpanded: true,
}, null, 2));
