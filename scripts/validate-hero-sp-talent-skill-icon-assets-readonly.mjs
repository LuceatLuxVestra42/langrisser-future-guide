import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const compactSha = (v) => sha256(Buffer.from(JSON.stringify(v)));
const fail = (m) => { throw new Error(m); };
const EXPECTED_MATERIALIZATION_SHA = "3edac2845fba3fbe7100b93f55a64b1d508098f0cd82667185c0e00d2f13d62d";
const EXPECTED_GENERAL_RECORDS = 1009;
const EXPECTED_AWAKENING_RECORDS = 256;
const EXPECTED_RELEASED = 25;
const EXPECTED_USAGE = 150;
const EXPECTED_UNIQUE = 25;

function decodeRgbaPng(buffer) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!buffer.subarray(0,8).equals(sig)) fail("PNG signature mismatch");
  let off=8,width=0,height=0,bit=0,type=0,interlace=0; const idat=[];
  while (off < buffer.length) {
    const len=buffer.readUInt32BE(off); const kind=buffer.toString("ascii",off+4,off+8); const data=buffer.subarray(off+8,off+8+len);
    if (kind === "IHDR") { width=data.readUInt32BE(0); height=data.readUInt32BE(4); bit=data[8]; type=data[9]; interlace=data[12]; }
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    off += 12 + len;
  }
  if (bit !== 8 || type !== 6 || interlace !== 0) fail(`unsupported PNG ${bit}/${type}/${interlace}`);
  const stride=width*4; const filtered=zlib.inflateSync(Buffer.concat(idat));
  if (filtered.length !== (stride+1)*height) fail("PNG scanline length mismatch");
  const rgba=Buffer.alloc(stride*height); let s=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for (let y=0;y<height;y++) {
    const f=filtered[s++];
    for (let x=0;x<stride;x++) {
      const v=filtered[s++],i=y*stride+x,left=x>=4?rgba[i-4]:0,up=y?rgba[i-stride]:0,ul=y&&x>=4?rgba[i-stride-4]:0;
      if (f===0) rgba[i]=v; else if (f===1) rgba[i]=(v+left)&255; else if (f===2) rgba[i]=(v+up)&255; else if (f===3) rgba[i]=(v+Math.floor((left+up)/2))&255; else if (f===4) rgba[i]=(v+paeth(left,up,ul))&255; else fail(`unsupported PNG filter ${f}`);
    }
  }
  return {width,height,rgba};
}

function collectSource() {
  const source=readJson("data/generated/hero-page-stage5-4-sp.v1.json");
  if (source.status !== "COMPLETE" || source.summary?.spReleasedCount !== EXPECTED_RELEASED || source.summary?.spTalentResolvedCount !== EXPECTED_RELEASED || source.summary?.hardErrorCount !== 0) fail("SP source authority drift");
  const byPath=new Map(); let released=0,usage=0;
  for (const hero of source.records ?? []) {
    const sp=hero.sp ?? {}; if (sp.status !== "RELEASED") continue;
    released += 1; const rows=sp.talent?.starProgression ?? []; if (rows.length !== 6) fail(`star count drift hero=${hero.heroId}`);
    for (const row of rows) {
      usage += 1; const p=row.skill?.iconPath;
      if (typeof p !== "string" || (!p.startsWith("UI/Icon/Skill_ABS/") && !p.startsWith("UI/Icon/Skill2_ABS/"))) fail(`invalid exact SP iconPath ${p}`);
      let r=byPath.get(p); if (!r) { r={usageCount:0,heroIds:new Set(),skillIds:new Set(),stars:new Set()}; byPath.set(p,r); }
      r.usageCount += 1; r.heroIds.add(Number(hero.heroId)); r.skillIds.add(Number(row.skillId)); r.stars.add(Number(row.star));
    }
  }
  if (released!==EXPECTED_RELEASED || usage!==EXPECTED_USAGE || byPath.size!==EXPECTED_UNIQUE) fail(`SP source cardinality drift ${released}/${usage}/${byPath.size}`);
  return {byPath,released,usage};
}

const manifest=readJson("data/generated/hero-skill-icon-assets.v1.json");
const material=readJson("data/generated/hero-skill-icon-sp-talent-materialization.v1.json");
if (manifest.schemaId!=="hero-skill-icon-assets/v1" || manifest.status!=="FROZEN") fail("manifest contract mismatch");
if (!Array.isArray(manifest.records) || manifest.records.length!==EXPECTED_GENERAL_RECORDS) fail(`general frozen count drift ${manifest.records?.length}`);
if (!Array.isArray(manifest.awakeningRecords) || manifest.awakeningRecords.length!==EXPECTED_AWAKENING_RECORDS) fail(`awakening frozen count drift ${manifest.awakeningRecords?.length}`);
if (manifest.allHeroAdmission?.status!=="FROZEN" || manifest.allHeroAdmission?.completion!=="COMPLETE" || manifest.allHeroAdmission?.generalMissingCount!==0) fail("general admission regression");
if (material.schemaId!=="hero-skill-icon-sp-talent-materialization/v1" || material.status!=="FROZEN" || material.completion!=="COMPLETE" || material.semanticReopen!==false) fail("SP materialization contract mismatch");
if (material.materializationSetSha256!==EXPECTED_MATERIALIZATION_SHA || compactSha(material.records)!==EXPECTED_MATERIALIZATION_SHA) fail("SP materialization digest mismatch");
if (material.summary?.spReleasedCount!==EXPECTED_RELEASED || material.summary?.spTalentUsageCount!==EXPECTED_USAGE || material.summary?.targetUniqueIconPathCount!==EXPECTED_UNIQUE || material.summary?.provedCount!==EXPECTED_UNIQUE || material.summary?.missingCount!==0) fail("SP materialization summary regression");

