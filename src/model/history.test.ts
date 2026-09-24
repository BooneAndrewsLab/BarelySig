import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { nextRedo, nextUndo, record, redo, startHistory, undo } from './history';

describe('history', () => {
  it('undoes and redoes with labels and places', () => {
    let h = startHistory<string, string>('a');
    h = record(h, 'b', 'Edit cells', 'sheet 1');
    h = record(h, 'c', 'New table', 'sheet 2');
    expect(nextUndo(h)).toEqual({ value: 'b', label: 'New table', where: 'sheet 2' });
    h = undo(h);
    expect(h.present).toBe('b');
    expect(nextRedo(h)?.label).toBe('New table');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe('c');
    expect(redo(h)).toBe(h);
  });

  it('drops redo on a new change, and ignores no-op changes', () => {
    let h = record(startHistory<string, null>('a'), 'b', 'x', null);
    h = undo(h);
    h = record(h, 'c', 'y', null);
    expect(h.future).toEqual([]);
    expect(record(h, 'c', 'z', null)).toBe(h);
  });

  it('keeps the most recent steps up to the limit', () => {
    let h = startHistory<number, null>(0);
    for (let i = 1; i <= 10; i += 1) h = record(h, i, `step ${String(i)}`, null, 3);
    expect(h.past.map((s) => s.value)).toEqual([7, 8, 9]);
  });

  it('undoing n steps then redoing them returns every state in order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (values, k) => {
          let h = startHistory<number | string, null>('start');
          for (const v of values) h = record(h, v, 'x', null);
          const n = k % (values.length + 1);
          for (let i = 0; i < n; i += 1) h = undo(h);
          expect(h.present).toBe(n === values.length ? 'start' : values[values.length - 1 - n]);
          for (let i = 0; i < n; i += 1) h = redo(h);
          expect(h.present).toBe(values.at(-1));
        },
      ),
    );
  });
});
