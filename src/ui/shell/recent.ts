/** The projects kept in this browser, newest change first, for the start screen and the Projects menu. */
import { useEffect, useState } from 'react';

import type { ProjectSummary } from '@/io/storage';
import type { Id } from '@/model/ids';

import { getSession } from '../state/session';

/**
 * Every project kept in this browser, leaving out `exclude` (the open one);
 * re-read whenever storage changes (item 09). Null until first read.
 */
export function useProjects(exclude?: Id): readonly ProjectSummary[] | null {
  const [all, setAll] = useState<readonly ProjectSummary[] | null>(null);
  useEffect(() => {
    const { storage } = getSession();
    let live = true;
    const read = () => {
      storage
        .list()
        .then((r) => {
          if (live) setAll(r);
        })
        .catch(() => {
          if (live) setAll([]);
        });
    };
    read();
    const off = storage.subscribe(read);
    return () => {
      live = false;
      off();
    };
  }, []);
  return all === null || exclude === undefined ? all : all.filter((r) => r.id !== exclude);
}

export const whenSaved = (t: number): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(t),
  );

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const startOfDay = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function whenEdited(t: number, now: number = Date.now(), locale?: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const ago = now - t;
  if (ago < MINUTE) return 'just now';
  if (ago < HOUR) return rtf.format(-Math.floor(ago / MINUTE), 'minute');
  const days = Math.round((startOfDay(now) - startOfDay(t)) / (24 * HOUR));
  if (days <= 0) return rtf.format(-Math.floor(ago / HOUR), 'hour');
  if (days < 7) return rtf.format(-days, 'day');
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(new Date(t));
}

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${String(n)} ${many}`;

/** "3 experiments · 2 graphs", or "No experiments yet". */
export function contentsLine(p: Pick<ProjectSummary, 'tables' | 'graphs'>): string {
  if (p.tables === 0) return 'No experiments yet';
  const parts = [count(p.tables, 'experiment', 'experiments')];
  if (p.graphs !== null && p.graphs > 0) parts.push(count(p.graphs, 'graph', 'graphs'));
  return parts.join(' · ');
}
