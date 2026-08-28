import crypto from 'node:crypto';

const pageUrl = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html';
const ua = { 'user-agent': 'Mozilla/5.0' };
const r = await fetch(pageUrl, { headers: ua, redirect: 'follow' });
if (!r.ok) throw new Error(`download page HTTP ${r.status}`);
const html = await r.text();

const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
const srcs = [...html.matchAll(/src\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
const candidates = [...new Set([...hrefs, ...srcs])]
  .filter(x => /download|\.zip(?:\?|$)|\.exe(?:\?|$)|\.7z(?:\?|$)|\.rar(?:\?|$)|\.msi(?:\?|$)/i.test(x));

function abs(u) { try { return new URL(u, pageUrl).href; } catch { return null; } }
const resolved = candidates.map(abs).filter(Boolean);
const checks = [];
for (const url of resolved) {
  try {
    const h = await fetch(url, { method: 'HEAD', headers: ua, redirect: 'follow' });
    checks.push({ url, status: h.status, finalUrl: h.url, contentType: h.headers.get('content-type'), contentLength: h.headers.get('content-length'), disposition: h.headers.get('content-disposition') });
  } catch (e) {
    checks.push({ url, error: String(e) });
  }
}
console.log(JSON.stringify({ pageUrl, candidateCount: resolved.length, checks }, null, 2));
if (!resolved.length) throw new Error('No installer/download candidate links found');
