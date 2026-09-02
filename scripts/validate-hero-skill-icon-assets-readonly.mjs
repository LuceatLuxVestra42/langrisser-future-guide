import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const repoRoot = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(message); };

const manifest = readJson("data/generated/hero-skill-icon-assets.v1.json");
const hero = readJson("data/generated/hero-detail/by-id/6.json");

const expected = new Map([
  ["UI/Icon/Skill_ABS/Gift_Knight.png", { skillIds: [3067, 3072, 3077, 3082], part: 27, bundle: "5ca1962b06355b48fe0ca6531e002a13a63a1d35e42f558471aace39d4298adf", raw: "2dd27910f983fc8da35a1b21fbd492babbba105b724913f4bf378365a64e3d77", rgba: "a153365f9ad2a903456543b07beddb9ae976bcd045b5ef29c54d67f5bdb59b6d", width: 175, height: 158 }],
  ["UI/Icon/Skill_ABS/Passive_BothBuf1.png", { skillIds: [5020], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "013986675fc800f75ad57f6ddbbd1bf3ff4776e4b848b20259a80c47a554a17e", rgba: "d02d74ba0718aa77fe54751a113718aaa87fd46a93cdc68b4ec393adea56d1a6", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Skill_SpeedUp1.png", { skillIds: [10324], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "4190d48120b768e60f9eac79b522bae112ae643798801466cc4f8612337d7c09", rgba: "7a6799f11348767d906e74f394656317cdb8ba8849adb0dfc999ebaa00946cc8", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Passive_BreakAtk.png", { skillIds: [5003], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "c26456ac6df22cc4eff33f2f4b9ad3f2f347d7119a4b7c0cfb543d1aa794d370", rgba: "14f1b8f0117a10d78cbc9a3ca8a92c06fdd05e204577a72e9fdb7da27abc59df", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Passive_AtkBuf1.png", { skillIds: [5007], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "d9be2df432aa6fe2b900039b2e7216dfdbb9e401b104e2d87782e412b2c87f4c", rgba: "39fdf53bd6721d69dba5f9e9e71a93b01361242556d088f8281ecbca8d1b52f6", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Passive_KnightWave.png", { skillIds: [10314], part: 27, bundle: "5ca1962b06355b48fe0ca6531e002a13a63a1d35e42f558471aace39d4298adf", raw: "2a5e1fc4f862f37035ba441396dd58781003e6ffc94743d997ec69711bb68cc5", rgba: "f9a106b6b29f295af004a9700ca95cdbed2b04c2e05658fa3f5e7843f549fca9", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Skill_KnightSoul.png", { skillIds: [10328], part: 27, bundle: "5ca1962b06355b48fe0ca6531e002a13a63a1d35e42f558471aace39d4298adf", raw: "ecccc08c924dd57383dae37c71958f733140ab8f7eef41fc73621565255a23e8", rgba: "252341b436ef8d19ece9e5092b82a6fa71d4bb7a91daf683b00b23d269a33640", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/SuperBuff_Empire1.png", { skillIds: [11807], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "8f8c4d36f9a7bef3a176a44ae1529d0a3761fb478440e6a919973b77030016fd", rgba: "ded240a21a596333da835adc93f13497de154e5a9aad35c874fa1356e66257bb", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Passive_Assault.png", { skillIds: [10302], part: 27, bundle: "5ca1962b06355b48fe0ca6531e002a13a63a1d35e42f558471aace39d4298adf", raw: "bb9da0f50b1698e1cb4fd9bdef28f7346182420833073cc6746f1e7f9e716b40", rgba: "6abbeb65ff6244febf5e4ec047f53919c2ec96c1692521fb3be4a3249e79d759", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Skill_KnightCrash.png", { skillIds: [10301], part: 27, bundle: "5ca1962b06355b48fe0ca6531e002a13a63a1d35e42f558471aace39d4298adf", raw: "c5cf77092c21f2272d68aa9b4860373f8f138d8540d3a0bc8a673238324b6ba7", rgba: "1f83bf5a89236e4c85eae587d9f51e34685dd686a6c8c79d8f6876632676c953", width: 170, height: 170 }],
  ["UI/Icon/Skill_ABS/Skill_SPLeon1.png", { skillIds: [12527], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "c9d8155df7099f97128895e1967ae5a13b2053ae878c10423171b980f8e0f491", rgba: "06e178222d76039de9eedab352665dfa727f1f8e62c6de82fae8c68128d9b6b0", width: 172, height: 172 }],
  ["UI/Icon/Skill_ABS/Skill_SPLeon2.png", { skillIds: [12528], part: 62, bundle: "14c4fe918356f47f0e9f5a59e77dae31e4eb4a0d19e30d898c9d8c1085b8eb12", raw: "154fb93aa05f63c9fd9209f6c9d656d0741fdaa2d86d2ce44613a2169d7bbcd5", rgba: "2cb351ff3ca777a334742320fd50eaf0246993a0fde36adba06989432df8f5c3", width: 172, height: 172 }],
]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbaPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) fail("PNG signature mismatch");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) fail(`unsupported PNG format ${bitDepth}/${colorType}/${interlace}`);
  const stride = width * 4;
  const filtered = zlib.inflateSync(Buffer.concat(idat));
  if (filtered.length !== (stride + 1) * height) fail("PNG scanline length mismatch");
  const rgba = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[source++];
    for (let x = 0; x < stride; x += 1) {
      const value = filtered[source++];
      const outIndex = y * stride + x;
      const left = x >= 4 ? rgba[outIndex - 4] : 0;
      const up = y > 0 ? rgba[outIndex - stride] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[outIndex - stride - 4] : 0;
      if (filter === 0) rgba[outIndex] = value;
      else if (filter === 1) rgba[outIndex] = (value + left) & 255;
      else if (filter === 2) rgba[outIndex] = (value + up) & 255;
      else if (filter === 3) rgba[outIndex] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) rgba[outIndex] = (value + paeth(left, up, upLeft)) & 255;
      else fail(`unsupported PNG filter ${filter}`);
    }
  }
  return { width, height, rgba };
}

