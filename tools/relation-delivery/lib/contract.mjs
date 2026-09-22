export const RELATION_DELIVERY_CONTRACT_SCHEMA = 'relation-delivery-contract/v1';

export function createLookupEnvelope({ present, targets }) {
  if (typeof present !== 'boolean') {
    throw new TypeError('relation delivery lookup present must be boolean');
  }
  if (!Array.isArray(targets)) {
    throw new TypeError('relation delivery lookup targets must be an array');
  }
  if (!present && targets.length !== 0) {
    throw new Error('relation delivery lookup cannot carry targets when present=false');
  }
  return Object.freeze({
    present,
    targets: Object.freeze([...targets]),
  });
}

export function assertOpaqueTarget(target) {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('relation delivery target must be an object');
  }
  if (!Object.prototype.hasOwnProperty.call(target, 'targetId')) {
    throw new Error('relation delivery target must preserve targetId');
  }
  return target;
}
