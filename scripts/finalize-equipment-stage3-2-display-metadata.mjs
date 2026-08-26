import fs from 'node:fs';
import path from 'node:path';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const outPath = 'data/generated/equipment_stage3_2_display_metadata.json';
const sheetId = '1RZFY2N3RU-vctduO_Tg2e4RVoZvJAAveiMgPnW6VTQg';
const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

function scoreRows(rows, keys = []) {
  if (!Array.isArray(rows)) return -1;
  let score = 0;
  for (const row of rows.slice(0, 100)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const key of keys) if (key in row) score += 2;
    if ('ID' in row) score += 2;
  }
  return score;
}
function extractRows(doc, keys = []) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') throw new Error('Unsupported JSON root');
  const arrays = Object.values(doc).filter(Array.isArray).map(v => ({ v, score: scoreRows(v, keys) }))
    .sort((a, b) => b.score - a.score || b.v.length - a.v.length);
  if (arrays.length && arrays[0].score > 0) return arrays[0].v;
  throw new Error('No record array found');
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
async function fetchSheet(title) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'langrisser-future-guide-stage3-2' } });
  if (!res.ok) throw new Error(`Google Sheet fetch failed ${title}: ${res.status}`);
  return parseCsv(await res.text());
}
function clean(v) { return v == null ? '' : String(v).replace(/\r/g, '\n').replace(/\n+/g, '\n').trim(); }
function normalizeNameCell(v, allowParenthetical) {
  const raw = clean(v).replace(/\s*\n\s*/g, ' ').trim();
  if (!allowParenthetical) return { nameKr: raw || null, raw: raw || null };
  const groups = [...raw.matchAll(/\(([^()]+)\)/g)].map(m => m[1].trim()).filter(Boolean);
  return { nameKr: (groups.at(-1) || raw || null), raw: raw || null };
}
function slotFromText(v) {
  const t = clean(v);
  if (t.includes('무기')) return 0;
  if (t.includes('갑옷')) return 1;
  if (t.includes('투구')) return 2;
  if (t.includes('장신구')) return 3;
  return null;
}
function parseDate(v) {
  const m = clean(v).match(/(20\d\d)[.-](\d\d)[.-](\d\d)/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function parseStats(v) {
  const rows = [];
  for (const line of clean(v).split('\n')) {
    const m = line.match(/(생명|공격|방어력|방어|지력|마방|기술|치명)\s*([+-]?\d+(?:\.\d+)?)/);
    if (!m) continue;
    const key = ({ 방어력: '방어', 치명: '기술' })[m[1]] || m[1];
    const num = Number(m[2]);
    rows.push([key, num]);
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}
function nums(v) {
  const found = [];
  for (const m of clean(v).matchAll(/(?<!\d)([+-]?\d+(?:\.\d+)?)(?!\d)/g)) found.push(Number(m[1]));
  return found.sort((a, b) => a - b);
}
const statsKey = rows => rows.map(([k, v]) => `${k}:${v}`).join(';');
const numsKey = values => values.join(',');
function statLabels(key) { return key.split(';').filter(Boolean).map(x => x.split(':')[0]).sort().join(';'); }
function overlapCount(aKey, bKey) {
  const a = aKey ? aKey.split(',') : [], b = bKey ? bKey.split(',') : [];
  const counts = new Map();
  for (const x of b) counts.set(x, (counts.get(x) || 0) + 1);
  let n = 0;
  for (const x of a) if ((counts.get(x) || 0) > 0) { n++; counts.set(x, counts.get(x) - 1); }
  return n;
}

const acquisition = load('data/generated/equipment_stage2_7_acquisition.json');
const filters = load('data/generated/equipment_stage2_3_filter_map.json');
const stats = load('data/generated/equipment_stage2_4_stats.json');
const effects = load('data/generated/equipment_stage2_5_effects.json');
const equipmentRows = extractRows(load('data/configdata/ConfigDataEquipmentInfo.json'), ['ID', 'Name', 'Icon', 'Rank']);
const filterById = new Map(filters.records.map(r => [Number(r.id), r]));
const statsById = new Map(stats.records.map(r => [Number(r.id), r]));
const effectById = new Map(effects.records.map(r => [Number(r.equipmentId), r]));
const equipmentById = new Map(equipmentRows.map(r => [Number(r.ID), r]));

const pageReadyClasses = new Set(['launch', 'legacy-additional', 'current-additional', 'exclusive-equipment']);
const candidates = acquisition.records.map(a => {
  const id = Number(a.equipmentId), f = filterById.get(id), s = statsById.get(id), e = effectById.get(id), raw = equipmentById.get(id);
  return {
    id, nameCn: a.nameCn, acquisitionClass: a.acquisitionClass, releaseGroupDate: a.releaseGroupDate ?? null,
    equipmentType: Number(a.equipmentType), subtypeKo: f?.subtypeKo ?? null,
    statKey: statsKey((s?.stats ?? []).map(x => [String(x.propertyKo), Number(x.maxValue)]).sort((x, y) => x[0].localeCompare(y[0], 'ko'))),
    effectNumsKey: numsKey(nums(e?.effectText ?? '')), icon: raw?.Icon == null ? null : String(raw.Icon), sortIndex: Number(a.sortIndex),
    pageReady: pageReadyClasses.has(a.acquisitionClass)
  };
});

const sourceRows = [];
const launchSheets = [
  ['무기(SSR)', 0], ['갑옷(SSR)', 1], ['투구(SSR)', 2], ['장신구(SSR)', 3]
];
for (const [title, slot] of launchSheets) {
  const rows = await fetchSheet(title);
  let subtypeKo = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], a = clean(r[0]), b = clean(r[1]);
    if (title === '장신구(SSR)' && ['공격형', '지력형', '방어형', '생명형', '치료형'].includes(a)) {
      subtypeKo = ({ 공격형: '공격', 지력형: '지력', 방어형: '방어', 생명형: '방어', 치료형: '치료' })[a];
    } else if (title !== '장신구(SSR)' && a.includes(':') && !a.startsWith('http')) {
      const head = a.split(':')[0].trim(); subtypeKo = head === '단검' ? '비수' : head;
    }
    if (!b || b === '명칭' || i < 2) continue;
    const nm = normalizeNameCell(b, false);
    sourceRows.push({ sourceClass: 'launch', sheet: title, row: i + 1, nameKr: nm.nameKr, sourceCell: nm.raw,
      equipmentType: slot, subtypeKo, releaseDate: null, statKey: statsKey(parseStats(r[2])), effectNumsKey: numsKey(nums(r[3])) });
  }
}
{
  const rows = await fetchSheet('추가장비'); let date = null;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]; date = parseDate(r[0]) || date; const name = clean(r[3]); if (!name) continue;
    const nm = normalizeNameCell(name, true);
    sourceRows.push({ sourceClass: 'legacy-additional', sheet: '추가장비', row: i + 1, nameKr: nm.nameKr, sourceCell: nm.raw,
      equipmentType: slotFromText(r[4]), subtypeKo: null, releaseDate: date, statKey: statsKey(parseStats(r[6])), effectNumsKey: numsKey(nums(r[7])) });
  }
}
{
  const rows = await fetchSheet('전용장비'); let date = null;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]; date = parseDate(r[0]) || date; const name = clean(r[2]); if (!name) continue;
    const nm = normalizeNameCell(name, false);
    sourceRows.push({ sourceClass: 'exclusive-equipment', sheet: '전용장비', row: i + 1, nameKr: nm.nameKr, sourceCell: nm.raw,
      equipmentType: slotFromText(r[4]), subtypeKo: null, releaseDate: date, statKey: statsKey(parseStats(r[5])), effectNumsKey: numsKey(nums(r[6])) });
  }
}

