export async function loadHero(heroId) {
  const response = await fetch('../generated/manifest.json');
  if (!response.ok) throw new Error('manifest unavailable');
  const manifest = await response.json();
  const record = manifest.records.find((row) => row.heroId === Number(heroId));
  if (!record) throw new Error('hero asset unavailable');
  const image = document.querySelector('#hero-art');
  image.src = '../' + record.asset;
  return record.asset;
}
loadHero(6);
