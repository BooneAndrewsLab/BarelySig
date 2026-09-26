import { useSyncExternalStore } from 'react';

import type { LayoutInput } from '@/graphs/layout';
import { type FigureView, getRenderer } from '@/graphs/renderer';

const NONE: FigureView = { drawn: null, busy: false, error: null };

/** The figure of `input` as drawn so far (item 11), redrawn as it changes; `slot` names where it shows. */
export function useFigure(slot: string, input: LayoutInput | null): FigureView {
  const r = getRenderer();
  const view = () => (input ? r.view(slot, input) : NONE);
  return useSyncExternalStore(r.subscribe, view, view);
}
