/**
 * Whether the margin notes are shown (#56): a per-viewer preference kept
 * in this browser's localStorage, which can be missing or refuse access
 * (private windows, blocked site data), so every access is guarded.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'barelysig.notes';
const listeners = new Set<() => void>();
let shown = read();

function read(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export function setNotesShown(value: boolean): void {
  shown = value;
  try {
    if (value) globalThis.localStorage.removeItem(KEY);
    else globalThis.localStorage.setItem(KEY, 'hidden');
  } catch {
    // Not remembered; the switch still works for this visit.
  }
  listeners.forEach((l) => {
    l();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useNotesShown = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => shown,
    () => true,
  );
