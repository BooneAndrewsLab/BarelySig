import { describe, expect, it } from 'vitest';

import { clearOldWebRCaches } from './pwa';

class FakeCaches {
  constructor(readonly names: Set<string>) {}
  keys() {
    return Promise.resolve([...this.names]);
  }
  delete(name: string) {
    return Promise.resolve(this.names.delete(name));
  }
}

describe('clearOldWebRCaches', () => {
  it('deletes WebR caches of other versions and nothing else', async () => {
    const fake = new FakeCaches(new Set(['webr-0.5.2', 'webr-0.6.0', 'workbox-precache-v2-x']));
    const removed = await clearOldWebRCaches('webr-0.6.0', fake as unknown as CacheStorage);
    expect(removed).toEqual(['webr-0.5.2']);
    expect([...fake.names].sort()).toEqual(['webr-0.6.0', 'workbox-precache-v2-x']);
  });

  it('does nothing without the Cache API', async () => {
    expect(await clearOldWebRCaches('webr-0.6.0', undefined)).toEqual([]);
  });
});
