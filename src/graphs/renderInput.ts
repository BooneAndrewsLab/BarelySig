/**
 * What a render request lays out (item 31, #87): a Column/Grouped/Nested
 * graph's `LayoutInput` through `layoutColumn`, or an XY graph's
 * `XyGraphInput` through `layoutXy`. Kept as its own module so `cache.ts`,
 * `renderer.ts` and `render.worker.ts` can dispatch on `kind` without a
 * cycle between them.
 */
import type { LayoutInput } from './layout';
import type { XyGraphInput } from './xy';

export type RenderInput =
  | { readonly kind: 'column'; readonly input: LayoutInput }
  | { readonly kind: 'xy'; readonly input: XyGraphInput };
