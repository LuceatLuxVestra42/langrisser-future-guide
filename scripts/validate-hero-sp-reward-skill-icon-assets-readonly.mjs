import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const compactSha = (v) => sha256(Buffer.from(JSON.stringify(v)));
const fail = (m) => { throw new Error(m); };

const EXPECTED_SHARDS = 267;
const EXPECTED_RELEASED = 25;
const EXPECTED_USAGE = 50;
const EXPECTED_TARGET_HEROES = 24;
const EXPECTED_TARGET_USAGE = 48;
const EXPECTED_TARGET_UNIQUE = 48;
const EXCLUDED_HERO = 6;
const EXPECTED_GENERAL = 1009;
const EXPECTED_AWAKENING = 256;
const EXPECTED_SP_TALENT = 25;

function decodeRgbaPng(buffer) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!buffer.subarray(0,8).equals(sig)) fail("PNG signature mismatch");
  let off=8,width=0,height=0,bit=0,type=0,interlace=0; const idat=[];
  while (off < buffer.length) {
    const len=buffer.readUInt32BE(off), kind=buffer.toString("ascii",off+4,off+8), data=buffer.subarray(off+8,off+8+len);
    if (kind==="IHDR") { width=data.readUInt32BE(0); height=data.readUInt32BE(4); bit=data[8]; type=data[9]; interlace=data[12]; }
    else if (kind==="IDAT") idat.push(data);
    else if (kind==="IEND") break;
    off += 12 + len;
  }
  if (bit!==8 || type!==6 || interlace!==0) fail(`unsupported PNG ${bit}/${type}/${interlace}`);
  const stride=width*4, filtered=zlib.inflateSync(Buffer.concat(idat));
  if (filtered.length !== (stride+1)*height) fail("PNG scanline length mismatch");
  const rgba=Buffer.alloc(stride*height); let s=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for (let y=0;y<height;y++) {
    const f=filtered[s++];
    for (let x=0;x<stride;x++) {
      const v=filtered[s++], i=y*stride+x, left=x>=4?rgba[i-4]:0, up=y?rgba[i-stride]:0, ul=y&&x>=4?rgba[i-stride-4]:0;
      if (f===0) rgba[i]=v;
      else if (f===1) rgba[i]=(v+left)&255;
      else if (f===2) rgba[i]=(v+up)&255;
      else if (f===3) rgba[i]=(v+Math.floor((left+up)/2))&255;
      else if (f===4) rgba[i]=(v+paeth(left,up,ul))&255;
      else fail(`unsupported PNG filter ${f}`);
    }
  }
  return {width,height,rgba};
}

function collectCurrentSpRewards() {
  const dir=path.join(root,"data/generated/hero-detail/by-id");
  const files=fs.readdirSync(dir).filter((n)=>/^\d+\.json$/.test(n)).sort((a,b)=>Number(a.slice(0,-5))-Number(b.slice(0,-5)));
  if (files.length!==EXPECTED_SHARDS) fail(`hero shard count drift ${files.length}/${EXPECTED_SHARDS}`);
  const all=new Map(), target=new Map(), leon=new Set(), heroIds=new Set();
  let released=0,usage=0;
  for (const file of files) {
    const hero=readJson(`data/generated/hero-detail/by-id/${file}`);
    const sp=hero.sp ?? {};
    if (sp.status!=="RELEASED") continue;
    released += 1;
    const heroId=Number(hero.heroId);
    const skills=sp.secondStageRewards?.skills ?? [];
    if (skills.length!==2) fail(`SP reward cardinality hero=${heroId} count=${skills.length}`);
    for (const skill of skills) {
      usage += 1;
      const skillId=Number(skill.skillId), sourcePath=skill.icon;
      if (!Number.isSafeInteger(skillId) || typeof sourcePath!=="string" || (!sourcePath.startsWith("UI/Icon/Skill_ABS/") && !sourcePath.startsWith("UI/Icon/Skill2_ABS/"))) {
        fail(`invalid exact SP reward locator hero=${heroId} skill=${skillId} path=${sourcePath}`);
      }
      const add=(map)=>{
        let row=map.get(sourcePath);
        if (!row) { row={usageCount:0,heroIds:new Set(),skillIds:new Set()}; map.set(sourcePath,row); }
        row.usageCount += 1; row.heroIds.add(heroId); row.skillIds.add(skillId);
      };
      add(all);
      if (heroId===EXCLUDED_HERO) leon.add(sourcePath);
      else { add(target); heroIds.add(heroId); }
    }
  }
  if (released!==EXPECTED_RELEASED || usage!==EXPECTED_USAGE || all.size!==EXPECTED_USAGE) fail(`SP source population drift released=${released} usage=${usage} unique=${all.size}`);
  if (leon.size!==2 || heroIds.size!==EXPECTED_TARGET_HEROES || target.size!==EXPECTED_TARGET_UNIQUE) fail("SP target/exclusion population drift");
  if ([...target.values()].reduce((n,r)=>n+r.usageCount,0)!==EXPECTED_TARGET_USAGE) fail("SP target usage drift");
  return {released,usage,all,target,leon};
}

