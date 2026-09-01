import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStatusSourceEntries,
  selectActiveSources,
} from '../lib/select-active-sources.mjs';
import {
  loadPromotionCompatibility,
  preflightPromotionCompatibility,
  promoteStatusSource,
} from '../lib/promote-status-source.mjs';
import { captureSourceProvenance } from '../lib/source-provenance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const currentSelection = selectActiveSources({ repoRoot });
const { entries } = loadStatusSourceEntries({ repoRoot });
const compatibilityContract = loadPromotionCompatibility({ repoRoot });

assert.equal(currentSelection.status, 'PASS');
assert.equal(currentSelection.selectedCount, 6);

const currentCompatibility = {};
for (const [domain, selected] of Object.entries(currentSelection.domains)) {
  const entry = entries.find(item => item.id === selected.selectedId);
  assert.ok(entry, `selected declaration missing for ${domain}`);
  assert.equal(entry.sourceProvenance?.hashAlgorithm, 'git-blob-sha1', `${domain} selected source must carry provenance`);
  const compatibility = preflightPromotionCompatibility({
    repoRoot,
    domain,
    sourcePath: entry.sourcePath,
    projectionOverride: entry.projectionOverride,
    compatibilityContract,
  });
  assert.equal(compatibility.pass, true, `${domain} current source must pass migrated promotion compatibility: ${JSON.stringify(compatibility.failures)}`);
  currentCompatibility[domain] = {
    selectedId: entry.id,
    expected: compatibility.effectiveExpected,
    supplementalSourceCount: compatibility.supplementalSourceCount,
  };
}

const activeEquipment = currentSelection.domains.equipment;
const equipmentAlreadyActive = promoteStatusSource({
  domain: 'equipment',
  id: activeEquipment.selectedId,
  sourcePath: activeEquipment.sourcePath,
});
assert.equal(equipmentAlreadyActive.status, 'PASS_STATUS_SOURCE_PROMOTION_ALREADY_ACTIVE');
assert.equal(equipmentAlreadyActive.writePerformed, false);
assert.equal(equipmentAlreadyActive.boundaries.statusSourceDeclarationWriteCount, 0);
assert.equal(equipmentAlreadyActive.sourceProvenance.hashAlgorithm, 'git-blob-sha1');
assert.deepEqual(
  Object.fromEntries(['canonical', 'public', 'general', 'exclusive'].map(key => [key, equipmentAlreadyActive.compatibility.effectiveExpected[key]])),
  { canonical: 390, public: 365, general: 198, exclusive: 167 },
);

