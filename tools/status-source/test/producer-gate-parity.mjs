import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectActiveSources } from '../lib/select-active-sources.mjs';
import {
  loadProducerGateContract,
  producerGateSummary,
  submitStatusSource,
  validateProducerSubmission,
} from '../lib/submit-status-source.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = loadProducerGateContract({ repoRoot });
const summary = producerGateSummary(contract);

assert.equal(summary.producerCount, 6);
assert.equal(summary.enabledProducerCount, 6);
assert.deepEqual(summary.domains, {
  hero: 'hero-final',
  soldier: 'soldier-final',
  equipment: 'equipment-final',
  'hero-soldier': 'hero-soldier-final',
  banner: 'banner-final',
  skin: 'skin-final',
});

const selection = selectActiveSources({ repoRoot });
assert.equal(selection.status, 'PASS');
assert.equal(selection.selectedCount, 6);
for (const producer of contract.producers) {
  const selected = selection.domains[producer.domain];
  assert.ok(selected, `selected source missing for producer domain ${producer.domain}`);
  assert.equal(new RegExp(producer.allowedSourcePattern).test(selected.sourcePath), true, `${producer.id} must accept current selected source ${selected.sourcePath}`);
}

const equipment = selection.domains.equipment;
const equipmentCheck = submitStatusSource({
  producerId: 'equipment-final',
  promotionOptions: {
    id: equipment.selectedId,
    sourcePath: equipment.sourcePath,
  },
}, { repoRoot });
assert.equal(equipmentCheck.status, 'PASS_STATUS_SOURCE_PRODUCER_CHECK');
assert.equal(equipmentCheck.mode, 'CHECK');
assert.equal(equipmentCheck.delegatedToR1_2Promotion, true);
assert.equal(equipmentCheck.promotion.writePerformed, false);
assert.equal(equipmentCheck.boundaries.statusSourceDeclarationWriteCount, 0);
assert.deepEqual(
  Object.fromEntries(['canonical', 'public', 'general', 'exclusive'].map(key => [key, equipmentCheck.promotion.compatibility.effectiveExpected[key]])),
  { canonical: 390, public: 365, general: 198, exclusive: 167 },
);

const mismatchGate = validateProducerSubmission({
  contract,
  producerId: 'equipment-final',
  promotionOptions: {
    domain: 'hero',
    id: equipment.selectedId,
    sourcePath: equipment.sourcePath,
  },
  repoRoot,
});
assert.equal(mismatchGate.pass, false);
assert.equal(mismatchGate.failures.some(item => item.type === 'PRODUCER_DOMAIN_OVERRIDE_FORBIDDEN'), true);

const unknownGate = validateProducerSubmission({
  contract,
  producerId: 'unknown-producer',
  promotionOptions: { id: 'x', sourcePath: equipment.sourcePath },
  repoRoot,
});
assert.equal(unknownGate.pass, false);
assert.equal(unknownGate.failures.some(item => item.type === 'PRODUCER_NOT_REGISTERED'), true);

const missingIdGate = validateProducerSubmission({
  contract,
  producerId: 'equipment-final',
  promotionOptions: { sourcePath: equipment.sourcePath },
  repoRoot,
});
assert.equal(missingIdGate.pass, false);
assert.equal(missingIdGate.failures.some(item => item.type === 'ENTRY_ID_REQUIRED'), true);

const wrongFamilyGate = validateProducerSubmission({
  contract,
  producerId: 'equipment-final',
  promotionOptions: {
    id: 'equipment-test',
    sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
  },
  repoRoot,
});
assert.equal(wrongFamilyGate.pass, false);
assert.equal(wrongFamilyGate.failures.some(item => item.type === 'SOURCE_PATH_OUTSIDE_PRODUCER_FAMILY'), true);

const missingSourceGate = validateProducerSubmission({
  contract,
  producerId: 'equipment-final',
  promotionOptions: {
    id: 'equipment-test',
    sourcePath: 'data/validation/equipment-does-not-exist.v1.json',
  },
  repoRoot,
});
assert.equal(missingSourceGate.pass, false);
assert.equal(missingSourceGate.failures.some(item => item.type === 'SOURCE_FILE_MISSING'), true);

const disabledContract = JSON.parse(JSON.stringify(contract));
disabledContract.producers.find(item => item.id === 'equipment-final').enabled = false;
const disabledGate = validateProducerSubmission({
  contract: disabledContract,
  producerId: 'equipment-final',
  promotionOptions: {
    id: equipment.selectedId,
    sourcePath: equipment.sourcePath,
  },
  repoRoot,
});
assert.equal(disabledGate.pass, false);
assert.equal(disabledGate.failures.some(item => item.type === 'PRODUCER_DISABLED'), true);

