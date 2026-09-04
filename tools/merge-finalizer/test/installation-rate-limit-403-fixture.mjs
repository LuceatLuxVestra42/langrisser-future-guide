import assert from 'node:assert/strict';
import {
  GitHubHttpError,
  GitHubTransientExhaustedError,
  githubRequest,
  installationRateLimitRetryDelayMs,
  isInstallationRateLimitFailure,
  isRetryableReadFailure,
} from '../lib/github-api.mjs';

const REPOSITORY = 'owner/repo';
const INSTALLATION_LIMIT = JSON.stringify({
  message: 'API rate limit exceeded for installation ID 12345.',
});
const NOW_MS = 1_800_000_000_000;

function headersFixture(values = {}) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    get(name) {
      return normalized.get(String(name).toLowerCase()) ?? null;
    },
  };
}

function httpResponse(status, body = '{}', headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersFixture(headers),
    text: async () => body,
  };
}

function retryFixture(sequence) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (_url, options) => {
      calls.push(options.method ?? 'GET');
      const next = sequence.shift();
      if (!next) throw new Error('retry fixture exhausted');
      return httpResponse(next.status, next.body, next.headers);
    },
  };
}

function sleepFixture() {
  const delays = [];
  return {
    delays,
    sleepImpl: async delay => { delays.push(delay); },
  };
}

const noRetrySleep = async () => {};
const fixedNow = () => NOW_MS;

assert.equal(isInstallationRateLimitFailure(403, INSTALLATION_LIMIT), true);
assert.equal(isInstallationRateLimitFailure(403, '{"message":"Resource not accessible by integration"}'), false);
assert.equal(isInstallationRateLimitFailure(401, INSTALLATION_LIMIT), false);
assert.equal(isRetryableReadFailure('GET', 403), false);
assert.equal(isRetryableReadFailure('GET', 403, INSTALLATION_LIMIT), true);
assert.equal(isRetryableReadFailure('PUT', 403, INSTALLATION_LIMIT), false);

assert.equal(
  installationRateLimitRetryDelayMs(httpResponse(403, INSTALLATION_LIMIT, { 'retry-after': '3' }), 250, NOW_MS),
  3000,
);
assert.equal(
  installationRateLimitRetryDelayMs(httpResponse(403, INSTALLATION_LIMIT, { 'x-ratelimit-reset': String((NOW_MS / 1000) + 5) }), 250, NOW_MS),
  5000,
);
assert.equal(
  installationRateLimitRetryDelayMs(httpResponse(403, INSTALLATION_LIMIT, { 'retry-after': 'bad', 'x-ratelimit-reset': 'bad' }), 250, NOW_MS),
  250,
);
assert.equal(
  installationRateLimitRetryDelayMs(httpResponse(403, INSTALLATION_LIMIT, {
    'retry-after': '2',
    'x-ratelimit-reset': String((NOW_MS / 1000) + 9),
  }), 250, NOW_MS),
  2000,
);

{
  const fixture = retryFixture([
    { status: 403, body: INSTALLATION_LIMIT, headers: { 'retry-after': '3', 'x-ratelimit-reset': String((NOW_MS / 1000) + 9) } },
    { status: 200, body: '{"ok":true}' },
  ]);
  const sleep = sleepFixture();
  const result = await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: sleep.sleepImpl,
    nowImpl: fixedNow,
  });
  assert.equal(result.ok, true);
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(sleep.delays, [3000]);
}

{
  const fixture = retryFixture([
    { status: 403, body: INSTALLATION_LIMIT, headers: { 'retry-after': 'bad', 'x-ratelimit-reset': String((NOW_MS / 1000) + 5) } },
    { status: 200, body: '{"ok":true}' },
  ]);
  const sleep = sleepFixture();
  await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: sleep.sleepImpl,
    nowImpl: fixedNow,
  });
  assert.deepEqual(sleep.delays, [5000]);
}

{
  const fixture = retryFixture([
    { status: 403, body: INSTALLATION_LIMIT, headers: { 'retry-after': 'bad', 'x-ratelimit-reset': 'bad' } },
    { status: 200, body: '{"ok":true}' },
  ]);
  const sleep = sleepFixture();
  await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: sleep.sleepImpl,
    nowImpl: fixedNow,
    retryDelaysMs: [777],
  });
  assert.deepEqual(sleep.delays, [777]);
}

{
  const fixture = retryFixture([
    { status: 403, body: '{"message":"Resource not accessible by integration"}', headers: { 'retry-after': '30' } },
  ]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noRetrySleep,
      nowImpl: fixedNow,
    }),
    error => error instanceof GitHubHttpError && error.status === 403,
  );
  assert.equal(fixture.calls.length, 1);
}

{
  const fixture = retryFixture(Array.from({ length: 4 }, () => ({
    status: 403,
    body: INSTALLATION_LIMIT,
  })));
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noRetrySleep,
      nowImpl: fixedNow,
    }),
    error => error instanceof GitHubTransientExhaustedError
      && error.httpStatus === 403
      && error.attempts === 4,
  );
  assert.equal(fixture.calls.length, 4);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_INSTALLATION_RATE_LIMIT_403_FIXTURE',
  generic403: 'FAIL_CLOSED',
  installationRateLimit403: 'RETRYABLE_GET_ONLY',
  retryDelayPriority: ['retry-after', 'x-ratelimit-reset', 'bounded-backoff'],
  mutation403: 'FAIL_CLOSED',
  maxAttempts: 4,
}, null, 2));