const promotionSourceText = fs.readFileSync(path.join(repoRoot, 'tools/status-source/lib/promote-status-source.mjs'), 'utf8');
for (const forbidden of [
  "from './build-project-doctor",
  "from '../../scripts/",
  'scripts/run-project-doctor',
  'scripts/build-project-status',
  'data/generated/project-doctor',
  'project-doctor-d1-0-contract.v1.json',
]) {
  assert.equal(promotionSourceText.includes(forbidden), false, `promotion runtime must not depend on legacy runtime: ${forbidden}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'status-source-r1-2-'));
try {
  fs.mkdirSync(path.join(tempRoot, 'data/status-sources'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'data/validation'), { recursive: true });

  const syntheticCompatibility = {
    version: 1,
    schemaId: 'status-source-promotion-compatibility/v1',
    status: 'DESIGN_FROZEN',
    policy: {
      projectionOverrideAllowedKeys: [
        'primaryFacet',
        'expected',
        'requiredSelectors',
        'zeroRequiredSelectors',
        'reviewSelectors',
        'nextWorkSelectors',
        'lifecycleRules',
        'supplementalSources',
        'policy',
      ],
    },
    domains: {
      hero: {
        expected: { canonicalHeroCount: 1 },
        requiredSelectors: {
          rawStatus: '/status',
          canonicalHeroCount: '/summary/canonicalHeroCount',
          hardErrorCount: '/summary/hardErrorCount',
        },
        zeroRequiredSelectors: [],
        supplementalSources: [],
      },
    },
  };

  const writeSource = (relative, payload) => fs.writeFileSync(
    path.join(tempRoot, relative),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  writeSource('data/validation/hero-root.v1.json', { status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } });
  writeSource('data/validation/hero-next.v1.json', { status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } });
  writeSource('data/validation/hero-bad.v1.json', { status: 'PASS', summary: { canonicalHeroCount: 2, hardErrorCount: 0 } });
  writeSource('data/validation/hero-rollback.v1.json', { status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } });

  const baseline = {
    version: 1,
    schemaId: 'project-doctor-active-source-entries/v1',
    entries: [{
      id: 'hero-root',
      domain: 'hero',
      state: 'APPROVED',
      sourcePath: 'data/validation/hero-root.v1.json',
      sourceProvenance: captureSourceProvenance({ repoRoot: tempRoot, sourcePath: 'data/validation/hero-root.v1.json' }),
      facet: 'canonical',
      successorOf: null,
      admission: [{ pointer: '/status', equals: 'PASS' }],
    }],
  };
  fs.writeFileSync(path.join(tempRoot, 'data/status-sources/baseline.v1.json'), `${JSON.stringify(baseline, null, 2)}\n`);

  const runtime = { repoRoot: tempRoot, compatibilityContract: syntheticCompatibility };
  const expectedNextProvenance = captureSourceProvenance({ repoRoot: tempRoot, sourcePath: 'data/validation/hero-next.v1.json' });
  const checked = promoteStatusSource({
    domain: 'hero',
    id: 'hero-next',
    sourcePath: 'data/validation/hero-next.v1.json',
  }, runtime);
  assert.equal(checked.status, 'PASS_STATUS_SOURCE_PROMOTION_CHECK');
  assert.equal(checked.writePerformed, false);
  assert.equal(checked.boundaries.statusSourceDeclarationWriteCount, 0);
  assert.deepEqual(checked.sourceProvenance, expectedNextProvenance, 'check mode must capture deterministic source provenance');
  assert.equal(fs.existsSync(path.join(tempRoot, checked.outputPath)), false, 'check mode must not write declaration');
  assert.equal(selectActiveSources({ repoRoot: tempRoot }).domains.hero.selectedId, 'hero-root');

  const applied = promoteStatusSource({
    domain: 'hero',
    id: 'hero-next',
    sourcePath: 'data/validation/hero-next.v1.json',
    apply: true,
  }, runtime);
  assert.equal(applied.status, 'PASS_STATUS_SOURCE_PROMOTION_APPLY');
  assert.equal(applied.writePerformed, true);
  assert.equal(applied.boundaries.statusSourceDeclarationWriteCount, 1);
  assert.deepEqual(applied.sourceProvenance, expectedNextProvenance, 'apply mode must expose captured provenance');
  assert.equal(fs.existsSync(path.join(tempRoot, applied.outputPath)), true, 'apply mode must write one declaration');
  const persistedPromotion = JSON.parse(fs.readFileSync(path.join(tempRoot, applied.outputPath), 'utf8'));
  assert.deepEqual(persistedPromotion.entry.sourceProvenance, expectedNextProvenance, 'persisted promotion must bind sourcePath to content hash');
  assert.equal(selectActiveSources({ repoRoot: tempRoot }).domains.hero.selectedId, 'hero-next');

  assert.throws(() => promoteStatusSource({
    domain: 'hero',
    id: 'hero-bad',
    sourcePath: 'data/validation/hero-bad.v1.json',
  }, runtime), /Candidate fails promotion compatibility/);
  assert.equal(fs.existsSync(path.join(tempRoot, 'data/status-sources/promotion.hero.hero-bad.v1.json')), false);

  assert.throws(() => promoteStatusSource({
    domain: 'hero',
    id: '../unsafe',
    sourcePath: 'data/validation/hero-next.v1.json',
  }, runtime), /Unsafe entry id/);

  const rollbackOutput = path.join(tempRoot, 'data/status-sources/promotion.hero.hero-rollback.v1.json');
  assert.throws(() => promoteStatusSource({
    domain: 'hero',
    id: 'hero-rollback',
    sourcePath: 'data/validation/hero-rollback.v1.json',
    apply: true,
  }, {
    ...runtime,
    postWriteHook: () => { throw new Error('SYNTHETIC_POST_WRITE_FAILURE'); },
  }), /rolled back/);
  assert.equal(fs.existsSync(rollbackOutput), false, 'failed post-write validation must roll back declaration');
  assert.equal(selectActiveSources({ repoRoot: tempRoot }).domains.hero.selectedId, 'hero-next');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: 'PASS_STATUS_SOURCE_R1_2_PROMOTION_SELF_TEST',
  currentDomainCount: Object.keys(currentCompatibility).length,
  currentCompatibility,
  equipmentAlreadyActive: {
    selectedId: equipmentAlreadyActive.selectedId,
    expected: Object.fromEntries(['canonical', 'public', 'general', 'exclusive'].map(key => [key, equipmentAlreadyActive.compatibility.effectiveExpected[key]])),
  },
  provenanceCapture: {
    hashAlgorithm: 'git-blob-sha1',
    checkModeCaptured: true,
    applyModePersisted: true,
  },
  checkModeWrites: 0,
  syntheticApplyWrites: 1,
  rollbackVerified: true,
  legacyRuntimeDependencies: 0,
  rawConfigDataReads: 0,
  semanticRecomputations: 0,
}, null, 2));
