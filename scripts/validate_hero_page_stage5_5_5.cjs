'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(root, p));

const paths = {
  stage551: 'data/validation/hero-page-stage5-5-1.v1.json',
  stage552: 'data/validation/hero-page-stage5-5-2-coverage.v1.json',
  stage553: 'data/validation/hero-page-stage5-5-3-validation.v1.json',
  stage554: 'data/validation/hero-page-stage5-5-4-validation.v1.json',
  output553: 'data/hero-page-stage5-5-3.v1.json',
  contract553: 'data/contracts/hero-page-stage5-5-3-output-contract.v1.json',
  contract554: 'data/contracts/hero-page-stage5-5-4-display-policy.v1.json',
};

const missingFiles = Object.entries(paths).filter(([, p]) => !exists(p)).map(([key, p]) => ({ key, path: p }));
if (missingFiles.length) {
  console.error(JSON.stringify({ status: 'FAIL', missingFiles }, null, 2));
  process.exit(1);
}

const s551 = read(paths.stage551);
const s552 = read(paths.stage552);
const s553 = read(paths.stage553);
const s554 = read(paths.stage554);
const output = read(paths.output553);
const c553 = read(paths.contract553);
const c554 = read(paths.contract554);

const checks = [];
const failures = [];
function check(name, ok, detail) {
  const row = { name, pass: Boolean(ok), detail };
  checks.push(row);
  if (!ok) failures.push(row);
}
function allTrue(obj) {
  return obj && typeof obj === 'object' && Object.values(obj).every(v => v === true);
}
function arrEmpty(v) { return Array.isArray(v) && v.length === 0; }

// 5-5-1: canonical identity and ownership contract gate.
check('5-5-1 completion', s551.completion === 'COMPLETE', s551.completion);
check('5-5-1 hard errors empty', arrEmpty(s551.hardErrors), s551.hardErrors);
check('5-5-1 canonical Hero count', s551.gates?.canonicalHeroIdentityReuse?.canonicalHeroCount === 267, s551.gates?.canonicalHeroIdentityReuse);
check('5-5-1 identity key frozen', s551.gates?.canonicalHeroIdentityReuse?.primaryKey === 'heroId', s551.gates?.canonicalHeroIdentityReuse?.primaryKey);
check('5-5-1 ownership boundary pass', s551.gates?.headerOwnershipBoundary?.status === 'PASS', s551.gates?.headerOwnershipBoundary);

// 5-5-2: semantics fully interpreted. REVIEW status is allowed only for explicit source-data gaps.
check('5-5-2 canonical Hero count', s552.canonicalHeroCount === 267, s552.canonicalHeroCount);
check('5-5-2 identity coverage', s552.heroInfoIdentityCoverage?.resolved === 267 && arrEmpty(s552.heroInfoIdentityCoverage?.missingHeroIds) && arrEmpty(s552.heroInfoIdentityCoverage?.duplicateHeroIds), s552.heroInfoIdentityCoverage);
check('5-5-2 hard errors empty', arrEmpty(s552.hardErrors), s552.hardErrors);
check('5-5-2 coverage issues empty', arrEmpty(s552.coverageIssues), s552.coverageIssues);
check('5-5-2 unresolved semantic fields empty', arrEmpty(s552.unresolvedSemanticFields), s552.unresolvedSemanticFields);
check('5-5-2 display enrichment ready', s552.readyForDisplayEnrichment === true, s552.readyForDisplayEnrichment);
check('5-5-2 skin structural coverage', s552.fields?.skins?.totalSkinRefs === 540 && s552.fields?.skins?.resolvedSkinRefs === 540 && arrEmpty(s552.fields?.skins?.unresolvedSkinRefs), s552.fields?.skins);
check('5-5-2 acquisition gap isolated', s552.fields?.skins?.acquisitionEncodedSkinCount === 364 && s552.fields?.skins?.acquisitionUnencodedSkinCount === 176, {encoded:s552.fields?.skins?.acquisitionEncodedSkinCount,unencoded:s552.fields?.skins?.acquisitionUnencodedSkinCount});
check('5-5-2 only nonblocking data completion issue', Array.isArray(s552.dataCompletionIssues) && s552.dataCompletionIssues.length === 1 && s552.dataCompletionIssues[0]?.field === 'skins.acquisition' && s552.dataCompletionIssues[0]?.canonicalSkinCount === 176, s552.dataCompletionIssues);

