import { createServerFn } from "@tanstack/react-start";

import { applyHeroDungeonBondPresentation } from "./hero-dungeon-presentation.server";
import { readHeroDetailRouteStage5Data } from "./hero-detail-stage5.server";
import { readHeroHeartFetterPresentation } from "./hero-heart-fetter.server";
import { readHeroSoldierCommand } from "./hero-soldier-command.server";
import { resolveHeroNameLocalization } from "./hero-display-name";
import {
  readHeroDetailRouteStage4Data,
  readHeroListStage2Data,
  readHeroListStage3Data,
  readHeroListStage4Data,
} from "./hero-list.server";
import { resolveHeroSkillKr } from "./hero-skill-localization";
import { hasHeroTalentKr, resolveHeroTalentKr } from "./hero-talent-localization";
import { getSoldierPrototypePageData } from "./soldier-page.functions";

const HERO_SOLDIER_ARMY_ORDER = new Map<string, number>(
  [
    "INFANTRY",
    "LANCER",
    "CAVALRY",
    "FLYING",
    "WATER",
    "ARCHER",
    "ASSASSIN",
    "MAGE",
    "HOLY",
    "DEMON",
  ].map((armyType, index) => [armyType, index]),
);

const LEGACY_SKILL_IDS_BY_HERO = new Map<number, ReadonlySet<number>>([\n  [1, new Set([\n    10201,\n    10301,\n    11701,\n    10601,\n    11706,\n    5012,\n    10205,\n  ])],\n  [3, new Set([\n    10113,\n    10301,\n    10102,\n    5015,\n    11749,\n  ])],\n  [4, new Set([\n    10811,\n  ])],\n  [5, new Set([\n    10842,\n    10804,\n    10838,\n    10808,\n    10815,\n    10803,\n  ])],\n  [6, new Set([\n    10301,\n    5020,\n    10324,\n    5003,\n    5007,\n    10314,\n    10328,\n    11807,\n    10302,\n  ])],\n  [7, new Set([\n    10205,\n    10206,\n    10224,\n    10209,\n  ])],\n  [8, new Set([\n    10716,\n    10705,\n    10703,\n    10706,\n    20001,\n    10841,\n    10813,\n    10109,\n    10717,\n  ])],\n  [9, new Set([\n    10711,\n    10701,\n    10712,\n    10716,\n    20001,\n    10719,\n    10717,\n    11813,\n    10709,\n  ])],\n  [10, new Set([\n    10208,\n    10102,\n    10809,\n    10829,\n  ])],\n  [11, new Set([\n    10603,\n    5021,\n    10601,\n    10406,\n    5013,\n    10602,\n    5016,\n  ])],\n  [12, new Set([\n    10208,\n    10203,\n    5007,\n    10223,\n    5004,\n    10218,\n    10103,\n  ])],\n  [13, new Set([\n    10701,\n    10703,\n    10841,\n    10704,\n    10702,\n  ])],\n  [14, new Set([\n    10401,\n    5020,\n    5025,\n    5024,\n    11706,\n    11701,\n    11708,\n  ])],\n  [15, new Set([\n    10707,\n    10705,\n    10804,\n    10807,\n  ])],\n  [16, new Set([\n    10401,\n    10311,\n    10418,\n    5025,\n    10303,\n    10105,\n  ])],\n  [17, new Set([\n    10713,\n    10701,\n    10710,\n    5024,\n    10703,\n    10716,\n  ])],\n  [18, new Set([\n    10705,\n    10803,\n    10706,\n    10203,\n    10704,\n  ])],\n  [19, new Set([\n    10501,\n    5009,\n    10324,\n    10504,\n    5025,\n  ])],\n  [20, new Set([\n    10314,\n    10804,\n    10301,\n    5003,\n    6007,\n    5009,\n    10326,\n  ])],\n  [21, new Set([\n    5021,\n    10304,\n    10101,\n    10210,\n    10113,\n    10209,\n    5016,\n  ])],\n  [22, new Set([\n    10707,\n    10702,\n  ])],\n  [23, new Set([\n    11704,\n    11708,\n    10210,\n    5012,\n    5013,\n  ])],\n  [24, new Set([\n    10311,\n    10303,\n    10314,\n    10301,\n    10102,\n    10803,\n  ])],\n  [25, new Set([\n    10415,\n    5024,\n    10224,\n    10104,\n    5014,\n    10404,\n  ])],\n  [26, new Set([\n    10415,\n    10410,\n    10819,\n    10601,\n    10104,\n  ])],\n  [27, new Set([\n    10321,\n    10203,\n    11719,\n    10302,\n  ])],\n  [28, new Set([\n    5009,\n    11708,\n    11701,\n    11703,\n  ])],\n  [29, new Set([\n    5021,\n    10819,\n    10701,\n    11781,\n  ])],\n  [30, new Set([\n    10707,\n    10703,\n    10603,\n    6007,\n    10713,\n  ])],\n  [31, new Set([\n    10819,\n    10704,\n    5021,\n    10811,\n  ])],\n  [32, new Set([\n    10321,\n    10311,\n    5004,\n    10105,\n    10209,\n    10224,\n    10303,\n    10326,\n  ])],\n  [33, new Set([\n    10116,\n    10102,\n    10804,\n    10829,\n    10209,\n  ])],\n  [34, new Set([\n    5098,\n    10201,\n    10223,\n    10604,\n    11711,\n    5012,\n    5100,\n    5013,\n  ])],\n  [35, new Set([\n    10803,\n    10707,\n    5003,\n    11780,\n  ])],\n  [36, new Set([\n    10203,\n    11711,\n    11703,\n    5003,\n    10604,\n    5025,\n  ])],\n  [37, new Set([\n    10105,\n    5025,\n    10210,\n    5015,\n    10406,\n  ])],\n  [38, new Set([\n    10321,\n    10324,\n    10811,\n  ])],\n  [39, new Set([\n    11704,\n    5024,\n    11703,\n    10109,\n    5008,\n    10604,\n    11708,\n    10304,\n  ])],\n  [40, new Set([\n    10223,\n    10203,\n    10210,\n    10314,\n    10104,\n    10208,\n  ])],\n  [41, new Set([\n    5022,\n    5012,\n    11704,\n    10504,\n    10501,\n  ])],\n  [42, new Set([\n    5008,\n    5003,\n    10501,\n    10604,\n    10326,\n    5005,\n    10603,\n  ])],\n  [43, new Set([\n    10804,\n    10819,\n  ])],\n  [44, new Set([\n    10314,\n    10301,\n    10324,\n    5004,\n    5007,\n    5015,\n    10302,\n  ])],\n  [45, new Set([\n    10410,\n    10418,\n    10501,\n    10401,\n    10303,\n    5014,\n  ])],\n  [47, new Set([\n    10301,\n    10418,\n    10321,\n    5021,\n    10303,\n  ])],\n  [48, new Set([\n    10116,\n    10206,\n    10113,\n    10203,\n    5024,\n    10101,\n  ])],\n  [49, new Set([\n    10605,\n    10803,\n    10603,\n    10410,\n    5024,\n    6008,\n    10604,\n    5014,\n  ])],\n  [51, new Set([\n    10841,\n    5005,\n    10710,\n    11728,\n    5022,\n    5024,\n    6007,\n    11820,\n    10813,\n  ])],\n  [52, new Set([\n    10401,\n    11730,\n    10504,\n    6008,\n    11725,\n    10304,\n    10311,\n    10404,\n  ])],\n  [53, new Set([\n    11739,\n    10314,\n    10223,\n    5014,\n    5004,\n    5098,\n    11740,\n    11823,\n    10328,\n  ])],\n  [54, new Set([\n    11746,\n    10719,\n    5016,\n  ])],\n  [55, new Set([\n    10326,\n    10102,\n    11748,\n    10208,\n    11749,\n    11720,\n    11824,\n    11747,\n  ])],\n  [56, new Set([\n    10703,\n    10811,\n    10716,\n    11728,\n    11750,\n    10829,\n  ])],\n  [57, new Set([\n    5014,\n    6008,\n    5016,\n    10803,\n  ])],\n  [58, new Set([\n    11788,\n    10206,\n    10311,\n    5022,\n    6007,\n  ])],\n  [59, new Set([\n    10703,\n    10704,\n    10701,\n    11791,\n  ])],\n  [60, new Set([\n    11778,\n    11779,\n    11706,\n    5003,\n    5012,\n  ])],\n  [61, new Set([\n    10707,\n    10705,\n    11781,\n    10704,\n    11780,\n  ])],\n  [62, new Set([\n    12052,\n    5016,\n    10214,\n    6008,\n    5007,\n    12095,\n    5025,\n  ])],\n  [63, new Set([\n    11703,\n    10201,\n    5020,\n    5013,\n    12009,\n  ])],\n  [64, new Set([\n    10321,\n    5003,\n    10101,\n    11706,\n    5022,\n    10103,\n    12080,\n  ])],\n  [65, new Set([\n    10504,\n    10501,\n    5003,\n    5016,\n    12068,\n    12048,\n    10104,\n    10223,\n    5015,\n  ])],\n  [66, new Set([\n    5025,\n    12010,\n    10223,\n    10314,\n    5007,\n    12011,\n    12001,\n    12009,\n  ])],\n  [67, new Set([\n    5013,\n    12001,\n    12018,\n    10105,\n    5015,\n    11708,\n  ])],\n  [69, new Set([\n    10209,\n    10101,\n    10203,\n  ])],\n  [70, new Set([\n    11706,\n  ])],\n  [71, new Set([\n    10705,\n    10701,\n    10712,\n    10707,\n  ])],\n  [72, new Set([\n    10201,\n    10203,\n    10208,\n    5012,\n  ])],\n  [73, new Set([\n    10603,\n    10601,\n    6007,\n    5008,\n    5004,\n  ])],\n  [74, new Set([\n    10842,\n    10838,\n    10706,\n  ])],\n  [75, new Set([\n    10707,\n    5005,\n    5016,\n    12090,\n  ])],\n  [76, new Set([\n    10314,\n    5024,\n    10324,\n    10404,\n    5003,\n  ])],\n  [77, new Set([\n    12095,\n    5014,\n    10223,\n    12081,\n    10311,\n    10326,\n  ])],\n  [78, new Set([\n    11711,\n    11708,\n    11704,\n    5021,\n    11703,\n  ])],\n  [79, new Set([\n    5012,\n    10223,\n    10324,\n    5014,\n    5009,\n  ])],\n  [80, new Set([\n    12001,\n    11748,\n    5015,\n    10101,\n    11749,\n  ])],\n  [81, new Set([\n    10819,\n    10406,\n    5016,\n  ])],\n  [82, new Set([\n    11788,\n    10809,\n    5009,\n    10104,\n  ])],\n  [83, new Set([\n    11706,\n    10304,\n    10203,\n    12001,\n  ])],\n  [84, new Set([\n    10707,\n    5016,\n    10713,\n    5021,\n  ])],\n  [85, new Set([\n    10314,\n    10105,\n    5008,\n    10321,\n    5015,\n  ])],\n  [86, new Set([\n    5012,\n    10205,\n    6007,\n    5014,\n    10209,\n  ])],\n  [87, new Set([\n    11779,\n    11748,\n    10214,\n    12048,\n    11749,\n    11788,\n  ])],\n  [88, new Set([\n    11778,\n    5014,\n    12009,\n    10321,\n    5021,\n  ])],\n  [89, new Set([\n    10842,\n    5005,\n    10116,\n    10838,\n    10829,\n    12014,\n    5014,\n  ])],\n  [91, new Set([\n    12059,\n    6008,\n    11749,\n    12062,\n    10829,\n  ])],\n  [92, new Set([\n    10701,\n    10841,\n    10819,\n    5022,\n    10702,\n  ])],\n  [93, new Set([\n    11746,\n    10703,\n    12059,\n    12069,\n  ])],\n  [94, new Set([\n    10716,\n    12081,\n    11739,\n  ])],\n  [95, new Set([\n    11704,\n    11706,\n    5025,\n    11711,\n    12018,\n  ])],\n  [96, new Set([\n    10705,\n    10841,\n    10819,\n    10706,\n  ])],\n  [97, new Set([\n    10209,\n    10116,\n    12052,\n  ])],\n  [98, new Set([\n    10418,\n    10311,\n    10203,\n    10304,\n  ])],\n  [99, new Set([\n    5005,\n    10205,\n    10702,\n  ])],\n  [100, new Set([\n    10705,\n    5005,\n    6008,\n    12102,\n  ])],\n  [101, new Set([\n    10321,\n    12166,\n    10311,\n    10326,\n    10314,\n    12167,\n    5003,\n    10328,\n  ])],\n  [102, new Set([\n    10703,\n    5022,\n    10841,\n    11720,\n  ])],\n  [103, new Set([\n    10201,\n    10601,\n    5012,\n    5004,\n  ])],\n  [104, new Set([\n    10101,\n    5024,\n    10223,\n    10224,\n    10103,\n  ])],\n  [105, new Set([\n    10705,\n    10811,\n    10707,\n  ])],\n  [106, new Set([\n    10201,\n    11779,\n    12090,\n    10208,\n  ])],\n  [108, new Set([\n    10703,\n    10713,\n    10716,\n    10717,\n    11791,\n  ])],\n  [109, new Set([\n    10811,\n    5015,\n    10803,\n  ])],\n  [110, new Set([\n    10223,\n    12104,\n    5024,\n    10401,\n    12103,\n    12105,\n  ])],\n  [111, new Set([\n    10705,\n    5005,\n    10841,\n    10712,\n    11706,\n    12059,\n    11781,\n    12102,\n  ])],\n  [112, new Set([\n    10415,\n    12095,\n    12009,\n    10214,\n    11779,\n    6007,\n  ])],\n  [113, new Set([\n    10701,\n    10705,\n    10703,\n    10702,\n  ])],\n  [114, new Set([\n    11779,\n    5008,\n    10803,\n    10829,\n    6007,\n  ])],\n  [115, new Set([\n    10324,\n    10314,\n    12147,\n    10328,\n    5008,\n    12148,\n    12149,\n    5014,\n    10302,\n  ])],\n  [116, new Set([\n    10701,\n    10109,\n    10705,\n    10841,\n    12090,\n  ])],\n  [118, new Set([\n    10205,\n    10206,\n    10224,\n    10214,\n  ])],\n  [119, new Set([\n    10716,\n    10705,\n    10841,\n    10803,\n    10813,\n    10717,\n  ])],\n  [120, new Set([\n    5014,\n    10803,\n    12081,\n    10819,\n  ])],\n  [121, new Set([\n    11701,\n    10105,\n    11708,\n    10604,\n  ])],\n  [122, new Set([\n    10326,\n    10311,\n    10102,\n    12062,\n    10209,\n  ])],\n  [123, new Set([\n    10324,\n    10311,\n    10301,\n    5015,\n    10203,\n    10321,\n  ])],\n  [124, new Set([\n    12059,\n    5003,\n    10406,\n    10104,\n  ])],\n  [125, new Set([\n    10701,\n    10815,\n    10819,\n    11791,\n    12059,\n    10804,\n  ])],\n  [126, new Set([\n    10701,\n    10703,\n    10109,\n    10716,\n  ])],\n  [127, new Set([\n    10401,\n    12001,\n    11779,\n    5025,\n    10304,\n    5016,\n  ])],\n  [129, new Set([\n    10704,\n    5014,\n    10705,\n    10703,\n    20001,\n    10717,\n    10819,\n  ])],\n  [130, new Set([\n    10101,\n    5024,\n    10116,\n    11749,\n    10223,\n  ])],\n  [131, new Set([\n    10703,\n    10841,\n    5015,\n    10819,\n    5024,\n  ])],\n  [132, new Set([\n    10101,\n    12001,\n    10809,\n  ])],\n  [133, new Set([\n    10223,\n    5100,\n    5098,\n  ])],\n  [134, new Set([\n    10703,\n    10716,\n    10717,\n  ])],\n  [135, new Set([\n    10206,\n    10304,\n    10116,\n    10210,\n  ])],\n  [136, new Set([\n    12090,\n    10101,\n    6007,\n    5024,\n  ])],\n  [137, new Set([\n    10201,\n    5003,\n    10218,\n  ])],\n  [138, new Set([\n    11701,\n    11704,\n    11711,\n    11706,\n  ])],\n  [139, new Set([\n    10223,\n    12081,\n    5098,\n    10101,\n    10208,\n    10210,\n  ])],\n  [140, new Set([\n    10201,\n    5004,\n    10208,\n    12001,\n    6007,\n  ])],\n  [141, new Set([\n    10841,\n    11706,\n    10838,\n    10808,\n  ])],\n  [142, new Set([\n    10601,\n    10604,\n    5024,\n    5014,\n    12009,\n  ])],\n  [143, new Set([\n    10201,\n    5007,\n    10218,\n    5100,\n  ])],\n  [144, new Set([\n    10101,\n    5003,\n    5014,\n    10103,\n    5021,\n  ])],\n  [145, new Set([\n    10223,\n    5008,\n    5025,\n    10208,\n    10829,\n  ])],\n  [146, new Set([\n    11706,\n    10201,\n    10601,\n    10203,\n    10604,\n  ])],\n  [147, new Set([\n    5004,\n    11706,\n    12001,\n    12090,\n    6007,\n  ])],\n  [148, new Set([\n    10604,\n    5003,\n    10311,\n    10804,\n    10104,\n    10102,\n  ])],\n  [99161, new Set([\n    11746,\n    10203,\n    10712,\n    10815,\n    10717,\n  ])],\n  [99162, new Set([\n    11778,\n    11711,\n    10605,\n    10203,\n  ])],\n  [99163, new Set([\n    11728,\n    5016,\n    11781,\n    11791,\n  ])],\n  [99164, new Set([\n    10208,\n    11779,\n    12009,\n    12095,\n  ])],\n  [99165, new Set([\n    10707,\n    10109,\n  ])],\n  [99166, new Set([\n    10201,\n    5007,\n    10401,\n    10418,\n  ])],\n  [99167, new Set([\n    11711,\n    10605,\n    11704,\n    5025,\n    6007,\n  ])],\n  [99168, new Set([\n    10811,\n    10842,\n    10406,\n  ])],\n  [99169, new Set([\n    10703,\n    10712,\n    5005,\n    5024,\n    10719,\n    10704,\n  ])],\n  [99170, new Set([\n    10208,\n    11720,\n    10205,\n    10218,\n    10314,\n  ])],\n  [99171, new Set([\n    10705,\n    10716,\n    10711,\n    10713,\n    10717,\n  ])],\n  [99172, new Set([\n    12068,\n    10208,\n    10504,\n    10501,\n    5004,\n    10104,\n  ])],\n  [99173, new Set([\n    5005,\n    10116,\n    10842,\n    6008,\n    10803,\n    10829,\n  ])],\n  [99174, new Set([\n    10838,\n    10311,\n    10842,\n    12059,\n    10809,\n  ])],\n  [99175, new Set([\n    5024,\n    10101,\n    11749,\n    5012,\n    10404,\n  ])],\n  [99176, new Set([\n    10324,\n    10311,\n    10314,\n    10301,\n    11739,\n    10302,\n  ])],\n  [99177, new Set([\n    10701,\n    10841,\n    11750,\n    10717,\n    6008,\n    10813,\n  ])],\n  [99178, new Set([\n    10705,\n    5005,\n    11728,\n    10701,\n    12102,\n  ])],\n  [99179, new Set([\n    10201,\n    10208,\n    5012,\n    10223,\n    11711,\n  ])],\n  [99180, new Set([\n    10101,\n    5024,\n    5025,\n    10105,\n    10401,\n    10418,\n  ])],\n  [99181, new Set([\n    11701,\n    11704,\n    11708,\n    10604,\n    12009,\n    10605,\n  ])],\n  [99182, new Set([\n    10203,\n    10311,\n    10210,\n    10101,\n    6007,\n    10103,\n    10102,\n  ])],\n  [99183, new Set([\n    10501,\n    12068,\n    11701,\n    12001,\n    11703,\n    5016,\n  ])],\n  [99184, new Set([\n    10842,\n    10815,\n    10819,\n  ])],\n  [99185, new Set([\n    10811,\n    10819,\n    10701,\n    11780,\n    10707,\n    10717,\n  ])],\n  [99186, new Set([\n    5100,\n    5016,\n    10201,\n    6007,\n    10218,\n    5009,\n  ])],\n  [99187, new Set([\n    10819,\n    10716,\n    10707,\n    10406,\n    10109,\n    10813,\n  ])],\n  [99188, new Set([\n    10701,\n    10406,\n    10719,\n    10716,\n    10717,\n  ])],\n  [99189, new Set([\n    11701,\n    5003,\n    11778,\n    5025,\n    10601,\n  ])],\n  [99190, new Set([\n    10101,\n    5016,\n    10102,\n    11720,\n    10223,\n    10326,\n  ])],\n  [99191, new Set([\n    10811,\n    10807,\n    10804,\n  ])],\n  [99192, new Set([\n    10201,\n    5015,\n    10103,\n    10401,\n  ])],\n  [99193, new Set([\n    5003,\n    10605,\n    11706,\n    12090,\n    10604,\n    10406,\n  ])],\n  [99194, new Set([\n    10208,\n    12009,\n    5098,\n    12001,\n  ])],\n  [99195, new Set([\n    10201,\n    10205,\n    12001,\n    10223,\n    5004,\n  ])],\n  [99196, new Set([\n    10707,\n    10819,\n    10811,\n    10813,\n    10804,\n    11781,\n  ])],\n  [99197, new Set([\n    10703,\n    10701,\n    12069,\n    11791,\n    10717,\n  ])],\n  [99198, new Set([\n    10324,\n    11739,\n    10301,\n  ])],\n  [99199, new Set([\n    10707,\n    10811,\n    10712,\n    5005,\n    10406,\n  ])],\n  [99200, new Set([\n    10601,\n    11778,\n    10604,\n    5004,\n  ])],\n  [99201, new Set([\n    10201,\n    10206,\n    5003,\n    10104,\n    10103,\n  ])],\n  [99202, new Set([\n    10101,\n    10105,\n    12001,\n    11739,\n    10415,\n  ])],\n  [99203, new Set([\n    10705,\n    10811,\n    5005,\n    10804,\n  ])],\n  [99204, new Set([\n    11701,\n    11708,\n    10604,\n    12009,\n    11703,\n    11719,\n  ])],\n  [99205, new Set([\n    10707,\n    11728,\n    10841,\n    10109,\n    10804,\n    10813,\n  ])],\n  [99206, new Set([\n    10324,\n    10314,\n    11739,\n    5004,\n    10302,\n    10105,\n  ])],\n  [99207, new Set([\n    10842,\n    11781,\n    10838,\n    11728,\n    5005,\n  ])],\n  [99208, new Set([\n    10101,\n    5007,\n    6007,\n    10103,\n  ])],\n  [99209, new Set([\n    10701,\n    10716,\n    5005,\n    10803,\n    11750,\n    10717,\n  ])],\n  [99210, new Set([\n    10706,\n    10804,\n    10709,\n    12081,\n  ])],\n  [99211, new Set([\n    10116,\n    12009,\n    10201,\n    5004,\n    10218,\n    10205,\n  ])],\n  [99212, new Set([\n    10201,\n    5003,\n    12090,\n    10401,\n    10223,\n  ])],\n  [99213, new Set([\n    10201,\n    5003,\n    12052,\n    10504,\n    5015,\n  ])],\n  [99214, new Set([\n    10601,\n    10603,\n    5004,\n    11778,\n    6007,\n    10605,\n  ])],\n  [99215, new Set([\n    10301,\n    10314,\n    11739,\n    10326,\n    10302,\n    5012,\n  ])],\n  [99216, new Set([\n    10201,\n    10208,\n    10415,\n    12001,\n    10218,\n    5014,\n  ])],\n  [99217, new Set([\n    5007,\n    10201,\n    10103,\n    10205,\n    5014,\n  ])],\n  [99218, new Set([\n    10415,\n    10404,\n    10201,\n    5007,\n    5004,\n  ])],\n  [99219, new Set([\n    10703,\n    10702,\n    10841,\n    10109,\n    10813,\n  ])],\n  [99220, new Set([\n    10707,\n    10713,\n    10701,\n    10819,\n    10702,\n  ])],\n  [99221, new Set([\n    5004,\n    10223,\n    10208,\n    6007,\n    12001,\n  ])],\n  [99222, new Set([\n    10803,\n    10717,\n    10716,\n  ])],\n  [99223, new Set([\n    10116,\n    11788,\n    10208,\n    10105,\n  ])],\n  [99224, new Set([\n    5024,\n    5100,\n    12090,\n  ])],\n  [99225, new Set([\n    10705,\n    10819,\n    10707,\n    10813,\n    10406,\n    12102,\n  ])],\n  [99226, new Set([\n    10201,\n    10401,\n    10209,\n    5016,\n  ])],\n  [99227, new Set([\n    5024,\n    10415,\n    10201,\n    10418,\n    10401,\n  ])],\n  [99228, new Set([\n    10223,\n    10206,\n    5009,\n    10304,\n    10829,\n  ])],\n  [99229, new Set([\n    10707,\n    12102,\n    10819,\n  ])],\n  [99230, new Set([\n    10208,\n    5100,\n    11711,\n    5098,\n    5013,\n  ])],\n  [99231, new Set([\n    10716,\n    10707,\n    10709,\n    10703,\n    10813,\n  ])],\n  [99232, new Set([\n    12668,\n    10838,\n    12669,\n  ])],\n  [99233, new Set([\n    12671,\n    5004,\n    10223,\n    10218,\n    10302,\n    10314,\n  ])],\n  [99234, new Set([\n    10101,\n    10103,\n    5008,\n    10116,\n    12675,\n    11706,\n  ])],\n  [99235, new Set([\n    10223,\n    12068,\n    10304,\n    12081,\n    11720,\n  ])],\n  [99236, new Set([\n    11701,\n    11711,\n    11706,\n    11704,\n  ])],\n  [99237, new Set([\n    10841,\n    10819,\n    11728,\n  ])],\n  [99238, new Set([\n    10701,\n    10705,\n    10838,\n    10406,\n    10813,\n    10811,\n  ])],\n  [99239, new Set([\n    10703,\n    10707,\n    10803,\n    10705,\n    10841,\n    10811,\n  ])],\n  [99240, new Set([\n    12979,\n    10704,\n    10706,\n    10819,\n    10803,\n  ])],\n  [99241, new Set([\n    10201,\n    5100,\n    5007,\n    10218,\n    10501,\n  ])],\n  [99242, new Set([\n    11748,\n    10101,\n    10415,\n    10210,\n    10304,\n    10404,\n  ])],\n  [99243, new Set([\n    10601,\n    10604,\n    12048,\n    10602,\n    11719,\n  ])],\n  [99244, new Set([\n    10717,\n    10716,\n    11791,\n    10406,\n    10711,\n  ])],\n  [99245, new Set([\n    10223,\n    11720,\n    5007,\n    10304,\n  ])],\n  [99246, new Set([\n    10401,\n    10418,\n    12010,\n    10415,\n  ])],\n  [99247, new Set([\n    11704,\n    11703,\n    11701,\n    11711,\n  ])],\n  [99248, new Set([\n    10716,\n    10701,\n    10703,\n    10717,\n  ])],\n  [99249, new Set([\n    5098,\n    6007,\n    11704,\n    10803,\n  ])],\n  [99250, new Set([\n    10201,\n    10223,\n    10214,\n    10218,\n    5007,\n  ])],\n  [99251, new Set([\n    11704,\n    11706,\n    5008,\n    11701,\n  ])],\n  [99252, new Set([\n    10223,\n    5003,\n    5013,\n    10218,\n    6008,\n  ])],\n  [99253, new Set([\n    10201,\n    11720,\n    5004,\n    10208,\n    5007,\n    10223,\n  ])],\n  [99254, new Set([\n    10401,\n    10410,\n    10415,\n    5024,\n    10201,\n  ])],\n  [99255, new Set([\n    10223,\n    10208,\n    10210,\n    10218,\n    5003,\n    10415,\n  ])],\n  [99256, new Set([\n    10223,\n    5004,\n    5013,\n    10208,\n    10210,\n    10218,\n  ])],\n  [99257, new Set([\n    10701,\n    10811,\n    10707,\n    11728,\n    10709,\n    11750,\n  ])],\n  [99258, new Set([\n    5007,\n    10201,\n    10208,\n    10415,\n    10218,\n  ])],\n  [99259, new Set([\n    10208,\n    10223,\n    5007,\n    10218,\n    10328,\n    10301,\n  ])],\n  [99260, new Set([\n    10604,\n    10311,\n    10203,\n    11719,\n    5020,\n    11739,\n  ])],\n  [99261, new Set([\n    10716,\n    5005,\n    10717,\n    10406,\n    10711,\n  ])],\n  [99262, new Set([\n    10101,\n    5016,\n    10103,\n    5020,\n    10326,\n  ])],\n  [99263, new Set([\n    10201,\n    10208,\n    10303,\n    10203,\n    13076,\n    10302,\n  ])],\n  [99264, new Set([\n    5007,\n    5020,\n    6007,\n    10301,\n    10302,\n  ])],\n  [99265, new Set([\n    10223,\n    12068,\n    11720,\n    10326,\n    10321,\n    10208,\n  ])],\n  [99266, new Set([\n    10223,\n    10208,\n    10210,\n    10218,\n    10105,\n    10326,\n  ])],\n  [99267, new Set([\n    5005,\n    10841,\n    10706,\n    10704,\n    10713,\n  ])],\n  [99268, new Set([\n    11701,\n    10604,\n    11706,\n    11719,\n  ])],\n  [99269, new Set([\n    10819,\n    10842,\n    10601,\n    6008,\n  ])],\n  [99270, new Set([\n    10208,\n    5098,\n    10218,\n    11719,\n  ])],\n  [99271, new Set([\n    10703,\n    11728,\n    10838,\n    10803,\n    10811,\n  ])],\n  [99272, new Set([\n    10208,\n    5007,\n    10604,\n    10218,\n  ])],\n  [99273, new Set([\n    10208,\n    5004,\n    10223,\n    10218,\n    10301,\n    10302,\n  ])],\n  [99274, new Set([\n    10707,\n    10813,\n    10819,\n    11750,\n  ])],\n  [99275, new Set([\n    10223,\n    10208,\n    10314,\n    10214,\n    6007,\n    10302,\n  ])],\n  [99276, new Set([\n    11706,\n    11711,\n    11701,\n    11703,\n    11719,\n  ])],\n  [99277, new Set([\n    10208,\n    5024,\n    10105,\n    10223,\n    5004,\n    10415,\n  ])],\n  [99278, new Set([\n    10201,\n    10101,\n    10223,\n    5007,\n    10103,\n  ])],\n  [99279, new Set([\n    10201,\n    10205,\n    10214,\n    10223,\n    10105,\n    10103,\n  ])],\n  [99280, new Set([\n    12979,\n    5005,\n    10716,\n    10842,\n    11746,\n    10711,\n  ])],\n  [99281, new Set([\n    10501,\n    5020,\n    10404,\n  ])],\n  [99282, new Set([\n    10401,\n    5004,\n    12010,\n    10415,\n    10103,\n  ])],\n  [99283, new Set([\n    10703,\n    10841,\n    10813,\n    10819,\n    11750,\n  ])],\n  [99284, new Set([\n    5013,\n    5016,\n    10208,\n    10223,\n    5004,\n    10218,\n  ])],\n  [99285, new Set([\n    10804,\n    10704,\n    10808,\n    10104,\n  ])],\n  [99286, new Set([\n    10208,\n    10201,\n    5004,\n    5024,\n    10401,\n  ])],\n  [99287, new Set([\n    10716,\n    10803,\n    5005,\n    11750,\n    12090,\n    10717,\n  ])],\n]);

