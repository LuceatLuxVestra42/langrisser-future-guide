from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement target, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


server = "src/lib/hero-card-icon-assets.server.ts"
replace_once(
    server,
    'import heroCardIconJson from "../../data/generated/hero-card-icon-assets.v1.json";\n',
    'import heroCardIconJson from "../../data/generated/hero-card-icon-assets.v1.json";\nimport heroCardIconWebDeliveryJson from "../../data/generated/hero-card-icon-web-delivery.v1.json";\n',
)
replace_once(
    server,
    'const source = heroCardIconJson as unknown as HeroCardIconAssetSource;\n',
    '''type HeroCardIconWebDeliveryRecord = {\n  heroId: number;\n  sourcePngPath: string;\n  sourcePngSha256: string;\n  width: number;\n  height: number;\n  webDeliveryFormat: string;\n  webDeliveryMode: string;\n  webDeliveryPath: string;\n  webDeliveryFilePath: string;\n  webDeliverySha256: string;\n  webDeliveryByteLength: number;\n};\n\ntype HeroCardIconWebDeliverySource = {\n  version: number;\n  stage: string;\n  schemaId: string;\n  status: string;\n  completion: string;\n  freezeState: string;\n  sourceFreezeState: string;\n  sourcePolicy: {\n    pngAuthoritativeSourceRetained: boolean;\n    webDeliveryFormat: string;\n    semanticRelationReopened: boolean;\n    remoteRuntimeHotlink: boolean;\n  };\n  summary: {\n    heroCount: number;\n    sourcePngCount: number;\n    webDeliveryCount: number;\n    pendingCount: number;\n    hardErrorCount: number;\n    sourcePngTotalBytes: number;\n    webDeliveryTotalBytes: number;\n    webDeliverySavingsPercent: number;\n  };\n  records: HeroCardIconWebDeliveryRecord[];\n};\n\nconst source = heroCardIconJson as unknown as HeroCardIconAssetSource;\nconst delivery = heroCardIconWebDeliveryJson as unknown as HeroCardIconWebDeliverySource;\nconst deliveryByHeroId = new Map(delivery.records.map((row) => [row.heroId, row]));\n''',
)
replace_once(
    server,
    '  const ids = new Set<number>();\n',
    '''  if (\n    delivery.version !== 1 ||\n    delivery.stage !== "hero-card-icon-web-delivery" ||\n    delivery.schemaId !== "hero-card-icon-web-delivery/v1" ||\n    delivery.status !== "PASS" ||\n    delivery.completion !== "COMPLETE" ||\n    delivery.freezeState !== "HERO_CARD_ICON_WEB_DELIVERY_FROZEN" ||\n    delivery.sourceFreezeState !== source.freezeState ||\n    delivery.sourcePolicy.pngAuthoritativeSourceRetained !== true ||\n    delivery.sourcePolicy.webDeliveryFormat !== "LOSSLESS_WEBP" ||\n    delivery.sourcePolicy.semanticRelationReopened !== false ||\n    delivery.sourcePolicy.remoteRuntimeHotlink !== false ||\n    delivery.summary.heroCount !== 267 ||\n    delivery.summary.sourcePngCount !== 267 ||\n    delivery.summary.webDeliveryCount !== 267 ||\n    delivery.summary.pendingCount !== 0 ||\n    delivery.summary.hardErrorCount !== 0 ||\n    delivery.records.length !== 267 ||\n    delivery.summary.webDeliveryTotalBytes >= delivery.summary.sourcePngTotalBytes\n  ) {\n    throw new Error("Hero card icon lossless WebP delivery manifest is not production-ready.");\n  }\n\n  const ids = new Set<number>();\n''',
)
replace_once(
    server,
    '    ids.add(row.heroId);\n    if (\n      row.assetStatus !== "RESOLVED" ||\n',
    '''    ids.add(row.heroId);\n    const deliveryRow = deliveryByHeroId.get(row.heroId);\n    if (\n      !deliveryRow ||\n      deliveryRow.sourcePngPath !== row.webAssetPath ||\n      deliveryRow.sourcePngSha256 !== row.sha256 ||\n      deliveryRow.width !== row.width ||\n      deliveryRow.height !== row.height ||\n      deliveryRow.webDeliveryFormat !== "image/webp" ||\n      deliveryRow.webDeliveryMode !== "LOSSLESS" ||\n      deliveryRow.webDeliveryPath !== `/images/heroes/card-icons-webp/${row.heroId}.webp` ||\n      deliveryRow.webDeliveryFilePath !== `public/images/heroes/card-icons-webp/${row.heroId}.webp` ||\n      deliveryRow.webDeliveryByteLength <= 0\n    ) {\n      throw new Error(`Hero ${row.heroId} card icon WebP delivery row is invalid.`);\n    }\n    if (\n      row.assetStatus !== "RESOLVED" ||\n''',
)
replace_once(
    server,
    '      webAssetPath: row.webAssetPath,\n',
    '      webAssetPath: deliveryByHeroId.get(row.heroId)!.webDeliveryPath,\n',
)
replace_once(
    server,
    '      remoteRuntimeHotlink: source.sourcePolicy.remoteRuntimeHotlink,\n',
    '''      remoteRuntimeHotlink: source.sourcePolicy.remoteRuntimeHotlink,\n      webDeliveryFreezeState: delivery.freezeState,\n      webDeliveryFormat: delivery.sourcePolicy.webDeliveryFormat,\n      pngAuthoritativeSourceRetained: delivery.sourcePolicy.pngAuthoritativeSourceRetained,\n      webDeliverySavingsPercent: delivery.summary.webDeliverySavingsPercent,\n''',
)

