/**
 * App-wide keyboard shortcuts (item 03). Text fields keep their own
 * Ctrl+Z (undoing typing), so project undo only acts outside them; the
 * grid's cell editor is such a field while it is open.
 */

export type AppCommand = 'undo' | 'redo' | 'open' | 'download';

interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | null;
}

function inTextField(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/** The command a key press asks for, or null. Ctrl on Windows/Linux, Cmd on macOS. */
export function commandFor(e: KeyLike): AppCommand | null {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'o' && !e.shiftKey) return 'open';
  if (key === 's' && !e.shiftKey) return 'download';
  if (inTextField(e.target)) return null;
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  return null;
}
