import { getSoldierCommonMaterialIconUrl } from "@/lib/soldier-common-material-assets";

type BondMaterial = {
  itemId: number;
  count: number;
  nameCn: string;
  iconPath: string;
};

type BondCostProfile = {
  profileId: string;
  levels: Array<{
    targetLevel: number;
    goldCost: number;
    materials: BondMaterial[];
  }>;
  total: {
    gold: number;
    materials: BondMaterial[];
  };
};

export type HeroBondMaterialsPresentation = {
  heroId: number;
  regularFetters: Array<BondCostProfile & {
    order: number;
    displayOrder: number;
    fetterId: number;
    nameCn: string | null;
  }>;
  heartFetter: BondCostProfile & {
    heartFetterId: number;
    nameCn: string | null;
  };
};

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function MaterialBadges({
  materials,
  resolveAssetUrl,
}: {
  materials: BondMaterial[];
  resolveAssetUrl: (path: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {materials.map((material) => (
        <span
          key={material.itemId}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
          data-hero-bond-material-id={material.itemId}
        >
          <img
            src={resolveAssetUrl(material.iconPath)}
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            className="h-6 w-6 shrink-0 object-contain"
            data-hero-bond-material-icon={material.itemId}
          />
          <span className="font-extrabold tabular-nums">×{formatNumber(material.count)}</span>
        </span>
      ))}
    </div>
  );
}

function GoldCost({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-extrabold tabular-nums text-foreground" data-hero-bond-gold-cost={value}>
      <img
        src={getSoldierCommonMaterialIconUrl("gold")}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
        className="h-6 w-6 shrink-0 object-contain"
      />
      <span>×{formatNumber(value)}</span>
    </span>
  );
}

function BondTrack({
  label,
  profile,
  iconUrl,
  resolveAssetUrl,
}: {
  label: string;
  profile: BondCostProfile;
  iconUrl?: string | null;
  resolveAssetUrl: (path: string) => string;
}) {
  return (
    <details
      className="group rounded-xl border border-border bg-muted/10"
      data-hero-bond-cost-profile={profile.profileId}
    >
      <summary className="cursor-pointer list-none p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="h-9 w-9 shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-foreground">{label}</h4>
              </div>
              <span className="text-[11px] font-bold text-muted-foreground group-open:hidden">단계별 보기</span>
              <span className="hidden text-[11px] font-bold text-muted-foreground group-open:inline">접기</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <GoldCost value={profile.total.gold} />
              <MaterialBadges materials={profile.total.materials} resolveAssetUrl={resolveAssetUrl} />
            </div>
          </div>
        </div>
      </summary>

      <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[620px] border-collapse text-xs">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-bold text-muted-foreground">목표 레벨</th>
                <th className="px-3 py-2 text-left font-bold text-muted-foreground">필요 재료</th>
                <th className="px-3 py-2 text-right font-bold text-muted-foreground">골드</th>
              </tr>
            </thead>
            <tbody>
              {profile.levels.map((level) => (
                <tr key={level.targetLevel} className="border-b border-border/60 last:border-b-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left font-extrabold text-foreground">
                    Lv.{level.targetLevel}
                  </th>
                  <td className="px-3 py-2.5">
                    <MaterialBadges materials={level.materials} resolveAssetUrl={resolveAssetUrl} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="flex justify-end">
                      <GoldCost value={level.goldCost} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function HeroBondMaterialsPanel({
  materials,
  resolveAssetUrl,
}: {
  materials: HeroBondMaterialsPresentation;
  resolveAssetUrl: (path: string) => string;
}) {
  return (
    <div className="mt-5 border-t border-border pt-5" data-hero-bond-materials="true">
      <div>
        <h3 className="text-sm font-extrabold text-foreground">유대 강화 재료</h3>
      </div>

      <div className="mt-3 space-y-2">
        {materials.regularFetters.map((fetter) => (
          <BondTrack
            key={fetter.fetterId}
            label={`유대 ${fetter.displayOrder}`}
            profile={fetter}
            iconUrl={resolveAssetUrl(`/images/fetter/Fetter${fetter.displayOrder}.png`)}
            resolveAssetUrl={resolveAssetUrl}
          />
        ))}
        <BondTrack
          label="마음의 유대"
          profile={materials.heartFetter}
          resolveAssetUrl={resolveAssetUrl}
        />
      </div>
    </div>
  );
}
