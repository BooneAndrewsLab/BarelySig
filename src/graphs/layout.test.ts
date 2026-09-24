import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ColumnPlot } from '@/model/project';

import {
  type GroupInput,
  type LayoutInput,
  describePlot,
  errorExtent,
  layoutColumn,
} from './layout';
import { COLORBLIND } from './palette';
import type { Mark, Scene } from './scene';
import { textWidth } from './text/measure';
import { CLASSIC, MODERN } from './theme';

function group(i: number, values: readonly number[], title = `Group ${String(i)}`): GroupInput {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const sd =
    n > 1 && mean !== null
      ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1))
      : null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    id: `g${String(i)}`,
    title,
    color: COLORBLIND[i % COLORBLIND.length] ?? '#000',
    values,
    summary: n
      ? {
          n,
          mean,
          median: sorted[Math.floor((n - 1) / 2)] ?? null,
          sd,
          sem: sd === null ? null : sd / Math.sqrt(n),
          ciLower: null,
          ciUpper: null,
          min: sorted[0] ?? null,
          max: sorted[n - 1] ?? null,
        }
      : null,
  };
}

const base = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 70, height: 60 },
  theme: MODERN,
  yTitle: 'Viability (%)',
  groups: [group(0, [98, 101, 99]), group(1, [91, 88, 93]), group(2, [62, 58, 65])],
  brackets: [],
  ...over,
});

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error('index');
  return x;
}

function box(m: Mark): Box {
  switch (m.kind) {
    case 'rect':
      return { x0: m.x, x1: m.x + m.w, y0: m.y, y1: m.y + m.h };
    case 'line':
      return {
        x0: Math.min(m.x1, m.x2),
        x1: Math.max(m.x1, m.x2),
        y0: Math.min(m.y1, m.y2),
        y1: Math.max(m.y1, m.y2),
      };
    case 'circle':
      return { x0: m.cx - m.r, x1: m.cx + m.r, y0: m.cy - m.r, y1: m.cy + m.r };
    case 'text': {
      const w = textWidth(m.text, m.size, m.weight);
      const x0 = m.anchor === 'start' ? m.x : m.anchor === 'middle' ? m.x - w / 2 : m.x - w;
      if (m.rotate === -90) return { x0: m.x - m.size, x1: m.x, y0: m.y - w / 2, y1: m.y + w / 2 };
      return { x0, x1: x0 + w, y0: m.y - m.size * 0.75, y1: m.y + m.size * 0.2 };
    }
    case 'path': {
      const nums = [...m.d.matchAll(/-?\d+(\.\d+)?/g)].map((x) => Number(x[0]));
      return {
        x0: Math.min(nums[0] ?? 0, nums[3] ?? 0),
        x1: Math.max(nums[0] ?? 0, nums[3] ?? 0),
        y0: nums[2] ?? 0,
        y1: nums[1] ?? 0,
      };
    }
  }
}

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
const of = (s: Scene, role: string) => s.marks.filter((m) => m.role === role);

