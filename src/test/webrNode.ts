/**
 * WebR under Node for tests: the same R build the browser runs, so fixtures
 * check the engine users get, not a desktop stand-in.
 *
 * Two Node quirks (item 01): the ESM build can't load `worker_threads`, so
 * the CommonJS build is required; and the runtime is loaded from
 * `node_modules/webr/dist/`, not `public/webr/`, because inside this
 * `"type": "module"` package Node would load WebR's CommonJS worker as ESM.
 * Packages install over HTTP from `public/webr/repo`, served by
 * `src/test/globalSetup.ts`.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type * as WebRModule from 'webr';
import { inject } from 'vitest';

const require = createRequire(import.meta.url);
const { WebR } = require('webr') as typeof WebRModule;

export async function startNodeWebR(): Promise<WebRModule.WebR> {
  const webR = new WebR({
    baseUrl: `${join(import.meta.dirname, '../../node_modules/webr/dist')}/`,
    repoUrl: inject('webrRepoUrl'),
    interactive: false,
  });
  await webR.init();
  return webR;
}
