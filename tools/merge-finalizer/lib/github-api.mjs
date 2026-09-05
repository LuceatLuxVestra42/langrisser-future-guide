export const DEFAULT_GITHUB_READ_MAX_ATTEMPTS = 4;
export const DEFAULT_GITHUB_READ_RETRY_DELAYS_MS = Object.freeze([250, 500, 1000]);
export const RETRYABLE_GITHUB_READ_STATUSES = Object.freeze(new Set([429, 502, 503, 504]));

const INSTALLATION_RATE_LIMIT_MESSAGE_PREFIX = 'API rate limit exceeded for installation';

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

export function isInstallationRateLimitFailure(status, body) {
  if (Number(status) !== 403) return false;

  let message = '';
  const text = String(body ?? '').trim();
  if (!text) return false;

  try {
    const parsed = JSON.parse(text);
    message = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
  } catch {
    message = text;
  }

  return message.startsWith(INSTALLATION_RATE_LIMIT_MESSAGE_PREFIX);
}

export function isRetryableReadFailure(method, status, body = '') {
  if (method !== 'GET') return false;
  return RETRYABLE_GITHUB_READ_STATUSES.has(Number(status))
    || isInstallationRateLimitFailure(status, body);
}

function retryAfterDelayMs(value, nowMs) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

function rateLimitResetDelayMs(value, nowMs) {
  const resetEpochSeconds = Number(String(value ?? '').trim());
  if (!Number.isFinite(resetEpochSeconds) || resetEpochSeconds < 0) return null;
  return Math.max(0, Math.ceil((resetEpochSeconds * 1000) - nowMs));
}

export function installationRateLimitRetryDelayMs(response, fallbackDelayMs, nowMs = Date.now()) {
  const retryAfter = retryAfterDelayMs(response?.headers?.get?.('retry-after'), nowMs);
  if (retryAfter != null) return retryAfter;

  const rateLimitReset = rateLimitResetDelayMs(response?.headers?.get?.('x-ratelimit-reset'), nowMs);
  if (rateLimitReset != null) return rateLimitReset;

  return fallbackDelayMs;
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function githubRequest(repository, path, token, options = {}) {
  const method = options.method ?? 'GET';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const nowImpl = options.nowImpl ?? Date.now;
  const maxAttempts = options.maxAttempts ?? DEFAULT_GITHUB_READ_MAX_ATTEMPTS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_GITHUB_READ_RETRY_DELAYS_MS;

  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (typeof nowImpl !== 'function') throw new Error('now implementation is required');
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
      if (isRetryableReadFailure(method, response.status, text)) {
        if (attempt >= maxAttempts) {
          throw new GitHubTransientExhaustedError(method, path, response.status, attempt);
        }
        const fallbackDelay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
        const delay = isInstallationRateLimitFailure(response.status, text)
          ? installationRateLimitRetryDelayMs(response, fallbackDelay, nowImpl())
          : fallbackDelay;
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
