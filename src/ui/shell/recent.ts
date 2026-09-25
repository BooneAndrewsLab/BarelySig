/** The projects kept in this browser, newest first, for the start screen and the Projects menu. */
import { useEffect, useState } from 'react';

import type { ProjectSummary } from '@/io/storage';
import type { Id } from '@/model/ids';

import { getSession } from '../state/session';

/** Reloads when `refresh` changes (e.g. the open project), leaving out `exclude`. */
export function useRecentProjects(refresh: unknown, exclude?: Id): readonly ProjectSummary[] {
  const [recent, setRecent] = useState<readonly ProjectSummary[]>([]);
  useEffect(() => {
    let live = true;
    getSession()
      .storage.list()
      .then((r) => {
        if (live) setRecent(r);
      })
      .catch(() => {
        if (live) setRecent([]);
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  return exclude === undefined ? recent : recent.filter((r) => r.id !== exclude);
}

export const whenSaved = (t: number): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(t),
  );
