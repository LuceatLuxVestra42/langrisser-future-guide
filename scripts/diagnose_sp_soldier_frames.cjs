const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const asset = JSON.parse(fs.readFileSync(path.join(root, 'data/configdata/ConfigDataSPSoldierInfo.json'), 'utf8'));
const b = Buffer.from(asset.m_bytes);
console.log(`SP payload bytes=${b.length}`);
let offset = 0;
let index = 0;
const history = [];
while (offset < b.length) {
  if (offset + 4 > b.length) {
    console.log(`TRUNCATED_HEADER offset=${offset}`);
    break;
  }
  const header = offset;
  const len = b.readUInt32BE(offset);
  offset += 4;
  if (len <= 0 || offset + len > b.length) {
    console.log(`INVALID index=${index} header=${header} len=${len} remaining=${b.length-offset}`);
    console.log('HISTORY=' + JSON.stringify(history.slice(-20)));
    console.log('NEXT96=' + JSON.stringify([...b.subarray(header, Math.min(b.length, header + 96))]));
    const candidates = [];
    for (let p = Math.max(0, header - 16); p + 4 < Math.min(b.length, header + 256); p++) {
      const n = b.readUInt32BE(p);
      if (n > 0 && n <= 512 && p + 4 + n <= b.length) candidates.push({p,n,bytes:[...b.subarray(p,p+12)]});
    }
    console.log('NEAR_CANDIDATES=' + JSON.stringify(candidates.slice(0,100)));
    break;
  }
  history.push({index, header, len, end: offset + len});
  offset += len;
  index++;
}
console.log(`parsed_frames=${index} final_offset=${offset} total=${b.length}`);
