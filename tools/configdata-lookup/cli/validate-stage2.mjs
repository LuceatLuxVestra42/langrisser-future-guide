import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';

installConfigDataSourceRootReadRedirect();
await import('../../../scripts/validate-configdata-lookup-stage2.mjs');