function getHeroSoldierTierOrder(record: { isSp: boolean; tier: number }) {
  if (record.isSp) return 0;
  if (record.tier === 3) return 1;
  if (record.tier === 2) return 2;
  if (record.tier === 1) return 3;
  return Number.MAX_SAFE_INTEGER;
}

function sortHeroSoldierIdsForPresentation(ids: readonly number[]) {
  const soldierById = new Map(
    getSoldierPrototypePageData().records.map((record) => [record.soldierId, record]),
  );

  return [...ids].sort((aId, bId) => {
    const a = soldierById.get(aId);
    const b = soldierById.get(bId);

    // The Hero route owns the existing fail-closed missing-Soldier validation.
    // Keep unresolved IDs stable here instead of changing that validation boundary.
    if (!a || !b) return 0;

    // Presentation priority: SP > T3 > T2 > T1, then army type, then Soldier ID.
    // This keeps every SP Soldier above normal tiers and every T1 Soldier at the bottom.
    const tierOrderDiff = getHeroSoldierTierOrder(a) - getHeroSoldierTierOrder(b);
    if (tierOrderDiff !== 0) return tierOrderDiff;

    const armyOrderDiff =
      (HERO_SOLDIER_ARMY_ORDER.get(a.armyType) ?? Number.MAX_SAFE_INTEGER) -
      (HERO_SOLDIER_ARMY_ORDER.get(b.armyType) ?? Number.MAX_SAFE_INTEGER);
    if (armyOrderDiff !== 0) return armyOrderDiff;

    return bId - aId;
  });
}

