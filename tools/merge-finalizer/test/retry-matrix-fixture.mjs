import assert from 'node:assert/strict';
import {
  GitHubHttpError,
  GitHubTransientExhaustedError,
  githubRequest,
  isInstallationRateLimitFailure,
  isRetryableReadFailure,
} from '../lib/github-api.mjs';

const REPOSITORY = 'owner/repo';
const INSTALLATION_LIMIT = JSON.stringify({ message: 'API rate limit exceeded for installation ID 12345.' });

function httpResponse(status, body = '{}', headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => normalized.get(String(name).toLowerCase()) ?? null },
    text: async () => body,
  };
}

function retryFixture(sequence) {
  const calls = [];
  const sleeps = [];
  return {
    calls,
    sleeps,
    fetchImpl: async (_url, options) => {
      calls.push(options.method ?? 'GET');
      const next = sequence.shift();
      if (!next) throw new Error('retry fixture exhausted');
      return httpResponse(next.status, next.body, next.headers);
    },
    sleepImpl: async delay => { sleeps.push(delay); },
  };
}

assert.equal(isRetryableReadFailure('GET', 401), false);
assert.equal(isRetryableReadFailure('GET', 403), false);
assert.equal(isInstallationRateLimitFailure(403, INSTALLATION_LIMIT), true);
assert.equal(isRetryableReadFailure('GET', 403, INSTALLATION_LIMIT), true);
assert.equal(isRetryableReadFailure('PUT', 403, INSTALLATION_LIMIT), false);
for (const status of [429, 502, 503, 504]) assert.equal(isRetryableReadFailure('GET', status), true);

for (const status of [401, 403]) {
  const fixture = retryFixture([{ status, body: '{"message":"Resource not accessible by integration"}' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', { fetchImpl: fixture.fetchImpl, sleepImpl: fixture.sleepImpl }),
    error => error instanceof GitHubHttpError && error.status === status,
  );
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.sleeps, []);
}

{
  const fixture = retryFixture([
    { status: 403, body: INSTALLATION_LIMIT, headers: { 'Retry-After': '2', 'x-ratelimit-reset': '9999999999' } },
    { status: 200, body: '{"ok":true}' },
  ]);
  assert.equal((await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: fixture.sleepImpl,
    nowImpl: () => 1_000_000,
  })).ok, true);
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(fixture.sleeps, [2000]);
}

for (const status of [429, 502, 503, 504]) {
  const fixture = retryFixture([{ status, body: '{}' }, { status: 200, body: '{"ok":true}' }]);
  assert.equal((await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: fixture.sleepImpl,
    retryDelaysMs: [7, 11, 13],
  })).ok, true);
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(fixture.sleeps, [7]);
}

for (const status of [403, 429, 502, 503, 504]) {
  const body = status === 403 ? INSTALLATION_LIMIT : '{}';
  const fixture = retryFixture(Array.from({ length: 4 }, () => ({ status, body })));
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: fixture.sleepImpl,
      retryDelaysMs: [0, 0, 0],
    }),
    error => error instanceof GitHubTransientExhaustedError
      && error.reason === 'GITHUB_API_TRANSIENT_EXHAUSTED'
      && error.httpStatus === status
      && error.attempts === 4,
  );
  assert.equal(fixture.calls.length, 4);
  assert.equal(fixture.sleeps.length, 3);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_RETRY_MATRIX',
  immediateFatal: [401, 'generic-403'],
  retryable: ['installation-rate-limit-403', 429, 502, 503, 504],
  mutationRetry: 'FORBIDDEN',
  maxAttempts: 4,
  exhaustedReason: 'GITHUB_API_TRANSIENT_EXHAUSTED',
}, null, 2));
