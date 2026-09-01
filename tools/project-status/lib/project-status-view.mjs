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

const REVIEW_LIFECYCLES = [
  'ACTIVE_REVIEW',
  'RESOLVED_BY_EVIDENCE',
  'DEFERRED_NON_ERROR',
  'BOUNDARY_NOTE',
];

const reviewAggregate = reviews => {
  const records = reviews ?? [];
  const reviewLifecycleCounts = Object.fromEntries(REVIEW_LIFECYCLES
    .map(lifecycle => [lifecycle, records.filter(review => review?.lifecycle === lifecycle).length]));
  const classifiedTotal = Object.values(reviewLifecycleCounts).reduce((sum, count) => sum + count, 0);
  if (classifiedTotal !== records.length) {
    throw new Error(`Project Status refuses unclassified review lifecycle entries: classified=${classifiedTotal}/reported=${records.length}.`);
  }

  return {
    reportedReviewTotal: records.length,
    activeReviewTotal: reviewLifecycleCounts.ACTIVE_REVIEW,
    resolvedReviewTotal: reviewLifecycleCounts.RESOLVED_BY_EVIDENCE,
    deferredReviewTotal: reviewLifecycleCounts.DEFERRED_NON_ERROR,
    boundaryNoteTotal: reviewLifecycleCounts.BOUNDARY_NOTE,
    healthImpactReviewTotal: records.filter(review => review?.healthImpact === true).length,
    reviewLifecycleCounts,
  };
};

const issueAggregate = reviews => {
  const records = reviews ?? [];
  const assigned = records.filter(review => typeof review?.issueKey === 'string' && review.issueKey.length > 0);
  const unassignedReviewTotal = records.length - assigned.length;
  const grouped = new Map();

  for (const review of assigned) {
    const issueKey = review.issueKey;
    if (!grouped.has(issueKey)) grouped.set(issueKey, []);
    grouped.get(issueKey).push(review);
  }

  const reviewIssues = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([issueKey, issueReviews]) => {
      const aggregate = reviewAggregate(issueReviews);
      const domains = [...new Set(issueReviews
        .map(review => review?.domain)
        .filter(domain => typeof domain === 'string' && domain.length > 0))].sort();
      return {
        issueKey,
        reportedReviewEntryCount: aggregate.reportedReviewTotal,
        activeReviewEntryCount: aggregate.activeReviewTotal,
        resolvedReviewEntryCount: aggregate.resolvedReviewTotal,
        deferredReviewEntryCount: aggregate.deferredReviewTotal,
        boundaryNoteEntryCount: aggregate.boundaryNoteTotal,
        healthImpactReviewEntryCount: aggregate.healthImpactReviewTotal,
        domains,
      };
    });

  return {
    assignedIssueReviewTotal: assigned.length,
    unassignedReviewTotal,
    uniqueIssueTotal: reviewIssues.length,
    healthImpactIssueTotal: reviewIssues.filter(issue => issue.healthImpactReviewEntryCount > 0).length,
    reviewIssues,
  };
};

const reviewsWithDomain = (domain, reviews) => (reviews ?? []).map(review => ({ ...review, domain }));

export function projectStatusView(normalized) {
  if (normalized?.schemaId !== 'project-status-normalized/v1' || normalized?.status !== 'COLLECTED') {
    throw new Error(`Project Status projection refuses unsupported normalized input: ${normalized?.schemaId ?? 'missing'}/${normalized?.status ?? 'missing'}`);
  }
  if (normalized.readOnly !== true || normalized.rawConfigDataReadCount !== 0 || normalized.semanticRecomputationCount !== 0) {
    throw new Error('Project Status projection refuses unsafe normalized input.');
  }

  const domains = (normalized.domains ?? []).map(record => {
    const domainReviews = reviewsWithDomain(record.domain, record.reviews);
    return {
      domain: record.domain,
      lifecycle: record.lifecycle,
      health: record.health,
      status: record.rawStatus ?? null,
      completion: record.rawCompletion ?? null,
      freezeState: record.rawFreezeState ?? null,
      population: record.population ?? {},
      hardErrorCount: record.hardErrorCount ?? 0,
      reviewCount: record.reviewCount ?? 0,
      ...reviewAggregate(domainReviews),
      ...issueAggregate(domainReviews),
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
    };
  });

  const names = domains.map(record => record.domain);
  if (new Set(names).size !== names.length) throw new Error('Project Status refuses duplicate domains.');

  const allReviews = (normalized.domains ?? []).flatMap(record => reviewsWithDomain(record.domain, record.reviews));
  const aggregate = reviewAggregate(allReviews);
  const issues = issueAggregate(allReviews);

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
    ...aggregate,
    ...issues,
    blockerTotal: normalized.blockerTotal ?? 0,
    domains,
  };
}

export function renderProjectStatusMarkdown(projectStatus) {
  const healthImpactIssues = (projectStatus.reviewIssues ?? [])
    .filter(issue => issue.healthImpactReviewEntryCount > 0);
  const healthImpactIssueRows = healthImpactIssues.length > 0
    ? healthImpactIssues.map(issue => [
      escapeCell(issue.issueKey),
      escapeCell(issue.domains.join(', ')),
      escapeCell(issue.healthImpactReviewEntryCount),
      escapeCell(issue.reportedReviewEntryCount),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    : ['| - | - | 0 | 0 |'];

  const lines = [
    '# Project Status',
    '',
    '> NEW Status Source authority를 read-only로 정규화/투영한 canonical Project Status 결과다. raw ConfigData나 canonical relation 의미를 재계산하지 않는다.',
    '',
    `- Project health: **${projectStatus.projectHealth}**`,
    `- Hard errors: **${projectStatus.knownHardErrorTotal}**`,
    `- Reported review entries: **${projectStatus.reportedReviewTotal}**`,
    `- Health-impact review entries: **${projectStatus.healthImpactReviewTotal}**`,
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
    '## Review 상태',
    '',
    '> Reported review entry는 source에 남아 있는 review 기록 수다. 현재 health를 REVIEW로 만드는 항목 수와 같지 않다.',
    '',
    `- Active review entries: **${projectStatus.activeReviewTotal}**`,
    `- Resolved by evidence: **${projectStatus.resolvedReviewTotal}**`,
    `- Deferred non-errors: **${projectStatus.deferredReviewTotal}**`,
    `- Boundary notes: **${projectStatus.boundaryNoteTotal}**`,
    `- Assigned health-impact issues: **${projectStatus.healthImpactIssueTotal}**`,
    `- Unique assigned issues: **${projectStatus.uniqueIssueTotal}**`,
    `- Unassigned review entries: **${projectStatus.unassignedReviewTotal}**`,
    '',
    '| Domain | Reported | Health-impact | Active | Resolved | Deferred | Boundary | Health |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...projectStatus.domains.map(record => [
      escapeCell(record.domain),
      escapeCell(record.reportedReviewTotal),
      escapeCell(record.healthImpactReviewTotal),
      escapeCell(record.activeReviewTotal),
      escapeCell(record.resolvedReviewTotal),
      escapeCell(record.deferredReviewTotal),
      escapeCell(record.boundaryNoteTotal),
      escapeCell(record.health),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
    '',
    '### Health-impact issueKey',
    '',
    '> 아래 표는 explicit issueKey가 배정된 health-impact review만 보여준다. issueKey가 없는 review는 추측으로 묶거나 중복 제거하지 않는다.',
    '',
    '| Issue key | Domains | Health-impact entries | Reported entries |',
    '|---|---|---:|---:|',
    ...healthImpactIssueRows,
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
