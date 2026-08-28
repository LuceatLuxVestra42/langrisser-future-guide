import { validateProducerSubmission, submitStatusSource } from './submit-project-doctor-status-source.mjs';

const contract = {
  status: 'DESIGN_FROZEN',
  producers: [
    {
      id: 'hero-final',
      domain: 'hero',
      enabled: true,
      allowedSourcePattern: '^data/validation/hero-[A-Za-z0-9._/-]+\\.v1\\.json$',
    },
    {
      id: 'skin-disabled',
      domain: 'skin',
      enabled: false,
      allowedSourcePattern: '^data/validation/skin-[A-Za-z0-9._/-]+\\.v1\\.json$',
    },
  ],
};

const cases = [];
const record = (id, pass, detail = null) => cases.push({ id, pass, detail });
const expectGate = (id, producerId, promotionOptions, expectedPass, expectedType = null) => {
  const result = validateProducerSubmission({ contract, producerId, promotionOptions });
  const typePass = expectedType === null || result.failures.some(item => item.type === expectedType);
  record(id, result.pass === expectedPass && typePass, result);
};

expectGate(
  'REGISTERED_PRODUCER_ACCEPTS_OWN_OUTPUT_FAMILY',
  'hero-final',
  { id: 'hero-next-final', sourcePath: 'data/validation/hero-next-final.v1.json', check: true },
  true,
);
expectGate(
  'UNREGISTERED_PRODUCER_BLOCKED',
  'unknown-final',
  { id: 'x', sourcePath: 'data/validation/hero-next-final.v1.json', check: true },
  false,
  'PRODUCER_NOT_REGISTERED',
);
expectGate(
  'DISABLED_PRODUCER_BLOCKED',
  'skin-disabled',
  { id: 'skin-next', sourcePath: 'data/validation/skin-next.v1.json', check: true },
  false,
  'PRODUCER_DISABLED',
);
expectGate(
  'CROSS_DOMAIN_OVERRIDE_BLOCKED',
  'hero-final',
  { domain: 'soldier', id: 'hero-next', sourcePath: 'data/validation/hero-next.v1.json', check: true },
  false,
  'PRODUCER_DOMAIN_OVERRIDE_FORBIDDEN',
);
expectGate(
  'WRONG_OUTPUT_FAMILY_BLOCKED',
  'hero-final',
  { id: 'hero-next', sourcePath: 'data/validation/soldier-next.v1.json', check: true },
  false,
  'SOURCE_PATH_OUTSIDE_PRODUCER_FAMILY',
);
expectGate(
  'CHECKPOINT_PATH_BLOCKED_WHEN_NOT_ALLOWLISTED',
  'hero-final',
  { id: 'hero-next', sourcePath: 'data/checkpoints/hero-next.v1.json', check: true },
  false,
  'SOURCE_PATH_OUTSIDE_PRODUCER_FAMILY',
);
expectGate(
  'ENTRY_ID_REQUIRED',
  'hero-final',
  { sourcePath: 'data/validation/hero-next.v1.json', check: true },
  false,
  'ENTRY_ID_REQUIRED',
);

let delegatedOptions = null;
const delegated = submitStatusSource(
  {
    producerId: 'hero-final',
    promotionOptions: {
      domain: undefined,
      id: 'hero-next-final',
      sourcePath: 'data/validation/hero-next-final.v1.json',
      check: true,
    },
  },
  {
    contract,
    promote: options => {
      delegatedOptions = options;
      return { status: 'PASS_STATUS_SOURCE_PROMOTION_CHECK', writePerformed: false };
    },
  },
);
record(
  'REGISTERED_PRODUCER_DELEGATES_TO_STAGE3_WITH_FORCED_DOMAIN',
  delegated.status === 'PASS_STATUS_SOURCE_PRODUCER_CHECK'
    && delegated.domain === 'hero'
    && delegatedOptions?.domain === 'hero'
    && delegatedOptions?.check === true,
  { delegated, delegatedOptions },
);

let bypassed = false;
try {
  submitStatusSource(
    {
      producerId: 'hero-final',
      promotionOptions: {
        domain: 'soldier',
        id: 'bad',
        sourcePath: 'data/validation/hero-next.v1.json',
        check: true,
      },
    },
    {
      contract,
      promote: () => {
        bypassed = true;
        return {};
      },
    },
  );
} catch {
  // expected
}
record('BLOCKED_GATE_NEVER_CALLS_STAGE3', bypassed === false, { bypassed });

const failed = cases.filter(item => !item.pass);
const summary = {
  version: 1,
  stage: 'PROJECT-STATUS-STAGE4',
  checkpoint: 'PROJECT_DOCTOR_STATUS_SOURCE_PRODUCER_GATE_SELF_TEST',
  status: failed.length === 0 ? 'PASS_STATUS_SOURCE_PRODUCER_GATE_SELF_TEST' : 'FAIL_STATUS_SOURCE_PRODUCER_GATE_SELF_TEST',
  completion: failed.length === 0 ? 'COMPLETE' : 'BLOCKED',
  testCount: cases.length,
  passedCount: cases.length - failed.length,
  failedCount: failed.length,
  cases,
  boundaries: {
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
  },
};

console.log(JSON.stringify(summary, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
