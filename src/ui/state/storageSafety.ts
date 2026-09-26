/**
 * Whether the browser keeps this site's storage (item 09). By default
 * IndexedDB is "best effort": a browser may clear it when disk space runs
 * low, and every project kept in this browser goes with it. Asking for
 * persistent storage protects it. Chromium decides that request silently;
 * Firefox puts it to the user as a dialog, which is only asked from a
 * click under a sentence saying why (PlasmidPop's approach). The answer
 * is reported, never assumed.
 */
import { useSyncExternalStore } from 'react';

/** `kept`: persistent; `at-risk`: may be cleared; `unknown`: the browser can't say. */
export type StorageSafety = 'kept' | 'at-risk' | 'unknown';

interface Env {
  readonly storage?: Pick<StorageManager, 'persisted' | 'persist'> | undefined;
  readonly permissions?: Pick<Permissions, 'query'> | undefined;
}

const env = (): Env => {
  const nav = globalThis.navigator as Partial<Navigator> | undefined;
  return { storage: nav?.storage, permissions: nav?.permissions };
};

export async function storageSafety(e: Env = env()): Promise<StorageSafety> {
  if (typeof e.storage?.persisted !== 'function') return 'unknown';
  try {
    return (await e.storage.persisted()) ? 'kept' : 'at-risk';
  } catch {
    return 'unknown';
  }
}

/** Whether asking would show the user a dialog (Firefox), rather than be decided silently. */
export async function wouldAskTheUser(e: Env = env()): Promise<boolean> {
  if (typeof e.permissions?.query !== 'function') return false;
  try {
    return (await e.permissions.query({ name: 'persistent-storage' })).state === 'prompt';
  } catch {
    return false;
  }
}

/** Asks the browser to keep this site's storage; resolves to whether it now does. */
export async function keepStorage(e: Env = env()): Promise<boolean> {
  if (typeof e.storage?.persist !== 'function') return false;
  try {
    return (await e.storage.persisted()) || (await e.storage.persist());
  } catch {
    return false;
  }
}

/**
 * The app's view of it, shared by the start screen and the sidebar:
 * checked once, re-checked after a request.
 */
let safety: StorageSafety = 'unknown';
const listeners = new Set<() => void>();

function set(next: StorageSafety): void {
  if (next === safety) return;
  safety = next;
  listeners.forEach((l) => {
    l();
  });
}

export async function checkStorage(e: Env = env()): Promise<StorageSafety> {
  set(await storageSafety(e));
  return safety;
}

/**
 * Asked once, when a project is first written (there is something to
 * protect by then): silently where the browser decides by itself, never
 * where it would show a dialog nobody asked for.
 */
let asked = false;
export async function keepStorageQuietly(e: Env = env()): Promise<void> {
  if (asked) return;
  asked = true;
  if ((await storageSafety(e)) !== 'at-risk' || (await wouldAskTheUser(e))) return;
  await keepStorage(e);
  await checkStorage(e);
}

/** The request made from a button; resolves to whether the browser agreed. */
export async function askToKeepStorage(e: Env = env()): Promise<boolean> {
  const kept = await keepStorage(e);
  await checkStorage(e);
  return kept;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useStorageSafety = (): StorageSafety =>
  useSyncExternalStore(
    subscribe,
    () => safety,
    () => 'unknown',
  );

/** For tests: forget the check and the quiet request. */
export function resetStorageSafety(): void {
  asked = false;
  set('unknown');
}