function projectSharedHeroNameLocalization<
  T extends {
    heroId: number;
    identity: { nameKr: string | null; nameCn: string };
    localization: unknown;
  },
>(hero: T): T {
  return {
    ...hero,
    localization: resolveHeroNameLocalization(
      hero.heroId,
      hero.identity.nameKr,
      hero.identity.nameCn,
    ),
  };
}

function localizeLegacyHeroSkill<T extends { skillId: number; nameCn: string | null; desc: string | null }>(
  heroId: number,
  skill: T,
): T {
  const admittedSkillIds = LEGACY_SKILL_IDS_BY_HERO.get(heroId);
  if (!admittedSkillIds?.has(skill.skillId)) return skill;

  const localization = resolveHeroSkillKr(skill);
  if (!localization) {
    throw new Error(
      `Hero ${heroId} legacy skill ${skill.skillId} no longer matches the admitted Korean localization catalog.`,
    );
  }

  return {
    ...skill,
    // Stage 5 remains presentation-only. Skill identity and relations stay frozen;
    // only the visible Korean name/description come from the shared Skill-ID catalog.
    nameCn: localization.nameKr,
    desc: localization.descKr,
  };
}

function localizeHeroTalentRow<
  T extends {
    star: number;
    skillId: number;
    skill: { skillId: number; nameCn: string | null; desc: string | null } | null;
  },
