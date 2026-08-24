const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data/configdata', name), 'utf8'));
}

function diagnose(name) {
  const asset = load(name);
  const b = Buffer.from(asset.m_bytes);
  let offset = 0;
  let frames = 0;
  let last = [];
  while (offset < b.length) {
    if (offset + 4 > b.length) break;
    const at = offset;
    const be = b.readUInt32BE(offset);
    const le = b.readUInt32LE(offset);
    if (offset + 4 + be > b.length) {
      console.log(`\n${name} failure after frames=${frames} offset=${at} total=${b.length}`);
      console.log(`bytes[${Math.max(0, at - 32)}..${Math.min(b.length, at + 96)}]=${[...b.subarray(Math.max(0, at - 32), Math.min(b.length, at + 96))].join(',')}`);
      console.log(`BE=${be} LE=${le}`);
      console.log(`previous=${JSON.stringify(last.slice(-8))}`);
      console.log('plausible BE headers in next 128 bytes:');
      const candidates = [];
      for (let i = at + 1; i + 4 <= Math.min(b.length, at + 128); i++) {
        const len = b.readUInt32BE(i);
        if (len > 0 && len < 5000 && i + 4 + len <= b.length) candidates.push({ at: i, len });
      }
      console.log(JSON.stringify(candidates.slice(0, 30)));
      return;
    }
    last.push({ at, len: be });
    if (last.length > 16) last.shift();
    offset += 4 + be;
    frames++;
  }
  console.log(`${name}: full BE framing PASS frames=${frames}`);
}

diagnose('ConfigDataHeroInfo.json');
diagnose('ConfigDataMissionInfo.json');
process.exit(1);
