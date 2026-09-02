import { installConfigDataSourceRootReadRedirect } from '../lib/configdata-source-root.mjs';

installConfigDataSourceRootReadRedirect();
await import('../../../scripts/build-configdata-lookup-stage2.mjs');