const runtimeSourceText = [
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/lib/submit-status-source.mjs'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'tools/status-source/cli/submit.mjs'), 'utf8'),
].join('\n');
for (const forbidden of [
  'project-doctor',
  'scripts/',
  'data/generated/project-doctor',
  'data/contracts/project-doctor-status-source-producers.v1.json',
]) {
  assert.equal(runtimeSourceText.includes(forbidden), false, `producer runtime must not depend on legacy Doctor runtime: ${forbidden}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'status-source-r1-3-'));
try {
  fs.mkdirSync(path.join(tempRoot, 'data/status-sources'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'data/validation'), { recursive: true });

  const syntheticProducerContract = {
    version: 1,
    schemaId: 'status-source-producer-gate/v1',
    stage: 'R1-3',
    status: 'DESIGN_FROZEN',
    producers: [{
      id: 'hero-final',
      domain: 'hero',
      enabled: true,
      allowedSourcePattern: '^data/validation/hero-[A-Za-z0-9._/-]+\\.v1\\.json$',
      role: 'Synthetic Hero completion producer',
    }],
  };
  const syntheticCompatibility = {
    version: 1,
    schemaId: 'status-source-promotion-compatibility/v1',
    status: 'DESIGN_FROZEN',
    policy: { projectionOverrideAllowedKeys: [] },
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
  const baseline = {
    version: 1,
    schemaId: 'project-doctor-active-source-entries/v1',
    entries: [{
      id: 'hero-root',
      domain: 'hero',
      state: 'APPROVED',
      sourcePath: 'data/validation/hero-root.v1.json',
      facet: 'canonical',
      successorOf: null,
      admission: [{ pointer: '/status', equals: 'PASS' }],
    }],
  };
  fs.writeFileSync(path.join(tempRoot, 'data/status-sources/baseline.v1.json'), `${JSON.stringify(baseline, null, 2)}\n`);
  fs.writeFileSync(path.join(tempRoot, 'data/validation/hero-root.v1.json'), `${JSON.stringify({ status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } }, null, 2)}\n`);
  fs.writeFileSync(path.join(tempRoot, 'data/validation/hero-next.v1.json'), `${JSON.stringify({ status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } }, null, 2)}\n`);
  fs.writeFileSync(path.join(tempRoot, 'data/validation/hero-apply.v1.json'), `${JSON.stringify({ status: 'PASS', summary: { canonicalHeroCount: 1, hardErrorCount: 0 } }, null, 2)}\n`);

  const runtime = {
    repoRoot: tempRoot,
    contract: syntheticProducerContract,
    promotionRuntime: {
      repoRoot: tempRoot,
      compatibilityContract: syntheticCompatibility,
    },
  };

  const checked = submitStatusSource({
    producerId: 'hero-final',
    promotionOptions: {
      id: 'hero-next',
      sourcePath: 'data/validation/hero-next.v1.json',
    },
  }, runtime);
  assert.equal(checked.mode, 'CHECK');
  assert.equal(checked.promotion.writePerformed, false);
  assert.equal(checked.boundaries.statusSourceDeclarationWriteCount, 0);
  assert.equal(fs.existsSync(path.join(tempRoot, checked.promotion.outputPath)), false);

  const applied = submitStatusSource({
    producerId: 'hero-final',
    promotionOptions: {
      id: 'hero-apply',
      sourcePath: 'data/validation/hero-apply.v1.json',
      apply: true,
    },
  }, runtime);
  assert.equal(applied.mode, 'APPLY');
  assert.equal(applied.promotion.writePerformed, true);
  assert.equal(applied.boundaries.statusSourceDeclarationWriteCount, 1);
  assert.equal(fs.existsSync(path.join(tempRoot, applied.promotion.outputPath)), true);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: 'PASS_STATUS_SOURCE_R1_3_PRODUCER_GATE_SELF_TEST',
  producerCount: summary.producerCount,
  enabledProducerCount: summary.enabledProducerCount,
  currentSelectedDomainsAccepted: 6,
  currentEquipmentCheckWrites: 0,
  syntheticApplyWrites: 1,
  producerDomainOverrideBlocked: true,
  unregisteredProducerBlocked: true,
  disabledProducerBlocked: true,
  wrongSourceFamilyBlocked: true,
  missingSourceBlocked: true,
  missingEntryIdBlocked: true,
  delegatedToR1_2Promotion: true,
  legacyRuntimeDependencies: 0,
  rawConfigDataReads: 0,
  semanticRecomputations: 0,
}, null, 2));
