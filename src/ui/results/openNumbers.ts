/**
 * Whether an analysis section's "All numbers" is open (#57): a per-viewer
 * preference kept in this browser's localStorage, keyed by section (unlike
 * the margin notes' single flag, #56's `notesShown.ts`) since one section's
 * choice is independent of another's. Can be missing or refuse access
 * (private windows, blocked site data), so every access is guarded.
 */
import { useSyncExternalStore } from 'react';

import type { Id } from '@/model/ids';

const KEY = 'barelysig.allNumbers';
const listeners = new Set<() => void>();
let open = read();

function read(): ReadonlySet<Id> {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids)
      ? new Set(ids.filter((x): x is Id => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function setAllNumbersOpen(id: Id, value: boolean): void {
  const next = new Set(open);
  if (value) next.add(id);
  else next.delete(id);
  open = next;
  try {
    if (next.size === 0) globalThis.localStorage.removeItem(KEY);
    else globalThis.localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Not remembered; the toggle still works for this visit.
  }
  listeners.forEach((l) => {
    l();
  });
}

/** For tests: forget which sections were open, as a fresh page load would. */
export function resetAllNumbersOpen(): void {
  open = read();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAllNumbersOpen = (id: Id): boolean =>
  useSyncExternalStore(
    subscribe,
    () => open.has(id),
    () => false,
  );