const manifest=readJson("data/generated/hero-skill-icon-assets.v1.json");
const material=readJson("data/generated/hero-skill-icon-sp-reward-materialization.v1.json");
if (manifest.schemaId!=="hero-skill-icon-assets/v1" || manifest.status!=="FROZEN") fail("base manifest contract mismatch");
if ((manifest.records??[]).length!==EXPECTED_GENERAL || (manifest.awakeningRecords??[]).length!==EXPECTED_AWAKENING || (manifest.spTalentRecords??[]).length!==EXPECTED_SP_TALENT) fail("frozen predecessor count drift");
if (material.schemaId!=="hero-skill-icon-sp-reward-materialization/v1" || material.status!=="FROZEN" || material.completion!=="COMPLETE" || material.semanticReopen!==false) fail("SP reward materialization contract mismatch");
if (material.lookupAuthority!=="exact sp.secondStageRewards.skills[].icon only") fail("SP reward materialization lookup authority drift");
if (material.materializationSetSha256!==compactSha(material.records??[])) fail("SP reward materialization digest mismatch");
const summary=material.summary??{};
if (summary.spReleasedCount!==EXPECTED_RELEASED || summary.spRewardUsageCount!==EXPECTED_USAGE || summary.excludedLeonUsageCount!==2 || summary.targetHeroCount!==EXPECTED_TARGET_HEROES || summary.targetUsageCount!==EXPECTED_TARGET_USAGE || summary.targetUniqueIconPathCount!==EXPECTED_TARGET_UNIQUE || summary.provedCount!==EXPECTED_TARGET_UNIQUE || summary.missingCount!==0 || summary.packageScanCount!==68 || summary.bundleScanCount!==3045 || summary.scanErrorCount!==0 || summary.publicPathCollisionCount!==0) fail("SP reward materialization summary drift");

const {released,usage,all,target,leon}=collectCurrentSpRewards();
const records=manifest.spRewardRecords, admission=manifest.spRewardAdmission;
if (!Array.isArray(records) || records.length!==EXPECTED_TARGET_UNIQUE) fail(`SP reward manifest count ${records?.length}/${EXPECTED_TARGET_UNIQUE}`);
if (admission?.status!=="FROZEN" || admission?.completion!=="COMPLETE" || admission?.semanticReopen!==false || admission?.stage!=="SP_REWARD_SKILL_ICON_MANIFEST_ADMISSION") fail("SP reward admission state mismatch");
if (admission?.lookupAuthority!=="exact sp.secondStageRewards.skills[].icon only" || admission?.predecessor?.materializationSetSha256!==material.materializationSetSha256) fail("SP reward admission predecessor mismatch");
if (admission?.spReleasedCount!==released || admission?.spRewardUsageCount!==usage || admission?.excludedAlreadyAdmittedHeroId!==EXCLUDED_HERO || admission?.excludedAlreadyAdmittedUsageCount!==2 || admission?.targetHeroCount!==EXPECTED_TARGET_HEROES || admission?.targetUsageCount!==EXPECTED_TARGET_USAGE || admission?.targetUniqueIconPathCount!==EXPECTED_TARGET_UNIQUE || admission?.admittedNowCount!==EXPECTED_TARGET_UNIQUE || admission?.spRewardMissingCount!==0 || admission?.manifestArray!=="spRewardRecords" || admission?.frontendConsumerRequired!==true) fail("SP reward admission summary mismatch");

