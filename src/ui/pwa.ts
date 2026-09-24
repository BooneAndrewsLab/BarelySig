/**
 * Offline support (item 04, #15): the service worker vite-plugin-pwa
 * generates, registered in production only; WebR caches of older versions
 * cleared; `.bsig` files opened from the OS by an installed app.
 */

/** Deletes WebR caches other than the current one (a WebR upgrade leaves the old one behind). */
export async function clearOldWebRCaches(
  current: string = __WEBR_CACHE__,
  store: CacheStorage | undefined = (globalThis as { caches?: CacheStorage }).caches,
): Promise<string[]> {
  if (!store) return [];
  const old = (await store.keys()).filter((k) => k.startsWith('webr-') && k !== current);
  await Promise.all(old.map((k) => store.delete(k)));
  return old;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  globalThis.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline caching is a convenience; the app works without it.
    });
    void clearOldWebRCaches().catch(() => undefined);
  });
}

interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/** An installed app opened with a `.bsig` (the manifest's file handler) gets it here. */
export function onLaunchFiles(open: (file: File) => void): void {
  const queue = (globalThis as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer((params) => {
    const [handle] = params.files;
    if (handle) void handle.getFile().then(open);
  });
}
