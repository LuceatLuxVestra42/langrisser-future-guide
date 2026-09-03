#!/usr/bin/env node
import { classifyMergeFinalization } from '../lib/merge-finalizer.mjs';

function parseArgs(argv) {
  const args = { repository: process.env.GITHUB_REPOSITORY ?? null, pr: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repository') args.repository = argv[++i] ?? null;
    else if (arg === '--pr') args.pr = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.repository || !/^[^/]+\/[^/]+$/.test(args.repository)) {
    throw new Error('--repository owner/repo is required');
  }
  if (!Number.isInteger(args.pr) || args.pr <= 0) throw new Error('--pr must be a positive integer');
  return args;
}

async function githubGet(repository, path, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub GET ${path} failed: ${response.status} ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN ?? '';
  const mainBranch = await githubGet(args.repository, '/branches/main', token);
  const pr = await githubGet(args.repository, `/pulls/${args.pr}`, token);
  const mainSha = mainBranch?.commit?.sha;
  const headSha = pr?.head?.sha;
  const comparison = await githubGet(args.repository, `/compare/${mainSha}...${headSha}`, token);
  const checks = await githubGet(args.repository, `/commits/${headSha}/check-runs?per_page=100`, token);
  const result = classifyMergeFinalization({
    mainSha,
    pr,
    comparison,
    checkRuns: checks.check_runs ?? [],
  });
  console.log(JSON.stringify({
    mode: 'DRY_RUN',
    mutationAttempted: false,
    repository: args.repository,
    ...result,
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKER_TOOLING', error: error.message }, null, 2));
  process.exitCode = 2;
});