validator = "scripts/validate-hero-card-icon-frontend.mjs"
replace_once(
    validator,
    "const validation = JSON.parse(fs.readFileSync('data/validation/hero-card-icon-assets.v1.json', 'utf8'));\n",
    "const validation = JSON.parse(fs.readFileSync('data/validation/hero-card-icon-assets.v1.json', 'utf8'));\nconst delivery = JSON.parse(fs.readFileSync('data/generated/hero-card-icon-web-delivery.v1.json', 'utf8'));\n",
)
replace_once(
    validator,
    "const files = fs.readdirSync('public/images/heroes/card-icons').filter((name) => /^\\d+\\.png$/.test(name));\nassert(files.length === 267, `expected 267 local card icons, got ${files.length}`);\n",
    """const files = fs.readdirSync('public/images/heroes/card-icons').filter((name) => /^\\d+\\.png$/.test(name));\nconst webpFiles = fs.readdirSync('public/images/heroes/card-icons-webp').filter((name) => /^\\d+\\.webp$/.test(name));\nassert(files.length === 267, `expected 267 authoritative PNG card icons, got ${files.length}`);\nassert(webpFiles.length === 267, `expected 267 WebP delivery card icons, got ${webpFiles.length}`);\nassert(delivery.status === 'PASS' && delivery.completion === 'COMPLETE', 'WebP delivery manifest must be complete');\nassert(delivery.freezeState === 'HERO_CARD_ICON_WEB_DELIVERY_FROZEN', 'WebP delivery freezeState mismatch');\nassert(delivery.sourceFreezeState === manifest.freezeState, 'WebP delivery predecessor freeze mismatch');\nassert(delivery.sourcePolicy?.pngAuthoritativeSourceRetained === true, 'authoritative PNG sources must be retained');\nassert(delivery.sourcePolicy?.webDeliveryFormat === 'LOSSLESS_WEBP', 'delivery format must be lossless WebP');\nassert(delivery.sourcePolicy?.semanticRelationReopened === false, 'WebP delivery must not reopen semantic relations');\nassert(delivery.summary?.heroCount === 267 && delivery.summary?.webDeliveryCount === 267, 'WebP delivery count must be 267');\nassert(delivery.summary?.pendingCount === 0 && delivery.summary?.hardErrorCount === 0, 'WebP delivery must have no pending/errors');\nassert(delivery.summary?.webDeliveryTotalBytes < delivery.summary?.sourcePngTotalBytes, 'WebP delivery must be smaller than PNG source set');\nconst deliveryByHeroId = new Map(delivery.records.map((row) => [row.heroId, row]));\n""",
)
replace_once(
    validator,
    "  assert(row.width > 0 && row.height > 0 && Math.abs(row.width - row.height) <= 8, `Hero ${row.heroId} icon is not square`);\n",
    """  assert(row.width > 0 && row.height > 0 && Math.abs(row.width - row.height) <= 8, `Hero ${row.heroId} icon is not square`);\n  const web = deliveryByHeroId.get(row.heroId);\n  assert(web?.sourcePngPath === row.webAssetPath, `Hero ${row.heroId} WebP predecessor path mismatch`);\n  assert(web?.sourcePngSha256 === row.sha256, `Hero ${row.heroId} WebP predecessor hash mismatch`);\n  assert(web?.webDeliveryMode === 'LOSSLESS', `Hero ${row.heroId} WebP delivery is not lossless`);\n  assert(web?.webDeliveryPath === `/images/heroes/card-icons-webp/${row.heroId}.webp`, `Hero ${row.heroId} WebP web path mismatch`);\n  assert(web?.webDeliveryFilePath === `public/images/heroes/card-icons-webp/${row.heroId}.webp`, `Hero ${row.heroId} WebP local path mismatch`);\n  assert(fs.existsSync(web?.webDeliveryFilePath ?? ''), `Hero ${row.heroId} WebP delivery missing`);\n""",
)
replace_once(
    validator,
    "assert(helper.includes('remoteRuntimeHotlink !== false'), 'server helper must reject remote-runtime hotlinking');\n",
    """assert(helper.includes('remoteRuntimeHotlink !== false'), 'server helper must reject remote-runtime hotlinking');\nassert(helper.includes('hero-card-icon-web-delivery.v1.json'), 'server helper must consume frozen WebP delivery manifest');\nassert(helper.includes('card-icons-webp'), 'server helper must expose WebP delivery paths');\n""",
)
replace_once(
    validator,
    "  localCardIconCount: files.length,\n",
    "  localCardIconCount: files.length,\n  webpDeliveryCount: webpFiles.length,\n  losslessWebpDelivery: true,\n  authoritativePngSourceRetained: true,\n  webDeliverySavingsPercent: delivery.summary.webDeliverySavingsPercent,\n",
)

