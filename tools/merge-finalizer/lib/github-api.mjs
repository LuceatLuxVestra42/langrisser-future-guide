export const DEFAULT_GITHUB_READ_MAX_ATTEMPTS = 4;
export const DEFAULT_GITHUB_READ_RETRY_DELAYS_MS = Object.freeze([250, 500, 1000]);
export const RETRYABLE_GITHUB_READ_STATUSES = Object.freeze(new Set([429, 502, 503, 504]));

export class GitHubHttpError extends Error {
  constructor(method, path, status, body) {
    super(`GitHub ${method} ${path} failed: ${status} ${String(body ?? '').slice(0, 500)}`);
    this.name = 'GitHubHttpError';
    this.method = method;
    this.status = status;
    this.path = path;
  }
}

export class GitHubResponseError extends Error {
  constructor(reason, method, path, details = {}) {
    super(`${reason}: GitHub ${method} ${path}`);
    this.name = 'GitHubResponseError';
    this.reason = reason;
    this.method = method;
    this.path = path;
    Object.assign(this, details);
  }
}

export class GitHubTransientExhaustedError extends Error {
  constructor(method, path, status, attempts) {
    super(`GitHub ${method} ${path} transient failure exhausted after ${attempts} attempts: ${status}`);
    this.name = 'GitHubTransientExhaustedError';
    this.reason = 'GITHUB_API_TRANSIENT_EXHAUSTED';
    this.method = method;
    this.path = path;
    this.httpStatus = status;
    this.attempts = attempts;
  }
}

export function isRetryableReadFailure(method, status) {
  return method === 'GET' && RETRYABLE_GITHUB_READ_STATUSES.has(Number(status));
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function githubRequest(repository, path, token, options = {}) {
  const method = options.method ?? 'GET';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? DEFAULT_GITHUB_READ_MAX_ATTEMPTS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_GITHUB_READ_RETRY_DELAYS_MS;

  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new Error('maxAttempts must be a positive integer');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();

    if (!response.ok) {
      if (isRetryableReadFailure(method, response.status)) {
        if (attempt >= maxAttempts) {
          throw new GitHubTransientExhaustedError(method, path, response.status, attempt);
        }
        const delay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
        await sleepImpl(delay);
        continue;
      }
      throw new GitHubHttpError(method, path, response.status, text);
    }

    if (!text) {
      if (method === 'GET') {
        throw new GitHubResponseError('GITHUB_API_EMPTY_RESPONSE', method, path);
      }
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      if (method === 'GET') {
        throw new GitHubResponseError('GITHUB_API_INVALID_JSON', method, path);
      }
      return text;
    }
  }

  throw new Error(`unreachable GitHub request state for ${method} ${path}`);
}
