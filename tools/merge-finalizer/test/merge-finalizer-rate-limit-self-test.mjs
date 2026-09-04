import assert from 'node:assert/strict';
import {
  GitHubHttpError,
  GitHubTransientExhaustedError,
  computeGitHubReadRetryDelay,
  githubRequest,
  isInstallationRateLimitFailure,
  isRetryableReadFailure,
} from '../lib/github-api.mjs';

const REPOSITORY = 'owner/repo';
const PATH = '/pulls/674';
const INSTALLATION_LIMIT_BODY = JSON.stringify({
  message: 'API rate limit exceeded for installation. Please retry later.',
});

function headers(values = {}) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get: name => normalized.get(String(name).toLowerCase()) ?? null };
}

function httpResponse(status, body = '{}', headerValues = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers(headerValues),
    text: async () => body,
  };
}

function fixture(sequence) {
  const calls = [];
  const sleeps = [];
  return {
    calls,
    sleeps,
    fetchImpl: async (_url, options) => {
      calls.push(options.method ?? 'GET');
      const next = sequence.shift();
      if (!next) throw new Error('rate-limit fixture exhausted');
      return httpResponse(next.status, next.body, next.headers);
    },
    sleepImpl: async ms => { sleeps.push(ms); },
  };
}

// Generic/permission 403 remains fail-closed and must not retry.
{
  const f = fixture([{ status: 403, body: '{"message":"Resource not accessible by integration"}' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, PATH, 'token', { fetchImpl: f.fetchImpl, sleepImpl: f.sleepImpl }),
    error => error instanceof GitHubHttpError && error.status === 403,
  );
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.sleeps, []);
}

// Exact installation rate-limit 403 retries and can recover.
{
  const f = fixture([
    { status: 403, body: INSTALLATION_LIMIT_BODY },
    { status: 200, body: '{"number":674}' },
  ]);
  const result = await githubRequest(REPOSITORY, PATH, 'token', {
    fetchImpl: f.fetchImpl,
    sleepImpl: f.sleepImpl,
  });
  assert.equal(result.number, 674);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.sleeps, [250]);
}

// Retry-After has first priority.
{
  const response = httpResponse(403, INSTALLATION_LIMIT_BODY, {
    'Retry-After': '2',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '9999999999',
  });
  assert.deepEqual(
    computeGitHubReadRetryDelay(response, 1, [250, 500, 1000], 1_000_000),
    { delayMs: 2000, source: 'retry-after' },
  );
}

// Exhaustion remains a tooling-class transient exhaustion; it never passes silently.
{
  const f = fixture(Array.from({ length: 4 }, () => ({ status: 403, body: INSTALLATION_LIMIT_BODY })));
  await assert.rejects(
    githubRequest(REPOSITORY, PATH, 'token', { fetchImpl: f.fetchImpl, sleepImpl: f.sleepImpl }),
    error => error instanceof GitHubTransientExhaustedError
      && error.reason === 'GITHUB_API_TRANSIENT_EXHAUSTED'
      && error.httpStatus === 403
      && error.attempts === 4
      && error.classification === 'GITHUB_API_INSTALLATION_RATE_LIMIT',
  );
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.sleeps, [250, 500, 1000]);
}

// Rate-limit reset is accepted only with Remaining=0 and is bounded by the retry budget.
{
  const nowMs = 1_000_000;
  const response = httpResponse(403, '{}', {
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String((nowMs + 3000) / 1000),
  });
  assert.equal(isInstallationRateLimitFailure('GET', 403, '{}', response.headers), true);
  assert.deepEqual(
    computeGitHubReadRetryDelay(response, 1, [250, 500, 1000], nowMs),
    { delayMs: 3000, source: 'x-ratelimit-reset' },
  );
}

// Ambiguous 403 and all mutations remain non-retryable.
assert.equal(isRetryableReadFailure('GET', 403, '{"message":"forbidden"}', headers()), false);
assert.equal(isRetryableReadFailure('PUT', 403, INSTALLATION_LIMIT_BODY, headers()), false);
assert.equal(isRetryableReadFailure('GET', 429), true);
assert.equal(isRetryableReadFailure('GET', 502), true);
assert.equal(isRetryableReadFailure('GET', 503), true);
assert.equal(isRetryableReadFailure('GET', 504), true);
assert.equal(isRetryableReadFailure('GET', 401), false);

// A reset delay outside the configured budget fails closed instead of sleeping indefinitely.
{
  const f = fixture([{
    status: 403,
    body: '{}',
    headers: {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1003',
    },
  }]);
  await assert.rejects(
    githubRequest(REPOSITORY, PATH, 'token', {
      fetchImpl: f.fetchImpl,
      sleepImpl: f.sleepImpl,
      nowImpl: () => 1_000_000,
      maxRateLimitDelayMs: 2000,
    }),
    error => error instanceof GitHubTransientExhaustedError
      && error.classification === 'GITHUB_API_INSTALLATION_RATE_LIMIT'
      && error.requiredDelayMs === 3000
      && error.maxRateLimitDelayMs === 2000,
  );
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.sleeps, []);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_INSTALLATION_RATE_LIMIT_403_SELF_TEST',
  generic403: 'FAIL_CLOSED_NO_RETRY',
  installationRateLimit403: 'BOUNDED_GET_RETRY',
  retryDelayOrder: ['Retry-After', 'X-RateLimit-Reset', 'bounded fallback'],
  existingRetryStatuses: [429, 502, 503, 504],
  mutationRetry: 'FORBIDDEN',
  exhaustedReason: 'GITHUB_API_TRANSIENT_EXHAUSTED',
}, null, 2));
