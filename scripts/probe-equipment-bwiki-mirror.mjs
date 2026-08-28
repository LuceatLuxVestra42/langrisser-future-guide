import crypto from 'node:crypto';

const probes = [
  { equipmentId: 6, nameCn: '夜鹰', expectedSha256: '4a58142e159ae0df9b941e1182e006a197ae299ba031c6acca93d679227f566d' },
  { equipmentId: 59, nameCn: '埃尼亚斯之甲', expectedSha256: 'd7a8b62a6d7c09daa5ee01aa1686c12eaada9fa8e767b23739c2a2ef59f82699' },
  { equipmentId: 80, nameCn: '埃尼亚斯之盔', expectedSha256: '773e1ba326105eba3e47e64363bf417d86402cffc95eb7e4aba87f2fbefa71c8' },
  { equipmentId: 99, nameCn: '神翼护胫', expectedSha256: 'b1d0c0a7ce6f45c6391b75b36a1c3be39ea9021ae57778a734053a5be9cf1828' },
  { equipmentId: 273, nameCn: '流浪的骑士', expectedSha256: 'fff84e6beaf9793017abea71b6cfddf0cca73cd8256cb22a6f840c1187f38f82' },
];

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

function htmlDecode(s) {
  return s.replaceAll('&amp;', '&').replaceAll('&#47;', '/');
}

function rawCandidatesFromHtml(html) {
  const urls = new Set();
  const re = /https:\/\/patchwiki\.biligame\.com\/images\/langrisser\/thumb\/[^"'<>\s]+/g;
  for (const m of html.matchAll(re)) {
    const u = htmlDecode(m[0]);
    const marker = '/thumb/';
    const i = u.indexOf(marker);
    if (i < 0) continue;
    const after = u.slice(i + marker.length);
    const parts = after.split('/');
    if (parts.length < 4) continue;
    const rawRel = parts.slice(0, 3).join('/');
    urls.add(`https://patchwiki.biligame.com/images/langrisser/${rawRel}`);
  }
  return [...urls];
}

async function fetchBytes(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

let pass = 0;
for (const p of probes) {
  const pageUrl = `https://wiki.biligame.com/langrisser/${encodeURIComponent(p.nameCn)}`;
  const page = await fetch(pageUrl, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!page.ok) throw new Error(`${p.nameCn}: page HTTP ${page.status}`);
  const html = await page.text();
  const candidates = rawCandidatesFromHtml(html);
  let matched = null;
  const checked = [];
  for (const url of candidates) {
    try {
      const bytes = await fetchBytes(url);
      const digest = sha256(bytes);
      checked.push({ url, bytes: bytes.length, sha256: digest });
      if (digest === p.expectedSha256) { matched = checked.at(-1); break; }
    } catch (e) {
      checked.push({ url, error: String(e) });
    }
  }
  console.log(JSON.stringify({ equipmentId: p.equipmentId, nameCn: p.nameCn, pageUrl, candidateCount: candidates.length, matched, checked }, null, 2));
  if (!matched) throw new Error(`${p.nameCn}: no BWiki original candidate matched frozen Drive SHA`);
  pass++;
}
if (pass !== probes.length) throw new Error(`Mirror probe ${pass}/${probes.length}`);
console.log(`BWIKI_RAW_MIRROR_SHA_PARITY_PASS ${pass}/${probes.length}`);
