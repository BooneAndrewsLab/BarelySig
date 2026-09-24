/**
 * Project-wide undo and redo (item 03). One history for the whole project
 * (note 02, decision 5): undoing "Delete table" also brings back its
 * analyses. Projects are immutable and share structure, so a step costs
 * only what the edit changed.
 *
 * Each step remembers the value before the change, what the change was
 * called ("Edit cells", for "Undo Edit cells"), and where it was made, so
 * undo can take the user back there.
 */

export interface Step<T, W> {
  /** The value before the change (in `past`) or after it (in `future`). */
  readonly value: T;
  readonly label: string;
  readonly where: W;
}

export interface History<T, W> {
  readonly past: readonly Step<T, W>[];
  readonly present: T;
  readonly future: readonly Step<T, W>[];
}

export const HISTORY_LIMIT = 500;

export const startHistory = <T, W>(present: T): History<T, W> => ({
  past: [],
  present,
  future: [],
});

/** Records a change to `next`. Redo is lost, as in every editor. No-op edits are not steps. */
export function record<T, W>(
  h: History<T, W>,
  next: T,
  label: string,
  where: W,
  limit = HISTORY_LIMIT,
): History<T, W> {
  if (next === h.present) return h;
  const past = [...h.past, { value: h.present, label, where }];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

export function undo<T, W>(h: History<T, W>): History<T, W> {
  const step = h.past.at(-1);
  if (!step) return h;
  return {
    past: h.past.slice(0, -1),
    present: step.value,
    future: [...h.future, { value: h.present, label: step.label, where: step.where }],
  };
}

export function redo<T, W>(h: History<T, W>): History<T, W> {
  const step = h.future.at(-1);
  if (!step) return h;
  return {
    past: [...h.past, { value: h.present, label: step.label, where: step.where }],
    present: step.value,
    future: h.future.slice(0, -1),
  };
}

/** The step undo would take back, e.g. to label the button. */
export const nextUndo = <T, W>(h: History<T, W>): Step<T, W> | undefined => h.past.at(-1);
export const nextRedo = <T, W>(h: History<T, W>): Step<T, W> | undefined => h.future.at(-1);
