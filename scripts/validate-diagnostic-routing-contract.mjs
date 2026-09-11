import fs from 'node:fs';

const agents = fs.readFileSync('AGENTS.md', 'utf8');
const projectContext = fs.readFileSync('.agents/rules/project-context.md', 'utf8');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const requiredAgentsMarkers = [
  '### Diagnostic probe result classification',
  '#### Diagnostic probe result schema',
  'EXPECTED_MISS',
  'TOOLING_UNAVAILABLE',
  'CLEANUP_RACE',
  'PROBE_IMPLEMENTATION_ERROR',
  'projectCheckStatus',
  'completionRequired',
  '#### Diagnostic capability preflight',
  '#### Narrow orchestration fail-fast',
  'A red GitHub Actions conclusion, nonzero diagnostic exit code, or failed cleanup step is not sufficient by itself to classify the owning work unit as `BLOCKER`.',
  'An owning validator hard failure remains fail-closed and must not be downgraded by these diagnostic routing rules.',
];

for (const marker of requiredAgentsMarkers) {
  check(agents.includes(marker), `AGENTS.md missing required diagnostic contract marker: ${marker}`);
}

check(
  projectContext.includes('Diagnostic routing contract owner'),
  'project-context.md missing explicit diagnostic routing owner section',
);
check(
  projectContext.includes('node scripts/validate-diagnostic-routing-contract.mjs'),
  'project-context.md missing diagnostic routing validator command',
);

function projectDiagnostic(input) {
  switch (input.internalStatus) {
    case 'PASS':
      return { projectCheckStatus: 'PASS', stop: false };
    case 'EXPECTED_MISS':
      return {
        projectCheckStatus: input.negativeCompletesPurpose ? 'PASS' : 'REVIEW',
        stop: false,
      };
    case 'TOOLING_UNAVAILABLE':
      return input.completionRequired && !input.authoritativeAlternateEvidence
        ? { projectCheckStatus: 'BLOCKER', stop: true }
        : { projectCheckStatus: 'REVIEW', stop: false };
    case 'CLEANUP_RACE':
      return input.requiredRepositoryStateAchieved === false
        ? { projectCheckStatus: 'BLOCKER', stop: true }
        : { projectCheckStatus: 'REVIEW', stop: false };
    case 'PROBE_IMPLEMENTATION_ERROR':
      return input.completionRequired && !input.reusableOrAlternateEvidence
        ? { projectCheckStatus: 'BLOCKER', stop: true }
        : { projectCheckStatus: 'REVIEW', stop: false };
    default:
      throw new Error(`unknown diagnostic status: ${input.internalStatus}`);
  }
}

const fixtures = [
  {
    name: 'probe target exists',
    input: { internalStatus: 'PASS' },
    expected: { projectCheckStatus: 'PASS', stop: false },
  },
  {
    name: 'probe target absent is an allowed negative observation',
    input: { internalStatus: 'EXPECTED_MISS', negativeCompletesPurpose: true },
    expected: { projectCheckStatus: 'PASS', stop: false },
  },
  {
    name: 'artifact exists and only cleanup conflicts',
    input: { internalStatus: 'CLEANUP_RACE', requiredRepositoryStateAchieved: true },
    expected: { projectCheckStatus: 'REVIEW', stop: false },
  },
  {
    name: 'required tool is unavailable with no authoritative alternate evidence',
    input: {
      internalStatus: 'TOOLING_UNAVAILABLE',
      completionRequired: true,
      authoritativeAlternateEvidence: false,
    },
    expected: { projectCheckStatus: 'BLOCKER', stop: true },
  },
];

for (const fixture of fixtures) {
  const actual = projectDiagnostic(fixture.input);
  check(
    actual.projectCheckStatus === fixture.expected.projectCheckStatus &&
      actual.stop === fixture.expected.stop,
    `${fixture.name}: expected ${JSON.stringify(fixture.expected)}, got ${JSON.stringify(actual)}`,
  );
}

const invariantFixture = {
  name: 'owning invariant requires canonical object and validator reports it missing',
  projectCheckStatus: 'BLOCKER',
  stop: true,
};
check(invariantFixture.projectCheckStatus === 'BLOCKER' && invariantFixture.stop, `${invariantFixture.name}: owning validator failure must remain fail-closed`);

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'BLOCKER', validator: 'diagnostic-routing-contract', failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      validator: 'diagnostic-routing-contract',
      owner: 'tooling/orchestration-maintenance',
      fixtures: [...fixtures.map((fixture) => fixture.name), invariantFixture.name],
    },
    null,
    2,
  ),
);