function score(ref, c) {
  if (ref.sourceClass !== c.acquisitionClass || ref.equipmentType !== c.equipmentType) return -Infinity;
  if (ref.subtypeKo && ref.subtypeKo !== c.subtypeKo) return -Infinity;
  if (ref.sourceClass === 'legacy-additional' && ref.releaseDate !== c.releaseGroupDate) return -Infinity;
  let n = 0;
  if (ref.statKey && ref.statKey === c.statKey) n += 8;
  else if (ref.statKey && statLabels(ref.statKey) === statLabels(c.statKey)) n += 2;
  if (ref.effectNumsKey === c.effectNumsKey) n += 8;
  else {
    n += Math.min(4, overlapCount(ref.effectNumsKey, c.effectNumsKey));
    if (ref.effectNumsKey.split(',').length === c.effectNumsKey.split(',').length) n += 1;
  }
  if (ref.sourceClass === 'legacy-additional') n += 10;
  return n;
}

const matchById = new Map();
function mutualBestMatch(refs, pool, threshold, method) {
  const remainingRefs = new Set(refs), remainingCandidates = new Set(pool);
  let changed = true;
  while (changed) {
    changed = false;
    const refBest = new Map(), candBest = new Map();
    for (const r of remainingRefs) {
      let best = -Infinity, items = [];
      for (const c of remainingCandidates) {
        const s = score(r, c); if (s > best) { best = s; items = [c]; } else if (s === best) items.push(c);
      }
      refBest.set(r, { best, items });
    }
    for (const c of remainingCandidates) {
      let best = -Infinity, items = [];
      for (const r of remainingRefs) {
        const s = score(r, c); if (s > best) { best = s; items = [r]; } else if (s === best) items.push(r);
      }
      candBest.set(c, { best, items });
    }
    for (const r of [...remainingRefs]) {
      const rb = refBest.get(r); if (rb.best < threshold || rb.items.length !== 1) continue;
      const c = rb.items[0], cb = candBest.get(c);
      if (!cb || cb.best !== rb.best || cb.items.length !== 1 || cb.items[0] !== r) continue;
      matchById.set(c.id, { ref: r, score: rb.best, method, accepted: true });
      remainingRefs.delete(r); remainingCandidates.delete(c); changed = true;
    }
  }
  return { remainingRefs: [...remainingRefs], remainingCandidates: [...remainingCandidates] };
}

