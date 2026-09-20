const HERO_SKILL_DISPLAY_TYPE_LABEL_KR: Record<string, string> = {
  "超绝强化": "초절강화",
  "物理伤害": "물리 피해",
  "魔法伤害": "마법 피해",
  "主动": "액티브",
  "被动": "패시브",
  "支援": "지원",
  "治疗": "치료",
  "变身": "변신",
  "召唤": "소환",
};

export function getHeroSkillDisplayTypeLabelKr(displayType: string | null) {
  if (!displayType) return null;
  return HERO_SKILL_DISPLAY_TYPE_LABEL_KR[displayType] ?? displayType;
}
