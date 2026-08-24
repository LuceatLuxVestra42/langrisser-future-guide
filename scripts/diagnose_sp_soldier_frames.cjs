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

function prefixAt(p) {
  if (p + 7 > b.length) return null;
  const n = b.readUInt32BE(p);
  if (n < 8 || n > 512 || p + 4 + n > b.length || b[p + 4] !== 16) return null;
  try {
    const idr = readVarint(b, p + 5);
    if (b[idr.offset] !== 24) return null;
    const nr = readVarint(b, idr.offset + 1);
    if (!Number.isInteger(idr.value) || !Number.isInteger(nr.value) || idr.value <= 0 || nr.value <= 0) return null;
    return {p,n,end:p+4+n,id:idr.value,normalId:nr.value,prefixEnd:nr.offset};
  } catch { return null; }
}

console.log(`SP payload bytes=${b.length}`);
const prefixes = [];
for (let p = 0; p + 4 <= b.length; p++) {
  const x = prefixAt(p);
  if (x && x.id >= 5000 && x.id < 7000 && x.normalId > 0 && x.normalId < 2000) prefixes.push(x);
}
console.log(`HEADER_PREFIX_CANDIDATES=${prefixes.length}`);
console.log('PREFIXES=' + JSON.stringify(prefixes));

const sequential = [];
let cursor = 0;
while (cursor < b.length) {
  const exact = prefixes.find(x => x.p === cursor);
  if (exact) { sequential.push({...exact,gapBefore:0}); cursor = exact.end; continue; }
  const next = prefixes.find(x => x.p > cursor);
  if (!next) break;
  sequential.push({...next,gapBefore:next.p-cursor}); cursor = next.end;
}
console.log(`PREFIX_CHAIN=${sequential.length} final=${cursor}/${b.length}`);
console.log('PREFIX_CHAIN_DATA=' + JSON.stringify(sequential));

const asciiRuns = [];
let s = null;
for (let i = 0; i <= b.length; i++) {
  const printable = i < b.length && b[i] >= 32 && b[i] <= 126;
  if (printable && s === null) s = i;
  if ((!printable || i === b.length) && s !== null) {
    if (i - s >= 8) asciiRuns.push({start:s,end:i,text:b.subarray(s,i).toString('ascii')});
    s = null;
  }
}
console.log('ASCII_RUNS=' + JSON.stringify(asciiRuns));

const uniquePairs = new Map();
for (const x of prefixes) uniquePairs.set(`${x.id}:${x.normalId}`, x);
console.log(`UNIQUE_PREFIX_PAIRS=${uniquePairs.size}`);
