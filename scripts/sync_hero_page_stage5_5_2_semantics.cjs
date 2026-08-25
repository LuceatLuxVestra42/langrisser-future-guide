'use strict';
const fs=require('fs'); const path=require('path');
const root=path.resolve(__dirname,'..'); const v=path.join(root,'data/validation');
const coveragePath=path.join(v,'hero-page-stage5-5-2-coverage.v1.json');
const tracePath=path.join(v,'hero-page-stage5-5-2-source-trace.v1.json');
const skinPath=path.join(v,'hero-page-stage5-5-2-skins-acquisition.v1.json');
const c=JSON.parse(fs.readFileSync(coveragePath,'utf8'));
const t=JSON.parse(fs.readFileSync(tracePath,'utf8'));
const s=JSON.parse(fs.readFileSync(skinPath,'utf8'));
if(!String(t?.fields?.skins?.status||'').includes('CONFIRMED')) throw new Error('Skin source trace is not confirmed');
if(!String(s?.status||'').startsWith('PASS')) throw new Error('Skin semantic validation is not PASS');
const ts=t.fields.skins;
c.completion='COVERAGE_AND_SEMANTICS_COMPLETE_WITH_DATA_GAPS';
c.sourceTraceStatus=t.status;
c.fields.skins={...c.fields.skins,
 status:ts.status,
 artworkSemantics:ts.artwork.status,
 artworkJoin:ts.artwork.join,
 staticImageField:ts.artwork.staticImage,
 animatedResourceField:ts.artwork.animatedResource,
 artworkCoverage:ts.artwork.coverage,
 orderingSemantics:ts.ordering.status,
 orderingSource:ts.ordering.source,
 orderingRule:ts.ordering.rule,
 acquisitionSemantics:ts.acquisition.status,
 acquisitionSource:ts.acquisition.source,
 acquisitionMapping:ts.acquisition.mapping,
 acquisitionEncodedSkinCount:ts.acquisition.encodedSkinCount,
 acquisitionUnencodedSkinCount:ts.acquisition.unencodedSkinCount,
 acquisitionMissingRule:ts.acquisition.missingRule,
 validation:ts.validation
};
c.unresolvedSemanticFields=[];
c.dataCompletionIssues=[{
 field:'skins.acquisition',
 issue:'ConfigDataHeroSkinInfo.GetPathType omitted',
 canonicalSkinCount:ts.acquisition.unencodedSkinCount,
 policy:'Keep null/UNENCODED unless a separately verified supplemental acquisition dictionary is supplied.'
}];
c.readyForDisplayEnrichment=true;
c.nextAction='Integrate the confirmed Stage 5-5-2 mappings. Build a supplemental acquisition-history dictionary only if exact acquisition text is required for the 176 skins with omitted GetPathType.';
fs.writeFileSync(coveragePath,JSON.stringify(c,null,2)+'\n');
console.log(JSON.stringify({completion:c.completion,unresolvedSemanticFields:c.unresolvedSemanticFields,dataCompletionIssues:c.dataCompletionIssues,readyForDisplayEnrichment:c.readyForDisplayEnrichment},null,2));