import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";

type HeroExclusiveEquipmentPresentation = {
  released: boolean;
  detail: {
    equipmentId: number;
    identity: {
      nameCn: string;
      nameKr: string | null;
    };
    effect: {
      effectName: string;
      effectText: string;
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
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-hero-exclusive-equipment="true">
      <h2 className="font-bold text-foreground">전용장비</h2>

      {exclusiveEquipment.released && detail ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-start">
          <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/20 p-3">
            <img
              src={getOfficialEquipmentImageUrl(detail.equipmentId)}
              alt={`${detail.identity.nameKr ?? detail.identity.nameCn} 전용장비`}
              loading="lazy"
              decoding="async"
              className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            />
          </div>

          <div className="min-w-0" data-hero-exclusive-equipment-copy="true">
            <h3 className="text-xl font-bold text-foreground">{detail.identity.nameKr ?? detail.identity.nameCn}</h3>
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
              <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{detail.effect.effectText}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">전용장비 없음</p>
      )}
    </section>
  );
}
