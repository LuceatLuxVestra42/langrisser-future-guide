export const DEFAULT_GITHUB_READ_MAX_ATTEMPTS = 4;
export const DEFAULT_GITHUB_READ_RETRY_DELAYS_MS = Object.freeze([250, 500, 1000]);
export const DEFAULT_GITHUB_RATE_LIMIT_MAX_DELAY_MS = 60_000;
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
  constructor(method, path, status, attempts, details = {}) {
    super(`GitHub ${method} ${path} transient failure exhausted after ${attempts} attempts: ${status}`);
    this.name = 'GitHubTransientExhaustedError';
    this.reason = 'GITHUB_API_TRANSIENT_EXHAUSTED';
    this.method = method;
    this.path = path;
    this.httpStatus = status;
    this.attempts = attempts;
    Object.assign(this, details);
  }
}

function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value == null ? null : String(value);
  }
  return null;
}

export function isInstallationRateLimitFailure(method, status, body = '', headers = null) {
  if (method !== 'GET' || Number(status) !== 403) return false;
  if (/API rate limit exceeded for installation\b/i.test(String(body ?? ''))) return true;
  if (readHeader(headers, 'Retry-After') != null) return true;
  return readHeader(headers, 'X-RateLimit-Remaining') === '0'
    && readHeader(headers, 'X-RateLimit-Reset') != null;
}

export function isRetryableReadFailure(method, status, body = '', headers = null) {
  return method === 'GET'
    && (RETRYABLE_GITHUB_READ_STATUSES.has(Number(status))
      || isInstallationRateLimitFailure(method, status, body, headers));
}

function parseRetryAfterMs(value, nowMs) {
  if (value == null) return null;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.ceil(Number(text) * 1000));
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed - nowMs);
}

function parseRateLimitResetMs(headers, nowMs) {
  if (readHeader(headers, 'X-RateLimit-Remaining') !== '0') return null;
  const reset = Number(readHeader(headers, 'X-RateLimit-Reset'));
  if (!Number.isFinite(reset) || reset < 0) return null;
  return Math.max(0, Math.ceil(reset * 1000 - nowMs));
}

export function computeGitHubReadRetryDelay(response, attempt, retryDelaysMs, nowMs = Date.now()) {
  const fallbackMs = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
  if (Number(response?.status) !== 403) return { delayMs: fallbackMs, source: 'fallback' };

  const retryAfterMs = parseRetryAfterMs(readHeader(response?.headers, 'Retry-After'), nowMs);
  if (retryAfterMs != null) return { delayMs: retryAfterMs, source: 'retry-after' };

  const resetMs = parseRateLimitResetMs(response?.headers, nowMs);
  if (resetMs != null) return { delayMs: resetMs, source: 'x-ratelimit-reset' };

  return { delayMs: fallbackMs, source: 'fallback' };
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function githubRequest(repository, path, token, options = {}) {
  const method = options.method ?? 'GET';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const nowImpl = options.nowImpl ?? Date.now;
  const maxAttempts = options.maxAttempts ?? DEFAULT_GITHUB_READ_MAX_ATTEMPTS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_GITHUB_READ_RETRY_DELAYS_MS;
  const maxRateLimitDelayMs = options.maxRateLimitDelayMs ?? DEFAULT_GITHUB_RATE_LIMIT_MAX_DELAY_MS;

  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (typeof nowImpl !== 'function') throw new Error('now implementation is required');
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new Error('maxAttempts must be a positive integer');
  if (!Number.isFinite(maxRateLimitDelayMs) || maxRateLimitDelayMs < 0) {
    throw new Error('maxRateLimitDelayMs must be a non-negative finite number');
  }

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
      const installationRateLimit = isInstallationRateLimitFailure(method, response.status, text, response.headers);
      if (isRetryableReadFailure(method, response.status, text, response.headers)) {
        if (attempt >= maxAttempts) {
          throw new GitHubTransientExhaustedError(method, path, response.status, attempt, {
            classification: installationRateLimit ? 'GITHUB_API_INSTALLATION_RATE_LIMIT' : 'GITHUB_API_TRANSIENT',
          });
        }
        const retry = computeGitHubReadRetryDelay(response, attempt, retryDelaysMs, nowImpl());
        if (installationRateLimit && retry.delayMs > maxRateLimitDelayMs) {
          throw new GitHubTransientExhaustedError(method, path, response.status, attempt, {
            classification: 'GITHUB_API_INSTALLATION_RATE_LIMIT',
            retryDelaySource: retry.source,
            requiredDelayMs: retry.delayMs,
            maxRateLimitDelayMs,
          });
        }
        await sleepImpl(retry.delayMs);
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
