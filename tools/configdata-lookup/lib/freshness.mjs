import { installConfigDataSourceRootReadRedirect } from './configdata-source-root.mjs';

installConfigDataSourceRootReadRedirect();
const { detectStalePlan } = await import('../../../scripts/lib/configdata-lookup-stage6.mjs');

export async function checkLookupFreshness() {
  return detectStalePlan();
}
