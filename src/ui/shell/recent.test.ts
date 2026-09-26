import { describe, expect, it } from 'vitest';

import { contentsLine, whenEdited } from './recent';

describe('whenEdited', () => {
  const now = new Date(2026, 8, 26, 15, 0).getTime();
  const at = (...a: [number, number, number, number, number]) => new Date(...a).getTime();

  it('reads as a person would say it', () => {
    expect(whenEdited(now - 20_000, now, 'en')).toBe('just now');
    expect(whenEdited(now - 60_000, now, 'en')).toBe('1 minute ago');
    expect(whenEdited(now - 5 * 60_000, now, 'en')).toBe('5 minutes ago');
    expect(whenEdited(at(2026, 8, 26, 9, 30), now, 'en')).toBe('5 hours ago');
    expect(whenEdited(at(2026, 8, 25, 23, 50), now, 'en')).toBe('yesterday');
    expect(whenEdited(at(2026, 8, 22, 10, 0), now, 'en')).toBe('4 days ago');
    expect(whenEdited(at(2026, 8, 12, 10, 0), now, 'en')).toBe('Sep 12');
    expect(whenEdited(at(2025, 11, 30, 10, 0), now, 'en')).toBe('Dec 30, 2025');
  });

  it('says yesterday by the calendar, even under a day ago', () => {
    const morning = new Date(2026, 8, 26, 1, 0).getTime();
    expect(whenEdited(at(2026, 8, 25, 22, 0), morning, 'en')).toBe('yesterday');
  });
});

describe('contentsLine', () => {
  it('counts experiments and graphs', () => {
    expect(contentsLine({ tables: 0, graphs: 0 })).toBe('No experiments yet');
    expect(contentsLine({ tables: 1, graphs: 0 })).toBe('1 experiment');
    expect(contentsLine({ tables: 3, graphs: 1 })).toBe('3 experiments · 1 graph');
    expect(contentsLine({ tables: 2, graphs: 4 })).toBe('2 experiments · 4 graphs');
    // A row written before graphs were counted.
    expect(contentsLine({ tables: 2, graphs: null })).toBe('2 experiments');
  });
});
