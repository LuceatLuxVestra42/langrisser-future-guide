from pathlib import Path

p = Path('scripts/validate-authoritative-pages-hosted.mjs')
s = p.read_text(encoding='utf-8')

def one(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f'{label} count={count}')
    s = s.replace(old, new)

one(
    'const relation = JSON.parse(fs.readFileSync("data/generated/skin-stage2-3-bidirectional-relation.v1.json", "utf8"));\n',
    'const relation = JSON.parse(fs.readFileSync("data/generated/skin-stage2-3-bidirectional-relation.v1.json", "utf8"));\nconst fullartManifest = JSON.parse(fs.readFileSync("data/generated/skin-fullart-reference.v1.json", "utf8"));\n',
    'fullart authority import',
)

start = 'const heroRows = Object.entries(relation.byHeroId ?? {})'
end = 'const hero6VisualCount = hero6SkinIds.length + 1;'
if s.count(start) != 1 or s.count(end) != 1:
    raise RuntimeError('representative block anchors drift')
a = s.index(start)
b = s.index(end) + len(end)
replacement = '''const hero6SkinIds = Array.isArray(relation.byHeroId?.["6"]) ? relation.byHeroId["6"].map(Number) : [];
check(hero6SkinIds.length === 6, `Hero 6 frozen Skin count mismatch: ${hero6SkinIds.length}`);
const fullartRecords = Array.isArray(fullartManifest?.records) ? [...fullartManifest.records].sort((a, b) => a.sourceOrder - b.sourceOrder) : [];
const hero6FullartIds = fullartRecords.filter((record) => record.heroId === 6).map((record) => Number(record.skinId));
check(JSON.stringify(hero6FullartIds) === JSON.stringify(hero6SkinIds), `Hero 6 fullart admission mismatch: ${JSON.stringify(hero6FullartIds)}`);
for (const skinId of hero6FullartIds) await fetchWithRetry(`images/skin-fullart/${skinId}.webp`);
const hero6VisualCount = hero6FullartIds.length + 1;'''
s = s[:a] + replacement + s[b:]

start = '  let response = await page.goto(url(`heroes/${skinHero.heroId}/`), { waitUntil: "networkidle", timeout: 45000 });'
end = '  response = await page.goto(url("heroes/6/"), { waitUntil: "networkidle", timeout: 45000 });'
if s.count(start) != 1 or s.count(end) != 1:
    raise RuntimeError('legacy browser representative anchors drift')
a = s.index(start)
b = s.index(end) + len(end)
s = s[:a] + '  let response = await page.goto(url("heroes/6/"), { waitUntil: "networkidle", timeout: 45000 });' + s[b:]

old = '''  const hero6Next = page.getByRole("button", { name: "다음 일러스트" });
  check(await hero6Next.count() === 1, "Hero 6 next artwork control missing or duplicated");
  await hero6Next.click();
  await page.waitForTimeout(100);
  await page.getByText(`스킨 1 · ID ${hero6SkinIds[0]}`, { exact: true }).waitFor();
  const hero6FirstSkinImage = page.locator(`img[src*="/images/skins/${hero6SkinIds[0]}.png"]`);
  check(await hero6FirstSkinImage.count() === 1, "Hero 6 first Skin did not follow representative artwork");'''
new = '''  const hero6Next = page.getByRole("button", { name: "다음 일러스트" });
  const hero6Prev = page.getByRole("button", { name: "이전 일러스트" });
  check(await hero6Next.count() === 1 && await hero6Prev.count() === 1, "Hero 6 artwork controls missing or duplicated");
  for (let index = 0; index < hero6FullartIds.length; index += 1) {
    const skinId = hero6FullartIds[index];
    await hero6Next.click();
    await page.waitForTimeout(100);
    await page.getByText(`스킨 ${index + 1} · ID ${skinId}`, { exact: true }).waitFor();
    const image = page.locator(`img[src*="/images/skin-fullart/${skinId}.webp"]`);
    check(await image.count() === 1, `Hero 6 fullart Skin ${skinId} image missing or duplicated`);
    const imageState = await image.evaluate((node) => ({ complete: node.complete, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, objectFit: getComputedStyle(node).objectFit }));
    check(imageState.complete && imageState.naturalWidth > 0 && imageState.naturalHeight > 0, `Hero 6 fullart Skin ${skinId} image did not load`);
    check(imageState.objectFit === "contain", `Hero 6 fullart Skin ${skinId} object-fit=${imageState.objectFit}`);
    check(await page.locator(`img[src*="/images/skins/${skinId}.png"]`).count() === 0, `Hero 6 reintroduced legacy static Skin ${skinId}`);
  }
  await hero6Next.click();
  await page.waitForTimeout(100);
  await page.getByText("대표 일러스트", { exact: true }).waitFor();
  await page.getByText(`1 / ${hero6VisualCount}`, { exact: true }).waitFor();
  check((await page.locator('img[alt="레온 대표 일러스트"]').getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 carousel did not wrap back to representative artwork");'''
one(old, new, 'Hero 6 fullart cycle block')

old = '''    const mobileHeroArtwork = mobilePage.locator('img[alt="레온 대표 일러스트"]');
    check(await mobileHeroArtwork.count() === 1, "Hero 6 mobile representative artwork missing or duplicated");
    check((await mobileHeroArtwork.getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 mobile representative artwork source mismatch");'''
new = '''    const mobileHeroArtwork = mobilePage.locator('img[alt="레온 대표 일러스트"]');
    check(await mobileHeroArtwork.count() === 1, "Hero 6 mobile representative artwork missing or duplicated");
    check((await mobileHeroArtwork.getAttribute("src"))?.includes("/images/heroes/cards/6.png"), "Hero 6 mobile representative artwork source mismatch");
    const mobileNext = mobilePage.getByRole("button", { name: "다음 일러스트" });
    await mobileNext.click();
    await mobilePage.waitForTimeout(100);
    await mobilePage.getByText(`스킨 1 · ID ${hero6FullartIds[0]}`, { exact: true }).waitFor();
    const mobileFullart = mobilePage.locator(`img[src*="/images/skin-fullart/${hero6FullartIds[0]}.webp"]`);
    check(await mobileFullart.count() === 1, "Hero 6 mobile first fullart Skin missing or duplicated");
    const mobileFullartState = await mobileFullart.evaluate((node) => ({ complete: node.complete, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, objectFit: getComputedStyle(node).objectFit }));
    check(mobileFullartState.complete && mobileFullartState.naturalWidth > 0 && mobileFullartState.naturalHeight > 0, "Hero 6 mobile first fullart Skin did not load");
    check(mobileFullartState.objectFit === "contain", `Hero 6 mobile fullart object-fit=${mobileFullartState.objectFit}`);'''
one(old, new, 'mobile fullart block')

one(
    '    skinRepresentative: { heroId: skinHero.heroId, firstSkinId, secondSkinId },',
    '    skinFullart: { heroId: 6, skinIds: hero6FullartIds, cycle: "BASE_TO_6_SKINS_TO_BASE_PASS", legacyStaticHeroDetailConsumption: false },',
    'result output',
)

p.write_text(s, encoding='utf-8')
