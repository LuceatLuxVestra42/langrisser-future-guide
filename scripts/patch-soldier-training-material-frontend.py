#!/usr/bin/env python3
from pathlib import Path

TARGET = Path('src/components/soldier-detail-modal.tsx')
text = TARGET.read_text(encoding='utf-8')

old_import = '''import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";\nimport type { SoldierPrototypeRecord } from "@/lib/soldier-page.server";'''
new_import = '''import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";\nimport {\n  getSoldierTrainingMaterialAsset,\n  getSoldierTrainingMaterialUrl,\n} from "@/lib/soldier-training-material-assets";\nimport type { SoldierPrototypeRecord } from "@/lib/soldier-page.server";'''

if new_import not in text:
    if old_import not in text:
        raise RuntimeError('expected Soldier detail import anchor not found')
    text = text.replace(old_import, new_import, 1)

old_block = '''        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {totals.materials.map((material) => (
            <div
              key={`${material.goodsType}:${material.itemId}`}
              className="rounded-lg border border-border bg-background px-2.5 py-2"
            >
              <p className="truncate text-[10px] font-semibold text-muted-foreground">
                아이템 #{material.itemId}
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums text-foreground">× {material.count}</p>
            </div>
          ))}
        </div>'''

new_block = '''        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {totals.materials.map((material) => {
            const asset = material.goodsType === 6
              ? getSoldierTrainingMaterialAsset(material.itemId)
              : null;
            const imageUrl = material.goodsType === 6
              ? getSoldierTrainingMaterialUrl(material.itemId)
              : null;
            const label = asset?.name ?? `아이템 #${material.itemId}`;

            return (
              <div
                key={`${material.goodsType}:${material.itemId}`}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
              >
                {imageUrl && asset ? (
                  <img
                    src={imageUrl}
                    alt=""
                    aria-hidden="true"
                    width={asset.width}
                    height={asset.height}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-black text-muted-foreground sm:h-11 sm:w-11"
                    aria-hidden="true"
                  >
                    #
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className="truncate text-[10px] font-semibold text-muted-foreground"
                    title={label}
                  >
                    {label}
                  </p>
                  <p className="mt-0.5 text-base font-black tabular-nums text-foreground">
                    × {formatNumber(material.count)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>'''

if new_block not in text:
    if old_block not in text:
        raise RuntimeError('expected TrainingSimulator material block not found')
    text = text.replace(old_block, new_block, 1)

TARGET.write_text(text, encoding='utf-8')
print('Soldier training material frontend patch applied')
