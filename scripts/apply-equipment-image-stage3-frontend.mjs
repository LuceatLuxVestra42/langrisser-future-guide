import fs from "node:fs";

const GENERAL_ROUTE = "src/routes/equipment.tsx";
const EXCLUSIVE_ROUTE = "src/routes/equipment_.exclusive.tsx";
const DETAIL_ROUTE = "src/routes/equipment_.$equipmentId.tsx";

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`Equipment Stage 3 integration marker missing: ${label}`);
  }
  return source.replace(needle, replacement);
}

function writeIfChanged(path, next) {
  const current = fs.readFileSync(path, "utf8");
  if (current === next) return false;
  fs.writeFileSync(path, next);
  return true;
}

function integrateGeneralRoute() {
  const source = fs.readFileSync(GENERAL_ROUTE, "utf8");
  if (source.includes('import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";')) {
    return false;
  }

  let next = source;
  next = replaceRequired(
    next,
    'import { Crown, Gem, Shield, Swords } from "lucide-react";\n',
    "",
    "general legacy placeholder icon import",
  );
  next = replaceRequired(
    next,
    'import { getGeneralEquipmentPageData } from "@/lib/equipment-page.functions";\n',
    'import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";\nimport { getGeneralEquipmentPageData } from "@/lib/equipment-page.functions";\n',
    "general asset resolver import",
  );

  const legacyPlaceholder = `function EquipmentPlaceholder({ record }: { record: EquipmentListRecord }) {
  const iconClass = "h-10 w-10 sm:h-12 sm:w-12";

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted pb-6 text-muted-foreground transition group-hover:text-foreground">
      {record.group === "weapon" ? (
        <Swords className={iconClass} strokeWidth={1.35} aria-hidden="true" />
      ) : record.group === "armor" ? (
        <Shield className={iconClass} strokeWidth={1.35} aria-hidden="true" />
      ) : record.group === "headgear" ? (
        <Crown className={iconClass} strokeWidth={1.35} aria-hidden="true" />
      ) : (
        <Gem className={iconClass} strokeWidth={1.35} aria-hidden="true" />
      )}
    </div>
  );
}
`;

  const officialImage = `function EquipmentPlaceholder({ record }: { record: EquipmentListRecord }) {
  const imageUrl = getOfficialEquipmentImageUrl(record.equipmentId);

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/35 pb-6">
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain p-1 pb-2 transition duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}
`;

  next = replaceRequired(next, legacyPlaceholder, officialImage, "general image card");
  return writeIfChanged(GENERAL_ROUTE, next);
}

function integrateExclusiveRoute() {
  const source = fs.readFileSync(EXCLUSIVE_ROUTE, "utf8");
  if (source.includes('import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";')) {
    return false;
  }

  let next = replaceRequired(
    source,
    'import { getExclusiveEquipmentPageData } from "@/lib/equipment-page.functions";\n',
    'import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";\nimport { getExclusiveEquipmentPageData } from "@/lib/equipment-page.functions";\n',
    "exclusive asset resolver import",
  );

  const insertionPoint = `                  </div>

                  <div className="flex flex-1 flex-col p-4">`;
  const imageBlock = `                  </div>

                  <div className="flex items-center justify-center border-b border-border bg-muted/20 px-4 py-4">
                    <img
                      src={getOfficialEquipmentImageUrl(record.equipmentId)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-28 object-contain transition duration-200 group-hover:scale-[1.03]"
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-4">`;

  next = replaceRequired(next, insertionPoint, imageBlock, "exclusive image card");
  return writeIfChanged(EXCLUSIVE_ROUTE, next);
}

function integrateDetailRoute() {
  const source = fs.readFileSync(DETAIL_ROUTE, "utf8");
  if (source.includes('import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";')) {
    return false;
  }

  let next = replaceRequired(
    source,
    'import { getEquipmentDetailPageData } from "@/lib/equipment-page.functions";\n',
    'import { getOfficialEquipmentImageUrl } from "@/lib/equipment-image-assets";\nimport { getEquipmentDetailPageData } from "@/lib/equipment-page.functions";\n',
    "detail asset resolver import",
  );

  const headerSignature = `  equipmentId: number;
}) {
  return (
    <header className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">`;
  const headerWithImageUrl = `  equipmentId: number;
}) {
  const imageUrl = getOfficialEquipmentImageUrl(equipmentId);

  return (
    <header className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">`;
  next = replaceRequired(next, headerSignature, headerWithImageUrl, "detail image resolver");

  const headerLayout = `      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">`;
  const headerLayoutWithImage = `      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex shrink-0 items-center justify-center self-start rounded-2xl border border-border bg-muted/25 p-2">
          <img
            src={imageUrl}
            alt={\`${displayName} 장비 이미지\`}
            decoding="async"
            className="h-28 w-28 object-contain sm:h-32 sm:w-32"
          />
        </div>

        <div className="min-w-0 flex-1">`;
  next = replaceRequired(next, headerLayout, headerLayoutWithImage, "detail header image");

  return writeIfChanged(DETAIL_ROUTE, next);
}

const changed = [
  [GENERAL_ROUTE, integrateGeneralRoute()],
  [EXCLUSIVE_ROUTE, integrateExclusiveRoute()],
  [DETAIL_ROUTE, integrateDetailRoute()],
].filter(([, didChange]) => didChange);

console.log(
  JSON.stringify(
    {
      stage: "Equipment Image Stage 3 Frontend Integration",
      changedFiles: changed.map(([path]) => path),
      changedCount: changed.length,
    },
    null,
    2,
  ),
);
