import fs from 'node:fs';
import { buildRegistry } from './build-project-doctor-active-source-registry.mjs';
import { promoteStatusSource } from './promote-project-doctor-status-source.mjs';

const checks = [];
const record = (name, pass, detail = null) => checks.push({ name, pass, detail });
const expectThrow = (name, fn, expectedFragment) => {
  try {
    fn();
    record(name, false, 'DID_NOT_THROW');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, message.includes(expectedFragment), message);
  }
};

const registry = buildRegistry({ write: false }).result;
record(
  'current registry passes before promotion tests',
  registry.status === 'PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY' && registry.selectedCount === 6,
  { status: registry.status, selectedCount: registry.selectedCount },
);

const dryRunId = 'fixture-stage3-hero-inherited-successor';
const dryRunPath = `data/status-sources/promotion.hero.${dryRunId}.v1.json`;
if (fs.existsSync(dryRunPath)) throw new Error(`Fixture output unexpectedly exists before test: ${dryRunPath}`);
const inherited = promoteStatusSource({
  domain: 'hero',
  id: dryRunId,
  sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
  check: true,
  equals: [],
  in: [],
});
record(
  'inherited admission dry-run promotes terminal successor',
  inherited.status === 'PASS_STATUS_SOURCE_PROMOTION_CHECK'
    && inherited.predecessorId === 'hero-stage6-4-final'
    && inherited.selectedId === dryRunId
    && inherited.admissionMode === 'INHERITED'
    && inherited.d1Preflight?.pass === true,
  inherited,
);
record('dry-run writes no sidecar', !fs.existsSync(dryRunPath), dryRunPath);

expectThrow(
  'inherited admission blocks incompatible source schema/status',
  () => promoteStatusSource({
    domain: 'hero',
    id: 'fixture-stage3-hero-incompatible',
    sourcePath: 'data/validation/hero-list-stage5.v1.json',
    check: true,
    equals: [],
    in: [],
  }),
  'Candidate registry blocked',
);

expectThrow(
  'explicit admission cannot bypass effective D1 projection',
  () => promoteStatusSource({
    domain: 'hero',
    id: 'fixture-stage3-hero-d1-incompatible',
    sourcePath: 'data/validation/hero-list-stage5.v1.json',
    check: true,
    equals: [
      { pointer: '/status', equals: 'PASS' },
      { pointer: '/completion', equals: 'VALIDATED' },
    ],
    in: [],
  }),
  'Candidate fails effective D1 projection',
);

const explicit = promoteStatusSource({
  domain: 'hero',
  id: 'fixture-stage3-hero-explicit-admission',
  sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
  check: true,
  equals: [
    { pointer: '/status', equals: 'PASS_WITH_REVIEW' },
    { pointer: '/completion', equals: 'COMPLETE' },
    { pointer: '/heroDataPipelineStatus', equals: 'FINAL_FROZEN' },
  ],
  in: [],
});
record(
  'explicit admission remains supported when intent is declared',
  explicit.status === 'PASS_STATUS_SOURCE_PROMOTION_CHECK'
    && explicit.admissionMode === 'EXPLICIT'
    && explicit.d1Preflight?.pass === true,
  explicit,
);

expectThrow(
  'unsafe promotion id is rejected',
  () => promoteStatusSource({
    domain: 'hero',
    id: '../unsafe',
    sourcePath: 'data/validation/hero-stage6-4-final.v1.json',
    check: true,
    equals: [],
    in: [],
  }),
  'Unsafe entry id',
);

expectThrow(
  'missing source is rejected before registry mutation',
  () => promoteStatusSource({
    domain: 'hero',
    id: 'fixture-stage3-missing-source',
    sourcePath: 'data/validation/this-file-must-not-exist.v1.json',
    check: true,
    equals: [],
    in: [],
  }),
  'Source file does not exist',
);

const failures = checks.filter(check => !check.pass);
const summary = {
  version: 1,
  schemaId: 'project-doctor-status-source-promotion-validation/v1',
  stage: 'PROJECT-STATUS-STAGE3',
  checkpoint: 'PROJECT_DOCTOR_STATUS_SOURCE_PROMOTION',
  status: failures.length === 0
    ? 'PASS_PROJECT_DOCTOR_STATUS_SOURCE_PROMOTION_VALIDATION'
    : 'FAIL_PROJECT_DOCTOR_STATUS_SOURCE_PROMOTION_VALIDATION',
  completion: failures.length === 0 ? 'COMPLETE' : 'BLOCKED',
  checkCount: checks.length,
  passCount: checks.length - failures.length,
  failureCount: failures.length,
  checks,
  failures,
  boundaries: {
    rawConfigDataRead: false,
    semanticRecomputation: false,
    canonicalJoinRecomputation: false,
    fixtureRepositoryMutation: false,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exitCode = 1;