describe('layoutColumn', () => {
  it('draws one bar per group from zero to the mean, and the points', () => {
    const s = layoutColumn(base());
    const bars = of(s, 'bar');
    expect(bars).toHaveLength(3);
    const axis = of(s, 'axis-x')[0];
    for (const b of bars) {
      if (b.kind !== 'rect' || axis?.kind !== 'line') throw new Error('shape');
      expect(b.y + b.h).toBeCloseTo(axis.y1, 6);
    }
    const [b0, b1] = bars;
    if (b0?.kind !== 'rect' || b1?.kind !== 'rect') throw new Error('shape');
    expect(b0.h).toBeGreaterThan(b1.h);
    expect(of(s, 'point')).toHaveLength(9);
  });

  it('keeps the size it was given, in points', () => {
    const s = layoutColumn(base({ size: { width: 89, height: 60 } }));
    expect(s.width).toBeCloseTo((89 * 72) / 25.4, 6);
    expect(s.height).toBeCloseTo((60 * 72) / 25.4, 6);
  });

  it('wraps long group labels so they never overlap', () => {
    const titles = [
      'Vehicle control, DMSO 0.1%',
      'Compound 1 at 10 µM for 24 h',
      'Compound 2',
      'Knockout clone 7',
    ];
    const s = layoutColumn(base({ groups: titles.map((t, i) => group(i, [1, 2, 3], t)) }));
    const labels = of(s, 'group-label').map(box);
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1)
        expect(overlaps(at(labels, i), at(labels, j))).toBe(false);
    }
    expect(labels.length).toBeGreaterThan(titles.length);
  });

  it('shows error bars above bars in Modern, both ways in Classic and for dots', () => {
    const up = layoutColumn(base());
    expect(of(up, 'error-cap')).toHaveLength(3);
    expect(of(layoutColumn(base({ theme: CLASSIC })), 'error-cap')).toHaveLength(6);
    const dots = layoutColumn(base({ plot: { kind: 'dots', center: 'mean', error: 'sem' } }));
    expect(of(dots, 'error-cap')).toHaveLength(6);
    expect(of(dots, 'centre')).toHaveLength(3);
    expect(of(dots, 'bar')).toHaveLength(0);
  });

  it('fits a dot plot to its data but starts bars at zero', () => {
    const labels = (s: Scene) => of(s, 'tick-label').map((m) => (m.kind === 'text' ? m.text : ''));
    expect(labels(layoutColumn(base()))[0]).toBe('0');
    expect(
      labels(layoutColumn(base({ plot: { kind: 'dots', center: 'median', error: 'none' } })))[0],
    ).not.toBe('0');
  });

  it('writes negative ticks with a true minus sign', () => {
    const s = layoutColumn(base({ groups: [group(0, [-5, -3, 2])] }));
    expect(of(s, 'tick-label').some((m) => m.kind === 'text' && m.text.startsWith('−'))).toBe(true);
  });

  it('gives a single tiny value a usable axis', () => {
    for (const plot of [
      { kind: 'dots', center: 'mean', error: 'sd' },
      { kind: 'bars', error: 'sd', points: true },
    ] as const) {
      const s = layoutColumn(base({ plot, groups: [group(0, [5e-323])] }));
      expect(of(s, 'tick-label').length).toBeGreaterThan(1);
    }
    const tiny = layoutColumn(
      base({
        plot: { kind: 'dots', center: 'mean', error: 'none' },
        groups: [group(0, [1.2e-12, 3.4e-12, 5.1e-12])],
      }),
    );
    expect(
      of(tiny, 'tick-label')
        .map((m) => (m.kind === 'text' ? m.text : ''))
        .join(' '),
    ).toMatch(/e-12|0\.000000000/);
  });

  it('draws nothing for empty groups but keeps their slot and label', () => {
    const s = layoutColumn(base({ groups: [group(0, [1, 2]), group(1, [])] }));
    expect(of(s, 'bar')).toHaveLength(1);
    expect(of(s, 'group-label')).toHaveLength(2);
  });

  it('keeps every mark inside the figure and never overlaps brackets with each other or the data', () => {
    const plotArb: fc.Arbitrary<ColumnPlot> = fc.oneof(
      fc.record({
        kind: fc.constant('bars' as const),
        error: fc.constantFrom('sd', 'sem', 'range', 'none'),
        points: fc.boolean(),
      }),
      fc.record({
        kind: fc.constant('dots' as const),
        center: fc.constantFrom('mean', 'median'),
        error: fc.constantFrom('sd', 'sem', 'range', 'none'),
      }),
    );
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.double({ min: -50, max: 200, noNaN: true }), { maxLength: 12 }), {
          minLength: 1,
          maxLength: 6,
        }),
        plotArb,
        fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 5 }),
        fc.boolean(),
        (vals, plot, pairs, classic) => {
          const groups = vals.map((v, i) => group(i, v));
          const brackets = pairs.map(([a, b], i) => ({
            id: `b${String(i)}`,
            from: a % groups.length,
            to: b % groups.length,
            label: '**',
          }));
          const s = layoutColumn(
            base({ plot, groups, brackets, theme: classic ? CLASSIC : MODERN }),
          );
          for (const m of s.marks) {
            const b = box(m);
            expect(b.x0, m.role).toBeGreaterThanOrEqual(-0.5);
            expect(b.y0, m.role).toBeGreaterThanOrEqual(-0.5);
            expect(b.x1, m.role).toBeLessThanOrEqual(s.width + 0.5);
          }
          const placed = of(s, 'bracket').map(box);
          const labels = of(s, 'bracket-label').map(box);
          for (let i = 0; i < placed.length; i += 1) {
            for (let j = i + 1; j < placed.length; j += 1) {
              expect(overlaps(at(placed, i), at(placed, j))).toBe(false);
              expect(overlaps(at(labels, i), at(labels, j))).toBe(false);
            }
          }
          const data = [...of(s, 'point'), ...of(s, 'error'), ...of(s, 'error-cap')].map(box);
          for (const b of [...placed, ...labels])
            for (const d of data) expect(overlaps(b, d)).toBe(false);
          expect(layoutColumn(base({ plot, groups, brackets }))).toEqual(
            layoutColumn(base({ plot, groups, brackets })),
          );
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('describing the plot', () => {
  it('says what the marks show', () => {
    expect(describePlot({ kind: 'bars', error: 'sd', points: true })).toBe(
      'Bars: mean ± SD; points: individual values',
    );
    expect(describePlot({ kind: 'bars', error: 'ci95', points: false })).toBe(
      'Bars: mean with 95% CI',
    );
    expect(describePlot({ kind: 'dots', center: 'median', error: 'range' })).toBe(
      'Lines: median with range; points: individual values',
    );
  });

  it('gets error bar ends from the summary', () => {
    const s = {
      n: 3,
      mean: 10,
      median: 9,
      sd: 2,
      sem: 1,
      ciLower: 7,
      ciUpper: 13,
      min: 8,
      max: 12,
    };
    expect(errorExtent('sd', s, 10)).toEqual([8, 12]);
    expect(errorExtent('ci95', s, 10)).toEqual([7, 13]);
    expect(errorExtent('none', s, 10)).toBeNull();
  });
});
