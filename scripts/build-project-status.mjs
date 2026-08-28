import fs from 'node:fs';
import path from 'node:path';

const SOURCE_PATH = 'data/generated/project-doctor-d1-1-status.v1.json';
const JSON_OUTPUT_PATH = 'data/generated/project-status.v1.json';
const MARKDOWN_OUTPUT_PATH = 'PROJECT_STATUS.md';
const CHECK_MODE = process.argv.includes('--check');

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;

const escapeCell = value => String(value ?? '-')
  .replaceAll('|', '\\|')
  .replaceAll('\n', '<br>');

const populationSummary = population => {
  const entries = Object.entries(population ?? {});
  return entries.length === 0
    ? '-'
    : entries.map(([key, value]) => `${key}=${value}`).join(', ');
};

const nextWorkSummary = nextWork => {
  const values = (nextWork ?? [])
    .map(item => item?.value)
    .filter(value => typeof value === 'string' && value.length > 0);
  return values.length === 0 ? '-' : values.join(' / ');
};

const source = readJson(SOURCE_PATH);

const requiredSourceState = {
  readOnly: true,
  rawConfigDataReadCount: 0,
  semanticRecomputationCount: 0,
};

for (const [key, expected] of Object.entries(requiredSourceState)) {
  if (source[key] !== expected) {
    throw new Error(`Project Status refuses unsafe Doctor source: ${key}=${source[key]} (expected ${expected})`);
  }
}

const domains = (source.domains ?? []).map(record => ({
  domain: record.domain,
  lifecycle: record.lifecycle,
  health: record.health,
  status: record.rawStatus ?? null,
  completion: record.rawCompletion ?? null,
  freezeState: record.rawFreezeState ?? null,
  population: record.population ?? {},
  hardErrorCount: record.hardErrorCount ?? 0,
  reviewCount: record.reviewCount ?? 0,
  blockerCount: (record.blockers ?? []).length,
  activeSource: record.primarySource?.path ?? null,
  supplementalSources: (record.supplementalSources ?? []).map(item => ({
    path: item.path,
    role: item.role ?? null,
    facet: item.facet ?? null,
  })),
  nextWork: (record.nextWork ?? []).map(item => ({
    source: item.source ?? null,
    selector: item.selector ?? null,
    value: item.value ?? null,
  })),
}));

const domainNames = domains.map(record => record.domain);
if (new Set(domainNames).size !== domainNames.length) {
  throw new Error('Project Status refuses duplicate Doctor domains.');
}

const projectStatus = {
  version: 1,
  schemaId: 'project-status/v1',
  source: {
    path: SOURCE_PATH,
    schemaId: source.schemaId,
    stage: source.stage,
    status: source.status,
  },
  derivedOnly: true,
  rawConfigDataReadCount: 0,
  semanticRecomputationCount: 0,
  projectHealth: source.projectHealth,
  healthCounts: source.healthCounts ?? {},
  lifecycleCounts: source.lifecycleCounts ?? {},
  knownHardErrorTotal: source.knownHardErrorTotal ?? 0,
  reviewTotal: source.reviewTotal ?? 0,
  blockerTotal: source.blockerTotal ?? 0,
  domains,
};

const markdownLines = [
  '# Project Status',
  '',
  '> 자동 생성 파일. `data/generated/project-doctor-d1-1-status.v1.json`을 경량 투영하며 canonical 의미를 재계산하지 않는다.',
  '',
  `- Project health: **${projectStatus.projectHealth}**`,
  `- Hard errors: **${projectStatus.knownHardErrorTotal}**`,
  `- Reviews: **${projectStatus.reviewTotal}**`,
  `- Blockers: **${projectStatus.blockerTotal}**`,
  `- Source: \`${SOURCE_PATH}\``,
  '',
  '| Domain | Lifecycle | Health | Status | Population | Active source | Next work |',
  '|---|---|---|---|---|---|---|',
  ...domains.map(record => [
    escapeCell(record.domain),
    escapeCell(record.lifecycle),
    escapeCell(record.health),
    escapeCell(record.status),
    escapeCell(populationSummary(record.population)),
    escapeCell(record.activeSource),
    escapeCell(nextWorkSummary(record.nextWork)),
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
  '',
  '## 운용 경계',
  '',
  '- 이 파일은 Project Doctor D1 상태의 파생 뷰다.',
  '- raw ConfigData를 직접 읽지 않는다.',
  '- canonical relation, identity, JOIN 의미를 재계산하지 않는다.',
  '- 상세 근거는 각 domain의 `activeSource`와 Project Doctor 원본 상태를 따른다.',
  '',
];

const expectedOutputs = new Map([
  [JSON_OUTPUT_PATH, stableJson(projectStatus)],
  [MARKDOWN_OUTPUT_PATH, `${markdownLines.join('\n')}\n`],
]);

if (CHECK_MODE) {
  let failed = false;
  for (const [filePath, expected] of expectedOutputs) {
    if (!fs.existsSync(filePath)) {
      console.error(`[project-status] missing generated file: ${filePath}`);
      failed = true;
      continue;
    }
    const actual = fs.readFileSync(filePath, 'utf8');
    if (actual !== expected) {
      console.error(`[project-status] stale generated file: ${filePath}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log('[project-status] PASS: generated JSON/Markdown are current.');
  process.exit(0);
}

for (const [filePath, content] of expectedOutputs) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`[project-status] wrote ${filePath}`);
}