const materialByPath=new Map((material.records??[]).map((r)=>[r.sourcePath,r]));
if (materialByPath.size!==EXPECTED_TARGET_UNIQUE) fail("SP reward materialization duplicate sourcePath");
const predecessors=[...(manifest.records??[]),...(manifest.awakeningRecords??[]),...(manifest.spTalentRecords??[])];
const predecessorPaths=new Set(predecessors.map((r)=>r.sourcePath));
for (const p of leon) if (!predecessorPaths.has(p)) fail(`Leon SP reward predecessor coverage missing ${p}`);
for (const p of target.keys()) if (predecessorPaths.has(p)) fail(`non-Leon SP reward unexpectedly in predecessor ${p}`);

const seen=new Set(), allPublic=new Set(predecessors.map((r)=>String(r.publicPath??"").toLowerCase()).filter(Boolean));
for (const record of records) {
  if (seen.has(record.sourcePath)) fail(`SP reward manifest duplicate ${record.sourcePath}`);
  seen.add(record.sourcePath);
  const source=target.get(record.sourcePath), mat=materialByPath.get(record.sourcePath);
  if (!source || !mat) fail(`SP reward provenance missing ${record.sourcePath}`);
  const expected={usageCount:source.usageCount,heroIds:[...source.heroIds].sort((a,b)=>a-b),skillIds:[...source.skillIds].sort((a,b)=>a-b)};
  for (const key of ["usageCount","heroIds","skillIds"]) {
    if (JSON.stringify(record[key])!==JSON.stringify(expected[key]) || JSON.stringify(mat[key])!==JSON.stringify(expected[key])) fail(`SP reward exact-source usage mismatch ${record.sourcePath} ${key}`);
  }
  for (const key of ["role","verificationOwner","packagePart","packageName","bundleEntry","bundleSha256","containerPath","objectType","pathId","rawObjectSha256","rgbaSha256","width","height","publicPath","pngBytes","pngSha256","nonSpriteExactPathCompanionCount"]) {
    if (JSON.stringify(record[key])!==JSON.stringify(mat[key])) fail(`SP reward materialization/manifest mismatch ${record.sourcePath} ${key}`);
  }
  if (record.role!=="sp-reward" || record.verificationOwner!=="OFFICIAL_INSTALLER_EXHAUSTIVE_ALL_BUNDLES_EXACT_RUNTIME_PATH_UNITY_SPRITE" || record.objectType!=="Sprite") fail(`SP reward proof contract mismatch ${record.sourcePath}`);
  const publicKey=String(record.publicPath??"").toLowerCase();
  if (!publicKey || allPublic.has(publicKey)) fail(`SP reward publicPath collision ${record.publicPath}`);
  allPublic.add(publicKey);
  const file=path.join(root,String(record.publicPath).replace(/^\//,"public/"));
  if (!fs.existsSync(file)) fail(`SP reward PNG missing ${record.publicPath}`);
  const png=fs.readFileSync(file);
  if (png.length!==record.pngBytes || sha256(png)!==record.pngSha256) fail(`SP reward PNG byte/hash mismatch ${record.sourcePath}`);
  const decoded=decodeRgbaPng(png);
  if (decoded.width!==record.width || decoded.height!==record.height || sha256(decoded.rgba)!==record.rgbaSha256) fail(`SP reward PNG RGBA proof mismatch ${record.sourcePath}`);
  let alpha=false; for (let i=3;i<decoded.rgba.length;i+=4) if (decoded.rgba[i]!==0) { alpha=true; break; }
  if (!alpha) fail(`SP reward PNG empty alpha ${record.sourcePath}`);
}
if (seen.size!==EXPECTED_TARGET_UNIQUE) fail("SP reward manifest coverage drift");
for (const p of target.keys()) if (!seen.has(p)) fail(`current SP reward target missing ${p}`);

const allAdmittedPaths=new Set([...predecessors,...records].map((r)=>r.sourcePath));
for (const p of all.keys()) if (!allAdmittedPaths.has(p)) fail(`SP reward overall coverage missing ${p}`);
const resolver=fs.readFileSync(path.join(root,"src/lib/hero-skill-icon-assets.ts"),"utf8");
if (!resolver.includes("...spRewardRecords") || !resolver.includes("bySourcePath.get(sourcePath)")) fail("frontend SP reward resolver admission missing");

console.log(`[hero-sp-reward-skill-icon-assets] PASS released=${released} usages=${usage} targetHeroes=${EXPECTED_TARGET_HEROES} new=${seen.size} leonReused=${leon.size} missing=0`);