// 5-5-3: generated integrated output and contract validation.
check('5-5-3 validation pass', s553.status === 'PASS', s553.status);
check('5-5-3 completion', s553.completion === 'FULL_267_RECORD_CONTRACT_VALIDATION_COMPLETE', s553.completion);
check('5-5-3 errors empty', arrEmpty(s553.errors), s553.errors);
check('5-5-3 warnings empty', arrEmpty(s553.warnings), s553.warnings);
check('5-5-3 invariants all true', allTrue(s553.invariants), s553.invariants);
check('5-5-3 output count', s553.summary?.outputRecordCount === 267 && output.recordCount === 267 && Array.isArray(output.records) && output.records.length === 267, {validation:s553.summary?.outputRecordCount,outputRecordCount:output.recordCount,records:output.records?.length});
check('5-5-3 unique Hero IDs', s553.summary?.uniqueHeroIdCount === 267 && new Set(output.records.map(r => r.heroId)).size === 267, s553.summary?.uniqueHeroIdCount);
check('5-5-3 total skins', s553.summary?.totalSkinCount === 540, s553.summary?.totalSkinCount);
check('5-5-3 output contract accepted', c553.status === 'ACCEPTED' && c553.canonicalHeroCount === 267, {status:c553.status,count:c553.canonicalHeroCount});

// 5-5-4: display exception policy deterministic across all records.
check('5-5-4 validation pass', s554.status === 'PASS', s554.status);
check('5-5-4 completion', s554.completion === 'DISPLAY_EXCEPTION_POLICY_VALIDATED_FOR_ALL_267_HEROES', s554.completion);
check('5-5-4 errors empty', arrEmpty(s554.errors), s554.errors);
check('5-5-4 warnings empty', arrEmpty(s554.warnings), s554.warnings);
check('5-5-4 policy invariants all true', allTrue(s554.policyInvariants), s554.policyInvariants);
check('5-5-4 Hero count', s554.summary?.heroCount === 267, s554.summary?.heroCount);
check('5-5-4 skin states', s554.summary?.skinCount === 540 && s554.summary?.encodedAcquisitionVisible === 364 && s554.summary?.unencodedAcquisitionHidden === 176, {skinCount:s554.summary?.skinCount,encoded:s554.summary?.encodedAcquisitionVisible,unencoded:s554.summary?.unencodedAcquisitionHidden});
check('5-5-4 no raw marker leak', arrEmpty(s554.markerLeaks), s554.markerLeaks);
check('5-5-4 no blank visible labels', arrEmpty(s554.blankVisibleLabels), s554.blankVisibleLabels);
check('5-5-4 display policy contract accepted', c554.status === 'ACCEPTED' && c554.canonicalHeroCount === 267, {status:c554.status,count:c554.canonicalHeroCount});

// Cross-stage ownership / non-regression checks.
check('SP remains separate Stage 5-4 ownership', c553.ownershipBoundaries?.sp?.includes('Stage 5-4') && c554.displayPolicies?.rarity?.spRule?.includes('OUT_OF_SCOPE'), {stage553:c553.ownershipBoundaries?.sp,stage554:c554.displayPolicies?.rarity?.spRule});
check('solo-limited SSR remains banner-owned', c553.ownershipBoundaries?.soloLimitedSSR?.includes('Banner/summon') && c554.displayPolicies?.rarity?.soloLimitedSsrRule?.includes('OUT_OF_SCOPE'), {stage553:c553.ownershipBoundaries?.soloLimitedSSR,stage554:c554.displayPolicies?.rarity?.soloLimitedSsrRule});
check('combat/bond/soldier ownership preserved', Boolean(c553.ownershipBoundaries?.combat && c553.ownershipBoundaries?.bonds && c553.ownershipBoundaries?.soldiers), c553.ownershipBoundaries);
check('asset export remains separate', Boolean(c553.ownershipBoundaries?.assetExport) && c554.displayPolicies?.artworkGallery?.assetRule?.includes('not browser URLs'), {stage553:c553.ownershipBoundaries?.assetExport,stage554:c554.displayPolicies?.artworkGallery?.assetRule});