const launchRefs = sourceRows.filter(r => r.sourceClass === 'launch');
const legacyRefs = sourceRows.filter(r => r.sourceClass === 'legacy-additional');
const exclusiveRefs = sourceRows.filter(r => r.sourceClass === 'exclusive-equipment');
mutualBestMatch(launchRefs, candidates.filter(c => c.acquisitionClass === 'launch'), 14, 'mutual-best-signature');
mutualBestMatch(legacyRefs, candidates.filter(c => c.acquisitionClass === 'legacy-additional'), 18, 'release-group-mutual-best');

// Exclusive equipment: evidence first, monotonic order only as a disambiguation constraint.
const exCands = candidates.filter(c => c.acquisitionClass === 'exclusive-equipment').sort((a, b) => a.sortIndex - b.sortIndex);
const R = exclusiveRefs, C = exCands;
const dp = Array.from({ length: R.length + 1 }, () => new Float64Array(C.length + 1));
const take = Array.from({ length: R.length + 1 }, () => new Uint8Array(C.length + 1));
for (let i = 1; i <= R.length; i++) {
  for (let j = 1; j <= C.length; j++) {
    let best = dp[i - 1][j], code = 1;
    if (dp[i][j - 1] > best) { best = dp[i][j - 1]; code = 2; }
    const s = score(R[i - 1], C[j - 1]);
    if (s >= 12 && dp[i - 1][j - 1] + s > best) { best = dp[i - 1][j - 1] + s; code = 3; }
    dp[i][j] = best; take[i][j] = code;
  }
}
let i = R.length, j = C.length;
while (i > 0 && j > 0) {
  const code = take[i][j];
  if (code === 3) {
    const r = R[i - 1], c = C[j - 1], s = score(r, c);
    matchById.set(c.id, { ref: r, score: s, method: 'signature-plus-monotonic-order', accepted: s >= 16 }); i--; j--;
  } else if (code === 1) i--; else j--;
}

const records = candidates.map(c => {
  const m = matchById.get(c.id);
  let nameKr = null, nameKrStatus = 'REVIEW_NAME_KR', nameKrCandidate = null, nameKrSource = null;
  if (m) {
    nameKrCandidate = m.ref.nameKr;
    nameKrSource = { url: sheetUrl, sheet: m.ref.sheet, row: m.ref.row, sourceCell: m.ref.sourceCell, matchScore: m.score, method: m.method };
    if (m.accepted) { nameKr = m.ref.nameKr; nameKrStatus = 'VERIFIED_REFERENCE_MATCH'; }
    else nameKrStatus = 'REVIEW_REFERENCE_MATCH';
  }
  return {
    equipmentId: c.id, nameCn: c.nameCn, acquisitionClass: c.acquisitionClass, pageReady: c.pageReady,
    nameKr, nameKrStatus, nameKrCandidate, nameKrSource,
    icon: c.icon, iconStatus: c.icon ? 'VERIFIED_DIRECT' : 'FAIL_MISSING_ICON'
  };
});

const countBy = (key, value, scope = records) => scope.filter(r => r[key] === value).length;
const pageReady = records.filter(r => r.pageReady);
const summary = {
  canonical: records.length, pageReady: pageReady.length,
  iconVerifiedPageReady: countBy('iconStatus', 'VERIFIED_DIRECT', pageReady),
  nameKrStatusPageReady: Object.fromEntries(['VERIFIED_REFERENCE_MATCH', 'REVIEW_REFERENCE_MATCH', 'REVIEW_NAME_KR'].map(k => [k, countBy('nameKrStatus', k, pageReady)])),
  verifiedByClass: Object.fromEntries(['launch', 'legacy-additional', 'current-additional', 'exclusive-equipment'].map(k => [k, pageReady.filter(r => r.acquisitionClass === k && r.nameKrStatus === 'VERIFIED_REFERENCE_MATCH').length])),
  sourceRows: { launch: launchRefs.length, legacyAdditional: legacyRefs.length, exclusiveNamed: exclusiveRefs.length }
};
const result = {
  stage: '3-2', status: summary.iconVerifiedPageReady === pageReady.length ? 'COMPLETE_WITH_REVIEW' : 'FAIL',
  source: { koreanSheet: sheetUrl, icon: 'data/configdata/ConfigDataEquipmentInfo.json' },
  policy: { noInventedTranslation: true, primaryKey: 'equipmentId', stage2SemanticsReopened: false },
  summary, records
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, ...summary }, null, 2));
