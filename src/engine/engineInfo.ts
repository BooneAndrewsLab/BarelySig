/**
 * The engine users get, as pinned in `lock.json` (item 04): WebR, R and
 * the R package versions. Known at build time, so input hashes (note 02)
 * and saved results can be checked before WebR has started.
 */
import type { EngineInfo } from '@/model/inputs';

import lock from './lock.json';

export const ENGINE: EngineInfo = { webr: lock.webr, r: lock.r, packages: lock.packages };
