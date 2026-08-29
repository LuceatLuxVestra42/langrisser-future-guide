import { ShieldCheck } from "lucide-react";

import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";

type HeroExclusiveEquipmentPresentation = {
  status: "RELEASED" | "NOT_RELEASED";
  released: boolean;
  equipmentId: number | null;
  detail: {
    equipmentId: number;
    identity: {
      equipmentId: number;
      nameCn: string;
      nameKr: string | null;
      icon: string;
    };
    classification: {
      group: string;
      groupKo: string;
      subtype: string;
      subtypeKo: string;
      equipmentType: number;
      label: number;
      acquisitionClass: string;
    };
    stats: {
      maxLevel: number;
      properties: Array<{
        propertyId: number;
        propertyKo: string;
        base: number;
        growthPer10Levels: number;
        maxLevel: number;
        maxRaw: number;
        maxValue: number;
      }>;
    };
    effect: {
      maxEffectSkillId: number;
      effectName: string;
      effectText: string;
    };
    acquisition: {
      releaseGroupDate: string | null;
      confidencePercent: number;
      classificationBasis: string;
    };
  } | null;
};

export function HeroExclusiveEquipmentSection({
  exclusiveEquipment,
}: {
  exclusiveEquipment: HeroExclusiveEquipmentPresentation;
}) {
  const detail = exclusiveEquipment.detail;

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <h2 className="font-bold text-foreground">전용장비</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">B-5 확정 소유권과 Equipment Stage 3-5 frozen 메타데이터를 그대로 표시해.</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">{exclusiveEquipment.status}</span>
      </div>

      {exclusiveEquipment.released && detail ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/20 p-5">
            <img
              src={getOfficialEquipmentImageUrl(detail.equipmentId)}
              alt={`${detail.identity.nameKr ?? detail.identity.nameCn} 전용장비`}
              className="h-32 w-32 object-contain sm:h-36 sm:w-36"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground">Equipment #{detail.equipmentId}</p>
                <h3 className="mt-1 text-xl font-bold text-foreground">{detail.identity.nameKr ?? detail.identity.nameCn}</h3>
                {detail.identity.nameKr ? <p className="mt-1 text-sm text-muted-foreground">{detail.identity.nameCn}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1 font-semibold">{detail.classification.groupKo} · {detail.classification.subtypeKo}</span>
                <span className="rounded-md bg-muted px-2 py-1 font-semibold">최대 Lv.{detail.stats.maxLevel}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
              {detail.stats.properties.map((property) => (
                <div key={property.propertyId} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] font-bold text-muted-foreground">{property.propertyKo}</p>
                  <p className="mt-0.5 font-bold text-foreground">{property.maxValue}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">{detail.effect.effectName}</h4>
                <span className="text-[11px] font-semibold text-muted-foreground">Skill #{detail.effect.maxEffectSkillId}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{detail.effect.effectText}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-1 font-semibold">획득 분류 · 전용장비</span>
              <span className="rounded-md bg-muted px-2 py-1 font-semibold">근거 신뢰도 {detail.acquisition.confidencePercent}%</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">현재 accepted snapshot에서 출시된 전용장비가 없어.</p>
      )}
    </section>
  );
}
