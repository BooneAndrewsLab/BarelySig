import { describe, expect, it } from 'vitest';

import { hitRegions, pick } from './hit';
import { MODERN } from './theme';
import { layoutXy, type XyGraphInput } from './xy';

const input: XyGraphInput = {
  plot: { kind: 'xy-scatter', style: 'traces', points: false, fit: false, band: 'none' },
  size: { width: 70, height: 60 },
  theme: MODERN,
  xTitle: 'X',
  yTitle: 'Y',
  series: [
    {
      id: 'a',
      title: 'A',
      color: '#1f77b4',
      points: [],
      connect: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 2 },
      ],
      traces: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 4 },
          { x: 2, y: 2 },
        ],
        [
          { x: 0, y: 2 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
        ],
      ],
    },
  ],
};

describe('XY connected-line and trace styles', () => {
  const scene = layoutXy(input);

  it('draws one trace path per replicate and one mean line', () => {
    expect(scene.marks.filter((m) => m.role === 'trace-line')).toHaveLength(2);
    expect(scene.marks.filter((m) => m.role === 'connect-line')).toHaveLength(1);
  });

  it('draws no points when they are switched off', () => {
    expect(scene.marks.some((m) => m.role === 'xy-point')).toBe(false);
  });

  it('makes the mean line pickable', () => {
    const regions = hitRegions(scene, 5);
    expect(regions.some((r) => r.element === 'connect-line:a')).toBe(true);
    const line = scene.marks.find((m) => m.role === 'connect-line');
    if (line?.kind !== 'path') throw new Error('shape');
    const [x, y] = /M([\d.]+) ([\d.]+)/.exec(line.d)?.slice(1).map(Number) ?? [];
    expect(pick(regions, x ?? 0, y ?? 0)).toBe('connect-line:a');
  });
});
