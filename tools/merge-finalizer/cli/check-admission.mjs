#!/usr/bin/env node
import { githubRequest } from '../lib/github-api.mjs';
import { classifyMergeAdmission, DEFAULT_ADMISSION_LABEL, hasMergeAdmission } from '../lib/admission.mjs';

function parseArgs(argv) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    pr: null,
    label: DEFAULT_ADMISSION_LABEL,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repository') args.repository = argv[++i] ?? null;
    else if (arg === '--pr') args.pr = Number(argv[++i]);
    else if (arg === '--label') args.label = argv[++i] ?? DEFAULT_ADMISSION_LABEL;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.repository || !/^[^/]+\/[^/]+$/.test(args.repository)) {
    throw new Error('--repository owner/repo is required');
  }
  if (!Number.isInteger(args.pr) || args.pr <= 0) throw new Error('--pr must be a positive integer');
  if (!args.label) throw new Error('--label must be non-empty');
  return args;
}

async function readOpenPulls(repository, token) {
  const pulls = [];
  for (let page = 1; page <= 100; page += 1) {
    const current = await githubRequest(repository, `/pulls?state=open&base=main&per_page=100&page=${page}`, token);
    if (!Array.isArray(current)) throw new Error('GitHub open pulls response must be an array');
    pulls.push(...current);
    if (current.length < 100) break;
  }
  return pulls;
}

const args = parseArgs(process.argv.slice(2));
const token = process.env.GITHUB_TOKEN ?? '';
const [pr, openPulls] = await Promise.all([
  githubRequest(args.repository, `/pulls/${args.pr}`, token),
  readOpenPulls(args.repository, token),
]);

const activeAdmissions = openPulls
  .filter(candidate => candidate?.draft !== true && hasMergeAdmission(candidate, args.label))
  .map(candidate => candidate.number);
const result = classifyMergeAdmission({ pr, activeAdmissions, label: args.label });
console.log(JSON.stringify(result, null, 2));

if (result.status === 'ADMITTED') process.exitCode = 0;
else if (result.status === 'NOT_ADMITTED') process.exitCode = 3;
else process.exitCode = 1;
