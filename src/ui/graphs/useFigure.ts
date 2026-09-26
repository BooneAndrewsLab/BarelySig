import { useState, useSyncExternalStore } from 'react';

import type { GraphInput } from '@/graphs/data';
import type { LayoutInput } from '@/graphs/layout';
import { type FigureView, getRenderer } from '@/graphs/renderer';

const NONE: FigureView = { drawn: null, busy: false, error: null };

/** The figure of `input` as drawn so far (item 11), redrawn as it changes; `slot` names where it shows. */
export function useFigure(slot: string, input: LayoutInput | null): FigureView {
  const r = getRenderer();
  const view = () => (input ? r.view(slot, input) : NONE);
  return useSyncExternalStore(r.subscribe, view, view);
}

/**
 * The graph with its error bars: while they are recalculated
 * (`calculating`), the last complete version, shown faded under a note,
 * rather than a bare one drawn in between; null when there is neither.
 */
export function useComplete(input: GraphInput, calculating: boolean): LayoutInput | null {
  const complete = input.ok && input.summaryReady ? input.input : null;
  const [last, setLast] = useState<LayoutInput | null>(null);
  if (complete && complete !== last) setLast(complete);
  return complete ?? (calculating ? last : null);
}
