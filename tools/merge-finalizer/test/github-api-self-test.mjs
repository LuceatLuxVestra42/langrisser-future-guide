import assert from 'node:assert/strict';
import {
  GitHubHttpError,
  GitHubResponseError,
  GitHubTransientExhaustedError,
  githubRequest,
  isRetryableReadFailure,
} from '../lib/github-api.mjs';

const REPOSITORY = 'owner/repo';

function response(status, body = '{}') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function fixtureFetch(statuses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (_url, options) => {
      calls.push(options.method ?? 'GET');
      const next = statuses.shift();
      if (!next) throw new Error('fixture exhausted');
      return response(next.status, next.body);
    },
  };
}

const noSleep = async () => {};

{
  const fixture = fixtureFetch([
    { status: 502, body: '{"message":"bad gateway"}' },
    { status: 502, body: '{"message":"bad gateway"}' },
    { status: 200, body: '{"name":"main"}' },
  ]);
  const result = await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: noSleep,
  });
  assert.equal(result.name, 'main');
  assert.equal(fixture.calls.length, 3);
}

for (const status of [429, 503, 504]) {
  const fixture = fixtureFetch([
    { status, body: '{"message":"transient"}' },
    { status: 200, body: '{"ok":true}' },
  ]);
  const result = await githubRequest(REPOSITORY, '/branches/main', 'token', {
    fetchImpl: fixture.fetchImpl,
    sleepImpl: noSleep,
  });
  assert.equal(result.ok, true);
  assert.equal(fixture.calls.length, 2);
}

{
  const fixture = fixtureFetch(Array.from({ length: 4 }, () => ({ status: 502, body: '{"message":"bad gateway"}' })));
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noSleep,
    }),
    error => {
      assert.equal(error instanceof GitHubTransientExhaustedError, true);
      assert.equal(error.reason, 'GITHUB_API_TRANSIENT_EXHAUSTED');
      assert.equal(error.httpStatus, 502);
      assert.equal(error.attempts, 4);
      assert.equal(error.method, 'GET');
      assert.equal(error.path, '/branches/main');
      return true;
    },
  );
  assert.equal(fixture.calls.length, 4);
}

for (const status of [404, 422]) {
  const fixture = fixtureFetch([{ status, body: '{"message":"terminal"}' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noSleep,
    }),
    error => error instanceof GitHubHttpError && error.status === status,
  );
  assert.equal(fixture.calls.length, 1);
}

{
  const fixture = fixtureFetch([{ status: 502, body: '{"message":"uncertain mutation result"}' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/pulls/42/update-branch', 'token', {
      method: 'PUT',
      body: { expected_head_sha: '1'.repeat(40) },
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noSleep,
    }),
    error => error instanceof GitHubHttpError && error.status === 502,
  );
  assert.equal(fixture.calls.length, 1);
}

{
  const fixture = fixtureFetch([{ status: 200, body: '' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noSleep,
    }),
    error => error instanceof GitHubResponseError && error.reason === 'GITHUB_API_EMPTY_RESPONSE',
  );
  assert.equal(fixture.calls.length, 1);
}

{
  const fixture = fixtureFetch([{ status: 200, body: 'not-json' }]);
  await assert.rejects(
    githubRequest(REPOSITORY, '/branches/main', 'token', {
      fetchImpl: fixture.fetchImpl,
      sleepImpl: noSleep,
    }),
    error => error instanceof GitHubResponseError && error.reason === 'GITHUB_API_INVALID_JSON',
  );
  assert.equal(fixture.calls.length, 1);
}

{
  const fixture = fixtureFetch([{ status: 204, body: '' }]);
  const result = await githubRequest(REPOSITORY, '/git/refs/heads/example', 'token', {
    method: 'DELETE',
    fetchImpl: fixture.fetchImpl,
    sleepImpl: noSleep,
  });
  assert.equal(result, null);
  assert.equal(fixture.calls.length, 1);
}

assert.equal(isRetryableReadFailure('GET', 429), true);
assert.equal(isRetryableReadFailure('GET', 502), true);
assert.equal(isRetryableReadFailure('GET', 503), true);
assert.equal(isRetryableReadFailure('GET', 504), true);
assert.equal(isRetryableReadFailure('PUT', 502), false);
assert.equal(isRetryableReadFailure('POST', 503), false);
assert.equal(isRetryableReadFailure('DELETE', 504), false);
assert.equal(isRetryableReadFailure('GET', 404), false);
assert.equal(isRetryableReadFailure('GET', 422), false);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'MERGE_FINALIZER_GITHUB_API_RETRY_SELF_TEST',
  retryableReadStatuses: [429, 502, 503, 504],
  maxAttempts: 4,
  mutationRetry: 'FORBIDDEN',
  exhaustedReason: 'GITHUB_API_TRANSIENT_EXHAUSTED',
}, null, 2));
