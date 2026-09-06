import cvFreezeJson from "../../data/presentation/hero-cv-localization-stage4-freeze.v1.json";
import cvValidationJson from "../../data/validation/hero-page-stage5-5-2-cv.v1.json";

type CvFreezeRecord = {
  sourceValue: string;
  nameKr: string;
  status: "CONFIRMED";
};

type CvValidationHero = {
  heroId: number;
  cvNameRaw: string;
  voiceActorStatus: "PRESENT" | "NONE_CONFIRMED";
};

export type HeroCvLocalization = {
  heroId: number;
  cvState: "NAMED" | "NONE";
  cvSourceValue: string;
  cvNameKr: string | null;
  localizationStatus: "CONFIRMED" | "NO_CV_EXCLUDED";
};

const cvFreeze = cvFreezeJson as {
  stage: string;
  status: string;
  authoritativeCvValidation?: {
    noCvMarker?: string;
    confirmedNoCvHeroIds?: number[];
  };
  records: CvFreezeRecord[];
};

const cvValidation = cvValidationJson as {
  status: string;
  coverage?: {
    mappedHeroCount?: number;
    heroesWithNamedVoiceActor?: number;
    heroesWithoutVoiceActor?: number;
    confirmedNoVoiceActorHeroIds?: number[];
  };
  heroes: CvValidationHero[];
};

if (cvFreeze.stage !== "hero-cv-localization-stage4" || cvFreeze.status !== "FROZEN") {
  throw new Error("Hero CV localization Stage 4 freeze is not admitted.");
}
if (cvValidation.status !== "PASS") {
  throw new Error("Authoritative Hero CV validation is not PASS.");
}

const noCvMarker = cvFreeze.authoritativeCvValidation?.noCvMarker ?? "■■■■";
const expectedNoCvHeroIds = new Set(cvFreeze.authoritativeCvValidation?.confirmedNoCvHeroIds ?? []);
const validationNoCvHeroIds = new Set(cvValidation.coverage?.confirmedNoVoiceActorHeroIds ?? []);
if (expectedNoCvHeroIds.size !== validationNoCvHeroIds.size || [...expectedNoCvHeroIds].some((id) => !validationNoCvHeroIds.has(id))) {
  throw new Error("Hero CV localization no-CV HeroID set is stale.");
}

const localizedBySourceValue = new Map<string, CvFreezeRecord>();
for (const row of cvFreeze.records) {
  if (row.status !== "CONFIRMED" || !row.sourceValue || !row.nameKr) {
    throw new Error(`Invalid frozen Hero CV localization record for sourceValue ${row.sourceValue || "<empty>"}.`);
  }
  if (localizedBySourceValue.has(row.sourceValue)) {
    throw new Error(`Duplicate frozen Hero CV sourceValue: ${row.sourceValue}`);
  }
  localizedBySourceValue.set(row.sourceValue, row);
}

const materializedByHeroId = new Map<number, HeroCvLocalization>();
for (const hero of cvValidation.heroes) {
  if (!Number.isInteger(hero.heroId) || materializedByHeroId.has(hero.heroId)) {
    throw new Error(`Invalid or duplicate HeroID in authoritative CV validation: ${hero.heroId}`);
  }

  if (hero.voiceActorStatus === "NONE_CONFIRMED") {
    if (!expectedNoCvHeroIds.has(hero.heroId) || hero.cvNameRaw !== noCvMarker) {
      throw new Error(`Hero ${hero.heroId} no-CV boundary mismatch.`);
    }
    materializedByHeroId.set(hero.heroId, {
      heroId: hero.heroId,
      cvState: "NONE",
      cvSourceValue: hero.cvNameRaw,
      cvNameKr: null,
      localizationStatus: "NO_CV_EXCLUDED",
    });
    continue;
  }

  if (hero.voiceActorStatus !== "PRESENT") {
    throw new Error(`Hero ${hero.heroId} has unsupported CV status ${hero.voiceActorStatus}.`);
  }
  const localized = localizedBySourceValue.get(hero.cvNameRaw);
  if (!localized) {
    throw new Error(`Hero ${hero.heroId} CV sourceValue is not localized: ${hero.cvNameRaw}`);
  }
  materializedByHeroId.set(hero.heroId, {
    heroId: hero.heroId,
    cvState: "NAMED",
    cvSourceValue: hero.cvNameRaw,
    cvNameKr: localized.nameKr,
    localizationStatus: "CONFIRMED",
  });
}

if (materializedByHeroId.size !== cvValidation.coverage?.mappedHeroCount) {
  throw new Error(`Hero CV materialization count mismatch: ${materializedByHeroId.size}`);
}

export function readHeroCvLocalization(heroId: number): HeroCvLocalization | null {
  return materializedByHeroId.get(heroId) ?? null;
}
