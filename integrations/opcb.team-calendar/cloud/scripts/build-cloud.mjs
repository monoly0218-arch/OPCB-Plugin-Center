import {build} from 'esbuild';
import {root} from '../server/runtime.mjs';
import {resolve} from 'node:path';
await build({entryPoints:[resolve(root,'cloud/index.ts')],outfile:resolve(root,'cloud/DEPLOY_EDGE.ts'),bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['node:crypto'],logLevel:'info'});