hosted = "scripts/validate-hero-card-icons-hosted.mjs"
replace_once(
    hosted,
    '  check(sources.every((src) => src.includes("/images/heroes/card-icons/") && src.endsWith(".png")), `Hero list ${label} contains a non-card-icon source`);\n',
    '  check(sources.every((src) => src.includes("/images/heroes/card-icons-webp/") && src.endsWith(".webp")), `Hero list ${label} contains a non-WebP card-icon source`);\n',
)
replace_once(
    hosted,
    '  check(hero6State.src.includes("/images/heroes/card-icons/6.png"), `Hero 6 ${label} source mismatch: ${hero6State.src}`);\n',
    '  check(hero6State.src.includes("/images/heroes/card-icons-webp/6.webp"), `Hero 6 ${label} source mismatch: ${hero6State.src}`);\n',
)
replace_once(
    hosted,
    '  check(!src?.includes("/images/heroes/card-icons/"), "Hero detail incorrectly consumes list card icon asset");\n',
    '  check(!src?.includes("/images/heroes/card-icons-webp/"), "Hero detail incorrectly consumes list card icon WebP asset");\n',
)
replace_once(
    hosted,
    '  const representativeAssetResponse = await fetch(url(`images/heroes/card-icons/6.png?qa=${Date.now()}`), { cache: "no-store" });\n  check(representativeAssetResponse.ok, `Hosted Hero 6 card icon HTTP failed: ${representativeAssetResponse.status}`);\n  check((representativeAssetResponse.headers.get("content-type") || "").includes("image/png"), "Hosted Hero 6 card icon content type is not PNG");\n',
    '  const representativeAssetResponse = await fetch(url(`images/heroes/card-icons-webp/6.webp?qa=${Date.now()}`), { cache: "no-store" });\n  check(representativeAssetResponse.ok, `Hosted Hero 6 WebP card icon HTTP failed: ${representativeAssetResponse.status}`);\n  check((representativeAssetResponse.headers.get("content-type") || "").includes("image/webp"), "Hosted Hero 6 card icon content type is not WebP");\n',
)
replace_once(
    hosted,
    '    localFrozenAssets: true,\n',
    '    localFrozenAssets: true,\n    losslessWebpDelivery: true,\n    authoritativePngSourceRetained: true,\n',
)

deploy = ".github/workflows/project-doctor-authoritative-pages-deploy.yml"
replace_once(
    deploy,
    "          test -f dist/client/images/heroes/card-icons/6.png\n          test \"$(find dist/client/images/heroes/card-icons -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ')\" = '267'\n",
    """          test -f dist/client/images/heroes/card-icons/6.png\n          test \"$(find dist/client/images/heroes/card-icons -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ')\" = '267'\n          test -f dist/client/images/heroes/card-icons-webp/6.webp\n          test \"$(find dist/client/images/heroes/card-icons-webp -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')\" = '267'\n""",
)
replace_once(
    deploy,
    "          grep -q '/langrisser-future-guide/images/heroes/card-icons/6.png' dist/client/heroes/index.html\n",
    """          grep -q '/langrisser-future-guide/images/heroes/card-icons-webp/6.webp' dist/client/heroes/index.html\n          if grep -q '/langrisser-future-guide/images/heroes/card-icons/6.png' dist/client/heroes/index.html; then\n            echo 'Hero list still consumes PNG source instead of WebP delivery' >&2\n            exit 1\n          fi\n""",
)
replace_once(
    deploy,
    '            "heroCardIconFreezeState": "HERO_CARD_ICON_ASSETS_FROZEN",\n',
    '            "heroCardIconFreezeState": "HERO_CARD_ICON_ASSETS_FROZEN",\n            "heroCardIconWebDeliveryCount": 267,\n            "heroCardIconWebDeliveryFreezeState": "HERO_CARD_ICON_WEB_DELIVERY_FROZEN",\n            "heroCardIconWebDeliveryFormat": "LOSSLESS_WEBP",\n',
)
replace_once(
    deploy,
    "          printf 'heroCardIconFreezeState=HERO_CARD_ICON_ASSETS_FROZEN\\n'\n",
    "          printf 'heroCardIconFreezeState=HERO_CARD_ICON_ASSETS_FROZEN\\n'\n          printf 'heroCardIconWebDeliveryCount=267\\n'\n          printf 'heroCardIconWebDeliveryFreezeState=HERO_CARD_ICON_WEB_DELIVERY_FROZEN\\n'\n          printf 'heroCardIconWebDeliveryFormat=LOSSLESS_WEBP\\n'\n",
)

print("PASS_HERO_CARD_ICON_WEBP_CONSUMER_MIGRATION")