>(heroId: number, row: T): T {
  if (row.star < 3 || row.star > 6 || !hasHeroTalentKr(heroId)) return row;
  if (!row.skill) {
    throw new Error(`Hero ${heroId} talent ${row.star}-star row is missing its frozen skill payload.`);
  }
  if (row.skill.skillId !== row.skillId) {
    throw new Error(`Hero ${heroId} talent ${row.star}-star row has a Skill-ID parity mismatch.`);
  }

  const localization = resolveHeroTalentKr({
    heroId,
    star: row.star,
    skillId: row.skillId,
    nameCn: row.skill.nameCn,
  });
  if (!localization) {
    throw new Error(
      `Hero ${heroId} talent ${row.star}-star Skill ${row.skillId} no longer matches the final Korean talent localization consumer.`,
    );
  }

  return {
    ...row,
    skill: {
      ...row.skill,
      // Frontend integration is presentation-only. HeroID, SkillID, star progression and
      // selection semantics remain frozen; only visible Korean text is replaced.
      nameCn: localization.nameKr,
      desc: localization.descKr,
    },
  };
}

export const getHeroListStage2Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage2Data(),
);

export const getHeroListStage3Data = createServerFn({ method: "GET" }).handler(
  async () => readHeroListStage3Data(),
);

export const getHeroListStage4Data = createServerFn({ method: "GET" }).handler(
  async () => {
    const data = readHeroListStage4Data();
    return {
      ...data,
      records: data.records.map(projectSharedHeroNameLocalization),
    };
  },
);