if (manifest.schemaId !== "hero-skill-icon-assets/v1" || manifest.status !== "FROZEN") fail("manifest contract mismatch");
if (manifest.scope?.heroId !== 6 || manifest.scope?.targetUniqueIconCount !== 12) fail("manifest scope mismatch");
if (manifest.scope?.centralDisciplineIncluded !== false) fail("central discipline scope mismatch");
if (manifest.source?.kind !== "OFFICIAL_INSTALLER" || manifest.source?.installVersion !== "1.1.113") fail("source baseline mismatch");
if (manifest.source?.verificationArtifactDigest !== "sha256:25c1b2dfdec1887c38c56fa2d0ea7d98636effff2be62af9350fe1292cbb249d") fail("verification artifact digest mismatch");
if (manifest.source?.unityContainerRootPrefix !== "assets/gameproject/runtimeassets/") fail("container root mismatch");
if (!Array.isArray(manifest.records) || manifest.records.length !== 12) fail("record count mismatch");

const current = new Map();
const addCurrent = (sourcePath, skillId) => {
  if (!sourcePath || !Number.isInteger(skillId)) return;
  if (!current.has(sourcePath)) current.set(sourcePath, new Set());
  current.get(sourcePath).add(Number(skillId));
};
for (const row of hero.normal?.talent?.starProgression ?? []) addCurrent(row.skill?.iconPath, row.skillId);
for (const row of hero.normal?.skills?.heroDirectSkills ?? []) addCurrent(row.iconPath, row.skillId);
for (const row of hero.normal?.skills?.jobLevelAcquisitions ?? []) addCurrent(row.skill?.iconPath, row.skillId);
for (const row of hero.sp?.secondStageRewards?.skills ?? []) addCurrent(row.icon, row.skillId);

if (current.size !== expected.size) fail(`Hero 6 current icon set mismatch ${current.size}/${expected.size}`);
for (const sourcePath of current.keys()) if (!expected.has(sourcePath)) fail(`unexpected Hero 6 sourcePath ${sourcePath}`);
if (hero.centralDiscipline?.icon && current.has(hero.centralDiscipline.icon)) fail("central discipline icon leaked into 12-icon scope");

const seenPublic = new Set();
for (const record of manifest.records) {
  const proof = expected.get(record.sourcePath);
  if (!proof) fail(`manifest unexpected sourcePath ${record.sourcePath}`);
  const currentIds = [...(current.get(record.sourcePath) ?? [])].sort((a, b) => a - b);
  const manifestIds = [...record.skillIds].sort((a, b) => a - b);
  if (JSON.stringify(currentIds) !== JSON.stringify(proof.skillIds) || JSON.stringify(manifestIds) !== JSON.stringify(proof.skillIds)) fail(`skill coverage mismatch ${record.sourcePath}`);
  if (record.packagePart !== proof.part || record.bundleSha256 !== proof.bundle || record.rawObjectSha256 !== proof.raw || record.rgbaSha256 !== proof.rgba) fail(`official proof mismatch ${record.sourcePath}`);
  if (record.objectType !== "Sprite" || record.width !== proof.width || record.height !== proof.height) fail(`Sprite metadata mismatch ${record.sourcePath}`);
  if (!record.publicPath.startsWith("/images/heroes/skill-icons/") || seenPublic.has(record.publicPath)) fail(`public path contract mismatch ${record.publicPath}`);
  seenPublic.add(record.publicPath);
  const relativePublic = record.publicPath.replace(/^\//, "");
  const filePath = path.join(repoRoot, "public", relativePublic);
  if (!fs.existsSync(filePath)) fail(`missing public asset ${record.publicPath}`);
  const png = fs.readFileSync(filePath);
  if (png.length !== record.pngBytes || sha256(png) !== record.pngSha256) fail(`PNG byte mismatch ${record.publicPath}`);
  const decoded = decodeRgbaPng(png);
  if (decoded.width !== proof.width || decoded.height !== proof.height || sha256(decoded.rgba) !== proof.rgba) fail(`PNG pixel mismatch ${record.publicPath}`);
  let nonEmptyAlpha = false;
  for (let index = 3; index < decoded.rgba.length; index += 4) {
    if (decoded.rgba[index] !== 0) { nonEmptyAlpha = true; break; }
  }
  if (!nonEmptyAlpha) fail(`empty alpha ${record.publicPath}`);
}

console.log(`[hero-skill-icon-assets] PASS records=${manifest.records.length} hero=6 official=1.1.113`);