const {byPath,released,usage}=collectSource();
const admission=manifest.spTalentAdmission; const records=manifest.spTalentRecords;
if (admission?.status!=="FROZEN" || admission?.completion!=="COMPLETE" || admission?.semanticReopen!==false) fail("SP admission not frozen/complete");
if (admission?.lookupAuthority!=="exact sp.talent.starProgression[].skill.iconPath only" || admission?.predecessor?.materializationSetSha256!==EXPECTED_MATERIALIZATION_SHA) fail("SP admission authority/predecessor mismatch");
if (admission?.spReleasedCount!==released || admission?.spTalentUsageCount!==usage || admission?.spTalentUniqueIconPathCount!==byPath.size || admission?.admittedNowCount!==EXPECTED_UNIQUE || admission?.spTalentMissingCount!==0 || admission?.frozenGeneralRecordCount!==EXPECTED_GENERAL_RECORDS || admission?.frozenAwakeningRecordCount!==EXPECTED_AWAKENING_RECORDS || admission?.manifestArray!=="spTalentRecords" || admission?.frontendMutation!==false) fail("SP admission summary regression");
if (!Array.isArray(records) || records.length!==EXPECTED_UNIQUE) fail(`SP manifest record count ${records?.length}/${EXPECTED_UNIQUE}`);

const materialByPath=new Map(material.records.map((r)=>[r.sourcePath,r]));
if (materialByPath.size!==EXPECTED_UNIQUE) fail("SP materialization duplicate sourcePath");
const frozenPaths=new Set([...manifest.records,...manifest.awakeningRecords].map((r)=>r.sourcePath));
const allPublic=new Set([...manifest.records,...manifest.awakeningRecords].map((r)=>String(r.publicPath??"").toLowerCase()).filter(Boolean));
const seen=new Set();
for (const record of records) {
  if (seen.has(record.sourcePath)) fail(`SP manifest duplicate sourcePath ${record.sourcePath}`); seen.add(record.sourcePath);
  if (frozenPaths.has(record.sourcePath)) fail(`SP sourcePath overlaps frozen predecessor ${record.sourcePath}`);
  const sourceRow=byPath.get(record.sourcePath), mat=materialByPath.get(record.sourcePath); if (!sourceRow || !mat) fail(`SP provenance missing ${record.sourcePath}`);
  const expected={usageCount:sourceRow.usageCount,heroIds:[...sourceRow.heroIds].sort((a,b)=>a-b),skillIds:[...sourceRow.skillIds].sort((a,b)=>a-b),stars:[...sourceRow.stars].sort((a,b)=>a-b)};
  for (const key of ["usageCount","heroIds","skillIds","stars"]) if (JSON.stringify(record[key])!==JSON.stringify(expected[key]) || JSON.stringify(mat[key])!==JSON.stringify(expected[key])) fail(`SP exact-source usage mismatch ${record.sourcePath} ${key}`);
  for (const key of ["role","verificationOwner","packagePart","packageName","bundleEntry","bundleSha256","containerPath","objectType","pathId","rawObjectSha256","rgbaSha256","width","height","publicPath","pngBytes","pngSha256","nonSpriteExactPathCompanionCount"]) if (JSON.stringify(record[key])!==JSON.stringify(mat[key])) fail(`SP materialization/manifest mismatch ${record.sourcePath} ${key}`);
  if (record.role!=="sp-talent" || record.verificationOwner!=="OFFICIAL_INSTALLER_EXACT_RUNTIME_PATH_UNITY_SPRITE" || record.objectType!=="Sprite") fail(`SP proof contract mismatch ${record.sourcePath}`);
  const publicKey=String(record.publicPath).toLowerCase(); if (allPublic.has(publicKey)) fail(`SP publicPath overlaps frozen predecessor ${record.publicPath}`); allPublic.add(publicKey);
  const file=path.join(root,String(record.publicPath).replace(/^\//,"public/")); if (!fs.existsSync(file)) fail(`SP PNG missing ${record.publicPath}`);
  const png=fs.readFileSync(file); if (png.length!==record.pngBytes || sha256(png)!==record.pngSha256) fail(`SP PNG byte/hash mismatch ${record.sourcePath}`);
  const decoded=decodeRgbaPng(png); if (decoded.width!==record.width || decoded.height!==record.height || sha256(decoded.rgba)!==record.rgbaSha256) fail(`SP PNG pixel proof mismatch ${record.sourcePath}`);
  let nonEmpty=false; for (let i=3;i<decoded.rgba.length;i+=4) if (decoded.rgba[i]!==0) { nonEmpty=true; break; } if (!nonEmpty) fail(`SP PNG empty alpha ${record.sourcePath}`);
}
if (seen.size!==EXPECTED_UNIQUE) fail("SP manifest unique coverage mismatch");
for (const p of byPath.keys()) if (!seen.has(p)) fail(`SP current-source coverage missing ${p}`);

console.log(`[hero-sp-talent-skill-icon-assets] PASS released=${released} usages=${usage} unique=${seen.size} missing=0 generalFrozen=${manifest.records.length} awakeningFrozen=${manifest.awakeningRecords.length}`);