function validateHeroId(input: { heroId: number }) {
  if (!Number.isSafeInteger(input.heroId) || input.heroId <= 0) {
    throw new Error("heroId must be a positive safe integer.");
  }
  return input;
}

export const getHeroDetailRouteStage4Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => {
    const routeData = readHeroDetailRouteStage4Data(data.heroId);
    if (!routeData) return routeData;
    return {
      ...routeData,
      hero: projectSharedHeroNameLocalization(routeData.hero),
    };
  });

export const getHeroDetailRouteStage5Data = createServerFn({ method: "GET" })
  .validator(validateHeroId)
  .handler(async ({ data }) => {
    const routeData = await readHeroDetailRouteStage5Data(data.heroId);
    if (!routeData) return routeData;

    const legacySkillIds = LEGACY_SKILL_IDS_BY_HERO.get(data.heroId);
    const skills = legacySkillIds
      ? {
          ...routeData.detail.skills,
          heroDirectSkills: routeData.detail.skills.heroDirectSkills.map((skill) =>
            localizeLegacyHeroSkill(data.heroId, skill),
          ),
          jobLevelAcquisitions: routeData.detail.skills.jobLevelAcquisitions.map((row) => ({
            ...row,
            skill: localizeLegacyHeroSkill(data.heroId, row.skill),
          })),
        }
      : routeData.detail.skills;

    const talent = hasHeroTalentKr(data.heroId)
      ? {
          ...routeData.detail.talent,
          starProgression: routeData.detail.talent.starProgression.map((row) =>
            localizeHeroTalentRow(data.heroId, row),
          ),
        }
      : routeData.detail.talent;

    return {
      ...routeData,
      hero: projectSharedHeroNameLocalization(routeData.hero),
      soldierCommand: readHeroSoldierCommand(data.heroId),
      heartFetter: readHeroHeartFetterPresentation(data.heroId),
      detail: applyHeroDungeonBondPresentation(data.heroId, {
        ...routeData.detail,
        skills,
        talent,
        soldiers: {
          ...routeData.detail.soldiers,
          ids: sortHeroSoldierIdsForPresentation(routeData.detail.soldiers.ids),
        },
      }),
    };
  });
