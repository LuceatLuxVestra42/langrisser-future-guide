import { createHash } from 'node:crypto';

export const FROZEN_SEMANTIC_FRESHNESS_CONTRACT = 'frozen-semantic-freshness/v2';
export const FROZEN_SEMANTIC_DIGEST_ALGORITHM = 'sha256';

function pathKey(parent, key) {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

export function canonicalizeJson(value, path = '$', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported JSON value at ${path}: ${typeof value}`);
  }

  if (seen.has(value)) throw new TypeError(`Cyclic JSON value at ${path}`);
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (item === undefined) throw new TypeError(`Undefined array item at ${path}[${index}]`);
        return canonicalizeJson(item, `${path}[${index}]`, seen);
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Non-plain object at ${path}`);
    }

    const result = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) throw new TypeError(`Undefined object value at ${pathKey(path, key)}`);
      result[key] = canonicalizeJson(child, pathKey(path, key), seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

export function sha256CanonicalJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function buildSemanticDigest(projection, semanticPayload) {
  if (typeof projection !== 'string' || projection.trim() === '') {
    throw new TypeError('Semantic digest projection must be a non-empty string');
  }

  return {
    contract: FROZEN_SEMANTIC_FRESHNESS_CONTRACT,
    algorithm: FROZEN_SEMANTIC_DIGEST_ALGORITHM,
    projection,
    digest: sha256CanonicalJson(semanticPayload),
  };
}

export function sameSemanticDigest(left, right) {
  return Boolean(
    left
      && right
      && left.contract === FROZEN_SEMANTIC_FRESHNESS_CONTRACT
      && right.contract === FROZEN_SEMANTIC_FRESHNESS_CONTRACT
      && left.algorithm === FROZEN_SEMANTIC_DIGEST_ALGORITHM
      && right.algorithm === FROZEN_SEMANTIC_DIGEST_ALGORITHM
      && left.projection === right.projection
      && left.digest === right.digest,
  );
}