const nonBlockingFollowups = [
  {
    id: 'LOCALIZATION',
    scope: ['CV Korean actor names', 'faction Korean labels', 'origin Korean titles', 'skin Korean names'],
    blockingStage5_5: false,
    reason: 'Validated source text/fallback exists; Stage 5-5-4 explicitly treats these as DEFERRED_LOCALIZATION.'
  },
  {
    id: 'SKIN_ACQUISITION_SUPPLEMENT',
    scope: '176 canonical skins with omitted GetPathType',
    blockingStage5_5: false,
    reason: 'Enum semantics are resolved; missing source values stay UNENCODED and hidden until a verified supplemental dictionary exists.'
  },
  {
    id: 'SP_COMPOSITION',
    scope: 'SP existence/illustration/missions and final gallery composition',
    blockingStage5_5: false,
    owner: 'Hero Stage 5-4 + later composition'
  },
  {
    id: 'SOLO_LIMITED_SSR_COMPOSITION',
    scope: 'SSR(1-person-limited) presentation label',
    blockingStage5_5: false,
    owner: 'Banner/summon data + later composition'
  },
  {
    id: 'ASSET_EXPORT',
    scope: 'Convert authoritative prefab/image source paths into extracted web-serving assets',
    blockingStage5_5: false,
    owner: 'asset/export pipeline'
  }
];

const result = {
  version: 1,
  stage: 'hero-page-5-5',
  substage: '5-5-5',
  checkpoint: 'final-gate',
  status: failures.length ? 'FAIL' : 'PASS',
  completion: failures.length ? 'BLOCKED' : 'STAGE_5_5_COMPLETE',
  purpose: 'Final cross-stage gate for Hero header/basic-information Stage 5-5 after source semantics, integrated output, and display exception policies are frozen.',
  inputs: paths,
  summary: {
    checkCount: checks.length,
    passedCheckCount: checks.filter(c => c.pass).length,
    failedCheckCount: failures.length,
    canonicalHeroCount: 267,
    integratedOutputRecordCount: output.records.length,
    totalRegularSkinCount: s553.summary?.totalSkinCount ?? null,
    unencodedSkinAcquisitionCount: s553.summary?.unencodedSkinCount ?? null,
    hardBlockingDataGaps: 0,
    nonBlockingFollowupCount: nonBlockingFollowups.length,
  },
  stageResults: {
    '5-5-1': { completion: s551.completion, hardErrorCount: s551.hardErrors?.length ?? null },
    '5-5-2': { completion: s552.completion, hardErrorCount: s552.hardErrors?.length ?? null, unresolvedSemanticFieldCount: s552.unresolvedSemanticFields?.length ?? null, dataCompletionIssueCount: s552.dataCompletionIssues?.length ?? null },
    '5-5-3': { status: s553.status, completion: s553.completion, errorCount: s553.errors?.length ?? null, warningCount: s553.warnings?.length ?? null },
    '5-5-4': { status: s554.status, completion: s554.completion, errorCount: s554.errors?.length ?? null, warningCount: s554.warnings?.length ?? null },
  },
  checks,
  failures,
  nonBlockingFollowups,
  closurePolicy: {
    reopen5_5OnlyIf: [
      'A proven source contradiction invalidates a frozen Stage 5-5 semantic mapping.',
      'Canonical Hero identity changes and the Stage 5-5 pipeline must be regenerated for the new canonical snapshot.',
      'A structural regression breaks one of the frozen 5-5-3/5-5-4 invariants.'
    ],
    doNotReopenFor: [
      'Korean localization additions.',
      'Supplementing exact acquisition history for currently UNENCODED skins.',
      'SP composition owned by Stage 5-4/later composition.',
      'SSR(1-person-limited) banner composition.',
      'Asset extraction or web-path conversion.'
    ]
  },
  nextAction: failures.length ? 'Resolve failed final-gate checks before closing Stage 5-5.' : 'Close Hero Stage 5-5 and proceed to Stage 5-wide integration/final review without reopening 5-5 semantics.',
};

const outPath = path.join(root, 'data/validation/hero-page-stage5-5-5-final.v1.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, completion: result.completion, summary: result.summary, failures: result.failures, nonBlockingFollowups: result.nonBlockingFollowups, output: path.relative(root, outPath) }, null, 2));
if (failures.length) process.exitCode = 1;
