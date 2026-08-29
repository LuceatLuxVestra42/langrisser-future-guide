import crypto from 'node:crypto';
import fs from 'node:fs';

const H_A6_VALIDATION='data/validation/hero-artwork-h-a6-materialization.v1.json';
const WEB_MANIFEST='data/generated/hero-artwork-h-a6-web-assets.v1.json';
const HOSTED_QA='data/validation/hero-artwork-hosted-qa.v1.json';
const IMAGE_DIR='public/images/heroes/cards';
const EXPECTED_H_A6='44e04bb3fd0657f82690efe39ae3395e36980ba6';
const EXPECTED_H_A5='68ab3c9c1e49fdc2f0bf2b0da324ac53da12b2fb';
const EXPECTED_MANIFEST_SHA='D9B949AA3BA97CF8E89CB27517CE2E47FAE1CE20E5790EFA6E1A5C0F65BFD40B';
const EXPECTED_H_A5_MANIFEST_SHA='AC08E7A03B033A10269E330F4E60D3B6A72D68AC6C68EFED37F48372E4E462F6';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha256=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const assert=(ok,msg)=>{if(!ok) throw new Error(`[HERO_ARTWORK_FINAL_INVALID] ${msg}`)};
const pngDimensions=p=>{
  const b=fs.readFileSync(p);
  assert(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),`invalid PNG ${p}`);
  return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
};

const h6=readJson(H_A6_VALIDATION);
const manifest=readJson(WEB_MANIFEST);
const qa=readJson(HOSTED_QA);

assert(h6.status==='PASS_H_A6_HERO_ARTWORK_MATERIALIZATION','H-A6 status');
assert(h6.sourceIndexValidationStatus==='PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL','H-A5 validation status');
assert(h6.sourceIndexCommit===EXPECTED_H_A5,'H-A5 commit');
assert(h6.sourceIndexManifestSha256===EXPECTED_H_A5_MANIFEST_SHA,'H-A5 manifest SHA');
assert(h6.canonicalHeroCount===267&&h6.materializedHeroCount===267,'H-A6 coverage');
assert(h6.exactPngHashMatchCount===267&&h6.exactRgbaHashMatchCount===267&&h6.exactDimensionMatchCount===267,'H-A6 exact matches');
assert(h6.missingAssetCount===0&&h6.extraAssetCount===0&&h6.uniqueWebPathCount===267,'H-A6 asset set');
assert(h6.renderBundleCount===12&&h6.packageCount===3,'H-A6 provenance counts');
assert(h6.webManifestSha256===EXPECTED_MANIFEST_SHA,'declared web manifest SHA');
assert(h6.semanticRecomputationPerformed===false&&h6.sourceArtworkPathRediscoveryPerformed===false&&h6.prefabTraversalPerformed===false,'semantic/extraction boundary');
assert(h6.filenameSimilaritySelectionPerformed===false&&h6.nameJoinPerformed===false&&h6.idArithmeticPerformed===false,'forbidden inference boundary');

assert(sha256(WEB_MANIFEST)===EXPECTED_MANIFEST_SHA,'web manifest bytes drift');
assert(manifest.status==='H_A6_WEB_ASSETS_MATERIALIZED','web manifest status');
assert(manifest.sourceIndexCommit===EXPECTED_H_A5&&manifest.sourceIndexManifestSha256===EXPECTED_H_A5_MANIFEST_SHA,'web manifest predecessor');
assert(manifest.heroCount===267&&manifest.renderBundleCount===12,'web manifest counts');
assert(manifest.targetWebContract==='public/images/heroes/cards/{heroId}.png','web path contract');
assert(Array.isArray(manifest.records)&&manifest.records.length===267,'record count');

const ids=new Set();
const paths=new Set();
let verified=0;
for(const r of manifest.records){
  const id=Number(r.heroId);
  assert(Number.isSafeInteger(id)&&id>0,`invalid heroId ${r.heroId}`);
  assert(!ids.has(id),`duplicate heroId ${id}`); ids.add(id);
  const expected=`${IMAGE_DIR}/${id}.png`;
  assert(r.path===expected,`path mismatch ${id}`);
  assert(!paths.has(expected),`duplicate path ${expected}`); paths.add(expected);
  assert(r.status==='VERIFIED_EXACT_H_A5_HASH',`record status ${id}`);
  assert(fs.existsSync(expected),`missing PNG ${id}`);
  assert(sha256(expected)===r.pngSha256,`PNG SHA mismatch ${id}`);
  const dim=pngDimensions(expected);
  assert(dim.width===r.width&&dim.height===r.height,`dimension mismatch ${id}`);
  verified++;
}
const actual=fs.readdirSync(IMAGE_DIR).filter(n=>/^\d+\.png$/.test(n));
assert(actual.length===267,`repository PNG count ${actual.length}`);
assert(actual.every(n=>ids.has(Number.parseInt(n,10))),'unexpected numeric Hero PNG');

assert(qa.status==='PASS_HERO_ARTWORK_HOSTED_BROWSER_QA'&&qa.completion==='COMPLETE','Hosted/Browser QA status');
assert(qa.hA6Predecessor===EXPECTED_H_A6,'QA H-A6 predecessor');
assert(qa.hostedAssetHeadPassCount===267,'Hosted PNG HEAD coverage');
assert(qa.summary?.checkCount===24&&qa.summary?.passed===24&&qa.summary?.failed===0,'QA checks');
assert(qa.browser?.desktop?.lazyCount===267&&qa.browser?.desktop?.pageErrors?.length===0,'desktop QA');
assert(qa.browser?.mobile?.listOverflow===0&&qa.browser?.mobile?.detailOverflow===0&&qa.browser?.mobile?.pageErrors?.length===0,'mobile QA');

console.log(JSON.stringify({status:'PASS_HERO_ARTWORK_FINAL_OWNER',heroCount:267,verifiedPngCount:verified,hostedHeadPassCount:267,browserCheckCount:24,semanticRecomputation:false},null,2));
