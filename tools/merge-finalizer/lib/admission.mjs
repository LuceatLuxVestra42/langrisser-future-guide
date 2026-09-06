export const DEFAULT_ADMISSION_LABEL = 'merge-admitted';

function labelNames(pr) {
  return (pr?.labels ?? []).map(label => (
    typeof label === 'string' ? label : label?.name
  )).filter(name => typeof name === 'string' && name.length > 0);
}

export function hasMergeAdmission(pr, label = DEFAULT_ADMISSION_LABEL) {
  return labelNames(pr).includes(label);
}

export function classifyMergeAdmission({
  pr,
  activeAdmissions = [],
  label = DEFAULT_ADMISSION_LABEL,
} = {}) {
  if (pr?.state !== 'open') {
    return { status: 'NOT_ADMITTED', reason: 'PR_NOT_OPEN' };
  }
  if (pr?.draft === true) {
    return { status: 'NOT_ADMITTED', reason: 'DRAFT' };
  }
  if (!hasMergeAdmission(pr, label)) {
    return { status: 'NOT_ADMITTED', reason: 'LABEL_MISSING' };
  }

  const active = [...new Set((activeAdmissions ?? [])
    .map(item => Number(item?.number ?? item))
    .filter(number => Number.isInteger(number) && number > 0))]
    .sort((a, b) => a - b);

  if (!active.includes(Number(pr.number))) {
    return {
      status: 'BLOCKER_ADMISSION_INDEX_MISMATCH',
      prNumber: Number(pr.number),
      activeAdmissions: active,
    };
  }
  if (active.length > 1) {
    return {
      status: 'BLOCKER_MULTIPLE_MERGE_ADMISSIONS',
      prNumber: Number(pr.number),
      activeAdmissions: active,
    };
  }

  return {
    status: 'ADMITTED',
    prNumber: Number(pr.number),
    label,
    activeAdmissions: active,
  };
}
