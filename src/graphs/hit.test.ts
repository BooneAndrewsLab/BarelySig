import { describe, expect, it } from 'vitest';

import { elementBoxes, elementOf, elementsOf, hitRegions, markBox, pick } from './hit';
import { type LayoutInput, layoutColumn } from './layout';
import { COLORBLIND } from './palette';
import type { Scene } from './scene';
import { CLASSIC, MODERN } from './theme';

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 70, height: 60 },
  theme: MODERN,
  yTitle: 'Viability (%)',
  groups: ['A', 'B'].map((id, i) => ({
    id,
    title: `Group ${id}`,
    color: COLORBLIND[i] ?? '#000',
    values: [90 + i, 95, 100 - i * 20],
    summary: {
      n: 3,
      mean: 95 - i * 7,
      median: 95,
      sd: 5,
      sem: 3,
      ciLower: 80,
      ciUpper: 110,
      min: 80,
      max: 100,
    },
  })),
  brackets: [{ id: 'tt', from: 0, to: 1, label: '*' }],
  ...over,
});

const centreOf = (scene: Scene, role: string, ref?: string) => {
  const m = scene.marks.find((x) => x.role === role && (ref === undefined || x.ref === ref));
  if (!m) throw new Error(role);
  const b = markBox(m);
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as const;
};

describe('picking elements', () => {
  const scene = layoutColumn(input());
  const regions = hitRegions(scene, 4);
  const at = (role: string, ref?: string) => pick(regions, ...centreOf(scene, role, ref));

  it('names the element under the pointer', () => {
    expect(at('bar', 'B')).toBe('series:B');
    expect(at('tick-label')).toBe('y-axis');
    expect(at('group-label', 'A')).toBe('x-axis');
    expect(at('axis-title')).toBe('y-title');
    expect(at('bracket-label')).toBe('bracket:tt');
    expect(pick(regions, 0.5, 0.5)).toBeNull();
  });

  it('prefers the smaller of overlapping regions: a point over its bar, a cap over the bar', () => {
    expect(at('point', 'A')).toBe('series:A');
    const bare = layoutColumn(input({ plot: { kind: 'bars', error: 'sd', points: false } }));
    const r = hitRegions(bare, 4);
    expect(pick(r, ...centreOf(bare, 'error', 'A'))).toBe('error-bars');
    expect(pick(r, ...centreOf(bare, 'error-cap', 'B'))).toBe('error-bars');
  });

  it('makes thin lines wide enough to hit', () => {
    const axis = scene.marks.find((m) => m.role === 'axis-y');
    if (axis?.kind !== 'line') throw new Error('shape');
    expect(pick(regions, axis.x1 - 1.5, (axis.y1 + axis.y2) / 2)).toBe('y-axis');
  });

  it('hits a Classic frame on its edges only', () => {
    const boxed = layoutColumn(input({ theme: CLASSIC }));
    const r = hitRegions(boxed, 4);
    const frame = boxed.marks.find((m) => m.role === 'frame');
    if (frame?.kind !== 'rect') throw new Error('shape');
    expect(pick(r, frame.x + frame.w / 2, frame.y + frame.h)).toBe('x-axis');
    expect(pick(r, frame.x, frame.y + frame.h / 2)).toBe('y-axis');
    expect(pick(r, frame.x + frame.w / 2, frame.y + frame.h / 2)).toBeNull();
  });

  it('lists each element once and outlines all of an element’s marks', () => {
    const els = elementsOf(scene);
    expect(new Set(els).size).toBe(els.length);
    expect(els).toEqual(
      expect.arrayContaining([
        'y-axis',
        'x-axis',
        'y-title',
        'series:A',
        'series:B',
        'error-bars',
        'bracket:tt',
      ]),
    );
    expect(elementBoxes(scene, 'series:A')).toHaveLength(4);
    expect(
      elementOf({
        kind: 'line',
        role: 'x',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        line: { stroke: '#000', width: 1 },
      }),
    ).toBeNull();
  });

  it('boxes symbol paths and turned text', () => {
    expect(
      markBox({
        kind: 'path',
        role: 'point',
        d: 'M1 2L5 2L3 7Z',
        line: { stroke: '#000', width: 1 },
      }),
    ).toEqual({
      x0: 1,
      y0: 2,
      x1: 5,
      y1: 7,
    });
    const b = markBox({
      kind: 'text',
      role: 'group-label',
      x: 10,
      y: 10,
      text: 'Long label',
      size: 7,
      weight: 400,
      anchor: 'end',
      fill: '#000',
      rotate: -90,
    });
    expect(b.y0).toBeGreaterThan(9);
    expect(b.y1 - b.y0).toBeGreaterThan(b.x1 - b.x0);
  });
});
