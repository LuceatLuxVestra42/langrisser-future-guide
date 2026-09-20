type HeroSpJobLocalizationRecord = {
  nameCn: string;
  nameKr: string | null;
  status: "CONFIRMED_KR" | "UNRELEASED_KR";
};

// Presentation-only overlay from the reviewed 2026-09-20 SP job-name source.
// Job ID is the only lookup key. Chinese name is a stale-snapshot guard and never creates a JOIN.
const HERO_SP_JOB_LOCALIZATION = new Map<number, HeroSpJobLocalizationRecord>([
  [128, { nameCn: "源初的君王", nameKr: "태초의 군주", status: "CONFIRMED_KR" }],
  [262, { nameCn: "孤刃逆旅", nameKr: "고독한 검객", status: "CONFIRMED_KR" }],
  [368, { nameCn: "光龙统帅", nameKr: "광룡 기사단장", status: "CONFIRMED_KR" }],
  [373, { nameCn: "异邦豪侠", nameKr: "이방의 협객", status: "CONFIRMED_KR" }],
  [377, { nameCn: "湮黯青龙", nameKr: "어둠의 청룡", status: "CONFIRMED_KR" }],
  [390, { nameCn: "魔能圣骑", nameKr: "마법 성기사", status: "CONFIRMED_KR" }],
  [414, { nameCn: "天穹魔龙", nameKr: "천공의 마룡", status: "CONFIRMED_KR" }],
  [426, { nameCn: "崇辉智将", nameKr: "빛나는 지략가", status: "CONFIRMED_KR" }],
  [437, { nameCn: "月辉领主", nameKr: "달빛 영주", status: "CONFIRMED_KR" }],
  [622, { nameCn: "游侠将军", nameKr: "레인저 제네럴", status: "CONFIRMED_KR" }],
  [633, { nameCn: "啸风骑将", nameKr: "바람의 기사", status: "CONFIRMED_KR" }],
  [744, { nameCn: "黑龙魔导师", nameKr: "흑룡 마도사", status: "CONFIRMED_KR" }],
  [769, { nameCn: "曙光的恩眷", nameKr: "새벽빛의 은혜", status: "CONFIRMED_KR" }],
  [841, { nameCn: "蔷薇女王", nameKr: "장미의 여왕", status: "CONFIRMED_KR" }],
  [858, { nameCn: "公主", nameKr: "프린세스", status: "CONFIRMED_KR" }],
  [864, { nameCn: "裁罪圣者", nameKr: "단죄의 성녀", status: "CONFIRMED_KR" }],
  [878, { nameCn: "神选君王", nameKr: "선택받은 왕", status: "CONFIRMED_KR" }],
  [1097, { nameCn: "至黯魔王", nameKr: "암흑의 마왕", status: "CONFIRMED_KR" }],
  [1119, { nameCn: "超越者之刃", nameKr: "오버테이커", status: "CONFIRMED_KR" }],
  [1214, { nameCn: "统黯帝皇", nameKr: "어둠의 황제", status: "CONFIRMED_KR" }],
  [1220, { nameCn: "魔导圣兽", nameKr: null, status: "UNRELEASED_KR" }],
  [20229, { nameCn: "辉煌圣女", nameKr: "찬란한 성녀", status: "CONFIRMED_KR" }],
  [20243, { nameCn: "无上极剑", nameKr: null, status: "UNRELEASED_KR" }],
  [20707, { nameCn: "初绽的圣约", nameKr: null, status: "UNRELEASED_KR" }],
  [20811, { nameCn: "黎明圣骑", nameKr: "여명의 성기사", status: "CONFIRMED_KR" }],
]);

if (HERO_SP_JOB_LOCALIZATION.size !== 25) {
  throw new Error("Hero SP job Korean localization coverage mismatch.");
}

export function resolveHeroSpJobNameKr(input: { jobId: number | null; nameCn: string | null }) {
  if (!Number.isSafeInteger(input.jobId) || input.jobId == null || input.jobId <= 0) return null;
  const record = HERO_SP_JOB_LOCALIZATION.get(input.jobId);
  if (!record) return null;
  if (!input.nameCn || input.nameCn !== record.nameCn) return null;
  return record.nameKr;
}
