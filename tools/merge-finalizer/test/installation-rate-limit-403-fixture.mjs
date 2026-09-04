import assert from 'node:assert/strict';
import {
  GitHubHttpError,
  GitHubTransientExhaustedError,
  githubRequest,
  isInstallationRateLimitFailure,
  isRetryableReadFailure,
} from '../lib/github-api.mjs';

const REPOSITORY = 'owner/repo';
const INSTALLATION_LIMIT = JSON.stringify({
  message: 'API rate limit exceeded for installation ID 12345.',
});

function httpResponse(status, body = '{}') {
  return {
    ok: status >= 200 && status < 300,
    status,
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
      return httpResponse(next.status, next.body);
    },
  };
}

const noRetrySleep = async () => {};

assert.equal(isInstallationRateLimitFailure(403, INSTALLATION_LIMIT), true);
assert.equal(isInstallationRateLimitFailure(403, '{"message":"Resource not accessible by integration"}'), false);
assert.equal(isInstallationRateLimitFailure(401, INSTALLATION_LIMIT), false);
assert.equal(isRetryableReadFailure('GET', 403), false);
assert.equal(isRetryableReadFailure('GET', 403, INSTALLATION_LIMIT), true);
assert.equal(isRetryableReadFailure('PUT', 403, INSTALLATION_LIMIT), false);

{
  const fixture = retryFixture([
    { status: 403, body: INSTALLATION_LIMIT },
    { status: 200, body: '{"ok":true}' },
  ]);
  const result = await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: noRetrySleep,
  });
  assert.equal(result.ok, true);
  assert.equal(fixture.calls.length, 2);
}

{
  const fixture = retryFixture([
    { status: 403, body: '{"message":"Resource not accessible by integration"}' },
  ]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noRetrySleep,
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
  mutation403: 'FAIL_CLOSED',
  maxAttempts: 4,
}, null, 2));
