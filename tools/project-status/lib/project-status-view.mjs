import { normalizeProjectStatus } from './normalize-project-status.mjs';

const escapeCell = value => String(value ?? '-')
  .replaceAll('|', '\\|')
  .replaceAll('\n', '<br>');

const populationSummary = population => {
  const entries = Object.entries(population ?? {});
  return entries.length === 0 ? '-' : entries.map(([key, value]) => `${key}=${value}`).join(', ');
};

const nextWorkSummary = nextWork => {
  const values = (nextWork ?? [])
    .map(item => item?.value)
    .filter(value => typeof value === 'string' && value.length > 0);
  return values.length === 0 ? '-' : values.join(' / ');
};

export function projectStatusView(normalized) {
  if (normalized?.schemaId !== 'project-status-normalized/v1' || normalized?.status !== 'COLLECTED') {
    throw new Error(`Project Status projection refuses unsupported normalized input: ${normalized?.schemaId ?? 'missing'}/${normalized?.status ?? 'missing'}`);
  }
  if (normalized.readOnly !== true || normalized.rawConfigDataReadCount !== 0 || normalized.semanticRecomputationCount !== 0) {
    throw new Error('Project Status projection refuses unsafe normalized input.');
  }

  const domains = (normalized.domains ?? []).map(record => ({
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
    activeSourceId: record.activeSource?.selectedId ?? null,
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

  const names = domains.map(record => record.domain);
  if (new Set(names).size !== names.length) throw new Error('Project Status refuses duplicate domains.');

  return {
    version: 1,
    schemaId: 'project-status/v1',
    source: {
      path: 'tools/project-status/lib/normalize-project-status.mjs',
      schemaId: normalized.schemaId,
      stage: normalized.stage,
      status: normalized.status,
      authoritySchemaId: normalized.sourceAuthority?.schemaId ?? null,
    },
    derivedOnly: true,
    readOnly: true,
    rawConfigDataReadCount: 0,
    semanticRecomputationCount: 0,
    canonicalJoinRecomputationCount: 0,
    projectHealth: normalized.projectHealth,
    healthCounts: normalized.healthCounts ?? {},
    lifecycleCounts: normalized.lifecycleCounts ?? {},
    knownHardErrorTotal: normalized.knownHardErrorTotal ?? 0,
    reviewTotal: normalized.reviewTotal ?? 0,
    blockerTotal: normalized.blockerTotal ?? 0,
    domains,
  };
}

export function renderProjectStatusMarkdown(projectStatus) {
  const lines = [
    '# Project Status',
    '',
    '> NEW Status Source authority를 read-only로 정규화/투영한 canonical Project Status 결과다. raw ConfigData나 canonical relation 의미를 재계산하지 않는다.',
    '',
    `- Project health: **${projectStatus.projectHealth}**`,
    `- Hard errors: **${projectStatus.knownHardErrorTotal}**`,
    `- Reviews: **${projectStatus.reviewTotal}**`,
    `- Blockers: **${projectStatus.blockerTotal}**`,
    `- Source: \`${projectStatus.source.path}\``,
    '',
    '| Domain | Lifecycle | Health | Status | Population | Active source | Next work |',
    '|---|---|---|---|---|---|---|',
    ...projectStatus.domains.map(record => [
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
    '- source authority는 NEW Status Source selection만 따른다.',
    '- OLD Project Doctor D1/D5/generated registry를 runtime predecessor로 사용하지 않는다.',
    '- raw ConfigData를 직접 읽지 않는다.',
    '- canonical relation, identity, JOIN 의미를 재계산하지 않는다.',
    '- supplemental source는 명시된 facet 근거만 제공하며 primary lifecycle을 재작성하지 않는다.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function buildProjectStatus(runtime = {}) {
  const normalized = runtime.normalized ?? normalizeProjectStatus(runtime);
  const projectStatus = projectStatusView(normalized);
  return {
    normalized,
    projectStatus,
    markdown: renderProjectStatusMarkdown(projectStatus),
  };
}
