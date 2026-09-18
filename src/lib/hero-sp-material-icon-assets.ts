import { getHeroJobMaterialIconUrl } from "@/lib/hero-job-material-icon-assets";
import { getSoldierCommonMaterialIconUrl } from "@/lib/soldier-common-material-assets";

type MaterialPresentation = {
  iconUrl: string;
  displayName: string;
};

const JOB_MATERIAL_BY_ID = new Map<number, { name: string; sourcePath: string }>([
  [17, { name: "勇气纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_CourageEmblem.png" }],
  [18, { name: "秩序纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_OrderEmblem.png" }],
  [19, { name: "自由纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_FreedomEmblem.png" }],
  [20, { name: "意志纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_WillEmblem.png" }],
  [22, { name: "公正纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_FairEmblem.png" }],
  [23, { name: "希望纹章", sourcePath: "UI/Icon/JobMaterial_ABS/Item_HopeEmblem.png" }],
  [25, { name: "英雄之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_HeroProof.png" }],
  [26, { name: "勇者之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_BraveProof.png" }],
  [27, { name: "游侠之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_RangerProof.png" }],
  [28, { name: "霸者之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_OppressorProof.png" }],
  [29, { name: "圣者之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_SaintProof.png" }],
  [30, { name: "隐者之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_HermitProof.png" }],
  [31, { name: "统帅之证", sourcePath: "UI/Icon/JobMaterial_ABS/Item_CommanderProof.png" }],
  [32, { name: "正义之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_JusticeMark.png" }],
  [33, { name: "命运之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_DestinyMark.png" }],
  [34, { name: "世界之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_WorldMark.png" }],
  [35, { name: "奥秘之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_MysteryMark.png" }],
  [37, { name: "审判之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_JudgementMark.png" }],
  [38, { name: "荣耀之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_GloryMark.png" }],
  [39, { name: "混沌之印", sourcePath: "UI/Icon/JobMaterial_ABS/Item_ChaosMark.png" }],
]);

const ITEM_NAME_BY_ID = new Map<number, string>([
  [2010, "艾尔文的另我之心"],
  [2011, "芙蕾雅的另我之心"],
  [2012, "西格玛的另我之心"],
  [2013, "海恩的另我之心"],
  [2014, "亚鲁特缪拉的另我之心"],
  [2015, "雪莉的另我之心"],
  [2016, "娜姆的另我之心"],
  [2017, "拉娜的另我之心"],
  [2018, "路因的另我之心"],
  [2019, "迪哈尔特的另我之心"],
  [2020, "格尼尔的另我之心"],
  [2021, "雷丁的另我之心"],
  [2022, "马修的另我之心"],
  [2023, "利昂的另我之心"],
  [2024, "巴恩哈特的另我之心"],
  [2025, "艾梅达的另我之心"],
  [2026, "兰芳特的另我之心"],
  [2027, "蒂亚莉丝的另我之心"],
  [2028, "兰迪乌斯的另我之心"],
  [2029, "超我之意"],
  [3009, "魔导石"],
  [3201, "纯净心灵之钥"],
  [3202, "闪耀心灵之钥"],
  [3203, "华彩心灵之钥"],
  [3234, "源铸之火"],
  [3235, "源铸之魄"],
  [3236, "源铸之翼"],
  [3237, "源铸之砂"],
  [3238, "灵魂之火"],
  [3239, "灵魂之魄"],
  [3240, "灵魂之翼"],
  [3241, "灵魂之砂"],
  [3246, "超然之心"],
  [3253, "璀璨星尘"],
  [3260, "永耀月华"],
]);

const MASTERY_NAME_BY_ID = new Map<number, string>([
  [301, "战士：特级生命"],
  [302, "战士：特级攻击"],
  [303, "战士：特级智力"],
  [304, "战士：特级防御"],
  [305, "战士：特级魔防"],
  [306, "战士：特级技巧"],
  [311, "骑手：特级生命"],
  [312, "骑手：特级攻击"],
  [314, "骑手：特级防御"],
  [315, "骑手：特级魔防"],
  [316, "骑手：特级技巧"],
  [321, "暗影：特级生命"],
  [322, "暗影：特级攻击"],
  [324, "暗影：特级防御"],
  [325, "暗影：特级魔防"],
  [326, "暗影：特级技巧"],
  [331, "神圣：特级生命"],
  [332, "神圣：特级攻击"],
  [333, "神圣：特级智力"],
  [334, "神圣：特级防御"],
  [335, "神圣：特级魔防"],
  [336, "神圣：特级技巧"],
  [341, "魔能：特级生命"],
  [343, "魔能：特级智力"],
  [345, "魔能：特级魔防"],
  [346, "魔能：特级技巧"],
]);

function wikiFileUrl(fileName: string) {
  return `https://wiki.biligame.com/langrisser/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

export function getHeroSpMaterialPresentation(
  goodsType: number | null,
  sourceId: number | null,
): MaterialPresentation | null {
  if (goodsType === 24 && sourceId == null) {
    return {
      iconUrl: getSoldierCommonMaterialIconUrl("aniki-controller"),
      displayName: "형귀 컨트롤러",
    };
  }

  if (goodsType === 5 && sourceId != null) {
    const item = JOB_MATERIAL_BY_ID.get(sourceId);
    if (!item) return null;
    const iconUrl = getHeroJobMaterialIconUrl(item.sourcePath);
    return iconUrl ? { iconUrl, displayName: item.name } : null;
  }

  if (goodsType === 6 && sourceId != null) {
    const name = ITEM_NAME_BY_ID.get(sourceId);
    return name ? { iconUrl: wikiFileUrl(`${name}.png`), displayName: name } : null;
  }

  if (goodsType === 20 && sourceId == null) {
    return { iconUrl: wikiFileUrl("记忆精华.png"), displayName: "记忆精华" };
  }

  if (goodsType === 27 && sourceId != null) {
    const name = MASTERY_NAME_BY_ID.get(sourceId);
    return name ? { iconUrl: wikiFileUrl(`${name}.png`), displayName: name } : null;
  }

  return null;
}
