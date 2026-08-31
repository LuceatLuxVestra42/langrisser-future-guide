import { detectStalePlan } from '../../../scripts/lib/configdata-lookup-stage6.mjs';

export async function checkLookupFreshness() {
  return detectStalePlan();
}
