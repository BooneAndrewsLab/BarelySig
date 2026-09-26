import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  askToKeepStorage,
  checkStorage,
  keepStorageQuietly,
  resetStorageSafety,
  storageSafety,
} from './storageSafety';

function browser(opts: { persisted: boolean; grants: boolean; permission?: PermissionState }) {
  let persisted = opts.persisted;
  const persist = vi.fn(() => {
    persisted = opts.grants;
    return Promise.resolve(opts.grants);
  });
  return {
    persist,
    env: {
      storage: { persisted: () => Promise.resolve(persisted), persist },
      permissions: {
        query: () => Promise.resolve({ state: opts.permission ?? 'granted' } as PermissionStatus),
      },
    },
  };
}

beforeEach(() => {
  resetStorageSafety();
});

describe('storage safety (item 09)', () => {
  it('says whether the browser keeps this site’s storage', async () => {
    expect(await storageSafety(browser({ persisted: true, grants: true }).env)).toBe('kept');
    expect(await storageSafety(browser({ persisted: false, grants: false }).env)).toBe('at-risk');
    expect(await storageSafety({})).toBe('unknown');
    const broken = {
      storage: { persisted: () => Promise.reject(new Error('no')), persist: vi.fn() },
    };
    expect(await storageSafety(broken)).toBe('unknown');
  });

  it('asks quietly once, where the browser decides without a dialog', async () => {
    const b = browser({ persisted: false, grants: true, permission: 'granted' });
    await keepStorageQuietly(b.env);
    await keepStorageQuietly(b.env);
    expect(b.persist).toHaveBeenCalledTimes(1);
    expect(await checkStorage(b.env)).toBe('kept');
  });

  it('never asks quietly where the browser would show a dialog', async () => {
    const b = browser({ persisted: false, grants: true, permission: 'prompt' });
    await keepStorageQuietly(b.env);
    expect(b.persist).not.toHaveBeenCalled();
  });

  it('reports the browser’s answer to the button', async () => {
    const no = browser({ persisted: false, grants: false, permission: 'prompt' });
    expect(await askToKeepStorage(no.env)).toBe(false);
    expect(await checkStorage(no.env)).toBe('at-risk');
    const yes = browser({ persisted: false, grants: true, permission: 'prompt' });
    expect(await askToKeepStorage(yes.env)).toBe(true);
    expect(await checkStorage(yes.env)).toBe('kept');
  });
});
