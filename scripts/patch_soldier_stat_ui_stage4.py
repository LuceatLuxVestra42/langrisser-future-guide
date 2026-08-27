from pathlib import Path

path = Path("src/components/soldier-detail-modal.tsx")
source = path.read_text()

source = source.replace(
    "sm:h-[180px] sm:grid-cols-[180px_minmax(0,1fr)_210px] sm:items-stretch lg:h-[210px] lg:grid-cols-[210px_minmax(0,1fr)_220px]",
    "sm:h-[180px] sm:grid-cols-[180px_minmax(0,1fr)_156px] sm:items-stretch lg:h-[210px] lg:grid-cols-[210px_minmax(0,1fr)_168px]",
)

start = source.index("function SoldierStatTable(")
end = source.index("\nfunction SectionHeading", start)

replacement = '''function SoldierStatTable({ record }: { record: SoldierPrototypeRecord }) {
  const assetUrl = (folder: "stats" | "movement", fileName: string) =>
    `${import.meta.env.BASE_URL}images/shared/${folder}/${fileName}`;

  const movementIcons: Record<number, string> = {
    1: "Move_Ride.png",
    2: "Move_Walk.png",
    3: "Move_Water.png",
    4: "Move_Fly.png",
    5: "Move_FieldArmy.png",
  };

  const stats = [
    { label: "사거리", icon: assetUrl("stats", "Icon_Range.png"), value: record.combat.range },
    {
      label: "이동",
      icon: assetUrl("movement", movementIcons[record.combat.moveType] ?? "Move_Walk.png"),
      value: record.combat.move,
    },
    { label: "생명", icon: assetUrl("stats", "Icon_HP.png"), value: record.combat.hp },
    { label: "공격", icon: assetUrl("stats", "Icon_Attack.png"), value: record.combat.atk },
    { label: "방어", icon: assetUrl("stats", "Icon_Defense.png"), value: record.combat.def },
    { label: "마방", icon: assetUrl("stats", "Icon_MagicDefense.png"), value: record.combat.mdef },
  ];

  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-background sm:h-full sm:grid-cols-2 sm:grid-rows-3">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          title={stat.label}
          className={`flex min-h-[48px] items-center justify-center gap-1.5 px-1.5 py-1.5 sm:min-h-0 ${
            index % 2 === 0 ? "sm:border-r sm:border-border" : ""
          } ${index < 4 ? "sm:border-b sm:border-border" : ""}`}
        >
          <img
            src={stat.icon}
            alt=""
            aria-hidden="true"
            className="h-5 w-5 shrink-0 object-contain sm:h-6 sm:w-6"
          />
          <span className="text-sm font-black leading-none tabular-nums text-foreground sm:text-base">
            {stat.value}
          </span>
          <span className="sr-only">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
'''

source = source[:start] + replacement + source[end:]
path.write_text(source)
