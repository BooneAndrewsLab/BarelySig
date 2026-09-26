import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { drawnParts, outlinePath, outlinesOf, pickIn } from './drawn';
import { elementBoxes, elementsOf, hitRegions, pick } from './hit';
import { type LayoutInput, layoutColumn } from './layout';
import { COLORBLIND } from './palette';
import { CLASSIC, MODERN } from './theme';

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 70, height: 60 },
  theme: MODERN,
  yTitle: 'Viability (%)',
  title: 'A title',
  groups: ['A', 'B', 'C'].map((id, i) => ({
    id,
    title: `Group ${id}`,
    color: COLORBLIND[i] ?? '#000',
    values: [90 + i, 95, 100 - i * 20, 97, 88],
    summary: {
      n: 5,
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
  brackets: [
    { id: 'ab', from: 0, to: 1, label: '*' },
    { id: 'ac', from: 0, to: 2, label: 'ns' },
  ],
  ...over,
});

const scenes = [
  layoutColumn(input()),
  layoutColumn(input({ theme: CLASSIC, plot: { kind: 'dots', center: 'mean', error: 'sem' } })),
];

describe('a drawn figure without its scene (item 11)', () => {
  it.each(scenes.map((s, i) => [i, s] as const))(
    'scene %i: outlines are what elementBoxes gives, element by element',
    (_, scene) => {
      const outlines = outlinesOf(scene);
      expect([...outlines.keys()]).toEqual(elementsOf(scene));
      for (const e of elementsOf(scene)) {
        const want = elementBoxes(scene, e).flatMap((b) => [b.x0, b.y0, b.x1, b.y1]);
        expect([...(outlines.get(e) ?? [])]).toEqual(want.map((v) => Math.fround(v)));
      }
    },
  );

  it('picks what the region list picks, anywhere on the figure', () => {
    for (const scene of scenes) {
      const regions = hitRegions(scene, 5);
      const packed = drawnParts(scene).regions;
      fc.assert(
        fc.property(
          fc.double({ min: -5, max: scene.width + 5, noNaN: true }),
          fc.double({ min: -5, max: scene.height + 5, noNaN: true }),
          (x, y) => {
            // Float32 boxes: skip points within rounding of an edge.
            const near = regions.some(
              (r) =>
                Math.min(
                  Math.abs(x - r.x0),
                  Math.abs(x - r.x1),
                  Math.abs(y - r.y0),
                  Math.abs(y - r.y1),
                ) < 1e-3,
            );
            fc.pre(!near);
            expect(pickIn(packed, x, y)).toBe(pick(regions, x, y));
          },
        ),
        { numRuns: 2000 },
      );
    }
  });

  it('breaks a tie as the region list does: the first region drawn', () => {
    const regions = {
      boxes: Float32Array.from([0, 0, 4, 4, 0, 0, 4, 4, 1, 1, 2, 2]),
      owner: Uint16Array.from([0, 1, 2]),
      elements: ['first', 'second', 'small'],
    };
    const list = [0, 1, 2].map((i) => ({
      x0: regions.boxes[i * 4] ?? 0,
      y0: regions.boxes[i * 4 + 1] ?? 0,
      x1: regions.boxes[i * 4 + 2] ?? 0,
      y1: regions.boxes[i * 4 + 3] ?? 0,
      element: regions.elements[i] ?? '',
    }));
    expect(pickIn(regions, 3, 3)).toBe('first');
    expect(pick(list, 3, 3)).toBe('first');
    expect(pickIn(regions, 1.5, 1.5)).toBe('small');
  });

  it('keeps the size and notes, and the element list', () => {
    const scene = scenes[0];
    if (!scene) throw new Error('scene');
    const parts = drawnParts(scene);
    expect([parts.width, parts.height]).toEqual([scene.width, scene.height]);
    expect(parts.notes).toBe(scene.notes);
    expect(parts.elements).toEqual(elementsOf(scene));
    expect(parts.regions.owner).toHaveLength(hitRegions(scene, 5).length);
  });

  it('outlines as one path: a padded box per mark', () => {
    expect(outlinePath(Float32Array.from([1, 2, 3, 4, 10, 10, 12, 11]), 1.5)).toBe(
      'M-0.5 0.5H4.5V5.5H-0.5ZM8.5 8.5H13.5V12.5H8.5Z',
    );
    expect(outlinePath(new Float32Array(), 1.5)).toBe('');
  });
});
