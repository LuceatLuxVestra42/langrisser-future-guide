const publicPathBySourcePath = new Map<string, string>([
  ["UI/Icon/JobMaterial_ABS/Item_BattlePractice.png", "/images/heroes/job-material-icons/1-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_BraveProof.png", "/images/heroes/job-material-icons/7-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_ChaosMark.png", "/images/heroes/job-material-icons/8-9.png"],
  ["UI/Icon/JobMaterial_ABS/Item_ClergyPractice.png", "/images/heroes/job-material-icons/1-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_CombatProof.png", "/images/heroes/job-material-icons/3-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_CommanderProof.png", "/images/heroes/job-material-icons/7-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_CourageEmblem.png", "/images/heroes/job-material-icons/6-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_DeffenceRibbon.png", "/images/heroes/job-material-icons/2-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_DestinyMark.png", "/images/heroes/job-material-icons/8-7.png"],
  ["UI/Icon/JobMaterial_ABS/Item_FairEmblem.png", "/images/heroes/job-material-icons/6-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_FaithEmblem.png", "/images/heroes/job-material-icons/6-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_FearlessBadge.png", "/images/heroes/job-material-icons/4-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_ForeseerBadge.png", "/images/heroes/job-material-icons/4-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_ForestProof.png", "/images/heroes/job-material-icons/3-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_FreedomEmblem.png", "/images/heroes/job-material-icons/6-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_GloryMark.png", "/images/heroes/job-material-icons/8-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_GuardianProof.png", "/images/heroes/job-material-icons/5-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_HermitProof.png", "/images/heroes/job-material-icons/7-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_HeroProof.png", "/images/heroes/job-material-icons/7-7.png"],
  ["UI/Icon/JobMaterial_ABS/Item_HopeEmblem.png", "/images/heroes/job-material-icons/6-8.png"],
  ["UI/Icon/JobMaterial_ABS/Item_JudgementMark.png", "/images/heroes/job-material-icons/8-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_JusticeMark.png", "/images/heroes/job-material-icons/8-8.png"],
  ["UI/Icon/JobMaterial_ABS/Item_KnightPractice.png", "/images/heroes/job-material-icons/1-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_KnightProof.png", "/images/heroes/job-material-icons/5-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_LoveEmblem.png", "/images/heroes/job-material-icons/6-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_LoyaltyBadge.png", "/images/heroes/job-material-icons/4-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_MagicProof.png", "/images/heroes/job-material-icons/3-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_MemoryRibbon.png", "/images/heroes/job-material-icons/2-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_MiracleMark.png", "/images/heroes/job-material-icons/8-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_MysteryMark.png", "/images/heroes/job-material-icons/8-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_OppressorProof.png", "/images/heroes/job-material-icons/7-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_OrderEmblem.png", "/images/heroes/job-material-icons/6-7.png"],
  ["UI/Icon/JobMaterial_ABS/Item_PowerRibbon.png", "/images/heroes/job-material-icons/2-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_PrayProof.png", "/images/heroes/job-material-icons/3-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_PriestProof.png", "/images/heroes/job-material-icons/5-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_QuickRibbon.png", "/images/heroes/job-material-icons/2-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_RangerProof.png", "/images/heroes/job-material-icons/7-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_RidingProof.png", "/images/heroes/job-material-icons/3-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_RogueProof.png", "/images/heroes/job-material-icons/5-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SaintProof.png", "/images/heroes/job-material-icons/7-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SecretBadge.png", "/images/heroes/job-material-icons/4-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_ShieldProof.png", "/images/heroes/job-material-icons/3-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SoldierProof.png", "/images/heroes/job-material-icons/5-6.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SoulBadge.png", "/images/heroes/job-material-icons/4-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SpellPractice.png", "/images/heroes/job-material-icons/1-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SpiritRibbon.png", "/images/heroes/job-material-icons/2-2.png"],
  ["UI/Icon/JobMaterial_ABS/Item_SurvivalPractice.png", "/images/heroes/job-material-icons/1-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_TimeMark.png", "/images/heroes/job-material-icons/8-3.png"],
  ["UI/Icon/JobMaterial_ABS/Item_UnyieldingBadge.png", "/images/heroes/job-material-icons/4-1.png"],
  ["UI/Icon/JobMaterial_ABS/Item_WillEmblem.png", "/images/heroes/job-material-icons/6-4.png"],
  ["UI/Icon/JobMaterial_ABS/Item_WisdomRibbon.png", "/images/heroes/job-material-icons/2-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_WizardProof.png", "/images/heroes/job-material-icons/5-5.png"],
  ["UI/Icon/JobMaterial_ABS/Item_WorldMark.png", "/images/heroes/job-material-icons/8-2.png"],
]);

function resolvePublicAssetUrl(publicPath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const basePrefix = base === "/" ? "" : base.replace(/\/$/, "");
  const normalizedPath = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${basePrefix}${normalizedPath}`;
}

export function getHeroJobMaterialIconUrl(sourcePath: string | null | undefined) {
  if (!sourcePath) return null;
  const publicPath = publicPathBySourcePath.get(sourcePath);
  if (!publicPath) return null;
  return resolvePublicAssetUrl(publicPath);
}
