const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const asset = JSON.parse(fs.readFileSync(path.join(root, 'data/configdata/ConfigDataSPSoldierInfo.json'), 'utf8'));
const b = Buffer.from(asset.m_bytes);

function readVarint(buffer, start) {
  let value = 0n, shift = 0n, offset = start;
  while (offset < buffer.length && shift <= 63n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: Number(value), offset };
    shift += 7n;
  }
  throw new Error(`invalid varint at ${start}`);
}

function parseFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const t = readVarint(buffer, offset); offset = t.offset;
    const field = t.value >>> 3, wire = t.value & 7;
    let value;
    if (wire === 0) { const r = readVarint(buffer, offset); offset = r.offset; value = r.value; }
    else if (wire === 1) { if (offset + 8 > buffer.length) throw new Error('fixed64'); value = buffer.subarray(offset, offset + 8); offset += 8; }
    else if (wire === 2) { const r = readVarint(buffer, offset); offset = r.offset; if (offset + r.value > buffer.length) throw new Error('len'); value = buffer.subarray(offset, offset + r.value); offset += r.value; }
    else if (wire === 5) { if (offset + 4 > buffer.length) throw new Error('fixed32'); value = buffer.subarray(offset, offset + 4); offset += 4; }
    else throw new Error(`wire=${wire}`);
    const list = fields.get(field) || []; list.push({wire,value}); fields.set(field,list);
  }
  return fields;
}
function fv(fields, field) {
  const e = (fields.get(field) || []).find(x => x.wire === 0);
  return e ? e.value : null;
}

console.log(`SP payload bytes=${b.length}`);

const candidates = [];
for (let p = 0; p + 4 <= b.length; p++) {
  const n = b.readUInt32BE(p);
  if (n < 8 || n > 512 || p + 4 + n > b.length) continue;
  try {
    const fields = parseFields(b.subarray(p + 4, p + 4 + n));
    const id = fv(fields, 2), normalId = fv(fields, 3);
    if (Number.isInteger(id) && Number.isInteger(normalId) && id > 0 && normalId > 0) {
      candidates.push({p,n,end:p+4+n,id,normalId});
    }
  } catch {}
}
console.log(`VALID_TOPLEVEL_CANDIDATES=${candidates.length}`);
console.log('CANDIDATES=' + JSON.stringify(candidates));

// Greedy chain starting from byte 0; when an expected header is invalid, resync to the next valid top-level candidate.
const chain = [];
let expected = 0;
while (expected < b.length) {
  const exact = candidates.find(c => c.p === expected);
  if (exact) {
    chain.push({...exact,gapBefore:0}); expected = exact.end; continue;
  }
  const next = candidates.find(c => c.p > expected);
  if (!next) break;
  chain.push({...next,gapBefore:next.p-expected});
  expected = next.end;
}
console.log(`GREEDY_CHAIN=${chain.length} final=${expected}/${b.length}`);
console.log('CHAIN=' + JSON.stringify(chain));

const gaps = [];
let prev = 0;
for (const c of chain) {
  if (c.p > prev) gaps.push({start:prev,end:c.p,len:c.p-prev,bytes:[...b.subarray(prev,Math.min(c.p,prev+256))]});
  prev = c.end;
}
if (prev < b.length) gaps.push({start:prev,end:b.length,len:b.length-prev,bytes:[...b.subarray(prev,Math.min(b.length,prev+256))]});
console.log('GAPS=' + JSON.stringify(gaps));

// Look for raw protobuf SP records in each gap by trying every [start,end) where end is next candidate boundary.
for (const gap of gaps) {
  const raw = [];
  for (let s = gap.start; s < gap.end; s++) {
    for (let e = s + 8; e <= gap.end; e++) {
      try {
        const fields = parseFields(b.subarray(s,e));
        const id = fv(fields,2), normalId = fv(fields,3);
        if (Number.isInteger(id) && Number.isInteger(normalId) && id > 0 && normalId > 0) raw.push({s,e,len:e-s,id,normalId});
      } catch {}
    }
  }
  console.log(`RAW_GAP_${gap.start}_${gap.end}=` + JSON.stringify(raw.slice(0,200)));
}
